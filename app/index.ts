import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";

type MarcRecord = {
    Title: string;
    Author: string;
    Publisher: string;
    Year: string;
    ISBN: string;
    Subjects: string;
    Description: string;
};

type MarcDatafield = {
    "@_tag": string;
    subfield?: MarcSubfield | MarcSubfield[];
};

type MarcSubfield = {
    "@_code": string;
    "#text": string;
};

type ParsedMarcRecord = {
    datafield?: MarcDatafield | MarcDatafield[];
};

const BASE_URL = "https://ipac.kvkli.cz/arl-li/cs/oai/";

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
});

function escapeCsv(value?: string): string {
    if (!value) return "";
    return `"${value.replace(/"/g, '""')}"`;
}

function getSubfield(
    record: ParsedMarcRecord,
    tag: string,
    code: string,
): string | undefined {
    const fields = record?.datafield;
    if (!fields) return;

    const arr = Array.isArray(fields) ? fields : [fields];

    return arr
        .filter((f) => f["@_tag"] === tag)
        .flatMap((f) => {
            const sub = f.subfield;
            if (!sub) return [];
            return Array.isArray(sub) ? sub : [sub];
        })
        .find((sf) => sf["@_code"] === code)?.["#text"];
}

function getSubfields(
    record: ParsedMarcRecord,
    tag: string,
    code: string,
): string[] {
    const fields = record?.datafield;
    if (!fields) return [];

    const arr = Array.isArray(fields) ? fields : [fields];

    return arr
        .filter((f) => f["@_tag"] === tag)
        .flatMap((f) => {
            const sub = f.subfield;
            if (!sub) return [];
            return Array.isArray(sub) ? sub : [sub];
        })
        .filter((sf) => sf["@_code"] === code)
        .map((sf) => sf["#text"])
        .filter(Boolean);
}

function parseMarc(recordNode: {
    metadata?: { record?: ParsedMarcRecord };
}): MarcRecord | null {
    const marc = recordNode?.metadata?.record;
    if (!marc) return null;

    return {
        Title: getSubfield(marc, "245", "a") ?? "",
        Author: getSubfield(marc, "100", "a") ?? "",
        Publisher: getSubfield(marc, "260", "b") ?? "",
        Year: getSubfield(marc, "260", "c") ?? "",
        ISBN: getSubfield(marc, "020", "a") ?? "",
        Subjects: getSubfields(marc, "650", "a").join("; "),
        Description: getSubfield(marc, "520", "a") ?? "",
    };
}

async function harvest(from: string, until: string) {
    let url =
        `${BASE_URL}?verb=ListRecords` +
        `&metadataPrefix=oai_marcxml_cpk` +
        `&set=CPK` +
        `&from=${from}` +
        `&until=${until}`;

    const out = fs.createWriteStream("books.csv", { encoding: "utf8" });
    out.write("Title,Author,Publisher,Year,ISBN,Subjects,Description\n");

    let batch = 0;

    while (url) {
        const { data } = await axios.get(url);
        const json = parser.parse(data);

        const listRecords = json["OAI-PMH"]?.ListRecords;
        if (!listRecords) break;

        const records = listRecords.record
            ? Array.isArray(listRecords.record)
                ? listRecords.record
                : [listRecords.record]
            : [];

        for (const r of records) {
            const book = parseMarc(r);
            if (!book) continue;

            out.write(
                [
                    escapeCsv(book.Title),
                    escapeCsv(book.Author),
                    escapeCsv(book.Publisher),
                    escapeCsv(book.Year),
                    escapeCsv(book.ISBN),
                    escapeCsv(book.Subjects),
                    escapeCsv(book.Description),
                ].join(",") + "\n",
            );
        }

        const token = listRecords.resumptionToken?.["#text"];
        url = token
            ? `${BASE_URL}?verb=ListRecords&resumptionToken=${token}`
            : "";

        batch++;
    }

    out.close();
}

import { startWeeklyBookScheduler } from "./graphql/services/weeklyBookScheduler";

// Start the weekly book update scheduler
if (process.env.ENABLE_WEEKLY_UPDATES !== "false") {
    startWeeklyBookScheduler();
}