import type { HoldingItem } from "./CatalogQuery";

export type BookItem = {
    id: string;
    title: string;
    author: string;
    subjects?: string;
    description?: string;
    recordType?: string;
    notes?: string;
    url?: string;
    year?: string;
    availability?: HoldingItem[];
    availableCopies?: number;
    totalCopies?: number;
};
