import type { ContentSection } from "./ContentSection";

export type CrawledPage = {
  url: string;
  path: string;
  title: string;
  language?: string;
  sections: ContentSection[];
};
