import jwt from "jsonwebtoken";
import { log, logError } from "../../lib/logger";

const SERVICE = "auth";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";
const TOKEN_EXPIRY = "8h";

export const authService = {
    login(username: string, password: string): string | null {
        log(SERVICE, `Login attempt for user="${username}"`);
        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (username === adminUsername && password === adminPassword) {
            log(SERVICE, `Login successful for user="${username}"`);
            return jwt.sign({ username, role: "admin" }, JWT_SECRET, {
                expiresIn: TOKEN_EXPIRY,
            });
        }
        log(SERVICE, `Login failed for user="${username}"`, "WARN");
        return null;
    },

    verifyToken(token: string): { username: string; role: string } | null {
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as {
                username: string;
                role: string;
            };
            log(SERVICE, `Token verified for user="${decoded.username}"`);
            return decoded;
        } catch (error) {
            logError(SERVICE, "Token verification failed", error);
            return null;
        }
    },
};
