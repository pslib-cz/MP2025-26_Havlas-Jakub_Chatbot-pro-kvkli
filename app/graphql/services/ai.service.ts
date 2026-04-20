import {
    AgentRuntime,
    ConversationHistory,
    createToolRegistry,
    ERROR_FALLBACK,
    sanitizeInput,
} from "./agent";
import {
    isInputTooLong,
    INPUT_TOO_LONG_MESSAGE,
    validateOutput,
} from "./agent/preprocessing";
import { buildSystemPrompt } from "../utils/ai.prompt";
import LoggerService from "./logger.service";
import type { ConversationHistoryEntry, GenerateAnswerArgs } from "../../types";


const registry = createToolRegistry();
const runtime = new AgentRuntime(registry);


function buildHistory(
    sanitizedPromptText: string,
    conversationHistory: ConversationHistoryEntry[] = [],
): ConversationHistory {
    const history = new ConversationHistory({
        systemPrompt: buildSystemPrompt(),
    });

    for (const { question, answer } of conversationHistory) {
        history.addUser(question);
        history.addAssistant(answer);
    }

    history.addUser(sanitizedPromptText);
    return history;
}


export async function generateAnswer(
    args: GenerateAnswerArgs,
): Promise<string> {
    const { promptText, conversationHistory = [] } = args;

    // ── Input length guard ────────────────────────────────────────────
    const sanitized = sanitizeInput(promptText);
    if (isInputTooLong(sanitized)) {
        LoggerService.warn("Input too long, rejecting", {
            length: sanitized.length,
        });
        return INPUT_TOO_LONG_MESSAGE;
    }

    try {
        const history = buildHistory(sanitized, conversationHistory);
        const result = await runtime.run(history);

        if (result.truncated) {
            LoggerService.warn("Agent loop was truncated", {
                iterations: result.iterations,
                promptText: sanitized,
            });
        }

        LoggerService.info("generateAnswer", {
            promptText: sanitized,
            iterations: result.iterations,
            truncated: result.truncated,
        });

        // ── Output validation ─────────────────────────────────────────
        return validateOutput(result.answer);
    } catch (error) {
        LoggerService.logError(error as Error, "generateAnswer", {
            promptText: sanitized,
        });
        return ERROR_FALLBACK;
    }
}

export const aiService = {
    generateAnswer,
};

export { ConversationHistory } from "./agent";


