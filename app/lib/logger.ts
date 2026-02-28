import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs");

function ensureLogDir(): void {
    if (!fs.existsSync(LOG_DIR)) {
        fs.mkdirSync(LOG_DIR, { recursive: true });
    }
}

export function log(service: string, message: string, level: "INFO" | "WARN" | "ERROR" = "INFO"): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] [${service}] ${message}\n`;
    try {
        ensureLogDir();
        const logFile = path.join(LOG_DIR, `${service}.log`);
        fs.appendFileSync(logFile, line);
    } catch {
        // fallback — don't crash the app over logging
    }
    const consoleMethod = level === "ERROR" ? console.error : level === "WARN" ? console.warn : console.log;
    consoleMethod(`[${service}] ${message}`);
}

export function logError(service: string, message: string, error?: unknown): void {
    const errMsg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error ?? "");
    log(service, `${message}${errMsg ? " — " + errMsg : ""}`, "ERROR");
}
