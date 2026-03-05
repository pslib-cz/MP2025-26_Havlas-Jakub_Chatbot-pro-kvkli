// ─── Agent Runtime Types ──────────────────────────────────────────────────────

import type { z } from "zod";
import type {
    ChatCompletionMessageParam,
    ChatCompletionTool,
} from "openai/resources/chat";

/**
 * Validated arguments produced by parsing raw JSON through a zod schema.
 * Each tool defines its own concrete shape via `ToolDefinition<T>`.
 */
export type ValidatedArgs<T extends z.ZodTypeAny> = z.infer<T>;

/**
 * A tool handler receives **validated** arguments and returns a structured
 * JSON string to be injected as a `role: "tool"` message.
 */
export type ToolHandlerFn<T extends z.ZodTypeAny> = (
    args: ValidatedArgs<T>,
) => Promise<string>;

/**
 * Complete definition of a single tool: OpenAI function spec, zod schema,
 * and the handler that executes business logic.
 */
export interface ToolDefinition<T extends z.ZodTypeAny = z.ZodTypeAny> {
    /** OpenAI function tool specification */
    spec: ChatCompletionTool;
    /** Zod schema used to validate the model's JSON arguments */
    schema: T;
    /** Async handler that receives validated args and returns a result string */
    handler: ToolHandlerFn<T>;
}

/** Configuration for the agent runtime loop */
export interface AgentRuntimeConfig {
    /** OpenAI model to use */
    model: string;
    /** Maximum tool-call loop iterations */
    maxToolIterations: number;
    /** Fallback answer when the model produces no content */
    fallbackAnswer: string;
    /** Tool definitions available to the model */
    tools: ChatCompletionTool[];
}

/** Result returned by a single agent run */
export interface AgentResult {
    /** The final textual answer */
    answer: string;
    /** Number of tool-call iterations performed */
    iterations: number;
    /** Whether the loop was terminated by the iteration limit */
    truncated: boolean;
}

/** A structured conversation message stored in history */
export interface StoredMessage {
    role: ChatCompletionMessageParam["role"];
    content: string | null;
    toolCallId?: string;
    toolCalls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
    }>;
}
