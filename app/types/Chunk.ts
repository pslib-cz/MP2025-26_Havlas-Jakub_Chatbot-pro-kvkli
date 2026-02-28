export type Chunk = {
  url: string;
  section_heading: string;
  chunk_index: number;
  text: string;
  hash: string;
  last_crawled: string;
};

export type ChunkDiff = {
  chunksToAdd: Chunk[];
  chunksToRemove: Chunk[];
  chunksUnchanged: Chunk[];
};
