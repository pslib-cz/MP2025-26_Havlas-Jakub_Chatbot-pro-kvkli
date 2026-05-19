// ─── Deterministic Preprocessing Utilities ────────────────────────────────────

import { MAX_COUNT } from "./constants";

/** Maximum allowed user message length (characters) */
export const MAX_INPUT_LENGTH = 1000;

/** Message returned when input exceeds length limit */
export const INPUT_TOO_LONG_MESSAGE =
    "Omlouvám se, ale vaše zpráva je příliš dlouhá. Zkuste ji prosím zkrátit (maximálně 1000 znaků).";

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
 * Check if input exceeds the maximum allowed length.
 * Returns true if the input is too long.
 */
export function isInputTooLong(input: string): boolean {
    return input.length > MAX_INPUT_LENGTH;
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
 * Normalize count values: clamps between 1 and MAX_COUNT.
 * Values above MAX_COUNT are clamped to MAX_COUNT (not treated as fetch-all).
 */
export function normalizeCount(
    count: number | undefined,
    defaultCount: number,
): number {
    if (count === undefined || count === null) {
        return defaultCount;
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

// ─── Output Validation ────────────────────────────────────────────────────────

/** Maximum allowed output length (characters) — truncate beyond this */
const MAX_OUTPUT_LENGTH = 4000;

/** Fallback when output is flagged as problematic */
export const OUTPUT_FILTERED_MESSAGE =
    "Omlouvám se, ale nemohu poskytnout tuto odpověď. Jak vám mohu pomoci s dotazem ohledně knihovny?";

/**
 * Patterns that indicate the model leaked system prompt content or was manipulated.
 */
const SYSTEM_LEAK_PATTERNS = [
    /VÝBĚR FUNKCÍ/i,
    /BEZPEČNOSTNÍ PRAVIDLA/i,
    /ZAKÁZÁNO \(strict\)/i,
    /OCHRANA PROTI MANIPULACI/i,
    /tool_calls/i,
    /getOpeningHours|getContact|getEvents|getOfficeInfo|searchCatalog|recommendBooks|findBookByPlot|searchWebsite/,
];

/**
 * Patterns indicating the model generated off-topic code output.
 */
const CODE_BLOCK_PATTERNS = [
    /```(?:html|css|javascript|typescript|python|java|cpp|c#|php|ruby|go|rust|sql|bash|shell|powershell)/i,
    /<html[\s>]/i,
    /<!doctype\s+html/i,
    /<script[\s>]/i,
    /<style[\s>]/i,
];

/**
 * Validate and sanitize the AI response.
 * Returns the original answer if safe, or a filtered message if problematic.
 */
export function validateOutput(answer: string): string {
    // Truncate excessively long responses
    if (answer.length > MAX_OUTPUT_LENGTH) {
        answer = answer.substring(0, MAX_OUTPUT_LENGTH) + "\n\n…(odpověď byla zkrácena)";
    }

    // Check for system prompt leakage
    for (const pattern of SYSTEM_LEAK_PATTERNS) {
        if (pattern.test(answer)) {
            return OUTPUT_FILTERED_MESSAGE;
        }
    }

    // Check for off-topic code generation
    for (const pattern of CODE_BLOCK_PATTERNS) {
        if (pattern.test(answer)) {
            return OUTPUT_FILTERED_MESSAGE;
        }
    }

    return answer;
}
