import { crawlSite, getCrawlProgress, stopCrawl } from "../services/crawl.service";
import { flattenPagesToChunks, diffChunks } from "../services/compare.service";
import { fetchExistingChunks, updateVectorDB } from "../services/site.service";

export const crawlResolvers = {
  Query: {
    crawlProgress: async () => {
      console.log("crawlProgress resolver called");

      const defaultProgress = {
        status: "idle",
        pagesVisited: 0,
        pagesInQueue: 0,
        totalPages: 0,
        currentUrl: null,
        startTime: null,
        endTime: null,
        error: null,
      };

      try {
        const progress = getCrawlProgress();
        console.log("Returning crawl progress:", progress);

        if (!progress) {
          console.log("No progress data, returning default");
          return defaultProgress;
        }

        // Ensure all required fields are present
        return {
          status: progress.status || "idle",
          pagesVisited: progress.pagesVisited || 0,
          pagesInQueue: progress.pagesInQueue || 0,
          totalPages: progress.totalPages || 0,
          currentUrl: progress.currentUrl || null,
          startTime: progress.startTime || null,
          endTime: progress.endTime || null,
          error: progress.error || null,
        };
      } catch (error) {
        console.error("Error in crawlProgress resolver:", error);
        return defaultProgress;
      }
    },
  },

  Mutation: {

    stopCrawl: async () => {
      return stopCrawl();
    },

    crawlWebsite: async (_: unknown, { url }: { url?: string }) => {
      console.log("🕷️ Starting crawl pipeline...");


      (async () => {
        try {
          // Step 1: Crawl website and extract structured content
          const crawlResult = await crawlSite(url);

          if (!crawlResult.success) {
            console.error("❌ Crawl failed:", crawlResult.message);
            return;
          }

          console.log(`✅ Crawled ${crawlResult.pagesCount} pages`);

          // Step 2: Read the crawled data from the output file
          const fs = await import("fs/promises");
          const crawledData = JSON.parse(
            await fs.readFile(crawlResult.outputFile, "utf-8")
          );

          // Step 3: Flatten pages into chunks
          const newChunks = flattenPagesToChunks(crawledData);
          console.log(`📦 Created ${newChunks.length} chunks from crawled pages`);

          // Step 4: Fetch existing chunks from vector DB
          const existingChunks = await fetchExistingChunks();
          console.log(`🗄️ Fetched ${existingChunks.length} existing chunks from DB`);

          // Step 5: Compare and determine what changed
          const diff = diffChunks(newChunks, existingChunks);
          console.log(`🔍 Analysis:`);
          console.log(`   - New/Changed: ${diff.chunksToAdd.length}`);
          console.log(`   - Removed: ${diff.chunksToRemove.length}`);
          console.log(`   - Unchanged: ${diff.chunksUnchanged.length}`);

          // Step 6: Update vector DB (only embed new/changed chunks)
          const updateResult = await updateVectorDB(
            diff.chunksToAdd,
            diff.chunksToRemove
          );

          console.log(`✨ Vector DB updated:`);
          console.log(`   - Added: ${updateResult.added}`);
          console.log(`   - Removed: ${updateResult.removed}`);
        } catch (error) {
          console.error("❌ Background crawl error:", error);
        }
      })();

      // Return immediately
      return {
        success: true,
        message: "Crawl started in background. Use crawlProgress query to monitor.",
        pagesCount: 0,
        outputFile: "",
      };
    },
  },
};
