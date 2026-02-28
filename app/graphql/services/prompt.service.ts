import { prisma } from "../../lib/prisma";
import { aiService } from "./ai.service";
import { AddPromptFeedbackArgs } from "../../types";
import LoggerService from "./logger.service";

const MAX_PROMPTS_PER_CONVERSATION = 10;

export const promptService = {
    async getReports() {
        try {
            const [positive, negative, total] = await Promise.all([
                prisma.prompt.count({ where: { userFeedback: true } }),
                prisma.prompt.count({ where: { userFeedback: false } }),
                prisma.prompt.count(),
            ]);

            const noFeedback = total - positive - negative;

            LoggerService.info("Reports fetched", { positive, negative, noFeedback, total });

            return { positive, negative, noFeedback, total };
        } catch (error) {
            LoggerService.logError(error as Error, "getReports");
            throw error;
        }
    },

    async addPrompt({
        promptText,
        answerText,
        conversationId,
    }: {
        promptText: string;
        answerText: string;
        conversationId?: number;
    }) {
        try {
            let convoId = conversationId;

            if (!convoId) {
                const newConvo = await prisma.conversation.create({
                    data: { length: 0 },
                });
                convoId = newConvo.conversationId;
            } else {
                // Check conversation prompt limit
                const promptCount = await prisma.prompt.count({
                    where: { conversationId: convoId },
                });

                if (promptCount >= MAX_PROMPTS_PER_CONVERSATION) {
                    LoggerService.warn("Conversation prompt limit reached", {
                        conversationId: convoId,
                        promptCount,
                    });
                    throw new Error("CONVERSATION_LIMIT_REACHED");
                }
            }

            const prompt = await prisma.prompt.create({
                data: {
                    conversationId: convoId,
                    promptText,
                    answerText: answerText,
                },
            });

            LoggerService.info("Prompt created", {
                conversationId: convoId,
                promptId: prompt.promptId,
            });

            return { conversationId: convoId, prompt };
        } catch (error) {
            LoggerService.logError(error as Error, "addPrompt", {
                promptText,
                conversationId,
            });
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
                LoggerService.warn("Prompt not found for feedback", {
                    conversationId,
                    promptNth,
                });
                throw new Error("Prompt not found.");
            }

            const updated = await prisma.prompt.update({
                where: { promptId: target.promptId },
                data: { userFeedback },
            });

            LoggerService.info("Prompt feedback added", {
                promptId: target.promptId,
                userFeedback,
            });

            return updated;
        } catch (error) {
            LoggerService.logError(error as Error, "addPromptFeedback", {
                conversationId,
                promptNth,
                userFeedback,
            });
            throw error;
        }
    },
};
