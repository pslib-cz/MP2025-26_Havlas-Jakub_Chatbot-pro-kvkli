// ─── Book Formatting Utilities ────────────────────────────────────────────────

import type { BookItem } from "../../../types";
import { CATALOG_BASE_URL, COMPACT_THRESHOLD } from "./constants";
import {
    normalizeUnicode,
    normalizeForComparison,
    stripAuthorRole,
} from "./preprocessing";
import LoggerService from "../logger.service";

/**
 * Build a catalog URL for a book item.
 */
function buildBookUrl(book: BookItem): string {
    return book.url || `${CATALOG_BASE_URL}-${book.id}-Arila/?disprec=2&iset=1`;
}

/** Clean trailing slashes and whitespace from a title */
function cleanTitle(title: string): string {
    return title.replace(/\s*\/\s*$/, "").trim();
}

/**
 * Compact single-line format: `- [Title](url) — Author`
 */
function formatBookCompact(book: BookItem, omitAuthor: boolean): string {
    const url = buildBookUrl(book);
    const title = cleanTitle(book.title);
    const author = stripAuthorRole(book.author);
    const availStr = book.totalCopies !== undefined
        ? ` [${book.availableCopies ?? 0}/${book.totalCopies} volných]`
        : "";
    return omitAuthor
        ? `- [${title}](${url})${availStr}`
        : `- [${title}](${url}) — ${author}${availStr}`;
}

/**
 * Detailed multi-line format with metadata.
 */
function formatBookDetailed(book: BookItem): string {
    const url = buildBookUrl(book);
    const title = cleanTitle(book.title);
    let result = `### 📘 [${title}](${url})\n**Autor:** ${book.author}`;
    if (book.year) {
        result += ` (${book.year})`;
    }
    if (book.subjects) {
        result += `\n**Témata:** ${book.subjects}`;
    }
    if (book.description) {
        const desc =
            book.description.length > 150
                ? `${book.description.substring(0, 150)}...`
                : book.description;
        result += `\n${desc}`;
    }
    if (book.totalCopies !== undefined) {
        const avail = book.availableCopies ?? 0;
        const total = book.totalCopies;
        const locations = book.availability
            ?.filter(h => h.status.toLowerCase() === "volný")
            .map(h => `${h.branch} – ${h.location}`)
            .filter((v, i, a) => a.indexOf(v) === i) ?? [];
        const locationStr = locations.length > 0 ? ` (${locations.join("; ")})` : "";
        result += `\n**Dostupnost:** ${avail} volných z ${total}${locationStr}`;
    }
    return result;
}

/**
 * Deduplicate books by normalized title+author key.
 */
export function deduplicateBooks(books: BookItem[]): BookItem[] {
    const seen = new Set<string>();
    const result: BookItem[] = [];
    for (const book of books) {
        const key = `${normalizeUnicode(book.title).toLowerCase().trim()}|${normalizeUnicode(book.author).toLowerCase().trim()}`;
        if (!seen.has(key)) {
            seen.add(key);
            result.push(book);
        }
    }
    if (result.length < books.length) {
        LoggerService.info("Deduplication complete", {
            before: books.length,
            after: result.length,
        });
    }
    return result;
}

/**
 * Filter catalog results to books whose author field matches the requested name.
 */
export function filterByAuthor(
    books: BookItem[],
    requestedAuthor: string,
): BookItem[] {
    const norm = normalizeForComparison(normalizeUnicode(requestedAuthor));
    const parts = norm.split(/\s+/).filter(Boolean);
    return books.filter((book) => {
        const bookAuthorNorm = normalizeForComparison(
            normalizeUnicode(book.author),
        );
        return (
            book.id &&
            parts.some(
                (part) => part.length > 2 && bookAuthorNorm.includes(part),
            )
        );
    });
}

/**
 * Format a list of books into a human-readable string.
 * Uses compact format for large lists, detailed for small ones.
 * Omits author when all books share the same requested author.
 */
export function formatBooks(
    books: BookItem[],
    requestedAuthor?: string,
): string {
    const deduped = deduplicateBooks(books);
    const useCompact = deduped.length > COMPACT_THRESHOLD;

    const allSameAuthor =
        requestedAuthor != null &&
        deduped.every((book) => {
            const bookNorm = normalizeUnicode(book.author).toLowerCase();
            const reqNorm = normalizeUnicode(requestedAuthor).toLowerCase();
            return (
                bookNorm.includes(reqNorm) ||
                reqNorm.includes(bookNorm.split(",")[0])
            );
        });

    if (useCompact) {
        return deduped
            .map((book) => formatBookCompact(book, allSameAuthor))
            .join("\n");
    }

    return deduped.map(formatBookDetailed).join("\n\n");
}

/**
 * Ensure each book has a valid URL.
 */
export function ensureBookUrls(books: BookItem[]): BookItem[] {
    return books.map((book) => ({
        ...book,
        url: buildBookUrl(book),
    }));
}
