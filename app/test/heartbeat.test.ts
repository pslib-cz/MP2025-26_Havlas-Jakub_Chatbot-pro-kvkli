import { describe, it, expect } from "vitest";
import { authResolvers } from "../graphql/resolvers/auth.resolver";

describe("heartbeat resolver", () => {
    it("should return true", () => {
        const result = authResolvers.Query.heartbeat();
        expect(result).toBe(true);
    });
});

describe("verifyToken resolver", () => {
    it("should return false when no token provided", async () => {
        const result = await authResolvers.Query.verifyToken(
            undefined as unknown,
            undefined as unknown,
            {},
        );
        expect(result).toBe(false);
    });

    it("should return false for invalid token", async () => {
        const result = await authResolvers.Query.verifyToken(
            undefined as unknown,
            undefined as unknown,
            { token: "invalid" },
        );
        expect(result).toBe(false);
    });
});
