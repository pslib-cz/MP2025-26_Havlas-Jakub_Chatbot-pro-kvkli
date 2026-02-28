import { ApolloServer } from "@apollo/server";
import { typeDefs } from "../../../../graphql/schema";
import { resolvers } from "../../../../graphql/resolvers";
import { validateOrigin, extractTokenFromHeaders } from "../../../../graphql/middleware/originGuard";

let serverStarted = false;
const server = new ApolloServer({
    typeDefs,
    resolvers,
});

async function ensureStarted() {
    if (!serverStarted) {
        await server.start();
        serverStarted = true;
    }
}

async function handleGraphQL(req: Request) {
    await ensureStarted();

    const origin = req.headers.get("origin");
    const referer = req.headers.get("referer");
    const authorization = req.headers.get("authorization");

    // Parse body
    const body = await req.json();
    const operationName = body.operationName || null;

    // Validate origin
    validateOrigin(origin, referer, operationName);

    // Extract auth token
    const token = extractTokenFromHeaders(authorization);

    const response = await server.executeOperation(
        {
            query: body.query,
            variables: body.variables,
            operationName: body.operationName,
        },
        {
            contextValue: { token },
        },
    );

    const result = response.body;

    if (result.kind === "single") {
        return new Response(JSON.stringify(result.singleResult), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": origin || "*",
                "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
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

export async function GET(req: Request) {
    return handleGraphQL(req);
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
    });
}
