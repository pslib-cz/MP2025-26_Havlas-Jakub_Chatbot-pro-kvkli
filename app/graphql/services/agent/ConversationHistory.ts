// ─── ConversationHistory ──────────────────────────────────────────────────────

import type { ChatCompletionMessageParam } from "openai/resources/chat";
import {
    DEFAULT_SYSTEM_PROMPT,
    DEFAULT_MAX_HISTORY_MESSAGES,
} from "./constants";

export interface ConversationHistoryConfig {
    /** System prompt — immutable once set */
    systemPrompt?: string;
    /** Maximum non-system messages to retain */
    maxMessages?: number;
}

/**
 * Manages an ordered list of chat messages for multi-turn conversations.
 *
 * - The system message is always preserved as the first message.
 * - Non-system messages are trimmed to `maxMessages` from the tail.
 * - Provides a `getTokenSafeMessages` placeholder for future token counting.
 */
export class ConversationHistory {
    private readonly systemMessage: ChatCompletionMessageParam;
    private messages: ChatCompletionMessageParam[] = [];
    private readonly maxMessages: number;

    constructor(config: ConversationHistoryConfig = {}) {
        const systemPrompt = config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
        this.maxMessages = config.maxMessages ?? DEFAULT_MAX_HISTORY_MESSAGES;
        this.systemMessage = { role: "system", content: systemPrompt };
    }

    /** Append a user message */
    addUser(content: string): void {
        this.messages.push({ role: "user", content });
        this.trimIfNeeded();
    }

    /** Append an assistant message */
    addAssistant(content: string): void {
        this.messages.push({ role: "assistant", content });
        this.trimIfNeeded();
    }

    /** Append an assistant message that contains tool calls (no textual content) */
    addAssistantToolCalls(
        toolCalls: Array<{
            id: string;
            type: "function";
            function: { name: string; arguments: string };
        }>,
    ): void {
        this.messages.push({
            role: "assistant",
            content: null,
            tool_calls: toolCalls,
        } as ChatCompletionMessageParam);
        this.trimIfNeeded();
    }

    /** Append a tool result message */
    addToolResult(toolCallId: string, content: string): void {
        if (!toolCallId) {
            throw new Error("toolCallId is required for tool messages");
        }
        if (typeof content !== "string") {
            throw new Error(
                `Tool result content must be a string, got ${typeof content}`,
            );
        }

        // Ensure content is valid UTF-8 and doesn't contain problematic characters
        const sanitizedContent = content
            .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, "") // Remove control characters except LF
            .trim();

        if (!sanitizedContent) {
            throw new Error(
                "Tool result content cannot be empty after sanitization",
            );
        }

        const toolMessage = {
            role: "tool" as const,
            tool_call_id: toolCallId,
            content: sanitizedContent,
        };

        this.messages.push(toolMessage as ChatCompletionMessageParam);
        this.trimIfNeeded();
    }

    /**
     * Return all messages for the model, optionally limited to the last N
     * non-system messages. The system message is always included first.
     */
    getMessages(lastN?: number): ChatCompletionMessageParam[] {
        const raw = !lastN
            ? [this.systemMessage, ...this.messages]
            : [this.systemMessage, ...this.messages.slice(-lastN)];

        // Strip legacy `role: "function"` messages — deprecated OpenAI format.
        // These should never be created by the current code, but old persisted
        // conversation data could theoretically contain them.
        const messages = raw.filter((msg) => {
            const role = (msg as unknown as Record<string, unknown>)
                .role as string;
            if (role === "function") {
                console.error(
                    "[ConversationHistory] Dropping legacy 'function' role message — " +
                        "use role: 'tool' with tool_call_id instead.",
                );
                return false;
            }
            return true;
        });

        // Validate and sanitize message sequence
        this.validateMessageSequence(messages);

        // Ensure messages are properly typed
        return messages.map((msg) => this.sanitizeMessage(msg));
    }

    /**
     * Placeholder for future token-aware message trimming.
     * Currently returns all messages. Replace with token counting logic
     * (e.g. tiktoken) when budget constraints are needed.
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getTokenSafeMessages(maxTokens?: number): ChatCompletionMessageParam[] {
        // TODO: Integrate tiktoken for actual token counting
        return this.getMessages();
    }

    /** Trim non-system messages to `maxMessages` from the tail */
    trim(limit?: number): void {
        const cap = limit ?? this.maxMessages;
        if (this.messages.length > cap) {
            this.messages = this.messages.slice(-cap);
        }
    }

    /** Reset conversation, preserving or replacing the system prompt */
    clear(newSystemPrompt?: string): void {
        if (newSystemPrompt) {
            (
                this.systemMessage as { role: "system"; content: string }
            ).content = newSystemPrompt;
        }
        this.messages = [];
    }

    /** Number of non-system messages currently stored */
    get length(): number {
        return this.messages.length;
    }

    // ── Internal ──────────────────────────────────────────────────────────

    /**
     * Ensure message is properly typed and doesn't contain invalid fields
     */
    private sanitizeMessage(
        msg: ChatCompletionMessageParam,
    ): ChatCompletionMessageParam {
        // Simply return the message - it's already been properly validated
        // Just ensure that deprecated fields don't exist
        const cleaned = structuredClone(msg);
        const cleanedObj = cleaned as unknown as Record<string, unknown>;
        delete cleanedObj["function_call"];
        delete cleanedObj["function"];

        return cleaned;
    }

    /**
     * Validate message sequence to ensure OpenAI API compatibility
     */
    private validateMessageSequence(
        messages: ChatCompletionMessageParam[],
    ): void {
        if (messages.length < 2) return; // Only system and maybe one message

        let expectTools = false;
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i] as unknown as Record<string, unknown>;
            const role = msg.role as string;

            // Validate role types
            if (!["system", "user", "assistant", "tool"].includes(role)) {
                console.error(
                    `Invalid role at message ${i}: "${role}". Valid roles: system, user, assistant, tool.`,
                );
            }

            // Validate that tool messages follow (directly or via other tool messages)
            // an assistant message that contains tool_calls.
            if (role === "tool") {
                if (i === 0) {
                    console.error("Tool message cannot be the first message");
                }
                // Walk backwards past any consecutive tool messages to find the
                // responsible assistant message.
                let prevAssistantIndex = i - 1;
                while (prevAssistantIndex >= 0) {
                    const r = (
                        messages[prevAssistantIndex] as unknown as Record<
                            string,
                            unknown
                        >
                    ).role as string;
                    if (r !== "tool") break;
                    prevAssistantIndex--;
                }
                const prevAssistant =
                    prevAssistantIndex >= 0
                        ? (messages[prevAssistantIndex] as unknown as Record<
                              string,
                              unknown
                          >)
                        : undefined;
                if (!prevAssistant || prevAssistant.role !== "assistant") {
                    console.error(
                        `Tool message at index ${i} must follow an assistant message. Nearest non-tool message role: ${
                            prevAssistant?.role
                        }`,
                    );
                }
                const toolCalls = prevAssistant?.tool_calls as
                    | unknown[]
                    | undefined;
                if (!toolCalls || toolCalls.length === 0) {
                    console.error(
                        `Tool message at index ${i} follows an assistant message without tool_calls`,
                    );
                }
            }

            // Track if we just had tool calls
            const toolCalls = msg.tool_calls as unknown[] | undefined;
            if (role === "assistant" && (toolCalls?.length ?? 0) > 0) {
                expectTools = true;
            } else if (role === "tool") {
                expectTools = false;
            } else if (role !== "tool" && expectTools) {
                // After tool_calls, we should see tool messages, not user/assistant
                expectTools = false;
            }
        }
    }

    private trimIfNeeded(): void {
        if (this.messages.length > this.maxMessages) {
            this.trim();
        }
    }
}
