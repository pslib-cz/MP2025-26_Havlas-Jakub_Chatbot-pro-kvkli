import { describe, it, expect } from "@jest/globals";
import { normalizeCount } from "../../graphql/services/agent/preprocessing";
import { MAX_COUNT, DEFAULT_COUNT } from "../../graphql/services/agent/constants";

describe("normalizeCount", () => {
    it("returns defaultCount when count is undefined", () => {
        expect(normalizeCount(undefined, DEFAULT_COUNT)).toBe(DEFAULT_COUNT);
    });

    it("returns defaultCount when count is null", () => {
        expect(normalizeCount(null as unknown as undefined, DEFAULT_COUNT)).toBe(DEFAULT_COUNT);
    });

    it("returns the exact count when within range", () => {
        expect(normalizeCount(10, DEFAULT_COUNT)).toBe(10);
    });

    it("clamps count to MAX_COUNT when above", () => {
        expect(normalizeCount(50, DEFAULT_COUNT)).toBe(MAX_COUNT);
    });

    it("clamps count=MAX_COUNT to MAX_COUNT (not treated as fetch-all)", () => {
        expect(normalizeCount(MAX_COUNT, DEFAULT_COUNT)).toBe(MAX_COUNT);
    });

    it("clamps count below 1 to 1", () => {
        expect(normalizeCount(0, DEFAULT_COUNT)).toBe(1);
        expect(normalizeCount(-5, DEFAULT_COUNT)).toBe(1);
    });
});
