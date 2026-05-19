import type { Prompt } from "./Prompt";

export type PaginatedPromptsData = {
  paginatedPrompts: {
    prompts: Prompt[];
    totalCount: number;
  };
};
