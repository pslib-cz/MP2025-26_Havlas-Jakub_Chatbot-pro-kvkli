import { describe, it, expect } from "@jest/globals";

/**
 * Smoke Tests - Basic sanity checks
 * These tests verify that core modules load and basic functionality works
 * They don't test detailed logic (that's for unit tests) but catch import errors,
 * missing dependencies, and basic structural issues
 */

describe("Smoke Tests - Services Load", () => {
  it("should load compare.service without errors", async () => {
    const compareService = await import("../../graphql/services/compare.service");
    
    expect(compareService.computeChunkHash).toBeDefined();
    expect(compareService.getChunkId).toBeDefined();
    expect(compareService.flattenPagesToChunks).toBeDefined();
    expect(compareService.diffChunks).toBeDefined();
  });

  it("should load crawl.service without errors", async () => {
    const crawlService = await import("../../graphql/services/crawl.service");
    
    expect(crawlService.crawlSite).toBeDefined();
  });

  it("should load prisma.service without errors", async () => {
    const prismaService = await import("../../graphql/services/prisma.service");
    
    expect(prismaService.prismaService).toBeDefined();
    expect(prismaService.prismaService.findAllConversations).toBeDefined();
    expect(prismaService.prismaService.findAllPrompts).toBeDefined();
  });

  it("should load originGuard without errors", async () => {
    const originGuard = await import("../../graphql/middleware/originGuard");

    expect(originGuard.validateOrigin).toBeDefined();
    expect(originGuard.extractTokenFromHeaders).toBeDefined();
  });
});

describe("Smoke Tests - Basic Functionality", () => {
  it("should compute hash for a string", async () => {
    const { computeChunkHash } = await import("../../graphql/services/compare.service");
    
    const hash = computeChunkHash("test content");
    
    expect(hash).toBeDefined();
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // SHA256 hash length
  });

  it("should generate chunk ID", async () => {
    const { getChunkId } = await import("../../graphql/services/compare.service");
    
    const chunk = {
      url: "https://example.com",
      section_heading: "Test",
      chunk_index: 0,
      text: "content",
      hash: "abc",
      last_crawled: "2026-01-01"
    };
    
    const id = getChunkId(chunk);
    
    expect(id).toBeDefined();
    expect(id).toBe("https://example.com::Test::0");
  });

  it("should flatten empty pages array", async () => {
    const { flattenPagesToChunks } = await import("../../graphql/services/compare.service");
    
    const chunks = flattenPagesToChunks([]);
    
    expect(Array.isArray(chunks)).toBe(true);
    expect(chunks.length).toBe(0);
  });

  it("should diff empty chunk arrays", async () => {
    const { diffChunks } = await import("../../graphql/services/compare.service");
    
    const diff = diffChunks([], []);
    
    expect(diff).toBeDefined();
    expect(diff.chunksToAdd).toBeDefined();
    expect(diff.chunksToRemove).toBeDefined();
    expect(diff.chunksUnchanged).toBeDefined();
    expect(Array.isArray(diff.chunksToAdd)).toBe(true);
  });
});

describe("Smoke Tests - Origin Guard", () => {
  it("should allow exempt operations without origin", async () => {
    const { validateOrigin } = await import("../../graphql/middleware/originGuard");

    // These should NOT throw
    expect(() => validateOrigin(null, null, "login")).not.toThrow();
    expect(() => validateOrigin(null, null, "Login")).not.toThrow();
    expect(() => validateOrigin(null, null, "heartbeat")).not.toThrow();
    expect(() => validateOrigin(null, null, "IntrospectionQuery")).not.toThrow();
  });

  it("should reject requests with no origin and non-exempt operation", async () => {
    const { validateOrigin } = await import("../../graphql/middleware/originGuard");

    expect(() => validateOrigin(null, null, "getConversations")).toThrow("Forbidden: missing origin");
    expect(() => validateOrigin(undefined, undefined, "someQuery")).toThrow("Forbidden: missing origin");
  });

  it("should allow requests from default localhost origin", async () => {
    const { validateOrigin } = await import("../../graphql/middleware/originGuard");

    // Default ALLOWED_ORIGINS includes http://localhost:3000
    expect(() => validateOrigin("http://localhost:3000", null, "getConversations")).not.toThrow();
  });

  it("should reject requests from unknown origins", async () => {
    const { validateOrigin } = await import("../../graphql/middleware/originGuard");

    expect(() => validateOrigin("http://evil.com", null, "getConversations")).toThrow("Forbidden: invalid origin");
  });

  it("should extract Bearer token from authorization header", async () => {
    const { extractTokenFromHeaders } = await import("../../graphql/middleware/originGuard");

    expect(extractTokenFromHeaders("Bearer abc123")).toBe("abc123");
    expect(extractTokenFromHeaders("Bearer ")).toBe("");
    expect(extractTokenFromHeaders(null)).toBeUndefined();
    expect(extractTokenFromHeaders(undefined)).toBeUndefined();
    expect(extractTokenFromHeaders("Basic abc123")).toBeUndefined();
    expect(extractTokenFromHeaders("InvalidFormat")).toBeUndefined();
  });

  it("should use referer as fallback when origin is missing", async () => {
    const { validateOrigin } = await import("../../graphql/middleware/originGuard");

    expect(() => validateOrigin(null, "http://localhost:3000/some/page", "getConversations")).not.toThrow();
  });
});

describe("Smoke Tests - HTML Parsing", () => {
  it("should parse basic HTML", async () => {
    const { parse } = await import("node-html-parser");
    
    const html = "<html><body><h1>Test</h1></body></html>";
    const root = parse(html);
    
    expect(root).toBeDefined();
    expect(root.querySelector("h1")).toBeDefined();
    expect(root.querySelector("h1")?.textContent).toBe("Test");
  });

  it("should handle URL construction", () => {
    const baseUrl = "https://example.com/page";
    const relativePath = "/other";
    
    const url = new URL(relativePath, baseUrl);
    
    expect(url.toString()).toBe("https://example.com/other");
  });
});

describe("Smoke Tests - Type System", () => {
  it("should have proper TypeScript types for Chunk", async () => {
    const { computeChunkHash } = await import("../../graphql/services/compare.service");
    
    const chunk: {
      url: string;
      section_heading: string;
      chunk_index: number;
      text: string;
      hash: string;
      last_crawled: string;
    } = {
      url: "test",
      section_heading: "test",
      chunk_index: 0,
      text: "test",
      hash: computeChunkHash("test"),
      last_crawled: new Date().toISOString()
    };
    
    expect(chunk.url).toBe("test");
  });

  it("should have proper types for CrawledPage", () => {
    const page: {
      url: string;
      title: string;
      sections: Array<{
        heading: string;
        level: number;
        content: string;
      }>;
    } = {
      url: "https://example.com",
      title: "Test Page",
      sections: [
        {
          heading: "Section 1",
          level: 1,
          content: "Content"
        }
      ]
    };
    
    expect(page.sections.length).toBe(1);
  });
});

describe("Smoke Tests - Node.js Built-ins", () => {
  it("should have access to crypto module", async () => {
    const crypto = await import("crypto");
    
    const hash = crypto.createHash("sha256");
    hash.update("test");
    const digest = hash.digest("hex");
    
    expect(digest).toBeDefined();
    expect(typeof digest).toBe("string");
  });

  it("should have access to path module", async () => {
    const path = await import("path");
    
    const joined = path.join("a", "b", "c");
    
    expect(joined).toBeDefined();
  });
});
