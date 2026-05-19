import { describe, it, expect, beforeAll } from "@jest/globals";

beforeAll(() => {
    process.env.ALLOWED_ORIGINS = "http://localhost:3000,https://mysite.com";
});

describe("validateOrigin", () => {
    let validateOrigin: typeof import("../../graphql/middleware/originGuard").validateOrigin;

    beforeAll(async () => {
        const mod = await import("../../graphql/middleware/originGuard");
        validateOrigin = mod.validateOrigin;
    });

    it("should allow requests from allowed origin", () => {
        expect(() =>
            validateOrigin("http://localhost:3000", null, "GetPaginatedPrompts"),
        ).not.toThrow();
    });

    it("should allow requests from allowed referer", () => {
        expect(() =>
            validateOrigin(null, "https://mysite.com/backoffice", "GetPaginatedPrompts"),
        ).not.toThrow();
    });

    it("should reject requests with no origin or referer", () => {
        expect(() =>
            validateOrigin(null, null, "GetPaginatedPrompts"),
        ).toThrow("Forbidden: missing origin");
    });

    it("should reject requests from disallowed origin", () => {
        expect(() =>
            validateOrigin("https://evil.com", null, "GetPaginatedPrompts"),
        ).toThrow("Forbidden: invalid origin");
    });

    it("should skip validation for login operation", () => {
        expect(() =>
            validateOrigin(null, null, "login"),
        ).not.toThrow();
    });

    it("should skip validation for heartbeat operation", () => {
        expect(() =>
            validateOrigin(null, null, "heartbeat"),
        ).not.toThrow();
    });

    it("should skip validation for IntrospectionQuery", () => {
        expect(() =>
            validateOrigin(null, null, "IntrospectionQuery"),
        ).not.toThrow();
    });
});

describe("extractTokenFromHeaders", () => {
    let extractTokenFromHeaders: typeof import("../../graphql/middleware/originGuard").extractTokenFromHeaders;

    beforeAll(async () => {
        const mod = await import("../../graphql/middleware/originGuard");
        extractTokenFromHeaders = mod.extractTokenFromHeaders;
    });

    it("should extract token from Bearer header", () => {
        const token = extractTokenFromHeaders("Bearer my-token-123");
        expect(token).toBe("my-token-123");
    });

    it("should return undefined for null header", () => {
        expect(extractTokenFromHeaders(null)).toBeUndefined();
    });

    it("should return undefined for malformed header", () => {
        expect(extractTokenFromHeaders("NotBearer token")).toBeUndefined();
    });

    it("should return undefined for empty string", () => {
        expect(extractTokenFromHeaders("")).toBeUndefined();
    });
});
