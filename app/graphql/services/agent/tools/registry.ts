// ─── Tool Registry Factory ────────────────────────────────────────────────────

import { ToolRegistry } from "../ToolRegistry";

import {
    SearchCatalogSchema,
    RecommendBooksSchema,
    FindBookByPlotSchema,
    GetOpeningHoursSchema,
    GetOfficeInfoSchema,
    GetContactSchema,
    GetEventsSchema,
    SearchWebsiteSchema,
} from "./schemas";

import {
    searchCatalogSpec,
    recommendBooksSpec,
    findBookByPlotSpec,
    getOpeningHoursSpec,
    getOfficeInfoSpec,
    getContactSpec,
    getEventsSpec,
    searchWebsiteSpec,
} from "./specs";

import {
    handleSearchCatalog,
    handleRecommendBooks,
    handleFindBookByPlot,
} from "./bookHandlers";

import {
    handleGetOpeningHours,
    handleGetOfficeInfo,
    handleGetContact,
    handleGetEvents,
    handleSearchWebsite,
} from "./infoHandlers";

/**
 * Create and return a ToolRegistry pre-loaded with all library chatbot tools.
 * Registration order matters — models prefer earlier tools.
 */
export function createToolRegistry(): ToolRegistry {
    const registry = new ToolRegistry();

    // ── Book tools ────────────────────────────────────────────────────
    registry.register(
        "searchCatalog",
        searchCatalogSpec,
        SearchCatalogSchema,
        handleSearchCatalog,
    );
    registry.register(
        "recommendBooks",
        recommendBooksSpec,
        RecommendBooksSchema,
        handleRecommendBooks,
    );
    registry.register(
        "findBookByPlot",
        findBookByPlotSpec,
        FindBookByPlotSchema,
        handleFindBookByPlot,
    );

    // ── Live-data tools (preferred for structured queries) ────────────
    registry.register(
        "getOpeningHours",
        getOpeningHoursSpec,
        GetOpeningHoursSchema,
        handleGetOpeningHours,
    );
    registry.register(
        "getOfficeInfo",
        getOfficeInfoSpec,
        GetOfficeInfoSchema,
        handleGetOfficeInfo,
    );
    registry.register(
        "getContact",
        getContactSpec,
        GetContactSchema,
        handleGetContact,
    );
    registry.register(
        "getEvents",
        getEventsSpec,
        GetEventsSchema,
        handleGetEvents,
    );

    // ── Fallback: semantic search (use ONLY when no dedicated tool fits) ──
    registry.register(
        "searchWebsite",
        searchWebsiteSpec,
        SearchWebsiteSchema,
        handleSearchWebsite,
    );

    return registry;
}
