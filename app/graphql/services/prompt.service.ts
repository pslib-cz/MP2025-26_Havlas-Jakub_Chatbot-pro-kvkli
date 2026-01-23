import { prisma } from "../../lib/prisma";
import { aiService } from "./ai.service";
import { AddPromptFeedbackArgs } from "../../types";
import LoggerService from "./logger.service";

export const promptService = {
    async addPrompt({
        promptText,
        conversationId,
    }: {
        promptText: string;
        conversationId?: number;
    }) {
        try {
            let convoId = conversationId;

            if (!convoId) {
                const newConvo = await prisma.conversation.create({
                    data: { length: 0 },
                });
                convoId = newConvo.conversationId;
            }

            const answer = await aiService.generateWithFaq({ promptText });

            const prompt = await prisma.prompt.create({
                data: {
                    conversationId: convoId,
                    promptText,
                    answerText: answer,
                },
            });

            LoggerService.info("Prompt created", { conversationId: convoId, promptId: prompt.promptId });

            return { conversationId: convoId, prompt };
        } catch (error) {
            LoggerService.logError(error as Error, "addPrompt", { promptText, conversationId });
            throw error;
        }
    },

    async addPromptFeedback({
        conversationId,
        promptNth,
        userFeedback,
    }: AddPromptFeedbackArgs) {
        try {
            const prompts = await prisma.prompt.findMany({
                where: { conversationId },
                orderBy: { promptId: "asc" },
            });

            const target = prompts[promptNth];
            if (!target) {
                LoggerService.warn("Prompt not found for feedback", { conversationId, promptNth });
                throw new Error("Prompt not found.");
            }

            const updated = await prisma.prompt.update({
                where: { promptId: target.promptId },
                data: { userFeedback },
            });

            LoggerService.info("Prompt feedback added", { promptId: target.promptId, userFeedback });

            return updated;
        } catch (error) {
            LoggerService.logError(error as Error, "addPromptFeedback", { conversationId, promptNth, userFeedback });
            throw error;
        }
    },
};
