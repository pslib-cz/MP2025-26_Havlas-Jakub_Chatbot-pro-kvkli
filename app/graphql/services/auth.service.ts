import jwt from "jsonwebtoken";
import LoggerService from "./logger.service";

const SERVICE = "auth";
const JWT_SECRET = process.env.JWT_SECRET || "fallback-secret-change-me";
const TOKEN_EXPIRY = "8h";

export const authService = {
    login(username: string, password: string): string | null {
        LoggerService.info(`Login attempt for user="${username}"`, {
            service: SERVICE,
        });
        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (username === adminUsername && password === adminPassword) {
            LoggerService.info(`Login successful for user="${username}"`, {
                service: SERVICE,
            });
            return jwt.sign({ username, role: "admin" }, JWT_SECRET, {
                expiresIn: TOKEN_EXPIRY,
            });
        }
        LoggerService.warn(`Login failed for user="${username}"`, {
            service: SERVICE,
        });
        return null;
    },

    verifyToken(token: string): { username: string; role: string } | null {
        try {
            const decoded = jwt.verify(token, JWT_SECRET) as {
                username: string;
                role: string;
            };
            LoggerService.info(
                `Token verified for user="${decoded.username}"`,
                { service: SERVICE },
            );
            return decoded;
        } catch (error) {
            LoggerService.logError(
                error as Error,
                "Token verification failed",
                { service: SERVICE },
            );
            return null;
        }
    },
};
