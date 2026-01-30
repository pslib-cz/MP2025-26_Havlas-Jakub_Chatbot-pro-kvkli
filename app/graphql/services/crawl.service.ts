import fs from "fs/promises";
import path from "path";
import axios from "axios";
import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import LoggerService from "./logger.service";

export type ContentSection = {
    heading: string;
    level: number;
    content: string;
};

export interface CrawledPage {
    url: string;
    path: string; // Add path property
    title: string;
    language?: string;
    sections: ContentSection[];
}

export interface CrawlResponse {
    success: boolean;
    message: string;
    pagesCount: number;
    outputFile: string;
}

export interface CrawlProgress {
    status: "idle" | "running" | "completed" | "error";
    phase:
        | "idle"
        | "crawling"
        | "chunking"
        | "diffing"
        | "updating"
        | "completed"
        | "error";
    pagesVisited: number;
    pagesInQueue: number;
    totalPages: number;
    chunksCreated: number;
    chunksToAdd: number;
    chunksToRemove: number;
    currentUrl: string | null;
    startTime: number | null;
    endTime: number | null;
    error: string | null;
}

// Global progress tracker
let currentProgress: CrawlProgress = {
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
};

// Stop signal
let shouldStop = false;

export function getCrawlProgress(): CrawlProgress {
    // Always return a valid progress object with explicit null values
    return {
        status: currentProgress.status,
        phase: currentProgress.phase,
        pagesVisited: currentProgress.pagesVisited,
        pagesInQueue: currentProgress.pagesInQueue,
        totalPages: currentProgress.totalPages,
        chunksCreated: currentProgress.chunksCreated,
        chunksToAdd: currentProgress.chunksToAdd,
        chunksToRemove: currentProgress.chunksToRemove,
        currentUrl: currentProgress.currentUrl ?? null,
        startTime: currentProgress.startTime ?? null,
        endTime: currentProgress.endTime ?? null,
        error: currentProgress.error ?? null,
    };
}

export function updateCrawlProgress(update: Partial<CrawlProgress>): void {
    currentProgress = { ...currentProgress, ...update };
}

export function stopCrawl(): boolean {
    if (currentProgress.status === "running") {
        shouldStop = true;
        currentProgress.status = "error";
        currentProgress.error = "Crawl stopped by user";
        currentProgress.endTime = Date.now();
        return true;
    }
    return false;
}

function sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
}

function normalizeUrl(url: string) {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
}

/**
 * Extract the main content area from HTML, removing navigation, headers, footers, etc.
 * Prefers <main> or <article>, falls back to <body>
 */
function extractMainContent(root: HTMLElement): HTMLElement | null {
    // Try to find main content container
    let mainContent = root.querySelector("main");
    if (!mainContent) {
        mainContent = root.querySelector("article");
    }
    if (!mainContent) {
        mainContent = root.querySelector("body");
    }

    if (!mainContent) return null;

    // Clone to avoid modifying original by serializing and re-parsing
    const clone = parse(mainContent.toString());

    // Remove unwanted elements
    const unwantedSelectors = [
        "nav",
        "header",
        "footer",
        "aside",
        "script",
        "style",
        "noscript",
        "iframe",
        ".cookie-banner",
        ".cookie-notice",
        "#cookie-consent",
        ".advertisement",
        ".ad",
        ".social-share",
        ".breadcrumb",
    ];

    unwantedSelectors.forEach((selector) => {
        clone.querySelectorAll(selector).forEach((el) => el.remove());
    });

    return clone;
}

/**
 * Extract structured content sections based on headings (h1-h6)
 * Content is grouped under the nearest preceding heading
 * Properly handles nested headings (h1 > h2 > h3) for better structure
 */
function extractStructuredSections(mainContent: HTMLElement): ContentSection[] {
    const sections: ContentSection[] = [];
    let currentSection: ContentSection | null = null;

    // Helper to normalize and clean text
    const cleanText = (text: string): string => {
        return text.replace(/\s+/g, " ").replace(/\n+/g, " ").trim();
    };

    // Helper to check if text content is meaningful
    const isMeaningful = (text: string): boolean => {
        // More strict filtering
        if (text.length < 50) return false; // Increased from 20

        // Skip common navigation/boilerplate text
        const boilerplatePatterns = [
            /^(menu|navigation|sidebar|footer|header)/i,
            /^(přihlásit|odhlásit|login|logout)/i,
            /^(sdílet|share|print|tisk)/i,
            /^(cookies|soubory cookie)/i,
        ];

        return !boilerplatePatterns.some((pattern) => pattern.test(text));
    };

    // Collect text from a node, excluding nested headings
    const collectText = (node: HTMLElement): string => {
        let text = "";

        for (const child of node.childNodes) {
            if (child.nodeType === 3) {
                // Text node - collect it
                text += " " + (child.textContent || "");
            } else if (child.nodeType === 1) {
                const childEl = child as HTMLElement;
                const tag = childEl.tagName?.toLowerCase();

                // Skip headings - they'll be processed separately
                if (tag?.match(/^h[1-6]$/)) {
                    continue;
                }

                // Recursively collect text from other elements
                text += " " + collectText(childEl);
            }
        }

        return text;
    };

    // Walk through DOM tree
    const walk = (node: HTMLElement) => {
        // Process direct children in order
        for (const child of node.childNodes) {
            if (child.nodeType !== 1) continue; // Skip non-element nodes

            const element = child as HTMLElement;
            const tagName = element.tagName?.toLowerCase();

            const headingMatch = tagName?.match(/^h([1-6])$/);
            if (headingMatch) {
                const level = parseInt(headingMatch[1], 10);
                const headingText = cleanText(element.textContent || "");

                if (headingText) {
                    if (
                        currentSection &&
                        isMeaningful(currentSection.content)
                    ) {
                        sections.push(currentSection);
                    }

                    currentSection = {
                        heading: headingText,
                        level: level,
                        content: "",
                    };
                }
            } else {
                const text = cleanText(collectText(element));

                if (text) {
                    if (!currentSection) {
                        currentSection = {
                            heading: "Introduction",
                            level: 1,
                            content: text,
                        };
                    } else {
                        currentSection.content +=
                            (currentSection.content ? " " : "") + text;
                    }
                }

                // Recurse to find nested headings
                walk(element);
            }
        }
    };

    walk(mainContent);

    //@ts-expect-error -- currentSection is checked
    if (currentSection && isMeaningful(currentSection.content)) {
        sections.push(currentSection);
    }

    return sections;
}

/**
 * Extract dynamic event/article links from the page
 */
function extractDynamicLinks(root: HTMLElement, baseUrl: string): string[] {
    const dynamicLinks: string[] = [];

    // Look for links matching dynamic patterns
    const links = root.querySelectorAll(
        'a[href*="/akce/id:"], a[href*="/akce/detail/"]',
    );

    for (const link of links) {
        const href = link.getAttribute("href");
        if (href) {
            try {
                const absolute = new URL(href, baseUrl).toString();
                dynamicLinks.push(absolute);
            } catch {
                // ignore invalid URLs
            }
        }
    }

    return dynamicLinks;
}

/**
 * Check if URL should be crawled based on content relevance
 */
function isRelevantUrl(url: string): boolean {
    const urlLower = url.toLowerCase();

    // Skip irrelevant sections
    const irrelevantPatterns = [
        "/rss/",
        "/feed/",
        "/print/",
        "/export/",
        "/search/",
        "/login",
        "/logout",
        "/admin",
        "/api/",
        "?print=",
        "?share=",
        "/galerie/",
        "/fotogalerie/",
    ];

    if (irrelevantPatterns.some((pattern) => urlLower.includes(pattern))) {
        return false;
    }

    // Prioritize important sections
    const importantPatterns = [
        "/sluzby/", // Services
        "/akce/", // Events
        "/o-knihovne/", // About
        "/kontakty/", // Contact
        "/katalog/", // Catalog
        "/o-nas/", // Education
    ];

    // If URL contains important patterns, keep it
    // Otherwise, check if it's the homepage or a top-level page
    const hasImportantContent = importantPatterns.some((pattern) =>
        urlLower.includes(pattern),
    );
    const isTopLevel = url.split("/").length <= 4; // e.g., https://kvkli.cz/page

    return hasImportantContent || isTopLevel;
}

/**
 * Check if URL points to a binary/non-HTML resource
 */
function shouldSkipUrl(url: string): boolean {
    const urlLower = url.toLowerCase();

    // Check if not relevant first
    if (!isRelevantUrl(url)) {
        return true;
    }

    // Skip file downloads
    if (urlLower.includes("/getfile/")) return true;
    if (urlLower.includes("/download/")) return true;

    // Skip common binary file extensions
    const binaryExtensions = [
        ".pdf",
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".svg",
        ".mp4",
        ".avi",
        ".mov",
        ".wmv",
        ".flv",
        ".mp3",
        ".wav",
        ".ogg",
        ".m4a",
        ".zip",
        ".rar",
        ".7z",
        ".tar",
        ".gz",
        ".doc",
        ".docx",
        ".xls",
        ".xlsx",
        ".ppt",
        ".pptx",
        ".exe",
        ".dmg",
        ".pkg",
        ".deb",
        ".rpm",
    ];

    return binaryExtensions.some((ext) => urlLower.endsWith(ext));
}

/**
 * Process a single URL (extracted for parallel execution)
 */
async function processUrl(
    url: string,
    baseOrigin: string,
): Promise<{ page: CrawledPage | null; links: string[] }> {
    const normalized = normalizeUrl(url);

    if (shouldSkipUrl(normalized)) {
        return { page: null, links: [] };
    }

    let html: string;
    try {
        const res = await axios.get(normalized, {
            headers: {
                "User-Agent": "RespectfulCrawler/1.0 (+slow)",
            },
            timeout: 10000,
            validateStatus: (status) => status === 200, // Only accept 200 OK
        });

        // Check Content-Type header to avoid parsing binary content
        const contentType = res.headers["content-type"] || "";
        if (!contentType.includes("text/html")) {
            return { page: null, links: [] };
        }

        html = res.data;
    } catch (error) {
        LoggerService.logError(error as Error, "processUrl", {
            url: normalized,
        });
        return { page: null, links: [] };
    }

    // Parse HTML
    const root = parse(html);

    // Extract structured content
    const title =
        root.querySelector("title")?.textContent?.trim() || "Untitled";
    const language =
        root.querySelector("html")?.getAttribute("lang") || undefined;

    // Extract URL path
    const urlObj = new URL(normalized);
    const path = urlObj.pathname;

    const mainContent = extractMainContent(root);
    const sections = mainContent ? extractStructuredSections(mainContent) : [];

    const page: CrawledPage = {
        url: normalized,
        path,
        title,
        language,
        sections,
    };

    // Collect all links
    const foundLinks: string[] = [];

    // Regular links
    const links = root.querySelectorAll("a[href]");
    for (const a of links) {
        const href = a.getAttribute("href");
        if (!href) continue;

        try {
            const absolute = normalizeUrl(new URL(href, normalized).toString());
            if (absolute.startsWith(baseOrigin) && !shouldSkipUrl(absolute)) {
                foundLinks.push(absolute);
            }
        } catch {
            // ignore invalid URLs
        }
    }

    // Dynamic links
    const dynamicLinks = extractDynamicLinks(root, normalized);
    for (const link of dynamicLinks) {
        const absolute = normalizeUrl(link);
        if (absolute.startsWith(baseOrigin) && !shouldSkipUrl(absolute)) {
            foundLinks.push(absolute);
        }
    }

    return { page, links: foundLinks };
}

export async function crawlSite(
    startUrl: string = "https://www.kvkli.cz",
    options?: {
        maxPages?: number;
        delayMs?: number;
        concurrency?: number;
    },
): Promise<CrawlResponse> {
    const maxPages = options?.maxPages ?? 2000;
    const delayMs = options?.delayMs ?? 1000; // Reduced delay with parallelism
    const concurrency = options?.concurrency ?? 5; // Process 5 pages at once

    // Reset stop signal and progress
    shouldStop = false;
    currentProgress = {
        status: "running",
        phase: "crawling",
        pagesVisited: 0,
        pagesInQueue: 1,
        totalPages: maxPages,
        chunksCreated: 0,
        chunksToAdd: 0,
        chunksToRemove: 0,
        currentUrl: null,
        startTime: Date.now(),
        endTime: null,
        error: null,
    };

    const visited = new Set<string>();
    const queue: string[] = [startUrl];
    const results: CrawledPage[] = [];

    const baseOrigin = new URL(startUrl).origin;

    try {
        while (queue.length > 0 && visited.size < maxPages && !shouldStop) {
            // Update progress
            currentProgress.pagesVisited = visited.size;
            currentProgress.pagesInQueue = queue.length;

            const batch: string[] = [];

            while (batch.length < concurrency && queue.length > 0) {
                const url = queue.shift()!;
                const normalized = normalizeUrl(url);

                if (!visited.has(normalized)) {
                    visited.add(normalized);
                    batch.push(normalized);
                }
            }

            if (batch.length === 0) break;

            // Check for stop signal
            if (shouldStop) {
                break;
            }

            currentProgress.currentUrl = batch[0];

            const batchResults = await Promise.all(
                batch.map((url) => processUrl(url, baseOrigin)),
            );

            for (const { page, links } of batchResults) {
                if (page) {
                    results.push(page);
                }

                for (const link of links) {
                    if (!visited.has(link)) {
                        queue.push(link);
                    }
                }
            }

            // Small delay between batches
            await sleep(delayMs);
        }

        // Check if stopped
        if (shouldStop) {
            LoggerService.warn("Crawl stopped by user", {
                pagesVisited: visited.size,
            });

            currentProgress = {
                ...currentProgress,
                status: "error",
                error: "Stopped by user",
                endTime: Date.now(),
            };

            return {
                success: false,
                message: "Crawl stopped by user",
                pagesCount: visited.size,
                outputFile: "",
            };
        }

        const outputDir = path.join(process.cwd(), "crawler-output");
        await fs.mkdir(outputDir, { recursive: true });

        const timestamp = Date.now();
        const outputFile = path.join(
            outputDir,
            `kvkli-structured-content-${timestamp}.json`,
        );

        await fs.writeFile(
            outputFile,
            JSON.stringify(results, null, 2),
            "utf-8",
        );

        LoggerService.info("Crawling completed", {
            pagesCount: visited.size,
            outputFile,
        });

        currentProgress = {
            status: "completed",
            phase: "completed",
            pagesVisited: visited.size,
            pagesInQueue: 0,
            totalPages: maxPages,
            chunksCreated: 0,
            chunksToAdd: 0,
            chunksToRemove: 0,
            currentUrl: null,
            endTime: Date.now(),
            startTime: currentProgress.startTime,
            error: null,
        };

        return {
            success: true,
            message: "Crawling completed politely 🐢",
            pagesCount: visited.size,
            outputFile,
        };
    } catch (err: unknown) {
        LoggerService.logError(err as Error, "crawlSite", {
            startUrl,
            pagesVisited: visited.size,
        });

        const errorMessage =
            err instanceof Error ? err.message : "Crawler failed";

        currentProgress = {
            ...currentProgress,
            status: "error",
            error: errorMessage,
            endTime: Date.now(),
        };

        return {
            success: false,
            message: errorMessage,
            pagesCount: visited.size,
            outputFile: "",
        };
    }
}
