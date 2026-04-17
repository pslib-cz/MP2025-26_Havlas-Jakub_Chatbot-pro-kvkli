// ─── Scraper Service — Live Data from KVKLI Website ───────────────────────────

import axios from "axios";
import { parse } from "node-html-parser";
import type { Contact } from "../../types/Contact";
import type { BranchOpeningHours, DaySchedule } from "../../types/OpeningHours";
import type { LibraryEvent } from "../../types/LibraryEvent";
import type { OfficeInfo } from "../../types/OfficeInfo";
import LoggerService from "./logger.service";

const CONTACTS_URL = "https://www.kvkli.cz/kontakt/kontakty-dle-oddeleni";
const OPENING_HOURS_URL = "https://www.kvkli.cz/kontakt/oteviraci-doba";
const BRANCHES_URL = "https://www.kvkli.cz/kontakt/hlavni-budova-a-pobocky";
const EVENTS_URL = "https://www.kvkli.cz/akce?p=99";
const BASE_URL = "https://www.kvkli.cz";
const REQUEST_TIMEOUT = 10000;

// ─── TTL Cache with In-Flight Deduplication ───────────────────────────────────

/** Cache TTL in milliseconds (10 minutes — same as contact service) */
const CACHE_TTL = 10 * 60 * 1000;

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

/**
 * Generic TTL cache with in-flight request deduplication.
 * Multiple concurrent calls to `get()` while the cache is cold will share
 * a single fetch, preventing duplicate outbound requests.
 */
class TtlCache<T> {
    private entry: CacheEntry<T> | null = null;
    private inflight: Promise<T> | null = null;

    constructor(
        private readonly fetcher: () => Promise<T>,
        private readonly label: string,
        private readonly ttl = CACHE_TTL,
    ) {}

    async get(): Promise<T> {
        // Return cached data if still fresh
        if (this.entry && Date.now() - this.entry.timestamp < this.ttl) {
            return this.entry.data;
        }

        // Deduplicate concurrent requests
        if (this.inflight) {
            return this.inflight;
        }

        this.inflight = this.fetcher()
            .then((data) => {
                this.entry = { data, timestamp: Date.now() };
                LoggerService.info(`${this.label}: cache refreshed`);
                return data;
            })
            .finally(() => {
                this.inflight = null;
            });

        return this.inflight;
    }

    /** Force-clear the cache (e.g. for admin/debug). */
    invalidate(): void {
        this.entry = null;
    }
}

/**
 * Scrape contacts from the KVKLI website.
 * Parses the kontaktGroup structure to extract names, roles, departments,
 * phones, and emails.
 */
export async function scrapeContacts(): Promise<Contact[]> {
    const response = await axios.get(CONTACTS_URL, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "KVKLI-Chatbot/1.0" },
    });

    const root = parse(response.data);
    const contacts: Contact[] = [];
    let idCounter = 1;

    const departmentGroups = root.querySelectorAll(".kontaktGroup > h2");

    for (const h2 of departmentGroups) {
        const department = h2.text.trim();
        const anchor = h2.getAttribute("id");
        const departmentUrl = anchor
            ? `${CONTACTS_URL}#${anchor}`
            : CONTACTS_URL;
        const parent = h2.parentNode;
        if (!parent) continue;

        const kontaktList = parent.querySelector(".kontaktList");
        if (!kontaktList) continue;

        const subGroups = kontaktList.querySelectorAll(".kontaktGroup");

        for (const subGroup of subGroups) {
            const h3 = subGroup.querySelector("h3");
            const role = h3 ? h3.text.trim() : undefined;

            const rows = subGroup.querySelectorAll(".row");

            for (const row of rows) {
                const labelEl = row.querySelector(".label");
                if (!labelEl) continue;

                // Extract name — the direct text content before <small>
                const smallEl = labelEl.querySelector("small");
                let name: string;
                if (smallEl) {
                    // Remove the <small> to get just the name text
                    name = labelEl.text.replace(smallEl.text, "").trim();
                } else {
                    name = labelEl.text.trim();
                }

                if (!name) continue;

                // Extract phones
                const phoneEls = row.querySelectorAll(
                    ".telefony a[href^='tel:']",
                );
                const phones = phoneEls
                    .map((a) => a.text.trim())
                    .filter(Boolean);

                // Extract email
                const emailEl = row.querySelector(".emaily a[href^='mailto:']");
                const email = emailEl ? emailEl.text.trim() : undefined;

                contacts.push({
                    id: String(idCounter++),
                    name,
                    role,
                    department,
                    phones,
                    email,
                    url: departmentUrl,
                });
            }
        }
    }

    LoggerService.info("Scraped contacts from KVKLI website", {
        count: contacts.length,
    });

    return contacts;
}

/**
 * Scrape opening hours from the KVKLI website.
 * Parses the timetableList structure to extract branch names and schedules.
 */
export async function scrapeOpeningHours(): Promise<BranchOpeningHours[]> {
    const response = await axios.get(OPENING_HOURS_URL, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "KVKLI-Chatbot/1.0" },
    });

    const root = parse(response.data);
    const branches: BranchOpeningHours[] = [];

    const wraps = root.querySelectorAll(".timetableList .wrap");

    for (const wrap of wraps) {
        const h2 = wrap.querySelector("h2");
        if (!h2) continue;

        const branch = h2.text.trim();
        const anchor = h2.getAttribute("id");
        const branchUrl = anchor
            ? `${OPENING_HOURS_URL}#${anchor}`
            : OPENING_HOURS_URL;
        const schedule: DaySchedule[] = [];

        const tabRows = wrap.querySelectorAll(".tabRow");

        for (const tabRow of tabRows) {
            const cols = tabRow.querySelectorAll(".tabCol");
            if (cols.length < 2) continue;

            const day = cols[0].text.trim();
            const hours: string[] = [];

            // Collect all time columns (there can be multiple for split hours)
            for (let i = 1; i < cols.length; i++) {
                const time = cols[i].text.trim();
                if (time) {
                    hours.push(time);
                }
            }

            if (hours.length > 0) {
                schedule.push({ day, hours });
            }
        }

        branches.push({ branch, schedule, url: branchUrl });
    }

    LoggerService.info("Scraped opening hours from KVKLI website", {
        branchCount: branches.length,
    });

    return branches;
}

// ─── Event Filter Mappings ────────────────────────────────────────────────────

/** Category name → query param ID on kvkli.cz */
const EVENT_CATEGORY_MAP: Record<string, string> = {
    "pro děti": "10071",
    beseda: "18855",
    konference: "18858",
    kurz: "18859",
    kvíz: "25086",
    "literární vycházka": "35871",
    projekce: "10069",
    přednáška: "10066",
    seminář: "19439",
    soutěž: "29884",
    "společenská akce": "18860",
    výstava: "10068",
    workshop: "19441",
};

/** Branch name → query param ID on kvkli.cz */
const EVENT_PLACE_MAP: Record<string, string> = {
    "hlavní budova": "10080",
    "králův háj": "10081",
    kunratická: "10082",
    machnín: "10083",
    rochlice: "10084",
    ruprechtice: "10085",
    vesec: "10086",
};

export interface EventFilterParams {
    date?: string; // YYYY-MM-DD
    category?: string; // Czech category name (fuzzy matched)
    place?: string; // Branch name (fuzzy matched)
    fulltext?: string; // Free-text search
}

function normalizeForMatch(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function fuzzyMatchKey(
    input: string,
    map: Record<string, string>,
): string | undefined {
    const norm = normalizeForMatch(input);
    // Exact match first
    for (const [key, value] of Object.entries(map)) {
        if (normalizeForMatch(key) === norm) return value;
    }
    // Partial match
    for (const [key, value] of Object.entries(map)) {
        const keyNorm = normalizeForMatch(key);
        if (keyNorm.includes(norm) || norm.includes(keyNorm)) return value;
    }
    return undefined;
}

function buildEventsUrl(params: EventFilterParams): string {
    const url = new URL(`${BASE_URL}/akce`);

    if (params.fulltext) {
        url.searchParams.set("fulltext", params.fulltext);
    }
    if (params.date) {
        url.searchParams.set("start", params.date);
    }
    if (params.category) {
        const id = fuzzyMatchKey(params.category, EVENT_CATEGORY_MAP);
        if (id) {
            url.searchParams.append("t[]", id);
        } else {
            LoggerService.warn(
                "scrapeEventsFiltered: unknown category, filtering client-side",
                {
                    category: params.category,
                },
            );
        }
    }
    if (params.place) {
        const id = fuzzyMatchKey(params.place, EVENT_PLACE_MAP);
        if (id) {
            url.searchParams.append("pob[]", id);
        } else {
            LoggerService.warn(
                "scrapeEventsFiltered: unknown place, filtering client-side",
                {
                    place: params.place,
                },
            );
        }
    }
    return url.toString();
}

/**
 * Scrape events with optional server-side filtering by date, category, and place.
 * Falls back to the default events URL when no filters are provided.
 */
export async function scrapeEventsFiltered(
    params: EventFilterParams = {},
): Promise<LibraryEvent[]> {
    const hasFilters =
        params.date || params.category || params.place || params.fulltext;
    const url = hasFilters ? buildEventsUrl(params) : EVENTS_URL;

    LoggerService.info("scrapeEventsFiltered: fetching", {
        url,
        params,
    });

    const response = await axios.get(url, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "KVKLI-Chatbot/1.0" },
    });

    const events = parseEventsHtml(response.data);

    // Client-side fallback filtering for unrecognized category/place
    let filtered = events;
    if (
        params.category &&
        !fuzzyMatchKey(params.category, EVENT_CATEGORY_MAP)
    ) {
        const catNorm = normalizeForMatch(params.category);
        filtered = filtered.filter((e) => {
            if (!e.type) return false;
            const tNorm = normalizeForMatch(e.type);
            return tNorm.includes(catNorm) || catNorm.includes(tNorm);
        });
    }
    if (params.place && !fuzzyMatchKey(params.place, EVENT_PLACE_MAP)) {
        const placeNorm = normalizeForMatch(params.place);
        filtered = filtered.filter((e) => {
            if (!e.location) return false;
            return normalizeForMatch(e.location).includes(placeNorm);
        });
    }

    LoggerService.info("scrapeEventsFiltered: results", {
        total: events.length,
        afterFilter: filtered.length,
        params,
    });

    return filtered;
}

/**
 * Scrape upcoming events from the KVKLI website (unfiltered, for cache).
 * Parses date headings (h2) and akce_item cards within each date section.
 */
export async function scrapeEvents(): Promise<LibraryEvent[]> {
    const response = await axios.get(EVENTS_URL, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "KVKLI-Chatbot/1.0" },
    });

    const events = parseEventsHtml(response.data);
    LoggerService.info("Scraped events from KVKLI website", {
        count: events.length,
    });
    return events;
}

/** Parse the events HTML into structured LibraryEvent objects. */
function parseEventsHtml(html: string): LibraryEvent[] {
    const root = parse(html);
    const events: LibraryEvent[] = [];

    const target = root.querySelector("#loadMoreTarget");
    if (!target) {
        LoggerService.warn("Could not find #loadMoreTarget on events page");
        return events;
    }

    // Iterate through child nodes — akce_daySep (with h2) sets the date, akce_list has items
    let currentDate = "";
    for (const child of target.childNodes) {
        if (!("tagName" in child)) continue;
        const el = child as import("node-html-parser").HTMLElement;

        // Date separator: <div class="akce_daySep"><h2>...</h2></div> or bare <h2>
        if (el.classList?.contains("akce_daySep")) {
            const h2 = el.querySelector("h2");
            if (h2) currentDate = h2.text.trim();
            continue;
        }
        if (el.tagName === "H2") {
            currentDate = el.text.trim();
            continue;
        }

        if (!el.classList?.contains("akce_list")) continue;

        const items = el.querySelectorAll(".akce_item");
        for (const item of items) {
            const link = item.querySelector("a");
            if (!link) continue;

            const href = link.getAttribute("href") ?? "";
            const url = href.startsWith("http") ? href : `${BASE_URL}${href}`;

            const title = link.querySelector("h3.label")?.text.trim() ?? "";

            // Event type (e.g. "Přednáška", "Výstava")
            const type =
                link.querySelector(".top .r")?.text.trim() || undefined;

            // Details line: date/time range and price
            const detailsLeft =
                link.querySelector(".details .l")?.text.trim() ?? "";

            // Use the details line as the date (e.g. "18. duben, 13:00 - 17:00")
            // falling back to the section heading ("Dnes", "Zítra", etc.)
            const dateFromDetails = detailsLeft
                .replace(/\s+/g, " ")
                .replace(/(zdarma|dobrovolné|\d+\s*Kč).*$/i, "")
                .trim();
            const eventDate = dateFromDetails || currentDate;

            // Extract time — look for HH:MM pattern in the details
            const timeMatch = detailsLeft.match(/\b(\d{1,2}:\d{2})\b/);
            const time = timeMatch ? timeMatch[1] : undefined;

            // Extract price — text after the separator
            const sepEl = link.querySelector(".details .l .sep");
            let price: string | undefined;
            if (sepEl && sepEl.nextSibling) {
                // Get text content after the separator within .details .l
                const fullText =
                    link.querySelector(".details .l")?.text.trim() ?? "";
                const sepIdx = fullText.lastIndexOf("\n");
                const afterSep =
                    sepIdx >= 0 ? fullText.substring(sepIdx).trim() : undefined;
                // Fallback: look for known price keywords
                if (
                    afterSep &&
                    (afterSep.includes("zdarma") ||
                        afterSep.includes("dobrovolné") ||
                        afterSep.match(/\d+\s*Kč/))
                ) {
                    price = afterSep;
                } else {
                    // Try matching from full text
                    const priceMatch = fullText.match(
                        /(zdarma|dobrovolné|\d+\s*Kč)/i,
                    );
                    price = priceMatch ? priceMatch[1] : undefined;
                }
            }

            // Location
            const location =
                link.querySelector(".location .em")?.text.trim() || undefined;

            // Image
            const imgEl = link.querySelector(".img img");
            const imgSrc = imgEl?.getAttribute("src");
            const imageUrl = imgSrc
                ? imgSrc.startsWith("http")
                    ? imgSrc
                    : `${BASE_URL}${imgSrc}`
                : undefined;

            if (title) {
                events.push({
                    title,
                    date: eventDate,
                    time,
                    type,
                    price,
                    location,
                    url,
                    imageUrl,
                });
            }
        }
    }

    return events;
}

/**
 * Scrape comprehensive office info: opening hours + contact details + services.
 * Combines data from the opening hours page, branch listing page, and individual detail pages.
 */
export async function scrapeOfficeInfo(
    branchFilter?: string,
): Promise<OfficeInfo[]> {
    const headers = { "User-Agent": "KVKLI-Chatbot/1.0" };

    LoggerService.info("scrapeOfficeInfo: starting", {
        branchFilter: branchFilter ?? "all",
    });

    // Fetch opening hours and branch listing in parallel
    const [hoursResponse, branchesResponse] = await Promise.all([
        axios.get(OPENING_HOURS_URL, { timeout: REQUEST_TIMEOUT, headers }),
        axios.get(BRANCHES_URL, { timeout: REQUEST_TIMEOUT, headers }),
    ]);

    LoggerService.debug(
        "scrapeOfficeInfo: fetched opening hours and branches pages",
        {
            hoursStatus: hoursResponse.status,
            branchesStatus: branchesResponse.status,
        },
    );

    // Parse opening hours into a map
    const hoursRoot = parse(hoursResponse.data);
    const hoursMap = new Map<
        string,
        { schedule: DaySchedule[]; url: string }
    >();

    for (const wrap of hoursRoot.querySelectorAll(".timetableList .wrap")) {
        const h2 = wrap.querySelector("h2");
        if (!h2) continue;
        const branch = h2.text.trim();
        const anchor = h2.getAttribute("id");
        const url = anchor
            ? `${OPENING_HOURS_URL}#${anchor}`
            : OPENING_HOURS_URL;
        const schedule: DaySchedule[] = [];

        for (const tabRow of wrap.querySelectorAll(".tabRow")) {
            const cols = tabRow.querySelectorAll(".tabCol");
            if (cols.length < 2) continue;
            const day = cols[0].text.trim();
            const hours: string[] = [];
            for (let i = 1; i < cols.length; i++) {
                const time = cols[i].text.trim();
                if (time) hours.push(time);
            }
            if (hours.length > 0) schedule.push({ day, hours });
        }

        hoursMap.set(branch, { schedule, url });
    }

    LoggerService.debug("scrapeOfficeInfo: parsed opening hours", {
        branchCount: hoursMap.size,
        branches: [...hoursMap.keys()],
    });

    // Parse branch listing page for contact info + detail URLs
    const branchRoot = parse(branchesResponse.data);
    const mainContent = branchRoot.querySelector("[role='main']") ?? branchRoot;
    const results: OfficeInfo[] = [];

    // Try mapItem blocks first
    const pobockaWrappers = mainContent.querySelectorAll(".mapItem");
    LoggerService.debug("scrapeOfficeInfo: mapItem blocks found", {
        count: pobockaWrappers.length,
    });
    if (pobockaWrappers.length > 0) {
        for (const wrapper of pobockaWrappers) {
            parseBranchBlock(wrapper, hoursMap, results);
        }
    }

    // Fallback: parse by h2 headers
    if (results.length === 0) {
        LoggerService.debug(
            "scrapeOfficeInfo: mapItem yielded no results, falling back to h2 parsing",
        );
        const skipHeaders = [
            "E\u2011ZPRAVODAJ",
            "E‑ZPRAVODAJ",
            "Základní informace",
            "Často hledáte",
            "Doporučujeme",
            "Spolupracujeme",
        ];

        for (const h2 of mainContent.querySelectorAll("h2")) {
            const branchName = h2.text.trim();
            if (!branchName) continue;
            if (skipHeaders.some((s) => branchName.includes(s))) continue;

            const parent = h2.parentNode;
            if (!parent) continue;

            const phones: string[] = [];
            for (const phoneLink of parent.querySelectorAll(
                "a[href^='tel:']",
            )) {
                const phone = phoneLink.text.trim();
                if (phone) phones.push(phone);
            }

            const emailLink = parent.querySelector("a[href^='mailto:']");
            const email = emailLink ? emailLink.text.trim() : undefined;

            let detailUrl: string | undefined;
            const detailLink = parent
                .querySelectorAll("a")
                .find((a) => a.text.trim().toLowerCase().includes("detail"));
            if (detailLink) {
                const href = detailLink.getAttribute("href") ?? "";
                detailUrl = href.startsWith("http")
                    ? href
                    : `${BASE_URL}${href}`;
            }

            let address: string | undefined;
            const mapLink = parent
                .querySelectorAll("a")
                .find((a) =>
                    (a.getAttribute("href") ?? "").includes("mapy.cz"),
                );
            if (mapLink) {
                const addrContainer = mapLink.parentNode;
                if (addrContainer) {
                    address = addrContainer.text
                        .replace("zobrazit na mapě", "")
                        .trim();
                }
            }

            let transport: string | undefined;
            const transportMatch = parent.text.match(
                /Dopravní spojení\s*([\s\S]*?)(?=$|Kontaktní|Dnešní|Adresa|Detail)/,
            );
            if (transportMatch) {
                transport = transportMatch[1].trim().replace(/\s+/g, " ");
            }

            const matchedHours = findMatchingHours(branchName, hoursMap);

            results.push({
                branch: branchName,
                openingHours: matchedHours?.schedule ?? [],
                openingHoursUrl: matchedHours?.url ?? OPENING_HOURS_URL,
                contact: {
                    phones: phones.length > 0 ? phones : undefined,
                    email,
                    address,
                    transport,
                },
                detailUrl,
            });
        }
    }

    LoggerService.debug("scrapeOfficeInfo: parsed branch listing", {
        resultCount: results.length,
        branches: results.map((r) => r.branch),
    });

    // Filter by branch name if specified
    let filtered = results;
    if (branchFilter) {
        const query = branchFilter
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
        filtered = results.filter((b) => {
            const name = b.branch
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "")
                .toLowerCase();
            return name.includes(query) || query.includes(name);
        });
    }

    LoggerService.debug("scrapeOfficeInfo: after filter", {
        filteredCount: filtered.length,
        branchFilter: branchFilter ?? "none",
    });

    // Fetch detail pages for filtered branches to get services + librarian info
    const detailPromises = filtered.map(async (branch) => {
        if (!branch.detailUrl) return;
        LoggerService.debug("scrapeOfficeInfo: fetching detail page", {
            branch: branch.branch,
            url: branch.detailUrl,
        });
        try {
            const resp = await axios.get(branch.detailUrl, {
                timeout: REQUEST_TIMEOUT,
                headers,
            });
            const root = parse(resp.data);
            const content = root.querySelector("[role='main']");
            if (!content) return;

            // Extract services from list after "Nabízíme" header
            for (const h2 of content.querySelectorAll("h2")) {
                const text = h2.text.trim().toLowerCase();
                if (text.includes("nabíz") || text.includes("služby")) {
                    const sibling = h2.nextElementSibling;
                    if (sibling && sibling.tagName === "UL") {
                        branch.services = sibling
                            .querySelectorAll("li")
                            .map((li) => li.text.trim())
                            .filter(Boolean);
                    }
                    break;
                }
            }

            // Extract librarian and extra contact info from "Kontaktní informace" section
            for (const h2 of content.querySelectorAll("h2")) {
                if (!h2.text.trim().toLowerCase().includes("kontakt")) continue;
                const sibling = h2.nextElementSibling;
                if (!sibling || sibling.tagName !== "UL") continue;
                for (const li of sibling.querySelectorAll("li")) {
                    const liText = li.text.trim();
                    if (/^Knihovni[cček]/.test(liText)) {
                        branch.contact = branch.contact ?? {};
                        branch.contact.librarian = liText
                            .replace(/^Knihovni\w+\s*:\s*/, "")
                            .trim();
                    }
                    if (
                        liText.startsWith("Adresa") &&
                        !branch.contact?.address
                    ) {
                        branch.contact = branch.contact ?? {};
                        branch.contact.address = liText
                            .replace(/^Adresa\s*:\s*/, "")
                            .trim();
                    }
                    if (
                        liText.startsWith("Dopravní") &&
                        !branch.contact?.transport
                    ) {
                        branch.contact = branch.contact ?? {};
                        branch.contact.transport = liText
                            .replace(/^Dopravní spojení\s*:\s*/, "")
                            .trim();
                    }
                }
                break;
            }
        } catch (err) {
            LoggerService.warn("Failed to fetch branch detail page", {
                url: branch.detailUrl,
                error: (err as Error).message,
            });
        }
    });

    await Promise.all(detailPromises);

    LoggerService.info("Scraped office info from KVKLI website", {
        totalBranches: results.length,
        filteredBranches: filtered.length,
    });

    return filtered;
}

function parseBranchBlock(
    wrapper: import("node-html-parser").HTMLElement,
    hoursMap: Map<string, { schedule: DaySchedule[]; url: string }>,
    results: OfficeInfo[],
) {
    const h2 = wrapper.querySelector("h2");
    if (!h2) return;
    const branchName = h2.text.trim();

    const phones: string[] = [];
    for (const a of wrapper.querySelectorAll("a[href^='tel:']")) {
        const phone = a.text.trim();
        if (phone) phones.push(phone);
    }

    const emailLink = wrapper.querySelector("a[href^='mailto:']");
    const email = emailLink ? emailLink.text.trim() : undefined;

    let detailUrl: string | undefined;
    const detailLink = wrapper
        .querySelectorAll("a")
        .find((a) => a.text.trim().toLowerCase().includes("detail"));
    if (detailLink) {
        const href = detailLink.getAttribute("href") ?? "";
        detailUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
    }

    const matchedHours = findMatchingHours(branchName, hoursMap);

    results.push({
        branch: branchName,
        openingHours: matchedHours?.schedule ?? [],
        openingHoursUrl: matchedHours?.url ?? OPENING_HOURS_URL,
        contact: {
            phones: phones.length > 0 ? phones : undefined,
            email,
        },
        detailUrl,
    });
}

function findMatchingHours(
    branchName: string,
    hoursMap: Map<string, { schedule: DaySchedule[]; url: string }>,
): { schedule: DaySchedule[]; url: string } | undefined {
    if (hoursMap.has(branchName)) return hoursMap.get(branchName);

    const normalize = (s: string) =>
        s
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]/g, "");

    const branchNorm = normalize(branchName);
    for (const [key, value] of hoursMap) {
        const keyNorm = normalize(key);
        if (branchNorm.includes(keyNorm) || keyNorm.includes(branchNorm)) {
            return value;
        }
    }

    const firstWord = normalize(branchName.split(/[\s\-–]/)[0]);
    if (firstWord.length >= 3) {
        for (const [key, value] of hoursMap) {
            if (normalize(key).includes(firstWord)) return value;
        }
    }

    return undefined;
}

// ─── Cached Wrappers (use these instead of the raw scrape functions) ──────────

const openingHoursCache = new TtlCache(scrapeOpeningHours, "openingHoursCache");
const eventsCache = new TtlCache(scrapeEvents, "eventsCache");

/** Cached version of scrapeOpeningHours — TTL + in-flight deduplication. */
export async function getCachedOpeningHours(): Promise<BranchOpeningHours[]> {
    return openingHoursCache.get();
}

/** Cached version of scrapeEvents — TTL + in-flight deduplication. */
export async function getCachedEvents(): Promise<LibraryEvent[]> {
    return eventsCache.get();
}

/** Force-clear all scraper caches (admin/debug). */
export function invalidateScraperCaches(): void {
    openingHoursCache.invalidate();
    eventsCache.invalidate();
}
