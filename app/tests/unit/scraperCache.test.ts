import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";

// We test the TtlCache behaviour via the cached wrappers exported from scraper.service.
// To isolate from real HTTP, we mock axios.

import axios from "axios";
jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

import {
    getCachedOpeningHours,
    getCachedEvents,
    invalidateScraperCaches,
} from "../../graphql/services/scraper.service";

// Provide a minimal HTML response that scrapeOpeningHours can parse
const OPENING_HOURS_HTML = `
<div class="timetableList">
  <div class="wrap">
    <h2 id="hlavni">Hlavní budova</h2>
    <div class="tabRow"><div class="tabCol">Pondělí</div><div class="tabCol">9:00 – 18:00</div></div>
  </div>
</div>`;

const EVENTS_HTML = `
<div id="loadMoreTarget">
  <h2>15. dubna 2026</h2>
  <div class="akce_list">
    <div class="akce_item">
      <a href="/akce/test">
        <h3 class="label">Test Event</h3>
      </a>
    </div>
  </div>
</div>`;

beforeEach(() => {
    jest.useFakeTimers();
    mockedAxios.get.mockReset();
    invalidateScraperCaches();
});

afterEach(() => {
    jest.useRealTimers();
});

describe("getCachedOpeningHours", () => {
    it("calls the scraper on first request", async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: OPENING_HOURS_HTML });

        const result = await getCachedOpeningHours();
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].branch).toBe("Hlavní budova");
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("returns cached data on second request within TTL", async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: OPENING_HOURS_HTML });

        await getCachedOpeningHours();
        const result = await getCachedOpeningHours();

        expect(result[0].branch).toBe("Hlavní budova");
        // Only one real HTTP call
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("re-fetches after TTL expires", async () => {
        mockedAxios.get.mockResolvedValue({ data: OPENING_HOURS_HTML });

        await getCachedOpeningHours();
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);

        // Advance past TTL (10 minutes)
        jest.advanceTimersByTime(11 * 60 * 1000);

        await getCachedOpeningHours();
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it("deduplicates concurrent in-flight requests", async () => {
        let resolvePromise: (v: { data: string }) => void;
        mockedAxios.get.mockReturnValueOnce(
            new Promise((resolve) => { resolvePromise = resolve; }) as any,
        );

        // Fire two requests concurrently
        const p1 = getCachedOpeningHours();
        const p2 = getCachedOpeningHours();

        // Resolve the single HTTP call
        resolvePromise!({ data: OPENING_HOURS_HTML });

        const [r1, r2] = await Promise.all([p1, p2]);
        expect(r1).toBe(r2); // same reference
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
});

describe("getCachedEvents", () => {
    it("calls the scraper on first request and caches", async () => {
        mockedAxios.get.mockResolvedValue({ data: EVENTS_HTML });

        const r1 = await getCachedEvents();
        const r2 = await getCachedEvents();

        expect(r1.length).toBeGreaterThan(0);
        expect(r1[0].title).toBe("Test Event");
        expect(r1).toBe(r2);
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });
});

describe("invalidateScraperCaches", () => {
    it("forces a re-fetch after invalidation", async () => {
        mockedAxios.get.mockResolvedValue({ data: OPENING_HOURS_HTML });

        await getCachedOpeningHours();
        expect(mockedAxios.get).toHaveBeenCalledTimes(1);

        invalidateScraperCaches();

        await getCachedOpeningHours();
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });
});
