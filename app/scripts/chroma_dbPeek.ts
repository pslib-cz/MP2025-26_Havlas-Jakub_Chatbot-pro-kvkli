import { chroma } from "../lib/chroma";

const COLLECTION_NAME = "kvkli_content";
async function inspectChroma() {
  try {
    // Verify connection
    await chroma.heartbeat();
    console.log("✓ ChromaDB connection successful\n");

    // list collections
    const collections = await chroma.listCollections();
    console.log("Collections:", collections.map(c => c.name));
    console.log(`Total collections: ${collections.length}\n`);

    // open a collection
    const collection = await chroma.getCollection({
      name: COLLECTION_NAME,
    });

    // Get collection count
    const count = await collection.count();
    console.log(`Collection "${COLLECTION_NAME}" has ${count} items\n`);

    // peek at data
    const peek = await collection.peek({
      limit: 10,
    });

    console.log("Peek at first 10 items:");
    console.log("IDs:", peek.ids);
    console.log("\nMetadatas:", JSON.stringify(peek.metadatas, null, 2));
    console.log("\nDocuments (first 100 chars):", peek.documents?.map(d => d?.substring(0, 100) + "..."));
  } catch (error) {
    console.error("Error inspecting ChromaDB:", error);
    throw error;
  }
}

inspectChroma().catch(console.error);
