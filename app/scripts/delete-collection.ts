import { chroma } from "../lib/chroma";

const COLLECTION_NAME = "kvkli_content";
const CONNECTION_TIMEOUT = 5000; // 5 seconds

async function deleteCollection() {
  try {
    console.log("Connecting to ChromaDB...");
    
    // Add timeout to heartbeat
    const heartbeatPromise = chroma.heartbeat();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error("Connection timeout")), CONNECTION_TIMEOUT)
    );
    
    await Promise.race([heartbeatPromise, timeoutPromise]);
    console.log("✓ Connected to ChromaDB");

    // Check if collection exists
    const collections = await chroma.listCollections();
    const exists = collections.some(col => col.name === COLLECTION_NAME);

    if (!exists) {
      console.log(`Collection "${COLLECTION_NAME}" does not exist. Nothing to delete.`);
      return;
    }

    // Delete the collection
    console.log(`Deleting collection "${COLLECTION_NAME}"...`);
    await chroma.deleteCollection({ name: COLLECTION_NAME });
    console.log(`✓ Collection "${COLLECTION_NAME}" deleted successfully`);

  } catch (error) {
    console.error("\n❌ Error deleting collection:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      
      if (error.message === "Connection timeout") {
        console.error("\n💡 Troubleshooting:");
        console.error("1. Make sure ChromaDB server is running");
        console.error("2. Start it with: chroma run --path ./chroma_data");
        console.error("3. Or: docker run -p 8000:8000 chromadb/chroma");
        console.error("4. Check your lib/chroma.ts configuration");
      }
    }
    process.exit(1);
  }
}

// Run the script
deleteCollection()
  .then(() => {
    console.log("✓ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Script failed:", error);
    process.exit(1);
  });
