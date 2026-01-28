import { config } from "dotenv";
import { chroma } from "../lib/chroma";

// Load .env file
config();

async function debugChroma() {
  try {
    console.log("=== ChromaDB Debug Information ===\n");
    console.log("CHROMA_URL:", process.env.CHROMA_URL || "⚠️  NOT SET - using default");
    console.log("Expected URL: http://localhost:8000");
    console.log("\nDocker volume mapping: ./chroma_db → /chroma/chroma");
    
    // Test heartbeat
    console.log("\nChecking ChromaDB connection...");
    await chroma.heartbeat();
    console.log("✓ ChromaDB is responding");
    
    // List all collections
    const collections = await chroma.listCollections();
    console.log(`\nFound ${collections.length} collection(s):`);
    collections.forEach(c => console.log(`  - ${c.name}`));
    
    // Get the kvkli_content collection
    console.log("\nChecking 'kvkli_content' collection...");
    const collection = await chroma.getOrCreateCollection({
      name: "kvkli_content"
    });
    
    const count = await collection.count();
    console.log(`✓ Collection has ${count} documents`);
    
    if (count > 0) {
      // Get a sample
      console.log("\nFetching sample documents...");
      const sample = await collection.get({ limit: 3 });
      console.log(`Sample IDs (${sample.ids.length}):`, sample.ids);
      if (sample.metadatas && sample.metadatas.length > 0) {
        console.log("\nFirst document metadata:");
        console.log(JSON.stringify(sample.metadatas[0], null, 2));
      }
      if (sample.documents && sample.documents.length > 0) {
        console.log("\nFirst document text (truncated):");
        console.log(sample.documents[0]?.substring(0, 200) + "...");
      }
    } else {
      console.log("\n⚠️  Collection is EMPTY!");
      console.log("\nYour ChromaDB is running in Docker but the collection is empty.");
      console.log("\nPossible causes:");
      console.log("1. The 4.8GB chroma_db folder is not being mounted correctly");
      console.log("2. You copied data to the wrong location");
      console.log("3. The collection needs to be re-populated");
      console.log("\nTo check your data location:");
      console.log("1. Check if ./chroma_db exists and has your 4.8GB data");
      console.log("2. Restart Docker Compose: docker-compose -f docker-compose.dev.yml down && docker-compose -f docker-compose.dev.yml up -d");
      console.log("3. Or re-populate: npx tsx scripts/crawl-site.ts");
    }
    
  } catch (error) {
    console.error("\n❌ Error:", error);
    if (error instanceof Error) {
      console.error("Message:", error.message);
    }
  }
}

debugChroma();
