import pino from "pino";
import path from "path";
import fs from "fs";
import { Writable } from "stream";

const logDir = path.join(process.cwd(), "logs");

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const getLogFileName = (date: string) => {
    return path.join(logDir, `app-${date}.log`);
};

const getCurrentDate = () => new Date().toISOString().split("T")[0];

// Rotating write stream — reopens the file when the date changes
let currentDate = getCurrentDate();
let fileStream = fs.createWriteStream(getLogFileName(currentDate), { flags: "a" });

const rotatingStream = new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void) {
        const today = getCurrentDate();
        if (today !== currentDate) {
            fileStream.end();
            currentDate = today;
            fileStream = fs.createWriteStream(getLogFileName(currentDate), { flags: "a" });
        }
        fileStream.write(chunk, callback);
    },
});

const logger = pino(
    {
        level: process.env.LOG_LEVEL || "info",
    },
    pino.multistream([
        { stream: rotatingStream },
        { stream: process.stdout }, // Console output
    ]),
);

export class LoggerService {
    static logAIFunctionCall(
        functionName: string,
        args: Record<string, unknown>,
        metadata?: Record<string, unknown>,
    ) {
        logger.info(
            {
                type: "ai_function_call",
                functionName,
                arguments: args,
                timestamp: new Date().toISOString(),
                ...metadata,
            },
            `AI Function Call: ${functionName}`,
        );
    }

    static logError(
        error: Error,
        context?: string,
        metadata?: Record<string, unknown>,
    ) {
        logger.error(
            {
                type: "error",
                context,
                error: {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                },
                timestamp: new Date().toISOString(),
                ...metadata,
            },
            `Error${context ? ` in ${context}` : ""}: ${error.message}`,
        );
    }

    static info(message: string, metadata?: Record<string, unknown>) {
        logger.info(
            { timestamp: new Date().toISOString(), ...metadata },
            message,
        );
    }

    static warn(message: string, metadata?: Record<string, unknown>) {
        logger.warn(
            { timestamp: new Date().toISOString(), ...metadata },
            message,
        );
    }

    static debug(message: string, metadata?: Record<string, unknown>) {
        logger.debug(
            { timestamp: new Date().toISOString(), ...metadata },
            message,
        );
    }
}

export default LoggerService;
