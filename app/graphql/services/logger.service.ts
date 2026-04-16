import pino from "pino";
import path from "path";
import fs from "fs";
import { Writable } from "stream";

const logDir = path.join(process.cwd(), "logs");

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const getLogFileName = () => {
    const date = new Date().toISOString().split("T")[0];
    return path.join(logDir, `app-${date}.log`);
};

// Daily-rotating file stream: opens a new file when the date changes
class DailyRotatingStream extends Writable {
    private currentDate = "";
    private fileStream: fs.WriteStream | null = null;

    constructor() {
        super();
        this.rotateIfNeeded();
    }

    private rotateIfNeeded() {
        const today = new Date().toISOString().split("T")[0];
        if (today !== this.currentDate) {
            if (this.fileStream) {
                this.fileStream.end();
            }
            this.currentDate = today;
            this.fileStream = fs.createWriteStream(getLogFileName(), {
                flags: "a",
            });
        }
    }

    _write(
        chunk: Buffer | string,
        _encoding: string,
        callback: (error?: Error | null) => void,
    ) {
        this.rotateIfNeeded();
        this.fileStream!.write(chunk, callback);
    }

    _final(callback: (error?: Error | null) => void) {
        if (this.fileStream) {
            this.fileStream.end(callback);
        } else {
            callback();
        }
    }
}

const dailyStream = new DailyRotatingStream();

const logger = pino(
    {
        level: process.env.LOG_LEVEL || "info",
    },
    pino.multistream([
        { stream: dailyStream },
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
