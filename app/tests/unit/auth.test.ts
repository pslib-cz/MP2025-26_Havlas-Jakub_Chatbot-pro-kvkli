import { describe, it, expect, beforeAll } from "@jest/globals";

// Set env vars before importing the service
beforeAll(() => {
    process.env.ADMIN_USERNAME = "kvkli";
    process.env.ADMIN_PASSWORD = "kvkli";
    process.env.JWT_SECRET = "test-secret";
});

describe("authService", () => {
    let authService: typeof import("../../graphql/services/auth.service").authService;

    beforeAll(async () => {
        const mod = await import("../../graphql/services/auth.service");
        authService = mod.authService;
    });

    describe("login", () => {
        it("should return a token for valid credentials", () => {
            const token = authService.login("kvkli", "kvkli");
            expect(token).toBeTruthy();
            expect(typeof token).toBe("string");
        });

        it("should return null for invalid username", () => {
            const token = authService.login("wrong", "kvkli");
            expect(token).toBeNull();
        });

        it("should return null for invalid password", () => {
            const token = authService.login("kvkli", "wrong");
            expect(token).toBeNull();
        });

        it("should return null for empty credentials", () => {
            const token = authService.login("", "");
            expect(token).toBeNull();
        });
    });

    describe("verifyToken", () => {
        it("should verify a valid token", () => {
            const token = authService.login("kvkli", "kvkli")!;
            const decoded = authService.verifyToken(token);
            expect(decoded).not.toBeNull();
            expect(decoded?.username).toBe("kvkli");
            expect(decoded?.role).toBe("admin");
        });

        it("should return null for an invalid token", () => {
            const decoded = authService.verifyToken("invalid.token.here");
            expect(decoded).toBeNull();
        });

        it("should return null for an empty string", () => {
            const decoded = authService.verifyToken("");
            expect(decoded).toBeNull();
        });

        it("should return null for a tampered token", () => {
            const token = authService.login("kvkli", "kvkli")!;
            const tampered = token.slice(0, -5) + "XXXXX";
            const decoded = authService.verifyToken(tampered);
            expect(decoded).toBeNull();
        });
    });
});
