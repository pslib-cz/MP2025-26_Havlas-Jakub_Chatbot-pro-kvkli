// ─── Zod Validation Schemas for Tool Arguments ───────────────────────────────

import { z } from "zod";

export const SearchCatalogSchema = z.object({
    searchType: z.enum(["title", "author", "general"]),
    query: z.string().min(1),
    count: z.number().optional(),
    fetchAll: z.boolean().optional(),
});

export const RecommendBooksSchema = z.object({
    query: z.string().min(1),
    count: z.number().optional(),
});

export const FindBookByPlotSchema = z.object({
    plotDescription: z.string().min(1),
    count: z.number().optional(),
});

export const SearchWebsiteSchema = z.object({
    query: z.string().min(1),
    maxResults: z.number().optional(),
});

export const GetContactSchema = z
    .object({
        name: z.string().optional(),
        role: z.string().optional(),
        department: z.string().optional(),
    })
    .refine(
        (d: { name?: string; role?: string; department?: string }) =>
            d.name || d.role || d.department,
        {
            message: "At least one search parameter is required",
        },
    );

export const GetOpeningHoursSchema = z.object({
    branch: z.string().optional(),
});

export const GetEventsSchema = z.object({
    type: z.string().optional(),
    date: z.string().optional(),
    category: z.string().optional(),
    place: z.string().optional(),
    fulltext: z.string().optional(),
    maxResults: z.number().optional(),
});

export const GetOfficeInfoSchema = z.object({
    branch: z.string().optional(),
});
