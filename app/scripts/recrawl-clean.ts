import { config } from "dotenv";
import { chroma } from "../lib/chroma";
import { crawlSite } from "../graphql/services/crawl.service";
import { flattenPagesToChunks } from "../graphql/services/compare.service";
import { updateVectorDB } from "../graphql/services/site.service";
import fs from "fs/promises";

config();

async function recrawlClean() {
  console.log("=== Clean Re-Crawl with Quality Filters ===\n");
  
  // 1. Delete old collection
  console.log("Deleting old collection...");
  try {
    await chroma.deleteCollection({ name: "kvkli_content" });
    console.log("✓ Old collection deleted\n");
  } catch (error) {
    console.log("Collection doesn't exist or already deleted\n");
  }
  
  // 2. Crawl with quality filters (500 pages should be enough with filters)
  console.log("Starting quality-focused crawl (max 500 pages)...");
  const crawlResult = await crawlSite("https://www.kvkli.cz", {
    maxPages: 500,
    delayMs: 1000,
    concurrency: 5,
  });
  
  if (!crawlResult.success) {
    console.error("Crawl failed:", crawlResult.message);
    return;
  }
  
  console.log(`✓ Crawled ${crawlResult.pagesCount} pages\n`);
  
  // 3. Load crawled data
  const data = await fs.readFile(crawlResult.outputFile, "utf-8");
  const pages = JSON.parse(data);
  
  // 4. Create chunks with quality filters
  console.log("Creating quality-filtered chunks...");
  const chunks = flattenPagesToChunks(pages);
  console.log(`✓ Created ${chunks.length} quality chunks\n`);
  
  // 5. Add to new collection
  console.log("Adding chunks to ChromaDB...");
  const result = await updateVectorDB(chunks, []);
  console.log(`✓ Added ${result.added} chunks to database\n`);
  
  console.log("=== Clean re-crawl complete! ===");
}

recrawlClean();
