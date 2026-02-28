export type CrawlProgress = {
  status: "idle" | "running" | "completed" | "error";
  phase: "idle" | "crawling" | "chunking" | "diffing" | "updating" | "completed" | "error";
  pagesVisited: number;
  pagesInQueue: number;
  totalPages: number;
  chunksCreated: number;
  chunksToAdd: number;
  chunksToRemove: number;
  currentUrl: string | null;
  startTime: number | null;
  endTime: number | null;
  error: string | null;
  embeddingsGenerated: number;
  embeddingsTotal: number;
  chunksAddedToDB: number;
  chunksRemovedFromDB: number;
};
