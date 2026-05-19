// ─── OpenAI Function Specs (sent to the model) ───────────────────────────────

import type { ChatCompletionTool } from "openai/resources/chat";

export const searchCatalogSpec: ChatCompletionTool = {
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
                        "How many books to return. Use exactly what the user requested (e.g. 3 if they said 'give me 3 books'). Defaults to 5 if not specified. Maximum 20.",
                },
                fetchAll: {
                    type: "boolean",
                    description:
                        "Set to true ONLY when the user explicitly says 'all', 'všechny', 'vše', or similar words meaning every/all. Do NOT set this when the user asks for a specific number. When true, count is ignored.",
                },
            },
            required: ["searchType", "query"],
        },
    },
};

export const recommendBooksSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "recommendBooks",
        description:
            "Recommend books based on themes, genre, literary period, author era, reader age, or similar books. Also use this as a FALLBACK when searching for books by a specific author if catalog search returns no results. You can pass a book title directly as the query — the backend will automatically look up the book's description and subjects for more accurate recommendations.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description:
                        "Thematic query for the vector search. Can be a description, subjects, genre, or a book title — the backend will automatically enrich short title queries with metadata for better results.",
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

export const findBookByPlotSpec: ChatCompletionTool = {
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

export const searchWebsiteSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "searchWebsite",
        description:
            "LAST RESORT — Search the library website using semantic search. Use ONLY for: registration, fees, rules, wifi, printing, general services. FORBIDDEN queries (use the dedicated tool instead): otevírací doba / otevřeno / zavřeno → getOpeningHours; pobočka / Machnín / Rochlice / Vesec → getOfficeInfo or getOpeningHours; kontakt / telefon / email → getContact; akce / událost / kurz / workshop / školení → getEvents. This tool returns OUTDATED cached data — the dedicated tools scrape LIVE data and are ALWAYS more accurate.",
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

export const getContactSpec: ChatCompletionTool = {
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

export const getOpeningHoursSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "getOpeningHours",
        description:
            "PREFERRED TOOL for opening hours — Get LIVE opening hours for library branches by scraping the website in real time. Use this ALWAYS when the user asks: otevírací doba, kdy má otevřeno, kdy je zavřeno, pracovní doba, provozní doba, hodiny — for ANY branch (Machnín, Rochlice, Vesec, Ruprechtice, Hlavní budova, Kunratická). Returns accurate, current data. NEVER use searchWebsite for opening hours.",
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

export const getEventsSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "getEvents",
        description:
            "Get LIVE events at the library (lectures, exhibitions, workshops, courses, concerts, readings, etc.). Supports filtering by DATE, CATEGORY, PLACE, and free-text search. Use this when the user asks about events, what's happening, courses (kurzy), workshops, trainings (školení), or cultural programs. When the user mentions a specific date, pass it as the 'date' parameter. When they ask about a specific event by name (e.g. 'francouzská konverzace'), use the 'fulltext' parameter — do NOT put the event name in 'type' or 'category'. The 'type'/'category' is for broad categories like 'Přednáška', 'Výstava', 'Kurz', 'Workshop', etc. Results are split into 'upcomingEvents' and 'pastEvents'.",
        parameters: {
            type: "object",
            properties: {
                fulltext: {
                    type: "string",
                    description:
                        "Free-text search for event name or keyword (e.g. 'francouzská konverzace', 'Bavardons', 'šachový turnaj'). Use this when the user asks about a specific event by name.",
                },
                date: {
                    type: "string",
                    description:
                        "Filter events from this date onwards, in YYYY-MM-DD format (e.g. '2026-04-20'). Use when the user asks about events on a specific date or after a date.",
                },
                category: {
                    type: "string",
                    description:
                        "Event category filter. Available categories: Pro děti, Beseda, Konference, Kurz, Kvíz, Literární vycházka, Projekce, Přednáška, Seminář, Soutěž, Společenská akce, Výstava, Workshop.",
                },
                place: {
                    type: "string",
                    description:
                        "Branch/place filter. Available places: Hlavní budova, Králův Háj, Kunratická, Machnín, Rochlice, Ruprechtice, Vesec.",
                },
                type: {
                    type: "string",
                    description:
                        "DEPRECATED — use 'category' instead. Kept for backward compatibility.",
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

export const getOfficeInfoSpec: ChatCompletionTool = {
    type: "function",
    function: {
        name: "getOfficeInfo",
        description:
            "Get LIVE comprehensive info about a library branch: opening hours, contact (phone, email, address, transport), librarian name, and services. Use when the user asks about a specific branch (pobočka) — Machnín, Rochlice, Vesec, Ruprechtice, Kunratická, Hlavní budova. Also good for: co nabízí pobočka, jak se tam dostat, kdo tam pracuje. For ONLY opening hours across all branches, prefer getOpeningHours.",
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
