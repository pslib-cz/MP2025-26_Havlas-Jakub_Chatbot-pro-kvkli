import crypto from "crypto";
import { CrawledPage } from "./crawl.service";

export interface Chunk {
  url: string;
  section_heading: string;
  chunk_index: number;
  text: string;
  hash: string;
  last_crawled: string;
}

export interface ChunkDiff {
  chunksToAdd: Chunk[];
  chunksToRemove: Chunk[];
  chunksUnchanged: Chunk[];
}

/**
 * Check if a chunk contains meaningful, indexable content
 */
function isValidChunk(chunk: Chunk): boolean {
  const text = chunk.text.toLowerCase();
  
  // Skip if too short
  if (chunk.text.length < 100) return false;
  
  // Skip navigation-only content
  const navigationPatterns = [
    /^(menu|navigace|breadcrumb)/i,
    /^(přejít na|skip to|go to)/i,
    /^(zobrazit|show|hide|skrýt)/i,
  ];
  
  if (navigationPatterns.some(pattern => pattern.test(chunk.text))) {
    return false;
  }
  
  // Skip cookie notices and similar boilerplate
  const boilerplateKeywords = ['cookies', 'gdpr', 'ochrana osobních údajů'];
  const hasBoilerplate = boilerplateKeywords.every(keyword => text.includes(keyword));
  if (hasBoilerplate && chunk.text.length < 500) {
    return false;
  }
  
  return true;
}

/**
 * Flatten structured pages into chunks (200-500 tokens approx)
 * Each section's content is split into smaller chunks for better embedding
 */
export function flattenPagesToChunks(pages: CrawledPage[]): Chunk[] {
  const chunks: Chunk[] = [];
  const timestamp = new Date().toISOString();

  // Approximate tokens: ~4 chars = 1 token
  const MIN_CHUNK_CHARS = 800;  // ~200 tokens
  const MAX_CHUNK_CHARS = 2000; // ~500 tokens

  for (const page of pages) {
    if (!page.sections || page.sections.length === 0) {
      // Page has no content, skip
      continue;
    }

    for (const section of page.sections) {
      const content = section.content.trim();
      if (!content) continue;

      // If section is small enough, keep as single chunk
      if (content.length <= MAX_CHUNK_CHARS) {
        const text = `${section.heading}\n\n${content}`;
        const chunk: Chunk = {
          url: page.url,
          section_heading: section.heading,
          chunk_index: 0,
          text,
          hash: computeChunkHash(text),
          last_crawled: timestamp,
        };
        
        // Only add if valid
        if (isValidChunk(chunk)) {
          chunks.push(chunk);
        }
      } else {
        // Split large sections into multiple chunks
        const sentences = content.match(/[^.!?]+[.!?]+/g) || [content];
        let currentChunk = `${section.heading}\n\n`;
        let chunkIndex = 0;

        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i].trim();
          
          // If adding this sentence exceeds max, save current chunk
          if (currentChunk.length + sentence.length > MAX_CHUNK_CHARS && currentChunk.length > MIN_CHUNK_CHARS) {
            const chunk: Chunk = {
              url: page.url,
              section_heading: section.heading,
              chunk_index: chunkIndex++,
              text: currentChunk.trim(),
              hash: computeChunkHash(currentChunk.trim()),
              last_crawled: timestamp,
            };
            
            if (isValidChunk(chunk)) {
              chunks.push(chunk);
            }
            
            currentChunk = `${section.heading} (cont.)\n\n${sentence} `;
          } else {
            currentChunk += sentence + " ";
          }
        }

        // Don't forget the last chunk
        if (currentChunk.trim().length > section.heading.length + 10) {
          const chunk: Chunk = {
            url: page.url,
            section_heading: section.heading,
            chunk_index: chunkIndex,
            text: currentChunk.trim(),
            hash: computeChunkHash(currentChunk.trim()),
            last_crawled: timestamp,
          };
          
          if (isValidChunk(chunk)) {
            chunks.push(chunk);
          }
        }
      }
    }
  }

  console.log(`Created ${chunks.length} valid chunks from ${pages.length} pages`);
  return chunks;
}

/**
 * Compute SHA256 hash of chunk text for change detection
 */
export function computeChunkHash(text: string): string {
  return crypto.createHash("sha256").update(text.trim()).digest("hex");
}

/**
 * Compare new chunks with existing chunks from vector DB
 * Returns chunks to add (new/changed) and chunks to remove (deleted)
 */
export function diffChunks(
  newChunks: Chunk[],
  existingChunks: Chunk[]
): ChunkDiff {
  const chunksToAdd: Chunk[] = [];
  const chunksToRemove: Chunk[] = [];
  const chunksUnchanged: Chunk[] = [];

  // Create hash maps for efficient lookup
  const newChunksMap = new Map<string, Chunk>();
  const existingChunksMap = new Map<string, Chunk>();

  // Build map of new chunks: key = url + section + chunk_index
  for (const chunk of newChunks) {
    const key = `${chunk.url}::${chunk.section_heading}::${chunk.chunk_index}`;
    newChunksMap.set(key, chunk);
  }

  // Build map of existing chunks
  for (const chunk of existingChunks) {
    const key = `${chunk.url}::${chunk.section_heading}::${chunk.chunk_index}`;
    existingChunksMap.set(key, chunk);
  }

  // Find chunks to add (new or changed)
  for (const [key, newChunk] of newChunksMap) {
    const existing = existingChunksMap.get(key);
    
    if (!existing) {
      // New chunk
      chunksToAdd.push(newChunk);
    } else if (existing.hash !== newChunk.hash) {
      // Content changed
      chunksToAdd.push(newChunk);
      chunksToRemove.push(existing); // Remove old version
    } else {
      // Unchanged
      chunksUnchanged.push(existing);
    }
  }

  // Find chunks to remove (deleted from new crawl)
  for (const [key, existingChunk] of existingChunksMap) {
    if (!newChunksMap.has(key)) {
      chunksToRemove.push(existingChunk);
    }
  }

  return {
    chunksToAdd,
    chunksToRemove,
    chunksUnchanged,
  };
}

/**
 * Get unique chunk ID for Chroma DB
 * Uses MD5 hash for long IDs to comply with Chroma Cloud's 128-byte limit
 */
export function getChunkId(chunk: Chunk): string {
  const fullId = `${chunk.url}::${chunk.section_heading}::${chunk.chunk_index}`;
  
  // If ID is short enough, use it directly
  if (fullId.length <= 100) {
    return fullId;
  }
  
  // Hash long IDs to stay under Chroma Cloud's 128-byte limit
  const hash = crypto.createHash('md5').update(fullId).digest('hex');
  return `hash_${hash}`;
}
