// ─── Service Info Scraper — Live scraping of kvkli.cz service pages ───────────

import axios from "axios";
import { parse } from "node-html-parser";
import LoggerService from "./logger.service";

const BASE_URL = "https://www.kvkli.cz";

/**
 * Available service pages with their slugs and descriptions.
 * Used by the AI model to pick the right page for a user query.
 */
export const SERVICE_PAGES: Record<string, { title: string; keywords: string }> = {
    "/sluzby/pujcovani-a-cetba/vse-o-pujcovani": {
        title: "Vše o půjčování",
        keywords: "výpůjční lhůta, prodlužování, počty výpůjček, rezervace, vracení, zpozdné, výdejní box",
    },
    "/sluzby/prihlasit-se-do-knihovny": {
        title: "Přihlásit se do knihovny (registrace)",
        keywords: "registrace, čtenářský průkaz, přihlášení, vzdálená registrace, poplatky za registraci, děti",
    },
    "/sluzby/pujcovani-a-cetba/jak-zaplatit": {
        title: "Jak zaplatit",
        keywords: "platby, poplatky, ceník, účet knihovny, online platba, finanční konto",
    },
    "/sluzby/pujcovani-a-cetba-/kde-najit": {
        title: "Kde najít (orientace v budově)",
        keywords: "patra, oddělení, mapa budovy, kde najdu, umístění, fond, DVD, CD, audioknihy, dětské",
    },
    "/sluzby/meziknihovni-sluzby": {
        title: "Meziknihovní služby",
        keywords: "MVS, meziknihovní výpůjčka, jiná knihovna, objednání odjinud",
    },
    "/sluzby/pujcovani-a-cetba-/vydejni-box": {
        title: "Výdejní box",
        keywords: "výdejní box, vyzvednutí, objednávka, samoobsluha",
    },
    "/sluzby/donaskova-sluzba": {
        title: "Donášková služba",
        keywords: "donáška, rozvoz, handicap, senioři, domů",
    },
    "/sluzby/studovny-studijni-boxy": {
        title: "Čítárny a studovny",
        keywords: "studovna, čítárna, studijní box, prezenční, tiché studium",
    },
    "/sluzby/studium-/kopirovani-tisk-skenovani": {
        title: "Kopírování, tisk, skenování",
        keywords: "kopírka, tisk, skenování, samoobslužné, cena kopie",
    },
    "/sluzby/kreativni-cinnosti/3d-tisk": {
        title: "3D tisk",
        keywords: "3D tisk, 3D tiskárna, modelování, kreativní",
    },
    "/sluzby/kreativni-cinnosti/deskove-hry": {
        title: "Deskové hry",
        keywords: "deskové hry, společenské hry, půjčení hry, hraní",
    },
    "/sluzby/kreativni-knihovna/hudebni-nastroje": {
        title: "Hudební nástroje",
        keywords: "hudební nástroje, kytara, ukulele, půjčení nástroje, hudba",
    },
    "/sluzby/kreativni-knihovna/vr": {
        title: "Virtuální realita",
        keywords: "VR, virtuální realita, headset, zážitek",
    },
    "/sluzby/kreativni-cinnosti/sici-stroj": {
        title: "Šicí stroj",
        keywords: "šicí stroj, šití, kreativní dílna",
    },
    "/sluzby/kreativni-knihovna/poslech-hudby": {
        title: "Poslech hudby",
        keywords: "poslech, hudba, vinyl, gramofon, sluchátka",
    },
    "/sluzby/ostatni/internet-wi-fi": {
        title: "Internet / Wi-Fi",
        keywords: "wifi, internet, připojení, počítač, online",
    },
    "/sluzby/ostatni/pronajmy-prostor": {
        title: "Pronájmy prostor",
        keywords: "pronájem, sál, místnost, akce, prostor",
    },
    "/sluzby/ostatni/knihovni-kavarna": {
        title: "Knihovní kavárna",
        keywords: "kavárna, občerstvení, káva",
    },
    "/sluzby/ostatni/moznosti-parkovani": {
        title: "Možnosti parkování",
        keywords: "parkování, auto, garáž, kde zaparkovat",
    },
    "/o-nas/o-knihovne/knihovni-rad": {
        title: "Knihovní řád",
        keywords: "knihovní řád, pravidla, podmínky, řád, povinnosti čtenáře",
    },
    "/o-nas/o-knihovne/cenik-sluzeb": {
        title: "Ceník služeb",
        keywords: "ceník, ceny, poplatky, kolik stojí, registrace cena, zpozdné sazba",
    },
    "/pro-deti/jak-to-u-nas-chodi": {
        title: "Pro děti – jak to u nás chodí",
        keywords: "děti, dětské oddělení, pravidla pro děti",
    },
    "/pro-deti/chci-se-stat-ctenarem": {
        title: "Pro děti – chci se stát čtenářem",
        keywords: "dětská registrace, dítě čtenář, průkaz dítě",
    },
    "/sluzby/citace-pro": {
        title: "Citace PRO",
        keywords: "citace, citování, zdroje, bibliografie",
    },
    "/sluzby/resersni-sluzba": {
        title: "Rešeršní služba",
        keywords: "rešerše, vyhledání literatury, odborné zdroje",
    },
    "/e-knihovna/e-vypujcky": {
        title: "E-výpůjčky (e-knihy)",
        keywords: "e-knihy, ebook, elektronické knihy, čtečka, online půjčení",
    },
};

/**
 * Scrape a specific page from kvkli.cz and extract the main text content.
 */
export async function scrapeServicePage(slug: string): Promise<string | null> {
    const url = `${BASE_URL}${slug}`;

    try {
        LoggerService.info("Scraping service page", { url });

        const response = await axios.get(url, {
            timeout: 10000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
        });

        const root = parse(response.data);

        // Extract main content area
        const mainContent = root.querySelector(".content[role='main']")
            || root.querySelector("#maincontent .content")
            || root.querySelector("section.main .content");

        if (!mainContent) {
            LoggerService.warn("No main content found on page", { url });
            return null;
        }

        // Remove script/style tags
        mainContent.querySelectorAll("script, style").forEach((el) => el.remove());

        // Get text, preserving some structure
        const text = mainContent.text
            .replace(/\t/g, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();

        if (text.length < 20) {
            LoggerService.warn("Page content too short", { url, length: text.length });
            return null;
        }

        LoggerService.info("Service page scraped successfully", {
            url,
            contentLength: text.length,
        });

        return text;
    } catch (error) {
        LoggerService.logError(error as Error, "scrapeServicePage", { url });
        return null;
    }
}
