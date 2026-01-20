import { openai } from "../../lib/openAI";
import { chroma } from "../../lib/chroma";
import { Chunk, getChunkId } from "./compare.service";

const COLLECTION_NAME = "kvkli_content";
const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 100; // Process embeddings in batches

/**
 * Get or create Chroma collection for content chunks
 */
async function getCollection() {
  try {
    // Verify connection first
    await chroma.heartbeat();
    
    return await chroma.getOrCreateCollection({
      name: COLLECTION_NAME,
      metadata: { 
        description: "KVKLI website content chunks",
        "hnsw:space": "cosine"
      },
    });
  } catch (error) {
    console.error("Error getting/creating collection:", error);
    throw new Error("Failed to connect to ChromaDB. Please ensure the ChromaDB server is running.");
  }
}

/**
 * Generate embeddings for text chunks using OpenAI API
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];

  // Process in batches to avoid rate limits
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    
    try {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: batch,
        dimensions: 1536,
      });

      const batchEmbeddings = response.data.map((item: { embedding: number[] }) => item.embedding);
      embeddings.push(...batchEmbeddings);

      console.log(`Generated embeddings for batch ${i / BATCH_SIZE + 1} (${batch.length} chunks)`);
    } catch (error) {
      console.error(`Error generating embeddings for batch ${i}:`, error);
      throw error;
    }
  }

  return embeddings;
}


export async function fetchExistingChunks(): Promise<Chunk[]> {
  try {
    const collection = await getCollection();
    const results = await collection.get();

    if (!results.ids || results.ids.length === 0) {
      return [];
    }

    const chunks: Chunk[] = [];
    for (let i = 0; i < results.ids.length; i++) {
      const metadata = results.metadatas?.[i];
      const document = results.documents?.[i];

      if (metadata && document) {
        chunks.push({
          url: metadata.url as string,
          section_heading: metadata.section_heading as string,
          chunk_index: metadata.chunk_index as number,
          text: document,
          hash: metadata.hash as string,
          last_crawled: metadata.last_crawled as string,
        });
      }
    }

    console.log(`Fetched ${chunks.length} existing chunks from DB`);
    return chunks;
  } catch (error) {
    console.error("Error fetching existing chunks:", error);
    return [];
  }
}


export async function updateVectorDB(
  chunksToAdd: Chunk[],
  chunksToRemove: Chunk[]
): Promise<{ added: number; removed: number }> {
  try {
    const collection = await getCollection();

    // Remove deleted chunks
    let removed = 0;
    if (chunksToRemove.length > 0) {
      const idsToRemove = chunksToRemove.map(getChunkId);
      try {
        await collection.delete({ ids: idsToRemove });
        removed = idsToRemove.length;
        console.log(`Removed ${removed} chunks from DB`);
      } catch (error) {
        console.error("Error removing chunks:", error);
        throw new Error(`Failed to remove chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Add new/changed chunks
    let added = 0;
    if (chunksToAdd.length > 0) {
      const texts = chunksToAdd.map((chunk) => chunk.text);
      const embeddings = await generateEmbeddings(texts);
      const ids = chunksToAdd.map(getChunkId);
      const metadatas = chunksToAdd.map((chunk) => ({
        url: chunk.url,
        section_heading: chunk.section_heading,
        chunk_index: chunk.chunk_index,
        hash: chunk.hash,
        last_crawled: chunk.last_crawled,
      }));

      try {
        // Batch the additions to avoid exceeding ChromaDB's max batch size
        const CHROMA_BATCH_SIZE = 5000; // Stay under the 5461 limit
        const totalBatches = Math.ceil(ids.length / CHROMA_BATCH_SIZE);
        
        for (let i = 0; i < ids.length; i += CHROMA_BATCH_SIZE) {
          const batchIds = ids.slice(i, i + CHROMA_BATCH_SIZE);
          const batchEmbeddings = embeddings.slice(i, i + CHROMA_BATCH_SIZE);
          const batchTexts = texts.slice(i, i + CHROMA_BATCH_SIZE);
          const batchMetadatas = metadatas.slice(i, i + CHROMA_BATCH_SIZE);
          
          const currentBatch = Math.floor(i / CHROMA_BATCH_SIZE) + 1;
          console.log(`Adding batch ${currentBatch}/${totalBatches} (${batchIds.length} chunks)...`);
          
          // Retry logic for batch addition
          let retries = 3;
          let success = false;
          
          while (retries > 0 && !success) {
            try {
              await collection.add({
                ids: batchIds,
                embeddings: batchEmbeddings,
                documents: batchTexts,
                metadatas: batchMetadatas,
              });
              success = true;
              console.log(`✓ Batch ${currentBatch}/${totalBatches} added successfully`);
            } catch (batchError) {
              retries--;
              if (retries > 0) {
                console.warn(`Batch ${currentBatch} failed, retrying... (${retries} attempts left)`);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
              } else {
                throw new Error(`Failed to add batch ${currentBatch} after 3 attempts: ${batchError instanceof Error ? batchError.message : 'Unknown error'}`);
              }
            }
          }
        }
        added = ids.length;
        console.log(`✓ Successfully added ${added} chunks to DB`);
      } catch (error) {
        console.error("Error adding chunks:", error);
        throw new Error(`Failed to add chunks to vector DB: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { added, removed };
  } catch (error) {
    console.error("Error in updateVectorDB:", error);
    throw error;
  }
}


export async function searchSimilarContent(
  query: string,
  limit: number = 5
): Promise<Array<{ text: string; url: string; section: string; score: number }>> {
  try {
    const collection = await getCollection();

    // Generate embedding for query
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: query,
      dimensions: 1536,
    });
    const queryEmbedding = response.data[0].embedding;

    // Search in Chroma
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: limit,
    });

    const matches: Array<{ text: string; url: string; section: string; score: number }> = [];

    if (results.ids && results.ids[0]) {
      for (let i = 0; i < results.ids[0].length; i++) {
        const metadata = results.metadatas?.[0]?.[i];
        const document = results.documents?.[0]?.[i];
        const distance = results.distances?.[0]?.[i];

        if (metadata && document) {
          matches.push({
            text: document,
            url: metadata.url as string,
            section: metadata.section_heading as string,
            score: distance ? 1 - distance : 0, // Convert distance to similarity score
          });
        }
      }
    }

    return matches;
  } catch (error) {
    console.error("Error searching similar content:", error);
    return [];
  }
}
