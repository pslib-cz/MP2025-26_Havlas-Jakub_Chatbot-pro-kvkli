import { ChromaClient } from "chromadb";

const chromaUrl = process.env.CHROMA_URL || "http://localhost:8000";

export const chroma = new ChromaClient({
  path: chromaUrl,
});
