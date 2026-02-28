import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";
const TOKEN_EXPIRY = "8h";

export const authService = {
    login(username: string, password: string): string | null {
        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (username === adminUsername && password === adminPassword) {
            return jwt.sign({ username, role: "admin" }, JWT_SECRET, {
                expiresIn: TOKEN_EXPIRY,
            });
        }
        return null;
    },

    verifyToken(token: string): { username: string; role: string } | null {
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as {
                username: string;
                role: string;
            };
            return decoded;
        } catch {
            return null;
        }
    },
};
