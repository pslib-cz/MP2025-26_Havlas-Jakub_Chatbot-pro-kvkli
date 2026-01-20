import { ChromaClient } from "chromadb";

// WSL2 uses a different IP than localhost
// You can find it with: wsl hostname -I
const CHROMA_HOST = process.env.CHROMA_HOST || "localhost";
const CHROMA_PORT = process.env.CHROMA_PORT || "8000";

export const chroma = new ChromaClient({
  path: `http://${CHROMA_HOST}:${CHROMA_PORT}`,
});
