// ─── Info Tool Handlers — Website, Contact, Hours, Events, Office ─────────────

import { z } from "zod";
import { sanitizeInput } from "../preprocessing";
import { searchSimilarContent } from "../../site.service";
import { contactService } from "../../contact.service";
import {
    getCachedOpeningHours,
    getCachedEvents,
    scrapeEventsFiltered,
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

// ─── Czech date parsing for event classification ──────────────────────────────

const CZECH_MONTHS: Record<string, number> = {
    ledna: 0,
    února: 1,
    března: 2,
    dubna: 3,
    května: 4,
    června: 5,
    července: 6,
    srpna: 7,
    září: 8,
    října: 9,
    listopadu: 10,
    prosince: 11,
};

function parseCzechDate(dateStr: string): Date | null {
    const match = dateStr.match(/(\d{1,2})\.\s*(\w+)\s+(\d{4})/);
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const monthName = match[2].toLowerCase();
    const year = parseInt(match[3], 10);
    const month = CZECH_MONTHS[monthName];
    if (month === undefined) return null;
    return new Date(year, month, day);
}

// ─── Keyword lists for searchWebsite guards ───────────────────────────────────

const EVENT_KEYWORDS = [
    "kurz",
    "kurzy",
    "workshop",
    "workshopy",
    "skoleni",
    "akce",
    "udalost",
    "udalosti",
    "prednaska",
    "prednasky",
    "koncert",
    "vystava",
    "vystavy",
    "cteni",
];

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

    // Guard: redirect event/course queries to live getEvents
    const isEventQuery = EVENT_KEYWORDS.some((kw) => queryNorm.includes(kw));
    if (isEventQuery) {
        LoggerService.warn(
            "searchWebsite: redirecting to getEvents (query matched event/course pattern)",
            { query },
        );
        return handleGetEvents({ maxResults: maxResults });
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
        // Determine whether to use filtered (live) or cached (unfiltered) scraping
        const hasFilters =
            args.date || args.category || args.place || args.fulltext;

        let events = hasFilters
            ? await scrapeEventsFiltered({
                  date: args.date,
                  category: args.category ?? args.type, // backward compat
                  place: args.place,
                  fulltext: args.fulltext,
              })
            : await getCachedEvents();

        // Legacy: if only 'type' is used (no 'category'), filter client-side on cached data
        if (!hasFilters && args.type) {
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

        // Also do client-side fulltext matching on title when fulltext is set
        // (server-side may not be perfect)
        if (args.fulltext) {
            const ft = args.fulltext
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            const fulltextFiltered = events.filter((e) => {
                const titleNorm = e.title
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .toLowerCase();
                return titleNorm.includes(ft);
            });
            // Only narrow if it still has results; otherwise keep server results
            if (fulltextFiltered.length > 0) {
                events = fulltextFiltered;
            }
        }

        // ── Classify events as upcoming vs past ──────────────────────
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const classified = events.map((e) => {
            const parsed = parseCzechDate(e.date);
            const isPast = parsed ? parsed < today : false;
            return { event: e, isPast, parsedDate: parsed };
        });

        // Sort: upcoming first (soonest first), then past (most recent first)
        classified.sort((a, b) => {
            if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
            if (!a.parsedDate || !b.parsedDate) return 0;
            if (a.isPast)
                return b.parsedDate.getTime() - a.parsedDate.getTime();
            return a.parsedDate.getTime() - b.parsedDate.getTime();
        });

        const maxResults = Math.min(args.maxResults ?? 10, 30);
        const limited = classified.slice(0, maxResults);

        const upcomingEvents = limited
            .filter((c) => !c.isPast)
            .map((c) => c.event);
        const pastEvents = limited.filter((c) => c.isPast).map((c) => c.event);

        if (upcomingEvents.length === 0 && pastEvents.length === 0) {
            return JSON.stringify({
                status: "no_results",
                message: "Nenašel jsem žádné akce odpovídající vašemu dotazu.",
            });
        }

        const result: Record<string, unknown> = { status: "ok" };

        if (upcomingEvents.length > 0) {
            result.upcomingEvents = upcomingEvents;
            result.upcomingCount = upcomingEvents.length;
        }

        if (pastEvents.length > 0) {
            result.pastEvents = pastEvents;
            result.pastCount = pastEvents.length;
            result.pastEventsNote =
                "Tyto akce již proběhly. Zmiň je uživateli pouze jako referenci a upozorni, že již proběhly.";
        }

        return JSON.stringify(result);
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
