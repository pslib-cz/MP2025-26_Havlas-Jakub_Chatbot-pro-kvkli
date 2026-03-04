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
        this.maxMessages =
            config.maxMessages ?? DEFAULT_MAX_HISTORY_MESSAGES;
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
        this.messages.push({
            role: "tool",
            tool_call_id: toolCallId,
            content,
        } as ChatCompletionMessageParam);
        this.trimIfNeeded();
    }

    /**
     * Return all messages for the model, optionally limited to the last N
     * non-system messages. The system message is always included first.
     */
    getMessages(lastN?: number): ChatCompletionMessageParam[] {
        if (!lastN) {
            return [this.systemMessage, ...this.messages];
        }
        return [this.systemMessage, ...this.messages.slice(-lastN)];
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
            (this.systemMessage as { role: "system"; content: string }).content =
                newSystemPrompt;
        }
        this.messages = [];
    }

    /** Number of non-system messages currently stored */
    get length(): number {
        return this.messages.length;
    }

    // ── Internal ──────────────────────────────────────────────────────────

    private trimIfNeeded(): void {
        if (this.messages.length > this.maxMessages) {
            this.trim();
        }
    }
}
