// ─── Contact Service — Deterministic Contact Lookup ───────────────────────────

import type { Contact } from "../../types/Contact";
import { CONTACTS } from "./data/contacts";

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
 * Deterministic contact service that searches a static contacts data source.
 * No vector search or dynamic scraping — purely in-memory lookup.
 */
export class ContactService {
    private readonly contacts: Contact[];
    private readonly normalized: Array<{
        name: string;
        role: string;
        department: string;
    }>;

    constructor(contacts: Contact[] = CONTACTS) {
        this.contacts = contacts;
        this.normalized = contacts.map((c) => ({
            name: normalize(c.name),
            role: normalize(c.role ?? ""),
            department: normalize(c.department),
        }));
    }

    /**
     * Search contacts by name, role, and/or department.
     * Returns all matches sorted by relevance (exact name > partial name > role/department).
     */
    search(query: ContactQuery): Contact[] {
        const qName = query.name ? normalize(query.name) : undefined;
        const qRole = query.role ? normalize(query.role) : undefined;
        const qDept = query.department
            ? normalize(query.department)
            : undefined;

        if (!qName && !qRole && !qDept) {
            return [];
        }

        const matches: ContactMatch[] = [];

        for (let i = 0; i < this.contacts.length; i++) {
            const norm = this.normalized[i];
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
                // Bidirectional contains OR any query token found in role
                if (
                    norm.role.includes(qRole) ||
                    qRole.includes(norm.role) ||
                    tokenMatch(roleTokens, norm.role)
                ) {
                    score += ROLE_SCORE;
                }
                // Also match role query tokens against department
                // (e.g. "IT správce" → finds Oddělení IT)
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
                matches.push({ contact: this.contacts[i], score });
            }
        }

        return matches.sort((a, b) => b.score - a.score).map((m) => m.contact);
    }
}

/** Singleton instance */
export const contactService = new ContactService();
