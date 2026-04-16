// ─── Tool Definitions — Zod Schemas & Handlers ───────────────────────────────

import { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat";
import { ToolRegistry } from "./ToolRegistry";
import { DEFAULT_COUNT, MAX_COUNT, FETCH_ALL_COUNT } from "./constants";
import { sanitizeInput, normalizeCount, toAsciiOnly } from "./preprocessing";
import { formatBooks, filterByAuthor, ensureBookUrls } from "./formatting";
import { vectorService } from "../book.service";
import { searchSimilarContent } from "../site.service";
import { queryCatalogService } from "../queryCatalog.service";
import { contactService } from "../contact.service";
import {
    scrapeOpeningHours,
    scrapeEvents,
    scrapeOfficeInfo,
} from "../scraper.service";
import LoggerService from "../logger.service";
import type { BookItem } from "../../../types";

// ─── Zod Schemas ──────────────────────────────────────────────────────────────

const SearchCatalogSchema = z.object({
    searchType: z.enum(["title", "author", "general"]),
    query: z.string().min(1),
    count: z.number().optional(),
});

const RecommendBooksSchema = z.object({
    query: z.string().min(1),
    count: z.number().optional(),
});

const FindBookByPlotSchema = z.object({
    plotDescription: z.string().min(1),
    count: z.number().optional(),
});

const SearchWebsiteSchema = z.object({
    query: z.string().min(1),
    maxResults: z.number().optional(),
});

const GetContactSchema = z
    .object({
        name: z.string().optional(),
        role: z.string().optional(),
        department: z.string().optional(),
    })
    .refine((d) => d.name || d.role || d.department, {
        message: "At least one search parameter is required",
    });

const GetOpeningHoursSchema = z.object({
    branch: z.string().optional(),
});

const GetEventsSchema = z.object({
    type: z.string().optional(),
    maxResults: z.number().optional(),
});

const GetOfficeInfoSchema = z.object({
    branch: z.string().optional(),
});

// ─── OpenAI Function Specs ────────────────────────────────────────────────────

const searchCatalogSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "searchCatalog",
        description:
            "Search the library catalog for specific books by title or author. Use this when user asks for a specific book name or author's works. IMPORTANT: Always use plain ASCII characters without diacritics for author names (e.g. use 'Jo Nesbo' not 'Jo Nesbø', 'Kafka' not 'Kafkä'). This prevents encoding errors. After receiving results, ALWAYS verify that every returned book actually matches the requested author/title — discard any results that belong to a different author.",
        parameters: {
            type: "object",
            properties: {
                searchType: {
                    type: "string",
                    enum: ["title", "author", "general"],
                    description:
                        "Type of search: 'title' for book titles, 'author' for author names, 'general' for general search",
                },
                query: {
                    type: "string",
                    description:
                        "The book title, author name, or search term. Use plain ASCII only — no accented or special characters.",
                },
                count: {
                    type: "number",
                    description:
                        "How many books to return. Use exactly what the user requested (e.g. 3 if they said 'give me 3 books'). If the user says 'all', 'všechny', or any similar word meaning all/every, use 20. Defaults to 5 if not specified. Maximum 20.",
                },
            },
            required: ["searchType", "query"],
        },
    },
};

const recommendBooksSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "recommendBooks",
        description:
            "Recommend books based on themes, genre, literary period, author era, reader age, or similar books. Also use this as a FALLBACK when searching for books by a specific author if catalog search returns no results.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description:
                        "User request for book recommendations (themes, era, authors, genre, etc.)",
                },
                count: {
                    type: "number",
                    description:
                        "How many books to return. Use exactly what the user requested. If the user says 'all', 'všechny', or any similar word meaning all/every, use 20. Defaults to 5 if not specified. Maximum 20.",
                },
            },
            required: ["query"],
        },
    },
};

const findBookByPlotSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "findBookByPlot",
        description:
            "Identify a specific book when the user describes its story or plot. Use this when user describes a book's content or story.",
        parameters: {
            type: "object",
            properties: {
                plotDescription: {
                    type: "string",
                    description: "Description of the book's plot or story",
                },
                count: {
                    type: "number",
                    description:
                        "How many matching books to return. If the user says 'all' or 'všechny', use 20. Defaults to 5 if not specified. Maximum 20.",
                },
            },
            required: ["plotDescription"],
        },
    },
};

const searchWebsiteSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "searchWebsite",
        description:
            "Search the library website for information about services, events, contacts, branches, opening hours, registration, fees, etc. Use this when you need specific information from the library's website to answer the user's question. You can formulate your own search query — use expanded terms and synonyms for better results. Do NOT use this for greetings or trivial questions.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description:
                        "Search query for the library website. Use expanded terms and synonyms (e.g. 'ředitelka ředitelství vedení kontakt telefon email' instead of just 'ředitel').",
                },
                maxResults: {
                    type: "number",
                    description:
                        "Maximum number of results to return (default 5, max 10)",
                },
            },
            required: ["query"],
        },
    },
};

const getContactSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "getContact",
        description:
            "Look up contact information for library staff or departments. Use this when the user asks for a phone number, email, or contact details of a person or department. Provide at least one search parameter.",
        parameters: {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    description:
                        "Full or partial name of the person or department (e.g. 'Vohlídalová', 'Studijní knihovna')",
                },
                role: {
                    type: "string",
                    description:
                        "Role or position (e.g. 'ředitelka', 'náměstek')",
                },
                department: {
                    type: "string",
                    description:
                        "Department name (e.g. 'IT', 'Ředitelství', 'Dětské oddělení')",
                },
            },
        },
    },
};

const getOpeningHoursSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "getOpeningHours",
        description:
            "Get current opening hours for library branches. Scrapes live data from the library website. Use this when the user asks about opening hours, when the library is open/closed, or business hours. Optionally filter by branch name.",
        parameters: {
            type: "object",
            properties: {
                branch: {
                    type: "string",
                    description:
                        "Optional branch name to filter (e.g. 'Hlavní budova', 'Vesec', 'Ruprechtice', 'Machnín'). If omitted, returns all branches.",
                },
            },
        },
    },
};

const getEventsSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "getEvents",
        description:
            "Get upcoming events at the library (lectures, exhibitions, workshops, concerts, readings, etc.). Scrapes live data from the library website. Use this when the user asks about events, what's happening at the library, upcoming programs, or cultural activities.",
        parameters: {
            type: "object",
            properties: {
                type: {
                    type: "string",
                    description:
                        "Optional event type filter (e.g. 'Přednáška', 'Výstava', 'Workshop', 'Koncert', 'Čtení'). If omitted, returns all event types.",
                },
                maxResults: {
                    type: "number",
                    description:
                        "Maximum number of events to return (default 10, max 30)",
                },
            },
        },
    },
};

const getOfficeInfoSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "getOfficeInfo",
        description:
            "Get comprehensive information about a library branch: opening hours, contact details (phone, email, address, transport), librarian name, and available services. Scrapes live data from the library website. Use this when the user asks about a specific branch — what it offers, how to get there, who works there, or its full details. For just opening hours across all branches, prefer getOpeningHours instead.",
        parameters: {
            type: "object",
            properties: {
                branch: {
                    type: "string",
                    description:
                        "Branch name to look up (e.g. 'Rochlice', 'Machnín', 'Vesec', 'Hlavní budova'). If omitted, returns info for all branches.",
                },
            },
        },
    },
};

// ─── Tool Handlers ────────────────────────────────────────────────────────────

async function handleSearchCatalog(
    args: z.infer<typeof SearchCatalogSchema>,
): Promise<string> {
    const query = sanitizeInput(args.query);
    const wantsAll = args.count != null && args.count >= MAX_COUNT;
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

    const books =
        args.searchType === "title"
            ? await queryCatalogService.searchByTitle(query, limit)
            : await queryCatalogService.searchGeneral(query, limit);

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

async function handleRecommendBooks(
    args: z.infer<typeof RecommendBooksSchema>,
): Promise<string> {
    const query = sanitizeInput(args.query);
    const limit = normalizeCount(args.count, DEFAULT_COUNT);

    LoggerService.logAIFunctionCall("recommendBooks", { query, limit });

    const books = (await vectorService.searchBooks(query, limit)) as BookItem[];

    if (books.length === 0) {
        return JSON.stringify({
            status: "no_results",
            message: "Nenašel jsem žádné knihy odpovídající vašemu dotazu.",
        });
    }

    const booksWithUrls = ensureBookUrls(books);

    return JSON.stringify({
        status: "ok",
        formatted: `Doporučuji tyto knihy:\n\n${formatBooks(booksWithUrls)}`,
    });
}

async function handleFindBookByPlot(
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

async function handleSearchWebsite(
    args: z.infer<typeof SearchWebsiteSchema>,
): Promise<string> {
    const query = sanitizeInput(args.query);
    const maxResults = Math.min(args.maxResults ?? 5, 10);

    LoggerService.logAIFunctionCall("searchWebsite", { query, maxResults });

    let similarContent: Awaited<ReturnType<typeof searchSimilarContent>> = [];
    try {
        similarContent = await searchSimilarContent(query, maxResults);
    } catch (err) {
        LoggerService.warn("ChromaDB unavailable for searchWebsite", {
            error: (err as Error).message,
        });
    }

    if (similarContent.length === 0) {
        return JSON.stringify({
            status: "no_results",
            message: "Žádný relevantní obsah nebyl nalezen na webu knihovny.",
        });
    }

    const sources = similarContent.map((item, idx) => ({
        index: idx + 1,
        section: item.section,
        url: item.url,
        text: item.text,
    }));

    return JSON.stringify({
        status: "ok",
        sourcesCount: sources.length,
        sources,
    });
}

async function handleGetContact(
    args: z.infer<typeof GetContactSchema>,
): Promise<string> {
    LoggerService.logAIFunctionCall("getContact", args);

    const matches = await contactService.search({
        name: args.name,
        role: args.role,
        department: args.department,
    });

    if (matches.length === 0) {
        return JSON.stringify({
            status: "no_results",
            matches: [],
            message:
                "Nepodařilo se najít žádný kontakt odpovídající zadaným kritériím.",
        });
    }

    return JSON.stringify({
        status: "ok",
        matches,
    });
}

async function handleGetOpeningHours(
    args: z.infer<typeof GetOpeningHoursSchema>,
): Promise<string> {
    LoggerService.logAIFunctionCall("getOpeningHours", args);

    try {
        let branches = await scrapeOpeningHours();

        if (args.branch) {
            const query = args.branch
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            branches = branches.filter((b) => {
                const name = b.branch
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase();
                return name.includes(query) || query.includes(name);
            });
        }

        if (branches.length === 0) {
            return JSON.stringify({
                status: "no_results",
                message:
                    "Nepodařilo se najít otevírací dobu pro zadanou pobočku.",
            });
        }

        return JSON.stringify({
            status: "ok",
            branches,
        });
    } catch (error) {
        LoggerService.logError(error as Error, "handleGetOpeningHours");
        return JSON.stringify({
            status: "error",
            message: "Nepodařilo se načíst otevírací dobu z webu knihovny.",
        });
    }
}

async function handleGetEvents(
    args: z.infer<typeof GetEventsSchema>,
): Promise<string> {
    LoggerService.logAIFunctionCall("getEvents", args);

    try {
        let events = await scrapeEvents();

        if (args.type) {
            const query = args.type
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            events = events.filter((e) => {
                if (!e.type) return false;
                const t = e.type
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase();
                return t.includes(query) || query.includes(t);
            });
        }

        const maxResults = Math.min(args.maxResults ?? 10, 30);
        events = events.slice(0, maxResults);

        if (events.length === 0) {
            return JSON.stringify({
                status: "no_results",
                message:
                    "Nenašel jsem žádné nadcházející akce odpovídající vašemu dotazu.",
            });
        }

        return JSON.stringify({
            status: "ok",
            count: events.length,
            events,
        });
    } catch (error) {
        LoggerService.logError(error as Error, "handleGetEvents");
        return JSON.stringify({
            status: "error",
            message: "Nepodařilo se načíst akce z webu knihovny.",
        });
    }
}

async function handleGetOfficeInfo(
    args: z.infer<typeof GetOfficeInfoSchema>,
): Promise<string> {
    LoggerService.logAIFunctionCall("getOfficeInfo", args);

    try {
        const offices = await scrapeOfficeInfo(args.branch);

        LoggerService.info("getOfficeInfo: results", {
            branch: args.branch ?? "all",
            resultCount: offices.length,
            branches: offices.map((o) => o.branch),
        });

        if (offices.length === 0) {
            return JSON.stringify({
                status: "no_results",
                message: "Nepodařilo se najít informace pro zadanou pobočku.",
            });
        }

        return JSON.stringify({
            status: "ok",
            branches: offices,
        });
    } catch (error) {
        LoggerService.logError(error as Error, "handleGetOfficeInfo");
        return JSON.stringify({
            status: "error",
            message:
                "Nepodařilo se načíst informace o pobočce z webu knihovny.",
        });
    }
}

// ─── Registry Factory ─────────────────────────────────────────────────────────

/**
 * Create and return a ToolRegistry pre-loaded with all library chatbot tools.
 */
export function createToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();

    registry.register(
        "searchCatalog",
        searchCatalogSpec,
        SearchCatalogSchema,
        handleSearchCatalog,
    );
    registry.register(
        "recommendBooks",
        recommendBooksSpec,
        RecommendBooksSchema,
        handleRecommendBooks,
    );
    registry.register(
        "findBookByPlot",
        findBookByPlotSpec,
        FindBookByPlotSchema,
        handleFindBookByPlot,
    );
    registry.register(
        "searchWebsite",
        searchWebsiteSpec,
        SearchWebsiteSchema,
        handleSearchWebsite,
    );
    registry.register(
        "getContact",
        getContactSpec,
        GetContactSchema,
        handleGetContact,
    );
    registry.register(
        "getOpeningHours",
        getOpeningHoursSpec,
        GetOpeningHoursSchema,
        handleGetOpeningHours,
    );
    registry.register(
        "getEvents",
        getEventsSpec,
        GetEventsSchema,
        handleGetEvents,
    );
    registry.register(
        "getOfficeInfo",
        getOfficeInfoSpec,
        GetOfficeInfoSchema,
        handleGetOfficeInfo,
    );

    return registry;
}
