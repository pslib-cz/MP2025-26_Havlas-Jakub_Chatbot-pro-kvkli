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

    const body: ChatCompletionCreateParamsNonStreaming = { model, messages };

    if (tools && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = "auto";
    }

    LoggerService.debug("OpenAI request", {
        model,
        messageCount: messages.length,
        toolCount: tools?.length ?? 0,
    });

    const response = await openai.chat.completions.create(body);

    LoggerService.debug("OpenAI response", {
        finishReason: response.choices[0]?.finish_reason,
        hasToolCalls: (response.choices[0]?.message.tool_calls?.length ?? 0) > 0,
    });

    return response;
}
