import type { FunctionParameters } from "openai/resources/shared";

export type FunctionDefinition = {
    name: string;
    description?: string;
    parameters?: FunctionParameters;
};

export const toolDefinitions: FunctionDefinition[] = [
    {
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
    {
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
    {
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
    {
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
];
