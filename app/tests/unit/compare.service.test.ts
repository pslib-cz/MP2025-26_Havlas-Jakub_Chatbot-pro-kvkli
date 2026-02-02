import { describe, it, expect } from "@jest/globals";
import {
  flattenPagesToChunks,
  computeChunkHash,
  diffChunks,
  getChunkId,
  Chunk,
} from "../../graphql/services/compare.service";
import { CrawledPage } from "../../graphql/services/crawl.service";

describe("compare.service", () => {
  describe("computeChunkHash", () => {
    it("should generate consistent hash for same text", () => {
      const text = "This is a test chunk";
      const hash1 = computeChunkHash(text);
      const hash2 = computeChunkHash(text);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA256 produces 64 hex characters
    });

    it("should generate different hashes for different text", () => {
      const text1 = "This is chunk 1";
      const text2 = "This is chunk 2";
      
      const hash1 = computeChunkHash(text1);
      const hash2 = computeChunkHash(text2);
      
      expect(hash1).not.toBe(hash2);
    });

    it("should trim whitespace before hashing", () => {
      const text1 = "  test  ";
      const text2 = "test";
      
      const hash1 = computeChunkHash(text1);
      const hash2 = computeChunkHash(text2);
      
      expect(hash1).toBe(hash2);
    });
  });

  describe("getChunkId", () => {
    it("should generate unique ID from chunk properties", () => {
      const chunk: Chunk = {
        url: "https://example.com/page1",
        section_heading: "Introduction",
        chunk_index: 0,
        text: "Some text",
        hash: "abc123",
        last_crawled: "2026-01-01T00:00:00.000Z",
      };

      const id = getChunkId(chunk);
      
      expect(id).toBe("https://example.com/page1::Introduction::0");
    });

    it("should generate different IDs for different chunk indices", () => {
      const chunk1: Chunk = {
        url: "https://example.com/page1",
        section_heading: "Section A",
        chunk_index: 0,
        text: "Text 1",
        hash: "hash1",
        last_crawled: "2026-01-01T00:00:00.000Z",
      };

      const chunk2: Chunk = {
        ...chunk1,
        chunk_index: 1,
      };

      expect(getChunkId(chunk1)).not.toBe(getChunkId(chunk2));
    });
  });

  describe("flattenPagesToChunks", () => {
    it("should handle empty pages array", () => {
      const chunks = flattenPagesToChunks([]);
      expect(chunks).toEqual([]);
    });

    it("should skip pages with no sections", () => {
      const pages: CrawledPage[] = [
        {
          url: "https://example.com/empty",
          path: "/empty",
          title: "Empty Page",
          sections: [],
        },
      ];

      const chunks = flattenPagesToChunks(pages);
      expect(chunks).toEqual([]);
    });

    it("should create single chunk for small section", () => {
      const pages: CrawledPage[] = [
        {
          url: "https://example.com/page1",
          path: "/page1",
          title: "Test Page",
          sections: [
            {
              heading: "Small Section",
              level: 1,
              content: "This is a small piece of content that fits in one chunk. It needs to be at least 100 characters long to pass validation. This sentence makes it long enough.",
            },
          ],
        },
      ];

      const chunks = flattenPagesToChunks(pages);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0].url).toBe("https://example.com/page1");
      expect(chunks[0].section_heading).toBe("Small Section");
      expect(chunks[0].chunk_index).toBe(0);
      expect(chunks[0].text).toContain("Small Section");
      expect(chunks[0].text).toContain("This is a small piece");
      expect(chunks[0].hash).toBeDefined();
      expect(chunks[0].last_crawled).toBeDefined();
    });

    it("should split large sections into multiple chunks", () => {
      // Create a large section with multiple sentences
      const longContent = Array(50)
        .fill("This is a sentence that will be part of a large section.")
        .join(" ");

      const pages: CrawledPage[] = [
        {
          url: "https://example.com/page2",
          path: "/page2",
          title: "Long Page",
          sections: [
            {
              heading: "Large Section",
              level: 1,
              content: longContent,
            },
          ],
        },
      ];

      const chunks = flattenPagesToChunks(pages);
      
      expect(chunks.length).toBeGreaterThan(1);
      
      // Each chunk should have the same section heading
      chunks.forEach((chunk) => {
        expect(chunk.section_heading).toBe("Large Section");
        expect(chunk.url).toBe("https://example.com/page2");
      });

      // Chunk indices should be sequential
      chunks.forEach((chunk, index) => {
        expect(chunk.chunk_index).toBe(index);
      });

      // Continuation chunks should have "(cont.)" in heading
      if (chunks.length > 1) {
        for (let i = 1; i < chunks.length; i++) {
          expect(chunks[i].text).toContain("(pokračování)");
        }
      }
    });

    it("should handle multiple sections from same page", () => {
      const pages: CrawledPage[] = [
        {
          url: "https://example.com/multi",
          path: "/multi",
          title: "Multi Section Page",
          sections: [
            {
              heading: "Section 1",
              level: 1,
              content: "Content of section 1. This needs to be longer than 100 characters to pass the validation check. Adding more text here to meet the requirement.",
            },
            {
              heading: "Section 2",
              level: 2,
              content: "Content of section 2. This also needs to be longer than 100 characters to pass validation. More text added to reach minimum length.",
            },
          ],
        },
      ];

      const chunks = flattenPagesToChunks(pages);
      
      expect(chunks).toHaveLength(2);
      expect(chunks[0].section_heading).toBe("Section 1");
      expect(chunks[1].section_heading).toBe("Section 2");
    });

    it("should skip sections with empty content", () => {
      const pages: CrawledPage[] = [
        {
          url: "https://example.com/mixed",
          path: "/mixed",
          title: "Mixed Page",
          sections: [
            {
              heading: "Empty Section",
              level: 1,
              content: "   ",
            },
            {
              heading: "Valid Section",
              level: 1,
              content: "This has content that is meaningful and long enough to pass validation. We need at least 100 characters for a chunk to be considered valid.",
            },
          ],
        },
      ];

      const chunks = flattenPagesToChunks(pages);
      
      expect(chunks).toHaveLength(1);
      expect(chunks[0].section_heading).toBe("Valid Section");
    });
  });

  describe("diffChunks", () => {
    it("should detect new chunks", () => {
      const newChunks: Chunk[] = [
        {
          url: "https://example.com/new",
          section_heading: "New Section",
          chunk_index: 0,
          text: "New content",
          hash: computeChunkHash("New content"),
          last_crawled: "2026-01-02T00:00:00.000Z",
        },
      ];

      const existingChunks: Chunk[] = [];

      const diff = diffChunks(newChunks, existingChunks);

      expect(diff.chunksToAdd).toHaveLength(1);
      expect(diff.chunksToRemove).toHaveLength(0);
      expect(diff.chunksUnchanged).toHaveLength(0);
      expect(diff.chunksToAdd[0]).toEqual(newChunks[0]);
    });

    it("should detect unchanged chunks", () => {
      const chunk: Chunk = {
        url: "https://example.com/page",
        section_heading: "Section",
        chunk_index: 0,
        text: "Same content",
        hash: computeChunkHash("Same content"),
        last_crawled: "2026-01-01T00:00:00.000Z",
      };

      const newChunks: Chunk[] = [{ ...chunk }];
      const existingChunks: Chunk[] = [{ ...chunk }];

      const diff = diffChunks(newChunks, existingChunks);

      expect(diff.chunksToAdd).toHaveLength(0);
      expect(diff.chunksToRemove).toHaveLength(0);
      expect(diff.chunksUnchanged).toHaveLength(1);
    });

    it("should detect changed chunks", () => {
      const oldChunk: Chunk = {
        url: "https://example.com/page",
        section_heading: "Section",
        chunk_index: 0,
        text: "Old content",
        hash: computeChunkHash("Old content"),
        last_crawled: "2026-01-01T00:00:00.000Z",
      };

      const newChunk: Chunk = {
        url: "https://example.com/page",
        section_heading: "Section",
        chunk_index: 0,
        text: "Updated content",
        hash: computeChunkHash("Updated content"),
        last_crawled: "2026-01-02T00:00:00.000Z",
      };

      const diff = diffChunks([newChunk], [oldChunk]);

      expect(diff.chunksToAdd).toHaveLength(1);
      expect(diff.chunksToRemove).toHaveLength(1);
      expect(diff.chunksUnchanged).toHaveLength(0);
      expect(diff.chunksToAdd[0]).toEqual(newChunk);
      expect(diff.chunksToRemove[0]).toEqual(oldChunk);
    });

    it("should detect removed chunks", () => {
      const oldChunk: Chunk = {
        url: "https://example.com/deleted",
        section_heading: "Removed Section",
        chunk_index: 0,
        text: "This will be deleted",
        hash: computeChunkHash("This will be deleted"),
        last_crawled: "2026-01-01T00:00:00.000Z",
      };

      const diff = diffChunks([], [oldChunk]);

      expect(diff.chunksToAdd).toHaveLength(0);
      expect(diff.chunksToRemove).toHaveLength(1);
      expect(diff.chunksUnchanged).toHaveLength(0);
      expect(diff.chunksToRemove[0]).toEqual(oldChunk);
    });

    it("should handle complex diff with mixed changes", () => {
      const unchanged: Chunk = {
        url: "https://example.com/page1",
        section_heading: "Unchanged",
        chunk_index: 0,
        text: "Same",
        hash: computeChunkHash("Same"),
        last_crawled: "2026-01-01T00:00:00.000Z",
      };

      const oldVersion: Chunk = {
        url: "https://example.com/page2",
        section_heading: "Modified",
        chunk_index: 0,
        text: "Old",
        hash: computeChunkHash("Old"),
        last_crawled: "2026-01-01T00:00:00.000Z",
      };

      const newVersion: Chunk = {
        ...oldVersion,
        text: "New",
        hash: computeChunkHash("New"),
        last_crawled: "2026-01-02T00:00:00.000Z",
      };

      const removed: Chunk = {
        url: "https://example.com/page3",
        section_heading: "Deleted",
        chunk_index: 0,
        text: "Gone",
        hash: computeChunkHash("Gone"),
        last_crawled: "2026-01-01T00:00:00.000Z",
      };

      const added: Chunk = {
        url: "https://example.com/page4",
        section_heading: "New",
        chunk_index: 0,
        text: "Fresh",
        hash: computeChunkHash("Fresh"),
        last_crawled: "2026-01-02T00:00:00.000Z",
      };

      const existingChunks = [unchanged, oldVersion, removed];
      const newChunks = [unchanged, newVersion, added];

      const diff = diffChunks(newChunks, existingChunks);

      expect(diff.chunksUnchanged).toHaveLength(1);
      expect(diff.chunksToAdd).toHaveLength(2); // modified + new
      expect(diff.chunksToRemove).toHaveLength(2); // old version + deleted

      expect(diff.chunksUnchanged[0].section_heading).toBe("Unchanged");
      expect(diff.chunksToAdd.find(c => c.section_heading === "Modified")).toBeDefined();
      expect(diff.chunksToAdd.find(c => c.section_heading === "New")).toBeDefined();
      expect(diff.chunksToRemove.find(c => c.section_heading === "Deleted")).toBeDefined();
    });
  });
});
