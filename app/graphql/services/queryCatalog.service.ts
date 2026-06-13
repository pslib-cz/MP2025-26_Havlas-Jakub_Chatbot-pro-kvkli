import fs from "fs/promises";
import path from "path";
import axios from "axios";
import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import LoggerService from "./logger.service";
import type { QueryData, BookResult, HoldingItem } from "../../types";


const CATALOG_URL = "https://ipac.kvkli.cz/arl-li/cs/vysledky/";
const BOOK_URL = "https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat-";
const PAGE_SIZE = 10; // catalog returns 10 items per page
const FETCH_ALL = 0;  // sentinel: fetch all available books


export const queryCatalogService = {
    async getBookById(id: string): Promise<BookResult | null> {
        try {
            LoggerService.info("Fetching book by ID", { id });
            const response = await axios.get(`${BOOK_URL}${id}-Arila/?disprec=2&iset=1`, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                },
            });
            const html = response.data;
            const root = parse(html);

            // Try multiple selectors for title
            const title = root.querySelector(".title, h1.title, .record-title")?.text.trim() || 
                         root.querySelector("h1")?.text.trim() || 
                         "Neznámý název";

            // Try multiple selectors for author
            const author = root.querySelector(".author, .record-author, span.author")?.text.trim() || 
                          root.querySelectorAll("tr").find(tr => 
                              tr.text.includes("Autor") || tr.text.includes("Author")
                          )?.querySelector("td")?.text.trim() || 
                          "Neznámý autor";

            // Get year
            const year = root.querySelector(".year, .publication-year, .date")?.text.trim();

            // Get description/annotation
            const description = root.querySelector(".description, .annotation, .summary")?.text.trim() ||
                               root.querySelectorAll("tr").find(tr => 
                                   tr.text.includes("Anotace") || tr.text.includes("Popis")
                               )?.querySelector("td")?.text.trim();

            // Get subjects
            const subjects = root.querySelector(".subjects, .keywords")?.text.trim() ||
                            root.querySelectorAll("tr").find(tr => 
                                tr.text.includes("Téma") || tr.text.includes("Předmět")
                            )?.querySelector("td")?.text.trim();

            // Parse holdings table (availability)
            const holdings: HoldingItem[] = [];
            const holdingsTable = root.querySelector("table.b_holdingsx");
            if (holdingsTable) {
                const rows = holdingsTable.querySelectorAll("tbody tr");
                for (const row of rows) {
                    const cells = row.querySelectorAll("td");
                    if (cells.length >= 5) {
                        holdings.push({
                            branch: cells[0].text.trim(),
                            department: cells[1].text.trim(),
                            location: cells[2].text.trim(),
                            signature: cells[3].text.trim(),
                            status: cells[4].text.trim(),
                        });
                    }
                }
            }

            // Parse copy count from "Počet ex." row as fallback
            let totalCopies: number | undefined;
            let availableCopies: number | undefined;
            const countRow = root.querySelectorAll("tr").find(tr =>
                tr.querySelector("th")?.text.includes("Počet ex.")
            );
            if (countRow) {
                const countText = countRow.querySelector("td")?.text.trim() || "";
                const totalMatch = countText.match(/^(\d+)/);
                const availMatch = countText.match(/volných\s+(\d+)/);
                if (totalMatch) totalCopies = parseInt(totalMatch[1], 10);
                if (availMatch) availableCopies = parseInt(availMatch[1], 10);
            }
            // If we have holdings but no count row, derive from holdings
            if (holdings.length > 0 && totalCopies === undefined) {
                totalCopies = holdings.length;
                availableCopies = holdings.filter(h => h.status.toLowerCase() === "volný").length;
            }

            const result: BookResult = {
                id,
                title: title.replace(/\s*\/\s*$/, '').trim(),
                author,
                year,
                url: `${BOOK_URL}${id}-Arila/?disprec=2&iset=1`,
                description,
                subjects,
                availability: holdings.length > 0 ? holdings : undefined,
                totalCopies,
                availableCopies,
            };

            LoggerService.info("Book fetched successfully", { id, title, holdings: holdings.length });
            return result;
        } catch (error) {
            LoggerService.logError(error as Error, "getBookById", { id });
            return null;
        }
    },

    async queryCatalog(data: QueryData, limit = 5): Promise<BookResult[]> {
        const { typeSearch, queryContent } = data;
        const fetchAll = limit === FETCH_ALL;
        
        try {
            LoggerService.info("Querying catalog", { typeSearch, queryContent, limit: fetchAll ? "all" : limit });

            const seen = new Set<string>();
            const results: BookResult[] = [];
            let page = 1;
            let hasMorePages = true;

            while (hasMorePages) {
                if (!fetchAll && results.length >= limit) break;

                const pageUrl = page === 1
                    ? `${CATALOG_URL}?field=${typeSearch}&term=${encodeURIComponent(queryContent)}&search=Hledat&op=result&zf=&sort=&guide=`
                    : `${CATALOG_URL}?field=${typeSearch}&term=${encodeURIComponent(queryContent)}&search=Hledat&op=result&zf=&sort=&guide=&pg=${page}`;

                const response = await axios.get(pageUrl, {
                    timeout: 10000,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                });

                const root = parse(response.data);
                const items = root.querySelectorAll(".result-item, .list-item, .record, tr.result");

                if (items.length === 0) break;
                if (items.length < PAGE_SIZE) hasMorePages = false;

                // Collect IDs/fallback data from this page first
                const pageEntries: Array<{ id: string } | { fallback: BookResult }> = [];
                for (let i = 0; i < items.length; i++) {
                    if (!fetchAll && pageEntries.length + results.length >= limit) break;
                    const item = items[i];
                    const link = item.querySelector("a[href*='detail-li_us_cat']");
                    const href = link?.getAttribute("href") || "";
                    const idMatch = href.match(/detail-li_us_cat-(\d+)/);
                    if (idMatch) {
                        pageEntries.push({ id: idMatch[1] });
                    } else {
                        const title = item.querySelector(".title, .result-title, h3, a")?.text.trim() || "Neznámý název";
                        const author = item.querySelector(".author, .result-author")?.text.trim() || "Neznámý autor";
                        const year = item.querySelector(".year, .result-year, .date")?.text.trim();
                        pageEntries.push({ fallback: {
                            id: `unknown-${page}-${i}`,
                            title: title.replace(/\s*\/\s*$/, '').trim(),
                            author,
                            year,
                            url: href.startsWith('http') ? href : `https://ipac.kvkli.cz${href}`,
                        } });
                    }
                }

                // Fetch all book details in parallel
                const fetchedBooks = await Promise.all(
                    pageEntries.map(entry =>
                        'id' in entry
                            ? this.getBookById(entry.id)
                            : Promise.resolve(entry.fallback)
                    )
                );

                for (const bookDetails of fetchedBooks) {
                    if (!bookDetails) continue;
                    const key = `${bookDetails.title.toLowerCase().trim()}|${bookDetails.author.toLowerCase().trim()}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        results.push(bookDetails);
                    } else {
                        LoggerService.info("Skipping duplicate book", { title: bookDetails.title, id: bookDetails.id });
                    }
                }

                LoggerService.info("Page fetched", { page, itemsOnPage: items.length, uniqueSoFar: results.length });
                page++;
            }

            LoggerService.info("Catalog query completed", {
                typeSearch,
                queryContent,
                pages: page - 1,
                resultsCount: results.length,
            });

            return results;
        } catch (error) {
            LoggerService.logError(error as Error, "queryCatalog", { typeSearch, queryContent });
            return [];
        }
    },

    async searchByTitle(title: string, limit = 5): Promise<BookResult[]> {
        return this.queryCatalog({ typeSearch: "TITLE", queryContent: title }, limit);
    },

    async searchByAuthor(author: string, limit = 5): Promise<BookResult[]> {
        return this.queryCatalog({ typeSearch: "AU", queryContent: author }, limit);
    },

    async searchGeneral(query: string, limit = 5): Promise<BookResult[]> {
        return this.queryCatalog({ typeSearch: "G", queryContent: query }, limit);
    },

    async searchBySubject(subject: string, limit = 5): Promise<BookResult[]> {
        return this.queryCatalog({ typeSearch: "SUBJECT", queryContent: subject }, limit);
    },
};