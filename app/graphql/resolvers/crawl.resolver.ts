import { crawlSite } from "../services/crawl.service";
import { flattenPagesToChunks, diffChunks } from "../services/compare.service";
import { fetchExistingChunks, updateVectorDB } from "../services/site.service";

export const crawlResolvers = {
  Mutation: {
    /**
     * Crawl website, compare with existing content, and update vector DB
     * Only generates embeddings for new/changed content to minimize API calls
     */
    crawlWebsite: async (_: unknown, { url }: { url?: string }) => {
      console.log("🕷️ Starting crawl pipeline...");

      // Step 1: Crawl website and extract structured content
      const crawlResult = await crawlSite(url);
      
      if (!crawlResult.success) {
        return {
          success: false,
          message: crawlResult.message,
          pagesCount: crawlResult.pagesCount,
          outputFile: crawlResult.outputFile,
        };
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

      // Step 7: Clean up - delete the temporary JSON file
      // try {
      //   await fs.unlink(crawlResult.outputFile);
      //   console.log(`🗑️ Deleted temporary file: ${crawlResult.outputFile}`);
      // } catch (error) {
      //   console.warn(`⚠️ Failed to delete temporary file: ${error}`);
      // }

      return {
        success: true,
        message: `Crawled ${crawlResult.pagesCount} pages, updated ${updateResult.added} chunks, removed ${updateResult.removed} chunks`,
        pagesCount: crawlResult.pagesCount,
        outputFile: crawlResult.outputFile,
      };
    },
  },
};
