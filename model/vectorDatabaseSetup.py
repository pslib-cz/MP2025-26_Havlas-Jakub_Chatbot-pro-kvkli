import os
import time
import pandas as pd
import chromadb
from openai import OpenAI
from dotenv import load_dotenv
from concurrent.futures import ThreadPoolExecutor, as_completed
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

# === 0. Load API key ===
load_dotenv(".env.local")
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise ValueError("❌ OPENAI_API_KEY not found in .env.local")

client_openai = OpenAI(api_key=api_key)

# === 1. Load CSV ===
csv_path = "model/books_cleaned.csv"
df = pd.read_csv(csv_path, encoding="utf-8")

# === 1.1 Filter to only keep records with all required fields ===
def has_all_fields(row):
    """Check if row has all required fields (Title, Author, Description)"""
    required_fields = ["Title", "Author", "Description"]
    for field in required_fields:
        value = str(row.get(field, "")).strip()
        if not value or value.lower() in ["nan", "none", ""]:
            return False
    return True

initial_count = len(df)
df = df[df.apply(has_all_fields, axis=1)].reset_index(drop=True)
filtered_count = len(df)
print(f"📋 Filtered dataset: {initial_count:,} → {filtered_count:,} records (kept only records with Title, Author, and Description)")

# === 1.2 Create embedding-ready text by combining fields ===
def make_embedding_text(row):
    parts = []

    title = str(row.get("Title", "")).strip()
    if title:
        parts.append(f"Title: {title}")

    author = str(row.get("Author", "")).strip()
    if author:
        parts.append(f"Author: {author}")

    description = str(row.get("Description", "")).strip()
    if description:
        parts.append(f"Description: {description}")

    # Join only non-empty fields
    return "\n".join(parts)


df["embedding_text"] = df.apply(make_embedding_text, axis=1)
texts = df["embedding_text"].astype(str).tolist()

print(f"📊 Total records to embed: {len(texts):,}")

# === 2. Chroma DB ===
chroma_path = os.path.abspath("./chroma_db")
print("📂 Using Chroma DB path:", chroma_path)

chroma_client = chromadb.PersistentClient(path=chroma_path)

# Delete old collection if exists
try:
    chroma_client.delete_collection("books")
except: 
    pass

collection = chroma_client.create_collection(
    "books",
    embedding_function=OpenAIEmbeddingFunction(model_name="text-embedding-3-small")
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
max_workers = 6

total = len(texts)
print(f"📊 Starting ingestion of {total:,} records in batches of {batch_size} ...")

start_time = time.time()

for i in range(0, total, batch_size):
    batch_texts = texts[i:i+batch_size]
    batch_ids = [f"book_{j}" for j in range(i, i+len(batch_texts))]

    print(f"🧠 Embedding batch {i // batch_size + 1} ({i} – {i+len(batch_texts)} of {total}) ...")
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

    print(f"✅ Saved batch {i // batch_size + 1}, total inserted: {collection.count()}")

    elapsed = time.time() - start_time
    print(f"⏱️ Elapsed time: {elapsed/60:.1f} min")

print("🎉 Ingestion completed!")
print(f"📊 Final document count: {collection.count()}")
