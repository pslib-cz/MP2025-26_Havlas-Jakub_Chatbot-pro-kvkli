export type SearchCatalogArgs = {
    searchType: "title" | "author" | "general";
    query: string;
    count?: number;
};
