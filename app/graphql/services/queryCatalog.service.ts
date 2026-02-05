import fs from "fs/promises";
import path from "path";
import axios from "axios";
import { parse } from "node-html-parser";
import type { HTMLElement } from "node-html-parser";
import LoggerService from "./logger.service";

const CATALOG_URL = "https://ipac.kvkli.cz/arl-li/cs/vysledky/";
const BOOK_URL = "https://ipac.kvkli.cz/arl-li/cs/detail-li_us_cat-s";
 type QueryData = {
        typeSearch: "G" | "AU" | "TITLE" | "SUBJECT" | "DATE1" | "PUBL";
        queryContent: string;
    }

export const queryCatalogService = {

    getBookById(id: string) {
        return axios.get(`${BOOK_URL}${id}`)
            .then(response => {
                const html = response.data;
                const root = parse(html);
                const title = root.querySelector(".result-title")?.text.trim() || "Unknown Title";
                const author = root.querySelector(".result-author")?.text.trim() || "Unknown Author";
                const year = root.querySelector(".result-year")?.text.trim() || "Unknown Year";
                return { title, author, year };
            })
            .catch(error => {
                LoggerService.logError(error as Error, "getBookById", { id });
                throw error;
            });
    },

   
    queryCatalog(Data: QueryData){
        const { typeSearch, queryContent } = Data;
        const url = `${CATALOG_URL}?field=${typeSearch}&term=${encodeURIComponent(queryContent)}&search=Hledat&op=result&zf=&sort=&guide=`;
        return axios.get(url)
            .then(response => {
                const html = response.data;
                const root = parse(html);
                const results: { title: string; author: string; year: string }[] = [];
                const items = root.querySelectorAll(".result-item");
                items.forEach((item: HTMLElement) => {
                    const title = item.querySelector(".result-title")?.text.trim() || "Unknown Title";
                    const author = item.querySelector(".result-author")?.text.trim() || "Unknown Author";
                    const year = item.querySelector(".result-year")?.text.trim() || "Unknown Year";
                    results.push({ title, author, year });
                }
                );
                return results;
            })
            .catch(error => {
                LoggerService.logError(error as Error, "queryCatalog", { typeSearch, queryContent });
                throw error;
            });
    }

}