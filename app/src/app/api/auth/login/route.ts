import { authService } from "../../../../../graphql/services/auth.service";

export async function POST(req: Request) {
    const { username, password } = await req.json();

    if (!username || !password) {
        return new Response(JSON.stringify({ error: "Missing credentials" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
        });
    }

    const token = authService.login(username, password);

    if (!token) {
        return new Response(JSON.stringify({ error: "Invalid credentials" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    const isProduction = process.env.NODE_ENV === "production";

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: {
            "Content-Type": "application/json",
            "Set-Cookie": `backoffice_token=${token}; HttpOnly; ${isProduction ? "Secure; " : ""}SameSite=Strict; Path=/; Max-Age=28800`,
        },
    });
}
