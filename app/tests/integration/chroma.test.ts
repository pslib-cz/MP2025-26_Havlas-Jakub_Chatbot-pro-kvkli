import { chroma } from "../../lib/chroma";
import { describe, it, expect } from "@jest/globals";

describe("ChromaDB Integration", () => {
    it("should connect to ChromaDB", async () => {
        const version = await chroma.version();
        expect(version).toBeDefined();
        console.log("✓ ChromaDB version:", version);
    });

    it("should respond to heartbeat", async () => {
        const heartbeat = await chroma.heartbeat();
        expect(heartbeat).toBeDefined();
        console.log("✓ Heartbeat:", heartbeat);
    });

    it("should list collections", async () => {
        const collections = await chroma.listCollections();
        expect(Array.isArray(collections)).toBe(true);
        console.log("✓ Collections count:", collections.length);
    });

    it("should get or create kvkli_content collection", async () => {
        const collection = await chroma.getOrCreateCollection({
            name: "kvkli_content",
            metadata: { description: "KVKLI website content chunks" },
        });
        expect(collection).toBeDefined();
        expect(collection.name).toBe("kvkli_content");
        console.log("✓ Collection created/retrieved:", collection.name);
    });
});
