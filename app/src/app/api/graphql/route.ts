import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../../../../graphql/schema";
import { resolvers } from "../../../../graphql/resolvers";
import { validateOrigin, extractTokenFromHeaders } from "../../../../graphql/middleware/originGuard";
import { extractClientIp } from "../../../../graphql/middleware/rateLimiter";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

let serverStarted = false;
const server = new ApolloServer({
    typeDefs,
    resolvers,
    introspection: !IS_PRODUCTION,
});

async function ensureStarted() {
    if (!serverStarted) {
        await server.start();
        serverStarted = true;
    }
}

/**
 * Build CORS headers using the validated origin.
 * Only reflects origins that are in the ALLOWED_ORIGINS list.
 */
function corsHeaders(origin: string | null): Record<string, string> {
    const normalizedOrigin = origin?.replace(/\/+$/, "") ?? "";
    const isAllowed = ALLOWED_ORIGINS.some((ao) => {
        const normalized = ao.replace(/\/+$/, "");
        return normalizedOrigin === normalized;
    });

    return {
        "Access-Control-Allow-Origin": isAllowed ? origin! : ALLOWED_ORIGINS[0],
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "X-Content-Type-Options": "nosniff",
    };
}

function extractTokenFromCookie(cookieHeader: string | null): string | undefined {
    if (!cookieHeader) return undefined;
    const match = cookieHeader.match(/backoffice_token=([^;]+)/);
    return match?.[1] || undefined;
}

async function handleGraphQL(req: Request) {
    await ensureStarted();

    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const authorization = req.headers.get("authorization");
    const cookie = req.headers.get("cookie");

    // Parse body
    const body = await req.json();
    const operationName = body.operationName || null;

    // Validate origin
    validateOrigin(origin, referer, operationName);

    // Extract auth token (prefer Authorization header, fall back to httpOnly cookie)
    const token = extractTokenFromHeaders(authorization) ?? extractTokenFromCookie(cookie);

    // Extract client IP for rate limiting
    const clientIp = extractClientIp(req);

    const response = await server.executeOperation(
        {
            query: body.query,
            variables: body.variables,
            operationName: body.operationName,
        },
        {
            contextValue: { token, clientIp },
        },
    );

    const result = response.body;

    if (result.kind === "single") {
        return new Response(JSON.stringify(result.singleResult), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                ...corsHeaders(origin),
            },
        });
    }

    return new Response(JSON.stringify({ errors: [{ message: "Unexpected response" }] }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
    });
}

export async function POST(req: Request) {
    return handleGraphQL(req);
}

// GET disabled in production — GraphQL should only accept POST
export async function GET() {
    if (IS_PRODUCTION) {
        return new Response(JSON.stringify({ errors: [{ message: "Method not allowed" }] }), {
            status: 405,
            headers: { "Content-Type": "application/json", "Allow": "POST, OPTIONS" },
        });
    }
    // In development, allow GET for Apollo Sandbox
    return new Response(JSON.stringify({ message: "Use POST for GraphQL queries" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

export async function OPTIONS(req: Request) {
    const origin = req.headers.get("origin");
    return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
    });
}
