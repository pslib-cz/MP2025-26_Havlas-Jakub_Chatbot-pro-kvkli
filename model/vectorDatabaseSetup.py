import os
import time
import pandas as pd
import chromadb
from openai import OpenAI
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

# === 0. Load API key ===
# Try multiple .env locations
env_paths = [
    Path(".env.local"),
    Path("../.env.local"),
    Path("../app/.env.local"),
]

loaded = False
for env_path in env_paths:
    if env_path.exists():
        print(f"📝 Loading environment from: {env_path}")
        load_dotenv(env_path)
        loaded = True
        break

if not loaded:
    print("⚠️ No .env.local file found, using system environment variables")

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("❌ OPENAI_API_KEY not found. Please set it in .env.local or environment variables")

client_openai = OpenAI(api_key=api_key)

# === 1. Load CSV ===
csv_path = "complete_records_fixed.csv"
print(f"📂 Loading {csv_path}...")
df = pd.read_csv(csv_path, encoding="utf-8", low_memory=False)
print(f"📊 Loaded {len(df):,} total records")

# === 1.1 Filter to only keep records with required fields ===
def has_required_fields(row):
    """Check if row has Title + Description + RecordType + (Author OR Contributors)"""
    # Check required fields
    title = str(row.get("Title", "")).strip()
    description = str(row.get("Description", "")).strip()
    record_type = str(row.get("RecordType", "")).strip()
    
    # Check at least one of Author or Contributors
    author = str(row.get("Author", "")).strip()
    contributors = str(row.get("Contributors", "")).strip()
    
    # All must be valid (not empty, not "nan", not "none")
    def is_valid(val):
        return val and val.lower() not in ["nan", "none", ""]
    
    has_basics = is_valid(title) and is_valid(description) and is_valid(record_type)
    has_author_or_contrib = is_valid(author) or is_valid(contributors)
    
    return has_basics and has_author_or_contrib

initial_count = len(df)
df = df[df.apply(has_required_fields, axis=1)].reset_index(drop=True)
filtered_count = len(df)
print(f"📋 Filtered dataset: {initial_count:,} → {filtered_count:,} records")
print(f"   (kept only: Title + Description + RecordType + (Author OR Contributors))")

# === 1.2 Create embedding-ready text by combining fields ===
def make_embedding_text(row):
    parts = []

    title = str(row.get("Title", "")).strip()
    if title and title.lower() not in ["nan", "none"]:
        parts.append(f"Title: {title}")

    description = str(row.get("Description", "")).strip()
    if description and description.lower() not in ["nan", "none"]:
        parts.append(f"Description: {description}")
    
    record_type = str(row.get("RecordType", "")).strip()
    if record_type and record_type.lower() not in ["nan", "none"]:
        parts.append(f"Type: {record_type}")

    # Prefer Author, fallback to Contributors
    author = str(row.get("Author", "")).strip()
    if author and author.lower() not in ["nan", "none"]:
        parts.append(f"Author: {author}")
    else:
        contributors = str(row.get("Contributors", "")).strip()
        if contributors and contributors.lower() not in ["nan", "none"]:
            parts.append(f"Contributors: {contributors}")
    
    # Optional fields
    subjects = str(row.get("Subjects", "")).strip()
    if subjects and subjects.lower() not in ["nan", "none"]:
        parts.append(f"Subjects: {subjects}")
    
    notes = str(row.get("Notes", "")).strip()
    if notes and notes.lower() not in ["nan", "none"]:
        parts.append(f"Notes: {notes}")

    return "\n".join(parts)

def extract_cpk_id(identifier):
    """Extract CPK ID from oai:ipac.kvkli.cz:CPK:0099715 format"""
    try:
        if isinstance(identifier, str) and "CPK:" in identifier:
            return identifier.split("CPK:")[-1].strip()
        return str(identifier)
    except:
        return str(identifier)

df["embedding_text"] = df.apply(make_embedding_text, axis=1)
df["cpk_id"] = df["Identifier"].apply(extract_cpk_id)

texts = df["embedding_text"].astype(str).tolist()
ids = df["cpk_id"].astype(str).tolist()

print(f"📊 Total records to embed: {len(texts):,}")
print(f"📝 Sample ID format: {ids[0]} (from {df['Identifier'].iloc[0]})")

# === 2. Chroma DB ===
# Connect to the Docker-hosted ChromaDB server instead of local storage
chroma_host = os.getenv("CHROMA_HOST", "localhost")
chroma_port = int(os.getenv("CHROMA_PORT", "8000"))

print(f"🔌 Connecting to ChromaDB server at {chroma_host}:{chroma_port}")

# For production: ensure ChromaDB is using persistent storage
# The Docker container should have a volume mounted, e.g.:
# docker run -p 8000:8000 -v ./chroma_data:/chroma/chroma chromadb/chroma
chroma_client = chromadb.HttpClient(host=chroma_host, port=chroma_port)

# Delete old collection if exists
try:
    chroma_client.delete_collection("books")
    print("🗑️ Deleted old collection")
except: 
    pass

# Create collection WITHOUT embedding_function since we provide embeddings manually
collection = chroma_client.create_collection(
    name="books",
    metadata={"hnsw:space": "cosine"}  # Optional: specify distance metric
)

# === 3. Embedding helper ===
def get_embedding(text):
    try:
        response = client_openai.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding
    except Exception as e:
        print(f"⚠️ Embedding failed: {e}")
        return None

# === 4. Parallel embedding ===
def embed_batch(batch_texts, max_workers=10):
    embeddings = [None] * len(batch_texts)
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_idx = {
            executor.submit(get_embedding, text): idx
            for idx, text in enumerate(batch_texts)
        }
        for future in as_completed(future_to_idx):
            idx = future_to_idx[future]
            embeddings[idx] = future.result()
    return embeddings

# === 5. Ingestion loop ===
batch_size = 400
max_workers = 10

total = len(texts)
print(f"🚀 Starting async ingestion of {total:,} records in batches of {batch_size}...")
print(f"⚡ Using {max_workers} parallel workers for embeddings")

start_time = time.time()
total_saved = 0

for i in range(0, total, batch_size):
    batch_texts = texts[i:i+batch_size]
    batch_ids = ids[i:i+batch_size]

    print(f"\n🧠 Processing batch {i // batch_size + 1} ({i} – {i+len(batch_texts)} of {total})...")
    batch_embeddings = embed_batch(batch_texts, max_workers=max_workers)

    # Remove failed embeddings
    valid = [
        (bid, btxt, emb)
        for bid, btxt, emb in zip(batch_ids, batch_texts, batch_embeddings)
        if emb is not None
    ]

    if not valid:
        print("⚠️ Entire batch failed, skipping.")
        continue

    valid_ids, valid_docs, valid_emb = zip(*valid)

    # Save to Chroma
    collection.add(
        ids=list(valid_ids),
        documents=list(valid_docs),
        embeddings=list(valid_emb)
    )

    total_saved += len(valid_ids)
    
    # Verify count from server
    current_count = collection.count()
    print(f"✅ Saved {len(valid_ids)} records, server total: {current_count}")

    elapsed = time.time() - start_time
    avg_per_batch = elapsed / ((i // batch_size) + 1)
    remaining_batches = (total - i - batch_size) // batch_size
    eta = avg_per_batch * remaining_batches
    
    print(f"⏱️ Elapsed: {elapsed/60:.1f} min | ETA: {eta/60:.1f} min")

print("\n🎉 Ingestion completed!")
print(f"📊 Final document count: {collection.count()}")
print(f"⏱️ Total time: {(time.time() - start_time)/60:.1f} minutes")
print(f"✅ Successfully saved: {total_saved:,} / {total:,} records ({total_saved/total*100:.1f}%)")
