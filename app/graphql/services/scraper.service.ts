// ─── Scraper Service — Live Data from KVKLI Website ───────────────────────────

import axios from "axios";
import { parse } from "node-html-parser";
import type { Contact } from "../../types/Contact";
import type { BranchOpeningHours, DaySchedule } from "../../types/OpeningHours";
import LoggerService from "./logger.service";

const CONTACTS_URL = "https://www.kvkli.cz/kontakt/kontakty-dle-oddeleni";
const OPENING_HOURS_URL = "https://www.kvkli.cz/kontakt/oteviraci-doba";
const REQUEST_TIMEOUT = 10000;

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

        branches.push({ branch, schedule });
    }

    LoggerService.info("Scraped opening hours from KVKLI website", {
        branchCount: branches.length,
    });

    return branches;
}
