// ─── Scraper Service — Live Data from KVKLI Website ───────────────────────────

import axios from "axios";
import { parse } from "node-html-parser";
import type { Contact } from "../../types/Contact";
import type { BranchOpeningHours, DaySchedule } from "../../types/OpeningHours";
import type { LibraryEvent } from "../../types/LibraryEvent";
import LoggerService from "./logger.service";

const CONTACTS_URL = "https://www.kvkli.cz/kontakt/kontakty-dle-oddeleni";
const OPENING_HOURS_URL = "https://www.kvkli.cz/kontakt/oteviraci-doba";
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

/**
 * Scrape upcoming events from the KVKLI website.
 * Parses date headings (h2) and akce_item cards within each date section.
 */
export async function scrapeEvents(): Promise<LibraryEvent[]> {
    const response = await axios.get(EVENTS_URL, {
        timeout: REQUEST_TIMEOUT,
        headers: { "User-Agent": "KVKLI-Chatbot/1.0" },
    });

    const root = parse(response.data);
    const events: LibraryEvent[] = [];

    const target = root.querySelector("#loadMoreTarget");
    if (!target) {
        LoggerService.warn("Could not find #loadMoreTarget on events page");
        return events;
    }

    // Iterate through child nodes — h2 sets the current date, akce_list contains event items
    let currentDate = "";
    for (const child of target.childNodes) {
        if (!("tagName" in child)) continue;
        const el = child as import("node-html-parser").HTMLElement;

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
                    date: currentDate,
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

    LoggerService.info("Scraped events from KVKLI website", {
        count: events.length,
    });

    return events;
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
