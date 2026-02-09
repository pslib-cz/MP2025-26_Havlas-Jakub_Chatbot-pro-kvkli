import { chroma } from "../../lib/chroma";
import { openai } from "../../lib/openAI";
import LoggerService from "./logger.service";

//Četl jsem knihu o mašinkách, mohl bys mi doporučit nějaké další knížký o vlacích?

function rewriteQueryForSearch(query: string): string {
    return `Hledám knihy související s následujícím dotazem: ${query}.
Prosím vyhledej relevantní názvy, autory, témata nebo anotace.`;
}

function parseEmbeddingDocument(doc: string | null) {
    const text = doc ?? "";
    const lines = text.split("\n").map((l) => l.trim());

    let title = "";
    let author = "";
    let subjects = "";
    let description = "";
    let recordType = "";
    let contributors = "";
    let notes = "";

    for (const line of lines) {
        if (line.startsWith("Title:")) {
            title = line.replace("Title:", "").trim();
        } else if (line.startsWith("Author:")) {
            author = line.replace("Author:", "").trim();
        } else if (line.startsWith("Contributors:")) {
            contributors = line.replace("Contributors:", "").trim();
        } else if (line.startsWith("Subjects:")) {
            subjects = line.replace("Subjects:", "").trim();
        } else if (line.startsWith("Description:")) {
            description = line.replace("Description:", "").trim();
        } else if (line.startsWith("Type:")) {
            recordType = line.replace("Type:", "").trim();
        } else if (line.startsWith("Notes:")) {
            notes = line.replace("Notes:", "").trim();
        }
    }

    // Use Contributors as fallback if Author is missing
    const finalAuthor = author || contributors || "Neznámý autor";

    // Fix weird data issues ("nan", "none")
    const isInvalid = (val: string) => !val || val.toLowerCase() === "nan" || val.toLowerCase() === "none";

    return {
        title: isInvalid(title) ? "Neznámý název" : title,
        author: finalAuthor,
        subjects: isInvalid(subjects) ? "" : subjects,
        description: isInvalid(description) ? "" : description,
        recordType: isInvalid(recordType) ? "" : recordType,
        notes: isInvalid(notes) ? "" : notes,
    };
}

// --------------------
// MAIN SERVICE
// --------------------

export const vectorService = {
    /**
     * Searches the "books" vector collection using OpenAI embeddings + Chroma.
     */
    async searchBooks(query: string) {
        try {
            // Add timeout to fail fast
            const collection = await Promise.race([
                chroma.getCollection({ name: "books" }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error("ChromaDB timeout")), 5000)
                )
            ]) as Awaited<ReturnType<typeof chroma.getCollection>>;
            if (!collection) {
                console.warn("⚠️ Collection 'books' does not exist.");
                return [];
            }

            // Rewrite query → better semantic search
            const rewritten = rewriteQueryForSearch(query);

            // Generate embedding
            const embeddingRes = await openai.embeddings.create({
                model: "text-embedding-3-small",
                input: rewritten,

            });

            const queryEmbedding = embeddingRes.data[0].embedding;

            // Perform vector search
            const result = await collection.query({
                queryEmbeddings: [queryEmbedding],
                nResults: 5,
            });

            const docs = result.documents?.[0] || [];
            const ids = result.ids?.[0] || [];

            // Convert each stored document into structured book metadata
            const books = docs.map((doc: string | null, idx: number) => {
                const parsed = parseEmbeddingDocument(doc);
                return {
                    id: ids[idx],
                    title: parsed.title,
                    author: parsed.author,
                    subjects: parsed.subjects,
                    description: parsed.description,
                    recordType: parsed.recordType,
                    notes: parsed.notes,
                };
            });

            LoggerService.info("Book search executed", { query, resultsCount: books.length });

            return books;
        } catch (err) {
            LoggerService.logError(err as Error, "searchBooks", { query });
            LoggerService.warn("ChromaDB unavailable, returning empty results");
            return [];
        }
    },
};
