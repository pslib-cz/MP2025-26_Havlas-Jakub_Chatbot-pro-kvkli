import {
    AgentRuntime,
    ConversationHistory,
    createToolRegistry,
    ERROR_FALLBACK,
    sanitizeInput,
} from "./agent";
import { buildSystemPrompt } from "../utils/ai.prompt";
import LoggerService from "./logger.service";
import type { ConversationHistoryEntry, GenerateAnswerArgs } from "../../types";


const registry = createToolRegistry();
const runtime = new AgentRuntime(registry);


function buildHistory(
    promptText: string,
    conversationHistory: ConversationHistoryEntry[] = [],
): ConversationHistory {
    const history = new ConversationHistory({
        systemPrompt: buildSystemPrompt(),
    });

    for (const { question, answer } of conversationHistory) {
        history.addUser(question);
        history.addAssistant(answer);
    }

    history.addUser(sanitizeInput(promptText));
    return history;
}


export async function generateAnswer(
    args: GenerateAnswerArgs,
): Promise<string> {
    const { promptText, conversationHistory = [] } = args;

    try {
        const history = buildHistory(promptText, conversationHistory);
        const result = await runtime.run(history);

        if (result.truncated) {
            LoggerService.warn("Agent loop was truncated", {
                iterations: result.iterations,
                promptText,
            });
        }

        LoggerService.info("generateAnswer", {
            promptText,
            iterations: result.iterations,
            truncated: result.truncated,
        });

        return result.answer;
    } catch (error) {
        LoggerService.logError(error as Error, "generateAnswer", {
            promptText,
        });
        return ERROR_FALLBACK;
    }
}

export const aiService = {
    generateAnswer,
};

export { ConversationHistory } from "./agent";


