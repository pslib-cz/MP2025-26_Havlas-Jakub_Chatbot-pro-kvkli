import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { RateLimiter, extractClientIp } from "../../graphql/middleware/rateLimiter";

describe("RateLimiter", () => {
    let limiter: RateLimiter;

    beforeEach(() => {
        limiter = new RateLimiter({ maxRequests: 3, windowMs: 1000 });
    });

    afterEach(() => {
        limiter.destroy();
    });

    it("allows requests within the limit", () => {
        const r1 = limiter.check("1.2.3.4");
        expect(r1.allowed).toBe(true);
        expect(r1.remaining).toBe(2);

        const r2 = limiter.check("1.2.3.4");
        expect(r2.allowed).toBe(true);
        expect(r2.remaining).toBe(1);

        const r3 = limiter.check("1.2.3.4");
        expect(r3.allowed).toBe(true);
        expect(r3.remaining).toBe(0);
    });

    it("blocks requests exceeding the limit", () => {
        limiter.check("1.2.3.4");
        limiter.check("1.2.3.4");
        limiter.check("1.2.3.4");

        const r4 = limiter.check("1.2.3.4");
        expect(r4.allowed).toBe(false);
        expect(r4.remaining).toBe(0);
        expect(r4.retryAfterMs).toBeGreaterThan(0);
    });

    it("tracks different IPs independently", () => {
        limiter.check("1.2.3.4");
        limiter.check("1.2.3.4");
        limiter.check("1.2.3.4");

        // Different IP should still be allowed
        const result = limiter.check("5.6.7.8");
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2);
    });

    it("resets after window expires", async () => {
        limiter.destroy();
        limiter = new RateLimiter({ maxRequests: 1, windowMs: 50 });

        const r1 = limiter.check("1.2.3.4");
        expect(r1.allowed).toBe(true);

        const r2 = limiter.check("1.2.3.4");
        expect(r2.allowed).toBe(false);

        // Wait for window to expire
        await new Promise((resolve) => setTimeout(resolve, 60));

        const r3 = limiter.check("1.2.3.4");
        expect(r3.allowed).toBe(true);
    });

    it("peek does not consume a slot", () => {
        const peek1 = limiter.peek("1.2.3.4");
        expect(peek1.remaining).toBe(3);
        expect(peek1.isLimited).toBe(false);

        const peek2 = limiter.peek("1.2.3.4");
        expect(peek2.remaining).toBe(3);

        // Now consume all slots
        limiter.check("1.2.3.4");
        limiter.check("1.2.3.4");
        limiter.check("1.2.3.4");

        const peek3 = limiter.peek("1.2.3.4");
        expect(peek3.remaining).toBe(0);
        expect(peek3.isLimited).toBe(true);
    });

    it("reset clears all entries", () => {
        limiter.check("1.2.3.4");
        limiter.check("1.2.3.4");
        limiter.check("1.2.3.4");
        expect(limiter.size).toBe(1);

        limiter.reset();
        expect(limiter.size).toBe(0);

        const result = limiter.check("1.2.3.4");
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(2);
    });
});

describe("extractClientIp", () => {
    function makeRequest(headers: Record<string, string>): Request {
        return {
            headers: {
                get: (name: string) => headers[name.toLowerCase()] ?? null,
            },
        } as unknown as Request;
    }

    it("extracts IP from x-forwarded-for (first entry)", () => {
        const req = makeRequest({ "x-forwarded-for": "10.0.0.1, 10.0.0.2" });
        expect(extractClientIp(req)).toBe("10.0.0.1");
    });

    it("extracts IP from x-forwarded-for (single entry)", () => {
        const req = makeRequest({ "x-forwarded-for": "192.168.1.1" });
        expect(extractClientIp(req)).toBe("192.168.1.1");
    });

    it("falls back to x-real-ip", () => {
        const req = makeRequest({ "x-real-ip": "172.16.0.1" });
        expect(extractClientIp(req)).toBe("172.16.0.1");
    });

    it("prefers x-forwarded-for over x-real-ip", () => {
        const req = makeRequest({
            "x-forwarded-for": "10.0.0.1",
            "x-real-ip": "172.16.0.1",
        });
        expect(extractClientIp(req)).toBe("10.0.0.1");
    });

    it("returns 'unknown' when no headers present", () => {
        const req = makeRequest({});
        expect(extractClientIp(req)).toBe("unknown");
    });
});
