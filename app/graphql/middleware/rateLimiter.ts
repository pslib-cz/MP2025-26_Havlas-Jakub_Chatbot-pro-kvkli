// ─── In-Memory Rate Limiter ───────────────────────────────────────────────────

import LoggerService from "../services/logger.service";

interface RateLimitEntry {
    count: number;
    windowStart: number;
}

/** Default: 20 requests per hour per IP */
const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
/** Clean up stale entries every 10 minutes */
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

export interface RateLimiterConfig {
    maxRequests?: number;
    windowMs?: number;
}

export class RateLimiter {
    private readonly store = new Map<string, RateLimitEntry>();
    private readonly maxRequests: number;
    private readonly windowMs: number;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    constructor(config: RateLimiterConfig = {}) {
        this.maxRequests = config.maxRequests ?? DEFAULT_MAX_REQUESTS;
        this.windowMs = config.windowMs ?? DEFAULT_WINDOW_MS;
        this.startCleanup();
    }

    /**
     * Check and consume a rate limit slot for the given key (typically IP).
     * Returns { allowed, remaining, retryAfterMs }.
     */
    check(key: string): {
        allowed: boolean;
        remaining: number;
        retryAfterMs: number;
    } {
        const now = Date.now();
        const entry = this.store.get(key);

        // No entry or window expired → fresh window
        if (!entry || now - entry.windowStart >= this.windowMs) {
            this.store.set(key, { count: 1, windowStart: now });
            return {
                allowed: true,
                remaining: this.maxRequests - 1,
                retryAfterMs: 0,
            };
        }

        // Within window
        if (entry.count < this.maxRequests) {
            entry.count += 1;
            return {
                allowed: true,
                remaining: this.maxRequests - entry.count,
                retryAfterMs: 0,
            };
        }

        // Rate limited
        const retryAfterMs = this.windowMs - (now - entry.windowStart);
        LoggerService.warn("Rate limit exceeded", {
            key,
            count: entry.count,
            retryAfterMs,
        });
        return {
            allowed: false,
            remaining: 0,
            retryAfterMs,
        };
    }

    /** Get current state for a key without consuming a slot */
    peek(key: string): { remaining: number; isLimited: boolean } {
        const now = Date.now();
        const entry = this.store.get(key);

        if (!entry || now - entry.windowStart >= this.windowMs) {
            return { remaining: this.maxRequests, isLimited: false };
        }

        const remaining = Math.max(0, this.maxRequests - entry.count);
        return { remaining, isLimited: remaining === 0 };
    }

    /** Remove expired entries to prevent memory growth */
    private cleanup(): void {
        const now = Date.now();
        let removed = 0;
        for (const [key, entry] of this.store) {
            if (now - entry.windowStart >= this.windowMs) {
                this.store.delete(key);
                removed++;
            }
        }
        if (removed > 0) {
            LoggerService.info(`Rate limiter cleanup: removed ${removed} expired entries`, {
                remaining: this.store.size,
            });
        }
    }

    private startCleanup(): void {
        this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
        // Allow the process to exit even if the timer is running
        if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
            this.cleanupTimer.unref();
        }
    }

    /** Stop cleanup timer (for testing) */
    destroy(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /** Reset all entries (for testing) */
    reset(): void {
        this.store.clear();
    }

    get size(): number {
        return this.store.size;
    }
}

// ─── Singleton instance for the addPrompt mutation ────────────────────────────

export const promptRateLimiter = new RateLimiter();

/**
 * Extract client IP from request headers.
 * Checks x-forwarded-for (behind proxy/Docker), then x-real-ip, then falls back to "unknown".
 */
export function extractClientIp(req: Request): string {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) {
        // x-forwarded-for can be comma-separated: client, proxy1, proxy2
        return forwarded.split(",")[0].trim();
    }

    const realIp = req.headers.get("x-real-ip");
    if (realIp) {
        return realIp.trim();
    }

    return "unknown";
}
