import { openai } from "../../lib/openAI";
import { chroma } from "../../lib/chroma";
import { Chunk, getChunkId } from "./compare.service";
import LoggerService from "./logger.service";
import { updateCrawlProgress } from "./crawl.service";

const COLLECTION_NAME = "kvkli_content";
const EMBEDDING_MODEL = "text-embedding-3-small";
const BATCH_SIZE = 100;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

/**
 * Retry helper for ChromaDB operations
 */
async function retryOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    retries = MAX_RETRIES,
): Promise<T> {
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error) {
            const isLastAttempt = i === retries - 1;
            if (isLastAttempt) {
                LoggerService.logError(
                    error as Error,
                    `${operationName} (final attempt)`,
                    { attempt: i + 1 },
                );
                throw error;
            }
            LoggerService.warn(`${operationName} failed, retrying...`, {
                attempt: i + 1,
                error: (error as Error).message,
            });
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
        }
    }
    throw new Error(`Failed after ${retries} attempts`);
}

/**
 * Get or create Chroma collection for content chunks
 */
async function getCollection() {
    return retryOperation(async () => {
        try {
            // Verify connection first
            await chroma.heartbeat();

            return await chroma.getOrCreateCollection({
                name: COLLECTION_NAME,
                metadata: {
                    description: "KVKLI website content chunks",
                },
            });
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            LoggerService.logError(
                new Error(`ChromaDB connection failed: ${errorMessage}`),
                "getCollection",
                { chromaUrl: process.env.CHROMA_URL || "not set" },
            );
            throw new Error(
                "ChromaDB is not accessible. Please ensure the ChromaDB server is running and CHROMA_URL is correctly configured.",
            );
        }
    }, "getCollection");
}

/**
 * Generate embeddings for text chunks using OpenAI API
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    LoggerService.info("🔮 Starting embedding generation", {
        totalTexts: texts.length,
        batches: Math.ceil(texts.length / BATCH_SIZE),
    });

    // Process in batches to avoid rate limits
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
        const batch = texts.slice(i, i + BATCH_SIZE);
        const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

        LoggerService.info(`Generating embeddings batch ${batchNumber}/${totalBatches}`, {
            batchSize: batch.length,
            progress: `${i + batch.length}/${texts.length}`,
        });

        try {
            const response = await openai.embeddings.create({
                model: EMBEDDING_MODEL,
                input: batch,

            });

            const batchEmbeddings = response.data.map(
                (item: { embedding: number[] }) => item.embedding,
            );
            embeddings.push(...batchEmbeddings);

            // Update progress
            updateCrawlProgress({
                embeddingsGenerated: embeddings.length,
                embeddingsTotal: texts.length,
            });

            LoggerService.info(`✓ Batch ${batchNumber}/${totalBatches} completed`, {
                embeddingsGenerated: embeddings.length,
            });
        } catch (error) {
            LoggerService.logError(error as Error, "generateEmbeddings", {
                batchIndex: i,
                batchNumber,
            });
            throw error;
        }
    }

    LoggerService.info("✅ All embeddings generated", {
        total: embeddings.length,
    });

    return embeddings;
}

export async function fetchExistingChunks(): Promise<Chunk[]> {
    try {
        LoggerService.info("Fetching existing chunks from ChromaDB");
        const collection = await getCollection();
        const results = await collection.get({
            include: ["metadatas", "documents"],
        });

        if (!results.ids || results.ids.length === 0) {
            LoggerService.info("No existing chunks found in ChromaDB");
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

        LoggerService.info("Successfully fetched existing chunks", {
            count: chunks.length,
        });

        return chunks;
    } catch (error) {
        LoggerService.logError(error as Error, "fetchExistingChunks");
        return [];
    }
}

export async function updateVectorDB(
    chunksToAdd: Chunk[],
    chunksToRemove: Chunk[],
): Promise<{ added: number; removed: number }> {
    try {
        // Deduplicate chunksToAdd by text hash to avoid inserting duplicates
        const seenHashes = new Set<string>();
        const deduplicatedChunksToAdd = chunksToAdd.filter((chunk) => {
            if (seenHashes.has(chunk.hash)) {
                return false;
            }
            seenHashes.add(chunk.hash);
            return true;
        });

        if (deduplicatedChunksToAdd.length < chunksToAdd.length) {
            LoggerService.info("Deduplicated chunks before insert", {
                original: chunksToAdd.length,
                deduplicated: deduplicatedChunksToAdd.length,
                removed: chunksToAdd.length - deduplicatedChunksToAdd.length,
            });
        }

        LoggerService.info("🗄️ Starting vector DB update", {
            chunksToAdd: deduplicatedChunksToAdd.length,
            chunksToRemove: chunksToRemove.length,
        });
        const collection = await getCollection();

        // Remove deleted chunks
        let removed = 0;
        if (chunksToRemove.length > 0) {
            LoggerService.info("🗑️ Removing outdated chunks", {
                count: chunksToRemove.length,
            });
            const idsToRemove = chunksToRemove.map(getChunkId);
            try {
                await collection.delete({ ids: idsToRemove });
                removed = idsToRemove.length;
                
                // Update progress
                updateCrawlProgress({
                    chunksRemovedFromDB: removed,
                });
                
                LoggerService.info("✓ Successfully removed chunks", {
                    count: removed,
                });
            } catch (error) {
                LoggerService.logError(error as Error, "updateVectorDB - remove");
                throw new Error(
                    `Failed to remove chunks: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
            }
        }

        // Add new/changed chunks - use deduplicated list
        let added = 0;
        if (deduplicatedChunksToAdd.length > 0) {
            LoggerService.info("➕ Adding new/updated chunks", {
                count: deduplicatedChunksToAdd.length,
            });
            
            // Update total embeddings count
            updateCrawlProgress({
                embeddingsTotal: deduplicatedChunksToAdd.length,
                embeddingsGenerated: 0,
            });
            
            const texts = deduplicatedChunksToAdd.map((chunk) => chunk.text);
            const embeddings = await generateEmbeddings(texts);
            const ids = deduplicatedChunksToAdd.map(getChunkId);
            const metadatas = deduplicatedChunksToAdd.map((chunk) => ({
                url: chunk.url,
                section_heading: chunk.section_heading,
                chunk_index: chunk.chunk_index,
                hash: chunk.hash,
                last_crawled: chunk.last_crawled,
            }));

            try {
                // Start with smaller batch size to avoid payload errors
                const CHROMA_BATCH_SIZE = 100; // Much smaller initial size
                const totalBatches = Math.ceil(ids.length / CHROMA_BATCH_SIZE);

                LoggerService.info("💾 Adding chunks to ChromaDB", {
                    totalChunks: ids.length,
                    batchSize: CHROMA_BATCH_SIZE,
                    totalBatches,
                });

                for (let i = 0; i < ids.length; i += CHROMA_BATCH_SIZE) {
                    const batchIds = ids.slice(i, i + CHROMA_BATCH_SIZE);
                    const batchEmbeddings = embeddings.slice(
                        i,
                        i + CHROMA_BATCH_SIZE,
                    );
                    const batchTexts = texts.slice(i, i + CHROMA_BATCH_SIZE);
                    const batchMetadatas = metadatas.slice(
                        i,
                        i + CHROMA_BATCH_SIZE,
                    );

                    const currentBatch = Math.floor(i / CHROMA_BATCH_SIZE) + 1;

                    LoggerService.info(`Adding batch ${currentBatch}/${totalBatches} to ChromaDB`, {
                        chunkCount: batchIds.length,
                        progress: `${Math.min(i + CHROMA_BATCH_SIZE, ids.length)}/${ids.length}`,
                    });

                    // Retry logic with dynamic batch size reduction
                    let retries = 3;
                    let currentBatchSize = batchIds.length;
                    let retryOffset = 0;

                    while (retryOffset < batchIds.length) {
                        const retryBatchIds = batchIds.slice(
                            retryOffset,
                            retryOffset + currentBatchSize,
                        );
                        const retryBatchEmbeddings = batchEmbeddings.slice(
                            retryOffset,
                            retryOffset + currentBatchSize,
                        );
                        const retryBatchTexts = batchTexts.slice(
                            retryOffset,
                            retryOffset + currentBatchSize,
                        );
                        const retryBatchMetadatas = batchMetadatas.slice(
                            retryOffset,
                            retryOffset + currentBatchSize,
                        );

                        try {
                            await collection.add({
                                ids: retryBatchIds,
                                embeddings: retryBatchEmbeddings,
                                documents: retryBatchTexts,
                                metadatas: retryBatchMetadatas,
                            });

                            retryOffset += currentBatchSize;
                            added += currentBatchSize;
                            
                            // Update progress
                            updateCrawlProgress({
                                chunksAddedToDB: added,
                            });
                            
                            LoggerService.info(`✓ Batch ${currentBatch} sub-batch added`, {
                                added: currentBatchSize,
                                totalAdded: added,
                            });
                      
                        } catch (batchError: unknown) {
                            const errorMessage =
                                (batchError as Error)?.message ||
                                String(batchError);

                            // Check if it's a payload size error
                            if (
                                errorMessage.includes("413") ||
                                errorMessage.includes("Payload Too Large")
                            ) {
                                LoggerService.warn(
                                    `Payload too large, reducing batch size from ${currentBatchSize} to ${Math.floor(currentBatchSize / 2)}`,
                                );
                                currentBatchSize = Math.max(
                                    1,
                                    Math.floor(currentBatchSize / 2),
                                );
                                continue; // Try again with smaller batch
                            }

                            retries--;
                            if (retries > 0) {
                                LoggerService.warn(
                                    `Batch ${currentBatch} failed, retrying... (${retries} attempts left)`,
                                );
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 2000),
                                );
                            } else {
                                throw new Error(
                                    `Failed to add batch ${currentBatch} after 3 attempts: ${errorMessage}`,
                                );
                            }
                        }
                    }
                }
                
                LoggerService.info("✅ Successfully added all chunks to ChromaDB", {
                    count: added,
                });
               
            } catch (error) {
                LoggerService.logError(error as Error, "updateVectorDB - add chunks");
                throw new Error(
                    `Failed to add chunks to vector DB: ${error instanceof Error ? error.message : "Unknown error"}`,
                );
            }
        }

        LoggerService.info("🎉 Vector DB update completed", { added, removed });
        return { added, removed };
    } catch (error) {
        LoggerService.logError(error as Error, "updateVectorDB");
        throw error;
    }
}

/**
 * Score boost based on URL relevance to query
 */
function getUrlRelevanceBoost(url: string, query: string): number {
    const urlLower = url.toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Boost contact page for director/management queries
    if ((queryLower.includes('ředitel') || queryLower.includes('vedení') || 
         queryLower.includes('petrydesová') || queryLower.includes('dana')) && 
        urlLower.includes('/kontakt')) {
        return 0.4;
    }
    
    // Boost service-related pages
    if (urlLower.includes('/sluzby/')) return 0.2;
    if (urlLower.includes('/pujcovani')) return 0.25;
    if (urlLower.includes('/vse-o-pujcovani')) return 0.3;
    if (urlLower.includes('/registrace')) return 0.2;
    if (urlLower.includes('/kontakt')) return 0.15;
    
    // Penalize book recommendations
    if (urlLower.includes('/knihovnici-doporucuji')) return -0.5;
    if (urlLower.includes('/tipy-ke-cteni')) return -0.5;
    if (urlLower.includes('/ctenarska-vyzva')) return -0.5;
    
    return 0;
}

export async function searchSimilarContent(
    query: string,
    limit: number = 5,
): Promise<
    Array<{ text: string; url: string; section: string; score: number }>
> {
    try {
        const collection = await getCollection();

        const count = await collection.count();

        if (count === 0) {
            LoggerService.warn(
                "ChromaDB collection is empty - no data to search",
            );
            return [];
        }

        LoggerService.info("Executing semantic search", {
            query,
            limit,
        });

        const response = await openai.embeddings.create({
            model: EMBEDDING_MODEL,
            input: query,
        });
        const queryEmbedding = response.data[0].embedding;

        // Get more results for re-ranking and deduplication
        const results = await collection.query({
            queryEmbeddings: [queryEmbedding],
            nResults: Math.min(limit * 5, count), // Get 5x more for dedup headroom
            include: ["metadatas", "documents", "distances"],
        });

        const matches: Array<{
            text: string;
            url: string;
            section: string;
            score: number;
        }> = [];

        // Deduplicate by text content hash
        const seenTextHashes = new Set<string>();

        if (results.ids && results.ids[0]) {
            for (let i = 0; i < results.ids[0].length; i++) {
                const metadata = results.metadatas?.[0]?.[i];
                const document = results.documents?.[0]?.[i];
                const distance = results.distances?.[0]?.[i];

                if (metadata && document) {
                    // Create a hash of the text to detect duplicates
                    const textKey = `${metadata.url as string}::${(document as string).substring(0, 100)}`;

                    if (seenTextHashes.has(textKey)) {
                        continue; // Skip duplicate
                    }
                    seenTextHashes.add(textKey);

                    const baseScore = distance ? 1 - distance : 0;
                    const urlBoost = getUrlRelevanceBoost(metadata.url as string, query);
                    const finalScore = baseScore + urlBoost;

                    matches.push({
                        text: document,
                        url: metadata.url as string,
                        section: metadata.section_heading as string,
                        score: finalScore,
                    });
                }
            }
        }

        // Re-rank by adjusted score and take top results
        const rankedMatches = matches
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);

        LoggerService.info("Site search executed", {
            query,
            resultsCount: rankedMatches.length,
            topUrls: rankedMatches.slice(0, 3).map(m => ({ url: m.url, score: m.score })),
        });
        console.log("Search results:", rankedMatches);
        return rankedMatches;
    } catch (error) {
        LoggerService.logError(error as Error, "searchSimilarContent", {
            query,
            limit,
        });
        LoggerService.warn("Returning empty results due to ChromaDB error");
        return [];
    }
}
