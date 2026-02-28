import { GraphQLError } from "graphql";
import { log } from "../../lib/logger";

const SERVICE = "originGuard";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

const ORIGIN_EXEMPT_OPERATIONS = ["login", "heartbeat", "IntrospectionQuery", "Login", "Heartbeat"];

export function validateOrigin(
    origin: string | null | undefined,
    referer: string | null | undefined,
    operationName: string | null | undefined,
): void {
    log(SERVICE, `validateOrigin — origin="${origin}", referer="${referer}", operation="${operationName}", allowedOrigins=${JSON.stringify(ALLOWED_ORIGINS)}`);

    if (operationName && ORIGIN_EXEMPT_OPERATIONS.includes(operationName)) {
        log(SERVICE, `Operation "${operationName}" is exempt from origin check`);
        return;
    }

    const sourceUrl = origin || referer;

    if (!sourceUrl) {
        log(SERVICE, `BLOCKED: missing origin and referer for operation "${operationName}"`, "WARN");
        throw new GraphQLError("Forbidden: missing origin", {
            extensions: { code: "FORBIDDEN" },
        });
    }

    const normalizedSource = sourceUrl.replace(/\/+$/, "");

    const isAllowed = ALLOWED_ORIGINS.some((allowed) => {
        const normalizedAllowed = allowed.replace(/\/+$/, "");
        return (
            normalizedSource === normalizedAllowed ||
            normalizedSource.startsWith(normalizedAllowed + "/") ||
            normalizedSource.startsWith(normalizedAllowed)
        );
    });

    if (!isAllowed) {
        log(SERVICE, `BLOCKED: origin "${sourceUrl}" not in allowed list ${JSON.stringify(ALLOWED_ORIGINS)} for operation "${operationName}"`, "WARN");
        throw new GraphQLError("Forbidden: invalid origin", {
            extensions: { code: "FORBIDDEN" },
        });
    }

    log(SERVICE, `ALLOWED: origin "${sourceUrl}" for operation "${operationName}"`);
}

export function extractTokenFromHeaders(
    authorization: string | null | undefined,
): string | undefined {
    if (!authorization) return undefined;
    const parts = authorization.split(" ");
    return parts.length === 2 && parts[0] === "Bearer" ? parts[1] : undefined;
}
