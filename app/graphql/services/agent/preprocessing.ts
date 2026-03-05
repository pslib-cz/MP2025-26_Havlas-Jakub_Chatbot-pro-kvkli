// ─── Deterministic Preprocessing Utilities ────────────────────────────────────

import { MAX_COUNT } from "./constants";

/**
 * Remove null bytes and control characters, normalize whitespace.
 * Ensures user input is safe for downstream processing.
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/\x00/g, "")
        .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .trim();
}

/**
 * Normalize Unicode to NFC form and strip combining diacritical marks.
 * Also maps common non-ASCII characters to ASCII equivalents.
 */
export function normalizeUnicode(value: string): string {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ø/g, "o")
        .replace(/Ø/g, "O")
        .replace(/æ/g, "ae")
        .replace(/Æ/g, "Ae")
        .replace(/å/g, "a")
        .replace(/Å/g, "A")
        .replace(/ł/g, "l")
        .replace(/Ł/g, "L")
        .replace(/ß/g, "ss");
}

/**
 * Strip all non-ASCII characters — useful as a catalog search fallback.
 */
export function toAsciiOnly(value: string): string {
    return value.replace(/[^\x00-\x7F]/g, "").trim();
}

/**
 * Lowercase and strip non-alphanumeric characters for loose comparison.
 */
export function normalizeForComparison(value: string): string {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .trim();
}

/**
 * Normalize count values: converts "all"/"všechny" semantics to MAX_COUNT.
 * Clamps between 1 and MAX_COUNT.
 */
export function normalizeCount(
    count: number | undefined,
    defaultCount: number,
): number {
    if (count === undefined || count === null) {
        return defaultCount;
    }
    if (count >= MAX_COUNT) {
        return MAX_COUNT;
    }
    return Math.max(1, Math.min(count, MAX_COUNT));
}

/**
 * Strip role suffixes like "(Autor)" and trailing birth years from author names.
 */
export function stripAuthorRole(author: string): string {
    return author
        .replace(/\s*\([^)]*\)\s*/g, "")
        .replace(/,\s*\d{4}-(\d{4})?\s*$/g, "")
        .replace(/,\s*$/, "")
        .trim();
}
