// ─── OpenAI Client Abstraction ────────────────────────────────────────────────

import type {
    ChatCompletionMessageParam,
    ChatCompletionTool,
    ChatCompletion,
    ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat";
import { openai } from "../../../lib/openAI";
import { MODEL } from "./constants";
import LoggerService from "../logger.service";

export interface ChatRequestOptions {
    /** Model override (defaults to constants.MODEL) */
    model?: string;
    /** Messages to send */
    messages: ChatCompletionMessageParam[];
    /** Available tools — omit to disable function calling */
    tools?: ChatCompletionTool[];
}

/**
 * Thin wrapper around the OpenAI chat completions API.
 * Encapsulates request shaping and provides a single point
 * for future enhancements (retries, rate-limit handling, streaming).
 */
export async function chatCompletion(
    options: ChatRequestOptions,
): Promise<ChatCompletion> {
    const { model = MODEL, messages, tools } = options;

    // Validate message structure to prevent API errors
    validateMessages(messages);

    // Convert messages to plain objects to ensure proper serialization
    const serializedMessages = messages.map(m => {
        const obj = JSON.parse(JSON.stringify(m));
        return obj as ChatCompletionMessageParam;
    });

    const body: ChatCompletionCreateParamsNonStreaming = { 
        model, 
        messages: serializedMessages,
    };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
    }

    LoggerService.debug("OpenAI request", {
        model,
        messageCount: messages.length,
        toolCount: tools?.length ?? 0,
        messageRoles: messages.map((m) => (m as unknown as Record<string, unknown>).role as string).join(", "),
    });

    try {
        const response = await openai.chat.completions.create(body);

        LoggerService.debug("OpenAI response", {
            finishReason: response.choices[0]?.finish_reason,
            hasToolCalls:
                (response.choices[0]?.message.tool_calls?.length ?? 0) > 0,
        });

        return response;
    } catch (error) {
        // Log detailed message structure on error for debugging
        LoggerService.warn("OpenAI API error - message structure:", {
            messageCount: messages.length,
            model,
            messages: messages.map((m, i) => {
                const msg = m as unknown as Record<string, unknown>;
                return {
                    index: i,
                    role: msg.role,
                    hasContent: !!msg.content,
                    hasToolCalls: !!msg.tool_calls,
                    hasToolCallId: !!msg.tool_call_id,
                    keys: Object.keys(msg),
                };
            }),
        });
        throw error;
    }
}

/**
 * Validate that messages have proper structure before sending to OpenAI
 */
function validateMessages(messages: ChatCompletionMessageParam[]): void {
    const validRoles = new Set(["system", "user", "assistant", "tool"]);
    
    messages.forEach((msg: unknown, index: number) => {
        const m = msg as unknown as Record<string, unknown>;
        if (!m.role || !validRoles.has(m.role as string)) {
            throw new Error(
                `Invalid message role at index ${index}: ${m.role}. Valid roles are: system, user, assistant, tool`
            );
        }
        
        // tool messages must have tool_call_id
        if (m.role === "tool" && !m.tool_call_id) {
            throw new Error(
                `Tool message at index ${index} must have 'tool_call_id' property`
            );
        }
        
        // Ensure no deprecated fields
        if (m.function_call || m.function) {
            throw new Error(
                `Deprecated function calling format found at index ${index}. Use tool_calls instead.`
            );
        }
    });
}
