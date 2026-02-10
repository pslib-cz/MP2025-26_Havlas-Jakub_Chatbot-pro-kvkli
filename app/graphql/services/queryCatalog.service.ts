import fs from "fs/promises";
import path from "path";
import axios from "axios";
import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import LoggerService from "./logger.service";

const CATALOG_URL = "https://ipac.kvkli.cz/arl-li/cs/vysledky/";
const BOOK_URL = "https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat-";

type QueryData = {
    typeSearch: "G" | "AU" | "TITLE" | "SUBJECT" | "DATE1" | "PUBL";
    queryContent: string;
};

type BookResult = {
    id: string;
    title: string;
    author: string;
    year?: string;
    url: string;
    description?: string;
    subjects?: string;
};

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

            const result = {
                id,
                title: title.replace(/\s*\/\s*$/, '').trim(),
                author,
                year,
                url: `${BOOK_URL}${id}-Arila/?disprec=2&iset=1`,
                description,
                subjects,
            };

            LoggerService.info("Book fetched successfully", { id, title });
            return result;
        } catch (error) {
            LoggerService.logError(error as Error, "getBookById", { id });
            return null;
        }
    },

    async queryCatalog(data: QueryData): Promise<BookResult[]> {
        const { typeSearch, queryContent } = data;
        
        try {
            LoggerService.info("Querying catalog", { typeSearch, queryContent });
            
            const url = `${CATALOG_URL}?field=${typeSearch}&term=${encodeURIComponent(queryContent)}&search=Hledat&op=result&zf=&sort=&guide=`;
            const response = await axios.get(url, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
            });

            const html = response.data;
            const root = parse(html);
            const results: BookResult[] = [];

            // Try multiple selectors for result items
            const items = root.querySelectorAll(".result-item, .list-item, .record, tr.result");

            if (items.length === 0) {
                LoggerService.warn("No results found in catalog", { typeSearch, queryContent });
                return [];
            }

            // Fetch detailed info for each result
            for (let i = 0; i < Math.min(items.length, 5); i++) {
                const item = items[i];
                try {
                    // Extract ID from link
                    const link = item.querySelector("a[href*='detail-li_us_cat']");
                    const href = link?.getAttribute("href") || "";
                    const idMatch = href.match(/detail-li_us_cat-(\d+)/);
                    
                    if (idMatch) {
                        const id = idMatch[1];
                        // Fetch full book details
                        const bookDetails = await this.getBookById(id);
                        if (bookDetails) {
                            results.push(bookDetails);
                        }
                    } else {
                        // Fallback: parse from search results
                        const title = item.querySelector(".title, .result-title, h3, a")?.text.trim() || "Neznámý název";
                        const author = item.querySelector(".author, .result-author")?.text.trim() || "Neznámý autor";
                        const year = item.querySelector(".year, .result-year, .date")?.text.trim();

                        results.push({
                            id: `unknown-${i}`,
                            title: title.replace(/\s*\/\s*$/, '').trim(),
                            author,
                            year,
                            url: href.startsWith('http') ? href : `https://ipac.kvkli.cz${href}`,
                        });
                    }
                } catch (parseError) {
                    LoggerService.warn("Failed to parse catalog item", { 
                        error: (parseError as Error).message,
                        index: i
                    });
                }
            }

            LoggerService.info("Catalog query completed", { 
                typeSearch, 
                queryContent, 
                resultsCount: results.length 
            });

            return results;
        } catch (error) {
            LoggerService.logError(error as Error, "queryCatalog", { typeSearch, queryContent });
            return [];
        }
    },

    async searchByTitle(title: string): Promise<BookResult[]> {
        return this.queryCatalog({ typeSearch: "TITLE", queryContent: title });
    },

    async searchByAuthor(author: string): Promise<BookResult[]> {
        return this.queryCatalog({ typeSearch: "AU", queryContent: author });
    },

    async searchGeneral(query: string): Promise<BookResult[]> {
        return this.queryCatalog({ typeSearch: "G", queryContent: query });
    },
};