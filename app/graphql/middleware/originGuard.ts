import { GraphQLError } from "graphql";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim());

const ORIGIN_EXEMPT_OPERATIONS = ["login", "heartbeat", "IntrospectionQuery", "Login", "Heartbeat"];

export function validateOrigin(
    origin: string | null | undefined,
    referer: string | null | undefined,
    operationName: string | null | undefined,
): void {
    if (operationName && ORIGIN_EXEMPT_OPERATIONS.includes(operationName)) {
        return;
    }

    const sourceUrl = origin || referer;

    if (!sourceUrl) {
        throw new GraphQLError("Forbidden: missing origin", {
            extensions: { code: "FORBIDDEN" },
        });
    }

    const isAllowed = ALLOWED_ORIGINS.some(
        (allowed) => sourceUrl === allowed || sourceUrl.startsWith(allowed),
    );

    if (!isAllowed) {
        throw new GraphQLError("Forbidden: invalid origin", {
            extensions: { code: "FORBIDDEN" },
        });
    }
}

export function extractTokenFromHeaders(
    authorization: string | null | undefined,
): string | undefined {
    if (!authorization) return undefined;
    const parts = authorization.split(" ");
    return parts.length === 2 && parts[0] === "Bearer" ? parts[1] : undefined;
}
