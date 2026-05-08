import {
    crawlSite,
    getCrawlProgress,
    stopCrawl,
    updateCrawlProgress,
} from "../services/crawl.service";
import { flattenPagesToChunks, diffChunks } from "../services/compare.service";
import { fetchExistingChunks, updateVectorDB } from "../services/site.service";
import { LoggerService } from "../services/logger.service";
import { CrawlWebsiteArgs, CrawlProgress, CrawlResult } from "../../types";
import { withAuth } from "../utils/resolver.utils";

export const crawlResolvers = {
    Query: {
        crawlProgress: withAuth(async (): Promise<CrawlProgress> => {
            const defaultProgress: CrawlProgress = {
                status: "idle",
                phase: "idle",
                pagesVisited: 0,
                pagesInQueue: 0,
                totalPages: 0,
                chunksCreated: 0,
                chunksToAdd: 0,
                chunksToRemove: 0,
                currentUrl: null,
                startTime: null,
                endTime: null,
                error: null,
                embeddingsGenerated: 0,
                embeddingsTotal: 0,
                chunksAddedToDB: 0,
                chunksRemovedFromDB: 0,
            };

            try {
                const progress = getCrawlProgress() as Partial<CrawlProgress>;

                if (!progress) {
                    return defaultProgress;
                }

                // Ensure all required fields are present
                return {
                    status: progress.status || "idle",
                    phase: progress.phase || "idle",
                    pagesVisited: progress.pagesVisited || 0,
                    pagesInQueue: progress.pagesInQueue || 0,
                    totalPages: progress.totalPages || 0,
                    chunksCreated: progress.chunksCreated || 0,
                    chunksToAdd: progress.chunksToAdd || 0,
                    chunksToRemove: progress.chunksToRemove || 0,
                    currentUrl: progress.currentUrl || null,
                    startTime: progress.startTime || null,
                    endTime: progress.endTime || null,
                    error: progress.error || null,
                    embeddingsGenerated: progress.embeddingsGenerated || 0,
                    embeddingsTotal: progress.embeddingsTotal || 0,
                    chunksAddedToDB: progress.chunksAddedToDB || 0,
                    chunksRemovedFromDB: progress.chunksRemovedFromDB || 0,
                };
            } catch (error) {
                console.error("Error in crawlProgress resolver:", error);
                return defaultProgress;
            }
        }),
    },

    Mutation: {
        stopCrawl: withAuth(async () => {
            return stopCrawl();
        }),

        crawlWebsite: withAuth(async (_: unknown, { url }: CrawlWebsiteArgs): Promise<CrawlResult> => {
            LoggerService.info("🕷️ Starting crawl pipeline", {
                url: url || "https://www.kvkli.cz",
            });

            (async () => {
                try {
                    LoggerService.info("📡 Initiating website crawl...");

                    // Step 1: Crawl website and extract structured content
                    const crawlResult: CrawlResult = await crawlSite(url);

                    if (!crawlResult.success) {
                        LoggerService.logError(
                            new Error(crawlResult.message),
                            "Crawl failed",
                        );
                        updateCrawlProgress({
                            status: "error",
                            phase: "error",
                            error: crawlResult.message,
                            endTime: Date.now(),
                        });
                        return;
                    }

                    LoggerService.info(
                        `✅ Crawled ${crawlResult.pagesCount} pages`,
                    );

                    // Step 2: Read the crawled data from the output file
                    LoggerService.info("📂 Reading crawled data from file...");
                    updateCrawlProgress({
                        phase: "chunking",
                        currentUrl: null,
                    });
                    const fs = await import("fs/promises");
                    const crawledData = JSON.parse(
                        await fs.readFile(crawlResult.outputFile, "utf-8"),
                    );

                    // Step 3: Flatten pages into chunks
                    LoggerService.info("📦 Creating chunks from pages...");
                    const newChunks = flattenPagesToChunks(crawledData);
                    LoggerService.info(
                        `📦 Created ${newChunks.length} chunks from crawled pages`,
                    );
                    updateCrawlProgress({ chunksCreated: newChunks.length });

                    // Step 4: Fetch existing chunks from vector DB
                    LoggerService.info("🗄️ Fetching existing chunks from database...");
                    updateCrawlProgress({ phase: "diffing" });
                    const existingChunks = await fetchExistingChunks();
                    LoggerService.info(
                        `🗄️ Fetched ${existingChunks.length} existing chunks from DB`,
                    );

                    // Step 5: Compare and determine what changed
                    LoggerService.info("🔍 Analyzing differences...");
                    const diff = diffChunks(newChunks, existingChunks);
                    LoggerService.info(`🔍 Diff Analysis:`, {
                        newOrChanged: diff.chunksToAdd.length,
                        removed: diff.chunksToRemove.length,
                        unchanged: diff.chunksUnchanged.length,
                    });
                    updateCrawlProgress({
                        chunksToAdd: diff.chunksToAdd.length,
                        chunksToRemove: diff.chunksToRemove.length,
                    });

                    // Step 6: Update vector DB (only embed new/changed chunks)
                    LoggerService.info("💾 Updating vector database...");
                    updateCrawlProgress({ phase: "updating" });
                    const updateResult = await updateVectorDB(
                        diff.chunksToAdd,
                        diff.chunksToRemove,
                    );

                    LoggerService.info(`✨ Vector DB updated:`, {
                        added: updateResult.added,
                        removed: updateResult.removed,
                    });

                    // Mark as completed
                    updateCrawlProgress({
                        status: "completed",
                        phase: "completed",
                        endTime: Date.now(),
                    });

                    LoggerService.info(
                        "🎉 Crawl pipeline completed successfully",
                    );
                } catch (error) {
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);
                    LoggerService.logError(
                        error as Error,
                        "Background crawl error",
                    );
                    updateCrawlProgress({
                        status: "error",
                        phase: "error",
                        error: errorMessage,
                        endTime: Date.now(),
                    });
                }
            })();

            // Return immediately
            return {
                success: true,
                message: "Crawl started in background. Use crawlProgress query to monitor.",
                pagesCount: 0,
                outputFile: "",
            };
        }),
    },
};
