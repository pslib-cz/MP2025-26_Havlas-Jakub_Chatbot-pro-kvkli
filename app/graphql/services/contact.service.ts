// ─── Contact Service — Live-Scraped Contact Lookup ────────────────────────────

import type { Contact } from "../../types/Contact";
import { CONTACTS } from "./data/contacts";
import { scrapeContacts } from "./scraper.service";
import LoggerService from "./logger.service";

interface ContactQuery {
    name?: string;
    role?: string;
    department?: string;
}

interface ContactMatch {
    contact: Contact;
    score: number;
}

const EXACT_NAME_BONUS = 100;
const PARTIAL_NAME_SCORE = 10;
const ROLE_SCORE = 5;
const DEPARTMENT_SCORE = 5;

/** Cache TTL in milliseconds (10 minutes) */
const CACHE_TTL = 10 * 60 * 1000;

/**
 * Remove diacritics and lowercase a string for fuzzy comparison.
 */
function normalize(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

/**
 * Split a normalized string into individual tokens (length >= 2).
 */
function tokenize(value: string): string[] {
    return value.split(/[\s,]+/).filter((t) => t.length >= 2);
}

/**
 * Returns true if any token from `queryTokens` appears in `target`.
 */
function tokenMatch(queryTokens: string[], target: string): boolean {
    return queryTokens.some((token) => target.includes(token));
}

/**
 * Contact service that scrapes live data from the KVKLI website with
 * in-memory caching. Falls back to static contacts if scraping fails.
 */
export class ContactService {
    private cachedContacts: Contact[] | null = null;
    private cacheTimestamp = 0;

    /**
     * Get contacts — from cache, live scrape, or static fallback.
     */
    private async getContacts(): Promise<Contact[]> {
        const now = Date.now();
        if (this.cachedContacts && now - this.cacheTimestamp < CACHE_TTL) {
            return this.cachedContacts;
        }

        try {
            const contacts = await scrapeContacts();
            if (contacts.length > 0) {
                this.cachedContacts = contacts;
                this.cacheTimestamp = now;
                return contacts;
            }
        } catch (error) {
            LoggerService.warn("Failed to scrape contacts, using fallback", {
                error: (error as Error).message,
            });
        }

        // Fallback to static data
        return CONTACTS;
    }

    /**
     * Search contacts by name, role, and/or department.
     * Returns all matches sorted by relevance (exact name > partial name > role/department).
     */
    async search(query: ContactQuery): Promise<Contact[]> {
        const qName = query.name ? normalize(query.name) : undefined;
        const qRole = query.role ? normalize(query.role) : undefined;
        const qDept = query.department
            ? normalize(query.department)
            : undefined;

        if (!qName && !qRole && !qDept) {
            return [];
        }

        const contacts = await this.getContacts();
        const normalized = contacts.map((c) => ({
            name: normalize(c.name),
            role: normalize(c.role ?? ""),
            department: normalize(c.department),
        }));

        const matches: ContactMatch[] = [];

        for (let i = 0; i < contacts.length; i++) {
            const norm = normalized[i];
            let score = 0;

            if (qName) {
                if (norm.name === qName) {
                    score += EXACT_NAME_BONUS;
                } else if (
                    norm.name.includes(qName) ||
                    qName.includes(norm.name)
                ) {
                    score += PARTIAL_NAME_SCORE;
                }
            }

            if (qRole) {
                const roleTokens = tokenize(qRole);
                if (
                    norm.role.includes(qRole) ||
                    qRole.includes(norm.role) ||
                    tokenMatch(roleTokens, norm.role)
                ) {
                    score += ROLE_SCORE;
                }
                if (tokenMatch(roleTokens, norm.department)) {
                    score += DEPARTMENT_SCORE;
                }
            }

            if (qDept) {
                const deptTokens = tokenize(qDept);
                if (
                    norm.department.includes(qDept) ||
                    qDept.includes(norm.department) ||
                    tokenMatch(deptTokens, norm.department)
                ) {
                    score += DEPARTMENT_SCORE;
                }
            }

            if (score > 0) {
                matches.push({ contact: contacts[i], score });
            }
        }

        return matches.sort((a, b) => b.score - a.score).map((m) => m.contact);
    }
}

/** Singleton instance */
export const contactService = new ContactService();
