import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import * as path from "path";
import OpenAI from "openai";
import { ChromaClient } from "chromadb";
import { LoggerService } from "./logger.service";

// ========================
// Types
// ========================

type BookRecord = {
    Identifier: string;
    Title: string;
    Author: string;
    Contributors: string;
    Publisher: string;
    PublicationYear: string;
    ISBN: string;
    ISSN: string;
    Subjects: string;
    Description: string;
    Language: string;
    PhysicalDescription: string;
    Series: string;
    Notes: string;
    RecordType: string;
    ContentType: string;
    MediaType: string;
    CarrierType: string;
};

type MarcDatafield = {
    "@_tag": string;
    "@_ind1"?: string;
    "@_ind2"?: string;
    subfield?: MarcSubfield | MarcSubfield[];
};

type MarcControlfield = {
    "@_tag": string;
    "#text": string;
};

type MarcSubfield = {
    "@_code": string;
    "#text": string;
};

type MarcRecord = {
    leader?: string;
    controlfield?: MarcControlfield | MarcControlfield[];
    datafield?: MarcDatafield | MarcDatafield[];
};

type OAIRecord = {
    header?: {
        identifier?: string;
    };
    metadata?: {
        record?: MarcRecord;
    };
};

// ========================
// Configuration
// ========================

const BASE_URL = "https://ipac.kvkli.cz/arl-li/cs/oai/";
const HARVEST_DIR = path.join(process.cwd(), "harvest_data");
const RAW_CSV = path.join(HARVEST_DIR, "raw_records.csv");
const CLEAN_CSV = path.join(HARVEST_DIR, "clean_records.csv");

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
});

// ========================
// Utilities
// ========================

function escapeCsv(value?: string): string {
    if (!value) return '""';
    const cleaned = value.replace(/"/g, '""');
    return `"${cleaned}"`;
}

function extractCpkId(identifier: string): string {
    try {
        if (identifier && identifier.includes("CPK:")) {
            return identifier.split("CPK:")[1].trim();
        }
        return identifier;
    } catch {
        return identifier;
    }
}

// ========================
// MARC Parsing
// ========================

function getControlField(marc: MarcRecord, tag: string): string | undefined {
    const fields = marc?.controlfield;
    if (!fields) return;

    const arr = Array.isArray(fields) ? fields : [fields];
    return arr.find((f) => f["@_tag"] === tag)?.["#text"];
}

function getSubfield(
    marc: MarcRecord,
    tag: string,
    code: string,
): string | undefined {
    const fields = marc?.datafield;
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

function getSubfields(marc: MarcRecord, tag: string, code: string): string[] {
    const fields = marc?.datafield;
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

function parseMarcXml(oaiRecord: OAIRecord): BookRecord | null {
    const marc = oaiRecord?.metadata?.record;
    if (!marc) return null;

    const book: BookRecord = {
        Identifier: oaiRecord?.header?.identifier || "",
        Title: "",
        Author: "",
        Contributors: "",
        Publisher: "",
        PublicationYear: "",
        ISBN: "",
        ISSN: "",
        Subjects: "",
        Description: "",
        Language: "",
        PhysicalDescription: "",
        Series: "",
        Notes: "",
        RecordType: marc.leader || "",
        ContentType: "",
        MediaType: "",
        CarrierType: "",
    };

    // Language from 008 field
    const field008 = getControlField(marc, "008");
    if (field008 && field008.length > 38) {
        book.Language = field008.substring(35, 38).trim();
    }

    // Title (245)
    const titleA = getSubfield(marc, "245", "a") || "";
    const titleB = getSubfield(marc, "245", "b");
    const titleN = getSubfield(marc, "245", "n");
    book.Title = titleA;
    if (titleB) book.Title += ` : ${titleB}`;
    if (titleN) book.Title += ` ${titleN}`;

    // Author (100, 110, 111)
    book.Author =
        getSubfield(marc, "100", "a") ||
        getSubfield(marc, "110", "a") ||
        getSubfield(marc, "111", "a") ||
        "";

    // Contributors (700, 710, 711)
    const contributors = [
        ...getSubfields(marc, "700", "a"),
        ...getSubfields(marc, "710", "a"),
        ...getSubfields(marc, "711", "a"),
    ];
    book.Contributors = contributors.join("; ");

    // Publisher (260, 264)
    const pub260A = getSubfield(marc, "260", "a");
    const pub260B = getSubfield(marc, "260", "b");
    const pub260C = getSubfield(marc, "260", "c");
    book.Publisher = [pub260A, pub260B].filter(Boolean).join(" ");
    book.PublicationYear = pub260C || "";

    if (!book.Publisher) {
        const pub264A = getSubfield(marc, "264", "a");
        const pub264B = getSubfield(marc, "264", "b");
        const pub264C = getSubfield(marc, "264", "c");
        book.Publisher = [pub264A, pub264B].filter(Boolean).join(" ");
        if (!book.PublicationYear) book.PublicationYear = pub264C || "";
    }

    // ISBN & ISSN
    book.ISBN = getSubfield(marc, "020", "a") || "";
    book.ISSN = getSubfield(marc, "022", "a") || "";

    // Subjects (600-699)
    const subjects: string[] = [];
    for (let tag = 600; tag < 700; tag++) {
        subjects.push(...getSubfields(marc, tag.toString(), "a"));
        subjects.push(...getSubfields(marc, tag.toString(), "x"));
    }
    book.Subjects = [...new Set(subjects)].join("; ");

    // Description (520)
    book.Description = getSubfield(marc, "520", "a") || "";

    // Physical description (300)
    const physDesc = [
        ...getSubfields(marc, "300", "a"),
        ...getSubfields(marc, "300", "b"),
        ...getSubfields(marc, "300", "c"),
    ];
    book.PhysicalDescription = physDesc.join(" ");

    // Series (490, 830)
    const series = [
        ...getSubfields(marc, "490", "a"),
        ...getSubfields(marc, "830", "a"),
    ];
    book.Series = series.join("; ");

    // Notes (500-599)
    const notes: string[] = [];
    for (let tag = 500; tag < 600; tag++) {
        notes.push(...getSubfields(marc, tag.toString(), "a"));
    }
    book.Notes = notes.join("; ");

    // RDA fields
    book.ContentType = getSubfield(marc, "336", "a") || "";
    book.MediaType = getSubfield(marc, "337", "a") || "";
    book.CarrierType = getSubfield(marc, "338", "a") || "";

    return book;
}

// ========================
// Harvesting
// ========================

async function harvestRecords(from?: string, until?: string): Promise<void> {
    LoggerService.info("Starting harvest", { from, until });

    // Ensure directory exists
    if (!fs.existsSync(HARVEST_DIR)) {
        fs.mkdirSync(HARVEST_DIR, { recursive: true });
        LoggerService.info("Created harvest directory", { path: HARVEST_DIR });
    }

    let url =
        `${BASE_URL}?verb=ListRecords` +
        `&metadataPrefix=oai_marcxml_cpk` +
        `&set=CPK`;

    if (from) url += `&from=${from}`;
    if (until) url += `&until=${until}`;

    const out = fs.createWriteStream(RAW_CSV, { encoding: "utf8" });
    out.write(
        "Identifier,Title,Author,Contributors,Publisher,PublicationYear,ISBN,ISSN,Subjects,Description,Language,PhysicalDescription,Series,Notes,RecordType,ContentType,MediaType,CarrierType\n",
    );

    let batch = 0;
    let totalRecords = 0;

    while (url) {
        try {
            const { data } = await axios.get(url, { timeout: 30000 });
            const json = parser.parse(data);

            const listRecords = json["OAI-PMH"]?.ListRecords;
            if (!listRecords) break;

            const records = listRecords.record
                ? Array.isArray(listRecords.record)
                    ? listRecords.record
                    : [listRecords.record]
                : [];

            for (const r of records) {
                const book = parseMarcXml(r);
                if (!book) continue;

                out.write(
                    [
                        escapeCsv(book.Identifier),
                        escapeCsv(book.Title),
                        escapeCsv(book.Author),
                        escapeCsv(book.Contributors),
                        escapeCsv(book.Publisher),
                        escapeCsv(book.PublicationYear),
                        escapeCsv(book.ISBN),
                        escapeCsv(book.ISSN),
                        escapeCsv(book.Subjects),
                        escapeCsv(book.Description),
                        escapeCsv(book.Language),
                        escapeCsv(book.PhysicalDescription),
                        escapeCsv(book.Series),
                        escapeCsv(book.Notes),
                        escapeCsv(book.RecordType),
                        escapeCsv(book.ContentType),
                        escapeCsv(book.MediaType),
                        escapeCsv(book.CarrierType),
                    ].join(",") + "\n",
                );
                totalRecords++;
            }

            const token = listRecords.resumptionToken?.["#text"];
            url = token
                ? `${BASE_URL}?verb=ListRecords&resumptionToken=${token}`
                : "";

            batch++;
            if (batch % 10 === 0) {
                LoggerService.info("Harvest progress", { batch, totalRecords });
            }
        } catch (error) {
            LoggerService.logError(error as Error, `harvestRecords batch ${batch}`, { batch, totalRecords });
            break;
        }
    }

    out.close();
    LoggerService.info("Harvest complete", { totalRecords, outputFile: RAW_CSV });
}

// ========================
// CSV Normalization
// ========================

function normalizeRecord(record: BookRecord): BookRecord | null {
    // Check required fields
    const hasTitle = record.Title && record.Title.trim().toLowerCase() !== "nan";
    const hasDescription = record.Description && record.Description.trim().toLowerCase() !== "nan";
    const hasRecordType = record.RecordType && record.RecordType.trim().toLowerCase() !== "nan";
    const hasAuthorOrContrib =
        (record.Author && record.Author.trim().toLowerCase() !== "nan") ||
        (record.Contributors && record.Contributors.trim().toLowerCase() !== "nan");

    if (!hasTitle || !hasDescription || !hasRecordType || !hasAuthorOrContrib) {
        return null;
    }

    // Clean fields
    const clean = (val: string) => {
        if (!val) return "";
        const cleaned = val.trim().replace(/^["']+|["']+$/g, "");
        return cleaned.toLowerCase() === "nan" ? "" : cleaned;
    };

    return {
        ...record,
        Title: clean(record.Title),
        Author: clean(record.Author),
        Contributors: clean(record.Contributors),
        Publisher: clean(record.Publisher),
        PublicationYear: clean(record.PublicationYear),
        ISBN: clean(record.ISBN),
        ISSN: clean(record.ISSN),
        Subjects: clean(record.Subjects),
        Description: clean(record.Description),
        Language: clean(record.Language),
        PhysicalDescription: clean(record.PhysicalDescription),
        Series: clean(record.Series),
        Notes: clean(record.Notes),
        RecordType: clean(record.RecordType),
        ContentType: clean(record.ContentType),
        MediaType: clean(record.MediaType),
        CarrierType: clean(record.CarrierType),
    };
}

async function normalizeCsv(): Promise<void> {
    LoggerService.info("Starting CSV normalization", { inputFile: RAW_CSV, outputFile: CLEAN_CSV });

    const lines = fs.readFileSync(RAW_CSV, "utf-8").split("\n");
    const header = lines[0];
    const out = fs.createWriteStream(CLEAN_CSV, { encoding: "utf8" });
    out.write(header + "\n");

    let kept = 0;
    let filtered = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parse CSV line (simple approach)
        const parts = line.match(/("(?:[^"]|"")*"|[^,]*)/g) || [];
        const values = parts.map((p) => p.replace(/^"|"$/g, "").replace(/""/g, '"'));

        if (values.length < 18) continue;

        const record: BookRecord = {
            Identifier: values[0],
            Title: values[1],
            Author: values[2],
            Contributors: values[3],
            Publisher: values[4],
            PublicationYear: values[5],
            ISBN: values[6],
            ISSN: values[7],
            Subjects: values[8],
            Description: values[9],
            Language: values[10],
            PhysicalDescription: values[11],
            Series: values[12],
            Notes: values[13],
            RecordType: values[14],
            ContentType: values[15],
            MediaType: values[16],
            CarrierType: values[17],
        };

        const normalized = normalizeRecord(record);
        if (!normalized) {
            filtered++;
            continue;
        }

        out.write(
            [
                escapeCsv(normalized.Identifier),
                escapeCsv(normalized.Title),
                escapeCsv(normalized.Author),
                escapeCsv(normalized.Contributors),
                escapeCsv(normalized.Publisher),
                escapeCsv(normalized.PublicationYear),
                escapeCsv(normalized.ISBN),
                escapeCsv(normalized.ISSN),
                escapeCsv(normalized.Subjects),
                escapeCsv(normalized.Description),
                escapeCsv(normalized.Language),
                escapeCsv(normalized.PhysicalDescription),
                escapeCsv(normalized.Series),
                escapeCsv(normalized.Notes),
                escapeCsv(normalized.RecordType),
                escapeCsv(normalized.ContentType),
                escapeCsv(normalized.MediaType),
                escapeCsv(normalized.CarrierType),
            ].join(",") + "\n",
        );
        kept++;
    }

    out.close();
    LoggerService.info("Normalization complete", { kept, filtered, totalProcessed: kept + filtered });
}

// ========================
// Vector Database Ingestion
// ========================

function makeEmbeddingText(record: BookRecord): string {
    const parts: string[] = [];

    if (record.Title) parts.push(`Title: ${record.Title}`);
    if (record.Description) parts.push(`Description: ${record.Description}`);
    if (record.RecordType) parts.push(`Type: ${record.RecordType}`);
    if (record.Author) parts.push(`Author: ${record.Author}`);
    else if (record.Contributors) parts.push(`Contributors: ${record.Contributors}`);
    if (record.Subjects) parts.push(`Subjects: ${record.Subjects}`);
    if (record.Notes) parts.push(`Notes: ${record.Notes}`);

    return parts.join("\n");
}

async function ingestToVectorDb(): Promise<void> {
    LoggerService.info("Starting vector database ingestion");

    // Initialize OpenAI
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    // Initialize ChromaDB
    const chromaHost = process.env.CHROMA_HOST || "localhost";
    const chromaPort = parseInt(process.env.CHROMA_PORT || "8000");
    const chroma = new ChromaClient({ path: `http://${chromaHost}:${chromaPort}` });

    // Delete old collection
    try {
        await chroma.deleteCollection({ name: "books" });
        LoggerService.info("Deleted old collection");
    } catch {
        LoggerService.debug("No existing collection to delete");
    }

    // Create new collection
    const collection = await chroma.createCollection({
        name: "books",
        metadata: { "hnsw:space": "cosine" },
    });
    LoggerService.info("Created new collection", { name: "books" });

    // Read normalized CSV
    const lines = fs.readFileSync(CLEAN_CSV, "utf-8").split("\n");
    const records: BookRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.match(/("(?:[^"]|"")*"|[^,]*)/g) || [];
        const values = parts.map((p) => p.replace(/^"|"$/g, "").replace(/""/g, '"'));

        if (values.length < 18) continue;

        records.push({
            Identifier: values[0],
            Title: values[1],
            Author: values[2],
            Contributors: values[3],
            Publisher: values[4],
            PublicationYear: values[5],
            ISBN: values[6],
            ISSN: values[7],
            Subjects: values[8],
            Description: values[9],
            Language: values[10],
            PhysicalDescription: values[11],
            Series: values[12],
            Notes: values[13],
            RecordType: values[14],
            ContentType: values[15],
            MediaType: values[16],
            CarrierType: values[17],
        });
    }

    LoggerService.info("Processing records for ingestion", { totalRecords: records.length });

    // Process in batches
    const batchSize = 100;
    let totalSaved = 0;

    for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        const texts = batch.map(makeEmbeddingText);
        const ids = batch.map((r) => extractCpkId(r.Identifier));

        const batchNum = Math.floor(i / batchSize) + 1;
        LoggerService.debug("Embedding batch", { batchNum, batchSize: batch.length });

        try {
            // Get embeddings
            const embeddingResponse = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: texts,
            });

            const embeddings = embeddingResponse.data.map((e) => e.embedding);

            // Add to ChromaDB
            await collection.add({
                ids,
                documents: texts,
                embeddings,
            });

            totalSaved += batch.length;
            LoggerService.info("Batch saved", { batchNum, batchSize: batch.length, totalSaved, totalRecords: records.length });
        } catch (error) {
            LoggerService.logError(error as Error, `ingestToVectorDb batch ${batchNum}`, { batchNum, batchSize: batch.length });
        }

        // Rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const count = await collection.count();
    LoggerService.info("Ingestion complete", { totalInDatabase: count, totalSaved });
}

// ========================
// Main Pipeline
// ========================

export async function runWeeklyBookUpdate(): Promise<void> {
    LoggerService.info("Starting weekly book update pipeline");

    const startTime = Date.now();

    try {
        // Calculate date range (last 7 days)
        const until = new Date().toISOString().split("T")[0];
        const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0];

        LoggerService.info("Date range calculated", { from, until });

        // Step 1: Harvest
        await harvestRecords(from, until);

        // Step 2: Normalize
        await normalizeCsv();

        // Step 3: Ingest to vector DB
        await ingestToVectorDb();

        const elapsed = (Date.now() - startTime) / 1000;
        LoggerService.info("Pipeline complete", { elapsedSeconds: elapsed });
    } catch (error) {
        LoggerService.logError(error as Error, "runWeeklyBookUpdate");
        throw error;
    }
}

// For testing
if (require.main === module) {
    runWeeklyBookUpdate().catch((error) => {
        LoggerService.logError(error, "main");
        process.exit(1);
    });
}
