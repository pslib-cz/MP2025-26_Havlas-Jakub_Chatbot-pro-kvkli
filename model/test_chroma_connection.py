import os
import chromadb
import requests
from pathlib import Path

# Try multiple environment files
env_files = [".env.local", ".env", "../app/.env.local", "../app/.env"]
print("🔍 ChromaDB Connection Diagnostics\n")
print("=" * 60)

# 0. Check environment files
print("\n0️⃣ Checking environment files...")
for env_file in env_files:
    env_path = Path(env_file)
    if env_path.exists():
        print(f"  ✅ Found: {env_file}")
        # Don't load, just check existence
    else:
        print(f"  ❌ Not found: {env_file}")

# Check ChromaDB data directory
print("\n📂 Checking ChromaDB data directories...")
possible_dirs = [
    Path("../app/chroma_data"),
    Path("./chroma_data"),
    Path("../chroma_data"),
]

for data_dir in possible_dirs:
    if data_dir.exists():
        print(f"  ✅ Found: {data_dir}")
        # List contents
        try:
            contents = list(data_dir.rglob("*"))
            print(f"     Contains {len(contents)} files/folders")
            # Show first few items
            for item in list(contents)[:5]:
                print(f"     - {item.relative_to(data_dir)}")
            if len(contents) > 5:
                print(f"     ... and {len(contents) - 5} more")
        except Exception as e:
            print(f"     Error reading directory: {e}")
    else:
        print(f"  ❌ Not found: {data_dir}")

# Test configurations
configs = [
    {"host": "localhost", "port": 8000, "name": "localhost:8000"},
    {"host": "127.0.0.1", "port": 8000, "name": "127.0.0.1:8000"},
]

# 1. Test HTTP endpoint directly
print("\n1️⃣ Testing HTTP endpoint accessibility...")
for config in configs:
    url = f"http://{config['host']}:{config['port']}/api/v1/heartbeat"
    try:
        response = requests.get(url, timeout=5)
        print(f"✅ {config['name']}: HTTP {response.status_code} - {response.json()}")
    except requests.exceptions.ConnectionError:
        print(f"❌ {config['name']}: Connection refused")
    except requests.exceptions.Timeout:
        print(f"❌ {config['name']}: Timeout")
    except Exception as e:
        print(f"❌ {config['name']}: {type(e).__name__} - {e}")

# 2. Test ChromaDB client connection
print("\n2️⃣ Testing ChromaDB client connection...")
working_client = None
for config in configs:
    try:
        print(f"\nTrying {config['name']}...")
        client = chromadb.HttpClient(host=config['host'], port=config['port'])
        
        # Test heartbeat
        heartbeat = client.heartbeat()
        print(f"  ✅ Heartbeat: {heartbeat}")
        
        # List collections
        collections = client.list_collections()
        print(f"  ✅ Collections: {[c.name for c in collections]}")
        
        # Try to get books collection
        try:
            books_collection = client.get_collection("books")
            count = books_collection.count()
            print(f"  ✅ Books collection exists with {count:,} documents")
            
            # Try a simple query
            if count > 0:
                result = books_collection.peek(limit=1)
                print(f"  ✅ Sample document ID: {result['ids'][0] if result['ids'] else 'N/A'}")
                
                # Show sample document
                if result['documents'] and result['documents'][0]:
                    print(f"  📄 Sample document preview:")
                    lines = result['documents'][0].split('\n')[:3]
                    for line in lines:
                        print(f"      {line}")
        except Exception as e:
            print(f"  ⚠️ Books collection error: {e}")
        
        print(f"  🎉 {config['name']} works!\n")
        working_client = client
        break  # Stop at first working config
        
    except Exception as e:
        print(f"  ❌ Failed: {type(e).__name__} - {e}")

# 3. Environment check
print("\n3️⃣ Environment variables:")
print(f"  CHROMA_HOST: {os.getenv('CHROMA_HOST', 'not set')}")
print(f"  CHROMA_PORT: {os.getenv('CHROMA_PORT', 'not set')}")
print(f"  CHROMA_URL: {os.getenv('CHROMA_URL', 'not set')}")
print(f"  OPENAI_API_KEY: {'set' if os.getenv('OPENAI_API_KEY') else 'not set'}")

# 4. Test embedding query (only if we have a working client)
if working_client:
    print("\n4️⃣ Testing full embedding query workflow...")
    try:
        from openai import OpenAI
        
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("  ⚠️ OPENAI_API_KEY not found, skipping embedding test")
        else:
            client_openai = OpenAI(api_key=api_key)
            chroma_client = chromadb.HttpClient(host="localhost", port=8000)
            
            try:
                books = chroma_client.get_collection("books")
                
                # Create test query
                test_query = "dětské knihy o zvířatech"
                print(f"  Query: '{test_query}'")
                
                # Generate embedding
                response = client_openai.embeddings.create(
                    model="text-embedding-3-small",
                    input=test_query,
                    dimensions=1536
                )
                query_embedding = response.data[0].embedding
                print(f"  ✅ Generated embedding (dim: {len(query_embedding)})")
                
                # Query ChromaDB
                results = books.query(
                    query_embeddings=[query_embedding],
                    n_results=3
                )
                
                print(f"  ✅ Query returned {len(results['ids'][0])} results")
                if results['documents'][0]:
                    print(f"  📚 Sample result:")
                    doc = results['documents'][0][0]
                    lines = doc.split('\n')[:3]  # First 3 lines
                    for line in lines:
                        print(f"      {line}")
                        
            except Exception as e:
                print(f"  ❌ Query test failed: {type(e).__name__} - {e}")
                
                import traceback
                traceback.print_exc()
                
    except ImportError:
        print("  ⚠️ OpenAI package not available, skipping embedding test")
else:
    print("\n4️⃣ Skipping embedding test (no working ChromaDB connection)")

print("\n" + "=" * 60)
print("✅ Diagnostics complete!")

# Print summary
print("\n📋 Summary:")
print("  - If HTTP endpoints work but ChromaDB client fails:")
print("    → Check CORS settings in docker-compose.dev.yml")
print("  - If 'books' collection doesn't exist:")
print("    → Run vectorDatabaseSetup.py to create it")
print("  - If connection refused:")
print("    → Make sure ChromaDB container is running: docker ps")
print("  - If you need the lib/chroma.ts file configuration:")
print("    → Share that file so I can check the ChromaClient initialization")
