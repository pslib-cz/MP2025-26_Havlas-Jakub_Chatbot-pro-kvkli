import { authService } from "../../../../../graphql/services/auth.service";

function extractTokenFromCookie(cookieHeader: string | null): string | undefined {
    if (!cookieHeader) return undefined;
    const match = cookieHeader.match(/backoffice_token=([^;]+)/);
    return match?.[1] || undefined;
}

export async function GET(req: Request) {
    const cookie = req.headers.get("cookie");
    const token = extractTokenFromCookie(cookie);

    if (!token || !authService.verifyToken(token)) {
        return new Response(JSON.stringify({ authenticated: false }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify({ authenticated: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}
