import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import LoggerService from "./logger.service";
import { AddPromptFeedbackArgs } from "../../types";

const SERVICE = "prisma";
const MAX_PROMPTS_PER_CONVERSATION = 10;

export const prismaService = {
    async findAllConversations() {
        try {
            const result = await prisma.conversation.findMany({
                include: { prompts: true },
            });
            return result;
        } catch (error) {
            LoggerService.logError(
                error as Error,
                "findAllConversations failed",
                { service: SERVICE },
            );
            throw error;
        }
    },

    async findConversationById(id: string) {
        try {
            const result = await prisma.conversation.findUnique({
                where: { conversationId: Number(id) },
                include: { prompts: true },
            });
            return result;
        } catch (error) {
            LoggerService.logError(
                error as Error,
                "findConversationById failed",
                { service: SERVICE },
            );
            throw error;
        }
    },

    async updateConversationFeedback(
        conversationId: number,
        userFeedbackMessage: string | undefined,
        userFeedback: boolean | null,
    ) {
        try {
            const result = await prisma.conversation.update({
                where: { conversationId },
                data: {
                    userFeedback,
                },
                include: { prompts: true },
            });
            return result;
        } catch (error) {
            LoggerService.logError(
                error as Error,
                "updateConversationFeedback failed",
                { service: SERVICE },
            );
            throw error;
        }
    },

    buildDateFilter(dateFrom?: string, dateTo?: string): Prisma.PromptWhereInput {
        if (!dateFrom && !dateTo) return {};
        const createdAt: { gte?: Date; lte?: Date } = {};
        if (dateFrom) createdAt.gte = new Date(dateFrom);
        if (dateTo) {
            const end = new Date(dateTo);
            end.setHours(23, 59, 59, 999);
            createdAt.lte = end;
        }
        return { createdAt } as Prisma.PromptWhereInput;
    },

    async findPaginatedPrompts(offset: number, limit: number, dateFrom?: string, dateTo?: string) {
        try {
            const result = await prisma.prompt.findMany({
                where: this.buildDateFilter(dateFrom, dateTo),
                orderBy: { promptId: "desc" },
                skip: offset,
                take: limit,
                include: { conversation: true },
            });
            return result;
        } catch (error) {
            LoggerService.logError(
                error as Error,
                "findPaginatedPrompts failed",
                { service: SERVICE },
            );
            throw error;
        }
    },

    async countPrompts(dateFrom?: string, dateTo?: string) {
        try {
            const result = await prisma.prompt.count({ where: this.buildDateFilter(dateFrom, dateTo) });
            return result;
        } catch (error) {
            LoggerService.logError(error as Error, "countPrompts failed", {
                service: SERVICE,
            });
            throw error;
        }
    },

    async findAllPrompts() {
        try {
            const result = await prisma.prompt.findMany({
                orderBy: { promptId: "desc" },
                include: { conversation: true },
            });
            return result;
        } catch (error) {
            LoggerService.logError(error as Error, "findAllPrompts failed", {
                service: SERVICE,
            });
            throw error;
        }
    },

    async deletePrompt(id: number) {
        try {
            const result = await prisma.prompt.delete({
                where: { promptId: Number(id) },
            });
            return result.promptId;
        } catch (error) {
            LoggerService.logError(error as Error, "deletePrompt failed", {
                service: SERVICE,
            });
            throw error;
        }
    },
    async deleteConversation(id: number) {
        try {
            const result = await prisma.conversation.delete({
                where: { conversationId: Number(id) },
            });
            return result.conversationId;
        } catch (error) {
            LoggerService.logError(error as Error, "deleteConversation failed", {
                service: SERVICE,
            });
            throw error;
        }
    },
    async CreateConversation() {
        return await prisma.conversation.create({
            data: { length: 0 },
        });
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
            if (!conversationId) {
                const newConvo = await prismaService.CreateConversation();
                conversationId = newConvo.conversationId;
            } else {
                const promptCount = await prisma.prompt.count({
                    where: { conversationId: conversationId },
                });

                if (promptCount >= MAX_PROMPTS_PER_CONVERSATION) {
                    LoggerService.warn("Conversation prompt limit reached", {
                        conversationId: conversationId,
                        promptCount,
                    });
                    throw new Error("CONVERSATION_LIMIT_REACHED");
                }
            }

            const prompt = await prismaService.createPrompt(
                conversationId,
                promptText,
                answerText,
            );

            return { conversationId: conversationId, prompt };
        } catch (error) {
            LoggerService.logError(error as Error, "addPrompt", {
                promptText,
                conversationId,
            });
            throw error;
        }
    },
    async createPrompt(
        conversationId: number,
        promptText: string,
        answerText: string,
    ) {
        try {
            const prompt = await prisma.prompt.create({
                data: {
                    conversationId,
                    promptText,
                    answerText,
                },
            });
            return prompt;
        } catch (error) {
            LoggerService.logError(error as Error, "createPrompt failed", {
                service: SERVICE,
                conversationId,
            });
            throw error;
        }
    },

    async getReports(dateFrom?: string, dateTo?: string) {
        try {
            const dateFilter = this.buildDateFilter(dateFrom, dateTo);
            const [positive, negative, total] = await Promise.all([
                prisma.prompt.count({ where: { ...dateFilter, userFeedback: true } }),
                prisma.prompt.count({ where: { ...dateFilter, userFeedback: false } }),
                prisma.prompt.count({ where: { ...dateFilter } }),
            ]);

            const noFeedback = total - positive - negative;

            return { positive, negative, noFeedback, total };
        } catch (error) {
            LoggerService.logError(error as Error, "getReports");
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
