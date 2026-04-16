// ─── Info Tool Handlers — Website, Contact, Hours, Events, Office ─────────────

import { z } from "zod";
import { sanitizeInput } from "../preprocessing";
import { searchSimilarContent } from "../../site.service";
import { contactService } from "../../contact.service";
import {
    getCachedOpeningHours,
    getCachedEvents,
    scrapeOfficeInfo,
} from "../../scraper.service";
import LoggerService from "../../logger.service";
import {
    SearchWebsiteSchema,
    GetContactSchema,
    GetOpeningHoursSchema,
    GetEventsSchema,
    GetOfficeInfoSchema,
} from "./schemas";

// ─── Search Website (semantic search — last resort) ───────────────────────────

const OPENING_HOURS_KEYWORDS = [
    "oteviraci doba",
    "oteviraci",
    "otevira",
    "otevreno",
    "zavreno",
    "hodiny",
    "provozni doba",
    "provozni",
    "pracovni doba",
    "otevrit",
    "otevrena",
    "kdy ma",
    "kdy je",
    "doba pobocka",
    "pobocka",
];

const BRANCH_NAMES = [
    "machnin",
    "rochlice",
    "vesec",
    "ruprechtice",
    "kraluvhaj",
    "kraluv haj",
    "kunraticka",
    "hlavni budova",
    "hlavni",
];

export async function handleSearchWebsite(
    args: z.infer<typeof SearchWebsiteSchema>,
): Promise<string> {
    const query = sanitizeInput(args.query);
    const maxResults = Math.min(args.maxResults ?? 5, 10);

    LoggerService.logAIFunctionCall("searchWebsite", { query, maxResults });

    // Guard: redirect opening-hours / branch queries to live-scraping tools
    const queryNorm = query
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();

    const isOpeningHoursQuery = OPENING_HOURS_KEYWORDS.some((kw) =>
        queryNorm.includes(kw),
    );
    const mentionedBranch = BRANCH_NAMES.find((b) => queryNorm.includes(b));

    if (isOpeningHoursQuery || mentionedBranch) {
        LoggerService.warn(
            "searchWebsite: redirecting to getOpeningHours (query matched opening-hours/branch pattern)",
            { query, isOpeningHoursQuery, mentionedBranch },
        );
        return handleGetOpeningHours({
            branch: mentionedBranch ?? undefined,
        });
    }

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

// ─── Get Contact ──────────────────────────────────────────────────────────────

export async function handleGetContact(
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

// ─── Get Opening Hours ────────────────────────────────────────────────────────

export async function handleGetOpeningHours(
    args: z.infer<typeof GetOpeningHoursSchema>,
): Promise<string> {
    LoggerService.logAIFunctionCall("getOpeningHours", args);

    try {
        let branches = await getCachedOpeningHours();

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

// ─── Get Events ───────────────────────────────────────────────────────────────

export async function handleGetEvents(
    args: z.infer<typeof GetEventsSchema>,
): Promise<string> {
    LoggerService.logAIFunctionCall("getEvents", args);

    try {
        let events = await getCachedEvents();

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

// ─── Get Office Info ──────────────────────────────────────────────────────────

export async function handleGetOfficeInfo(
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
