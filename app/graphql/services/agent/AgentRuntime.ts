// ─── Agent Runtime — Loop Orchestration ───────────────────────────────────────

import type { AgentResult } from "./types";
import type { ChatCompletionMessageFunctionToolCall } from "openai/resources/chat";
import { ConversationHistory } from "./ConversationHistory";
import { ToolRegistry } from "./ToolRegistry";
import { chatCompletion } from "./OpenAIClient";
import { MODEL, MAX_TOOL_ITERATIONS, FALLBACK_ANSWER } from "./constants";
import LoggerService from "../logger.service";

export interface AgentRuntimeOptions {
    /** Model override */
    model?: string;
    /** Max iterations override */
    maxToolIterations?: number;
    /** Fallback answer override */
    fallbackAnswer?: string;
}

/**
 * Generic agent loop that orchestrates OpenAI chat completion with tool calling.
 *
 * Flow:
 * 1. Send messages + tool specs to OpenAI.
 * 2. If the response contains `tool_calls`, validate & execute each tool,
 *    inject results as `role: "tool"` messages, and call the model again.
 * 3. Repeat until no `tool_calls` remain or `MAX_TOOL_ITERATIONS` is reached.
 * 4. Return the final textual answer.
 */
export class AgentRuntime {
    private readonly model: string;
    private readonly maxIterations: number;
    private readonly fallback: string;
    private readonly registry: ToolRegistry;

    constructor(registry: ToolRegistry, options: AgentRuntimeOptions = {}) {
        this.registry = registry;
        this.model = options.model ?? MODEL;
        this.maxIterations = options.maxToolIterations ?? MAX_TOOL_ITERATIONS;
        this.fallback = options.fallbackAnswer ?? FALLBACK_ANSWER;
    }

    /**
     * Execute the agent loop for a given conversation history.
     *
     * @param history - Conversation context (mutated in place with tool messages)
     * @returns AgentResult with the final answer and metadata
     */
    async run(history: ConversationHistory): Promise<AgentResult> {
        const toolSpecs = this.registry.getSpecs();
        let iterations = 0;

        // Log the last user message so we can trace how the agent handles it
        const messages = history.getMessages();
        const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
        LoggerService.info("AgentRuntime: starting run", {
            userMessage:
                typeof lastUserMsg?.content === "string"
                    ? lastUserMsg.content
                    : JSON.stringify(lastUserMsg?.content),
            totalMessages: messages.length,
        });

        while (iterations < this.maxIterations) {
            const response = await chatCompletion({
                model: this.model,
                messages: history.getMessages(),
                tools: toolSpecs.length > 0 ? toolSpecs : undefined,
            });

            const choice = response.choices[0];
            const message = choice.message;
            const toolCalls = message.tool_calls;

            // ── No tool calls → final answer ──────────────────────────────
            if (!toolCalls || toolCalls.length === 0) {
                const answer = message.content ?? this.fallback;
                history.addAssistant(answer);

                LoggerService.info("AgentRuntime: final answer produced", {
                    iterations,
                    answerPreview: answer.substring(0, 200),
                });

                return {
                    answer,
                    iterations,
                    truncated: false,
                };
            }

            // ── Process tool calls ────────────────────────────────────────
            iterations += 1;

            // Narrow to function tool calls only
            const functionToolCalls = toolCalls.filter(
                (tc): tc is ChatCompletionMessageFunctionToolCall =>
                    tc.type === "function",
            );

            // Record the assistant message with tool calls
            history.addAssistantToolCalls(
                functionToolCalls.map((tc) => ({
                    id: tc.id,
                    type: "function" as const,
                    function: {
                        name: tc.function.name,
                        arguments: tc.function.arguments,
                    },
                })),
            );

            // Execute each tool call and inject the result
            for (const toolCall of functionToolCalls) {
                const { name, arguments: rawArgs } = toolCall.function;

                LoggerService.info("AgentRuntime: executing tool", {
                    tool: name,
                    iteration: iterations,
                    toolCallId: toolCall.id,
                    arguments: rawArgs,
                });

                const result = await this.registry.execute(
                    name,
                    rawArgs,
                    this.fallback,
                );

                LoggerService.debug("AgentRuntime: tool result received", {
                    tool: name,
                    resultLength: result.length,
                    resultPreview: result.substring(0, 100),
                });

                history.addToolResult(toolCall.id, result);

                LoggerService.debug(
                    "AgentRuntime: tool result added to history",
                    {
                        tool: name,
                        totalMessages: history.length,
                    },
                );
            }
        }

        // ── Iteration limit reached ───────────────────────────────────────
        LoggerService.warn("AgentRuntime: max tool iterations reached", {
            maxIterations: this.maxIterations,
        });

        // Make one final call without tools to force a textual response
        const finalResponse = await chatCompletion({
            model: this.model,
            messages: history.getMessages(),
        });

        const finalAnswer =
            finalResponse.choices[0].message.content ?? this.fallback;
        history.addAssistant(finalAnswer);

        return {
            answer: finalAnswer,
            iterations: this.maxIterations,
            truncated: true,
        };
    }
}
