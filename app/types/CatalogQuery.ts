export type CatalogQueryType = "G" | "AU" | "TITLE" | "SUBJECT" | "DATE1" | "PUBL";

export type QueryData = {
  typeSearch: CatalogQueryType;
  queryContent: string;
};

export type BookResult = {
  id: string;
  title: string;
  author: string;
  subjects?: string;
  description?: string;
  url?: string;
  year?: string;
};
