// ─── Tool Registry ────────────────────────────────────────────────────────────

import type { z } from "zod";
import type { ChatCompletionTool } from "openai/resources/chat";
import type { ToolDefinition, ToolHandlerFn } from "./types";
import LoggerService from "../logger.service";

/**
 * Central registry that maps tool names to their OpenAI spec, zod schema,
 * and execution handler. Provides validation and dispatch in one place —
 * no per-tool branching in the agent loop.
 */
export class ToolRegistry {
    private readonly tools = new Map<string, ToolDefinition>();

    /**
     * Register a tool with its OpenAI function spec, zod validation schema,
     * and async handler.
     */
    register<T extends z.ZodTypeAny>(
        name: string,
        spec: ChatCompletionTool,
        schema: T,
        handler: ToolHandlerFn<T>,
    ): void {
        this.tools.set(name, {
            spec,
            schema,
            handler: handler as ToolHandlerFn<z.ZodTypeAny>,
        });
    }

    /** Return all registered OpenAI tool specs for the API request */
    getSpecs(): ChatCompletionTool[] {
        return Array.from(this.tools.values()).map((t) => t.spec);
    }

    /** Check whether a tool name is registered */
    has(name: string): boolean {
        return this.tools.has(name);
    }

    /**
     * Validate raw JSON arguments against the tool's zod schema and execute
     * the handler. Returns the result string on success, or a safe fallback
     * string on validation/execution failure.
     */
    async execute(
        name: string,
        rawArgs: string,
        fallback: string,
    ): Promise<string> {
        const definition = this.tools.get(name);
        if (!definition) {
            LoggerService.warn("ToolRegistry: unknown tool requested", { name });
            return fallback;
        }

        // ── Validate ──────────────────────────────────────────────────────
        let parsed: unknown;
        try {
            const json: unknown = JSON.parse(rawArgs);
            parsed = definition.schema.parse(json);
        } catch (error) {
            LoggerService.warn("ToolRegistry: argument validation failed", {
                tool: name,
                rawArgs,
                error: (error as Error).message,
            });
            return fallback;
        }

        // ── Execute ───────────────────────────────────────────────────────
        try {
            return await definition.handler(parsed);
        } catch (error) {
            LoggerService.logError(error as Error, `ToolRegistry.execute(${name})`, {
                args: rawArgs,
            });
            return fallback;
        }
    }
}
