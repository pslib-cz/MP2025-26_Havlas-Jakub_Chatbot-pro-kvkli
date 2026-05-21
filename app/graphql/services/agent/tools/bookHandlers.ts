// ─── Book Tool Handlers — Catalog, Recommendations, Plot Search ──────────────

import { z } from "zod";
import { DEFAULT_COUNT, FETCH_ALL_COUNT } from "../constants";
import {
    sanitizeInput,
    normalizeCount,
    toAsciiOnly,
    normalizeUnicode,
} from "../preprocessing";
import { formatBooks, filterByAuthor, ensureBookUrls } from "../formatting";
import { vectorService } from "../../book.service";
import { queryCatalogService } from "../../queryCatalog.service";
import LoggerService from "../../logger.service";
import type { BookItem } from "../../../../types";
import {
    SearchCatalogSchema,
    RecommendBooksSchema,
    FindBookByPlotSchema,
} from "./schemas";

// ─── Search Catalog ───────────────────────────────────────────────────────────

export async function handleSearchCatalog(
    args: z.infer<typeof SearchCatalogSchema>,
): Promise<string> {
    const query = sanitizeInput(args.query);
    const wantsAll = args.fetchAll === true;
    const limit = wantsAll
        ? FETCH_ALL_COUNT
        : normalizeCount(args.count, DEFAULT_COUNT);

    LoggerService.logAIFunctionCall("searchCatalog", {
        searchType: args.searchType,
        query,
        limit: wantsAll ? "all" : limit,
    });

    if (args.searchType === "author") {
        let books = await queryCatalogService.searchByAuthor(query, limit);

        // Retry with ASCII-stripped query if no results
        if (books.length === 0) {
            const asciiQuery = toAsciiOnly(query);
            if (asciiQuery && asciiQuery !== query) {
                LoggerService.warn(
                    "Author search retrying with ASCII-stripped query",
                    { original: query, ascii: asciiQuery },
                );
                books = await queryCatalogService.searchByAuthor(
                    asciiQuery,
                    limit,
                );
            }
        }

        // Filter out unrelated authors
        const verified = filterByAuthor(books as BookItem[], query);
        if (verified.length < books.length) {
            LoggerService.warn(
                "Filtered out unrelated authors from catalog results",
                {
                    original: books.length,
                    verified: verified.length,
                    requested: query,
                },
            );
        }

        if (verified.length === 0) {
            return JSON.stringify({
                status: "no_results",
                message:
                    "Nenašel jsem žádné knihy od tohoto autora v našem katalogu. Zkuste změnit hledaný výraz, například bez diakritiky.",
            });
        }

        return JSON.stringify({
            status: "ok",
            formatted: `V našem katalogu jsme nalezli tyto knihy:\n\n${formatBooks(verified, query)}`,
        });
    }

    let books;
    if (args.searchType === "title") {
        books = await queryCatalogService.searchByTitle(query, limit);

        // Retry with capitalized first letters if no results
        if (books.length === 0) {
            const capitalizedQuery = query
                .split(" ")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
            if (capitalizedQuery !== query) {
                LoggerService.warn(
                    "Title search retrying with capitalized query",
                    { original: query, capitalized: capitalizedQuery },
                );
                books = await queryCatalogService.searchByTitle(
                    capitalizedQuery,
                    limit,
                );
            }
        }

        // Fallback to general search if title still found nothing
        if (books.length === 0) {
            LoggerService.warn(
                "Title search failed, falling back to general search",
                { query },
            );
            books = await queryCatalogService.searchGeneral(query, limit);
        }
    } else if (args.searchType === "subject") {
        books = await queryCatalogService.searchBySubject(query, limit);
    } else {
        books = await queryCatalogService.searchGeneral(query, limit);
    }

    // Fallback: if general/title found nothing, try subject search
    if (books.length === 0 && args.searchType !== "subject") {
        LoggerService.warn(
            "searchCatalog: no results, retrying with subject search as fallback",
            { originalType: args.searchType, query },
        );
        books = await queryCatalogService.searchBySubject(query, limit);
    }

    if (books.length === 0) {
        return JSON.stringify({
            status: "no_results",
            message:
                "Nenašel jsem žádné knihy odpovídající vašemu hledání. Zkuste změnit hledaný výraz nebo se zeptejte jinak.",
        });
    }

    return JSON.stringify({
        status: "ok",
        formatted: `V našem katalogu jsme nalezli tyto knihy:\n\n${formatBooks(books as BookItem[])}`,
    });
}

// ─── Title Enrichment for Recommendations ─────────────────────────────────────

const TITLE_ENRICHMENT_THRESHOLD = 12;

const RECOMMENDATION_PREFIXES = [
    /^podobn[éá]\s+knih[yaou]\s+jako\s+/i,
    /^knih[yaou]\s+podobn[éá]\s+/i,
    /^doporuč(?:it|ení)?\s+(?:mi\s+)?(?:knih[yaou]\s+)?(?:podobn[éá]\s+)?(?:jako\s+)?/i,
    /^něco\s+podobného\s+jako\s+/i,
    /^hledám\s+(?:knih[yaou]\s+)?podobn[éá]\s+(?:jako\s+)?/i,
    /^chci\s+(?:knih[yaou]\s+)?podobn[éá]\s+(?:jako\s+)?/i,
];

const RECOMMENDATION_SUFFIXES = [
    /\s+(?:podobn[éá]\s+)?knih[yaou]$/i,
    /\s+doporuč(?:ení|it)?$/i,
];

function extractTitleFromQuery(query: string): string {
    let stripped = query.trim();
    for (const prefix of RECOMMENDATION_PREFIXES) {
        stripped = stripped.replace(prefix, "");
    }
    for (const suffix of RECOMMENDATION_SUFFIXES) {
        stripped = stripped.replace(suffix, "");
    }
    stripped = stripped.trim();
    return stripped.length > 0 && stripped.length < query.trim().length
        ? stripped
        : query.trim();
}

function normalizeTitleForMatch(title: string): string {
    return normalizeUnicode(title)
        .toLowerCase()
        .replace(/\s*\/\s*$/, "")
        .replace(/[^\w\s]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function extractEnrichment(book: {
    description?: string;
    subjects?: string;
}): string | null {
    const parts: string[] = [];
    if (book.description) parts.push(book.description);
    if (book.subjects) parts.push(`Témata: ${book.subjects}`);
    return parts.length > 0 ? parts.join(". ") : null;
}

async function tryEnrichTitleQuery(
    query: string,
): Promise<{ enrichedQuery: string; sourceTitle: string | null }> {
    const wordCount = query.trim().split(/\s+/).length;
    if (wordCount > TITLE_ENRICHMENT_THRESHOLD) {
        return { enrichedQuery: query, sourceTitle: null };
    }

    const bareTitle = extractTitleFromQuery(query);
    const searchQuery = bareTitle;
    const queryNorm = normalizeTitleForMatch(bareTitle);

    if (bareTitle !== query.trim()) {
        LoggerService.info(
            "recommendBooks: stripped recommendation phrasing from query",
            { originalQuery: query, extractedTitle: bareTitle },
        );
    }

    // Step 1: Try catalog search with fuzzy matching
    try {
        const catalogResults = await queryCatalogService.searchByTitle(
            searchQuery,
            5,
        );

        const match = catalogResults.find((b) => {
            const titleNorm = normalizeTitleForMatch(b.title);
            return (
                titleNorm.includes(queryNorm) || queryNorm.includes(titleNorm)
            );
        });

        if (match) {
            const enriched = extractEnrichment(match);
            if (enriched) {
                LoggerService.info(
                    "recommendBooks: enriched title query from catalog",
                    {
                        originalQuery: query,
                        matchedTitle: match.title,
                        enrichedQueryPreview: enriched.substring(0, 200),
                    },
                );
                return { enrichedQuery: enriched, sourceTitle: match.title };
            }
        }
    } catch (err) {
        LoggerService.warn(
            "recommendBooks: catalog enrichment failed, trying ChromaDB fallback",
            { query, error: (err as Error).message },
        );
    }

    // Step 2: ChromaDB vector fallback
    try {
        const vectorResults = (await vectorService.searchBooks(
            searchQuery,
            3,
        )) as BookItem[];

        const match = vectorResults.find((b) => {
            const titleNorm = normalizeTitleForMatch(b.title);
            return (
                titleNorm.includes(queryNorm) || queryNorm.includes(titleNorm)
            );
        });

        if (match) {
            const enriched = extractEnrichment(match);
            if (enriched) {
                LoggerService.info(
                    "recommendBooks: enriched title query from ChromaDB fallback",
                    {
                        originalQuery: query,
                        matchedTitle: match.title,
                        enrichedQueryPreview: enriched.substring(0, 200),
                    },
                );
                return { enrichedQuery: enriched, sourceTitle: match.title };
            }
        }

        LoggerService.warn(
            "recommendBooks: no matching title found in catalog or ChromaDB",
            { query, catalogAttempted: true, chromaAttempted: true },
        );
    } catch (err) {
        LoggerService.warn(
            "recommendBooks: ChromaDB fallback also failed, using original query",
            { query, error: (err as Error).message },
        );
    }

    return { enrichedQuery: query, sourceTitle: null };
}

// ─── Recommend Books ──────────────────────────────────────────────────────────

export async function handleRecommendBooks(
    args: z.infer<typeof RecommendBooksSchema>,
): Promise<string> {
    const query = sanitizeInput(args.query);
    const limit = normalizeCount(args.count, DEFAULT_COUNT);

    LoggerService.logAIFunctionCall("recommendBooks", { query, limit });

    const { enrichedQuery, sourceTitle } = await tryEnrichTitleQuery(query);

    const books = (await vectorService.searchBooks(
        enrichedQuery,
        sourceTitle ? limit + 1 : limit,
    )) as BookItem[];

    let filtered = books;
    if (sourceTitle) {
        const srcLower = sourceTitle.toLowerCase();
        filtered = books.filter(
            (b) => !b.title.toLowerCase().includes(srcLower),
        );
    }
    filtered = filtered.slice(0, limit);

    if (filtered.length === 0) {
        return JSON.stringify({
            status: "no_results",
            message: "Nenašel jsem žádné knihy odpovídající vašemu dotazu.",
        });
    }

    const booksWithUrls = ensureBookUrls(filtered);

    return JSON.stringify({
        status: "ok",
        formatted: `Doporučuji tyto knihy:\n\n${formatBooks(booksWithUrls)}`,
    });
}

// ─── Find Book by Plot ────────────────────────────────────────────────────────

export async function handleFindBookByPlot(
    args: z.infer<typeof FindBookByPlotSchema>,
): Promise<string> {
    const plotDescription = sanitizeInput(args.plotDescription);
    const limit = normalizeCount(args.count, DEFAULT_COUNT);

    LoggerService.logAIFunctionCall("findBookByPlot", {
        plotDescription,
        limit,
    });

    const books = (await vectorService.searchBooks(
        plotDescription,
        limit,
    )) as BookItem[];

    if (books.length === 0) {
        return JSON.stringify({
            status: "no_results",
            message: "Nenašel jsem žádné knihy odpovídající vašemu popisu.",
        });
    }

    const booksWithUrls = ensureBookUrls(books);

    return JSON.stringify({
        status: "ok",
        formatted: `Nalezl jsem tyto knihy odpovídající vašemu popisu:\n\n${formatBooks(booksWithUrls)}`,
    });
}
