import { prisma } from "../../lib/prisma";
import LoggerService from "./logger.service";

const SERVICE = "prisma";

export const prismaService = {
    // Conversation operations
    async findAllConversations() {
        LoggerService.info("findAllConversations called", { service: SERVICE });
        try {
            const result = await prisma.conversation.findMany({
                include: { prompts: true },
            });
            LoggerService.info(
                `findAllConversations returned ${result.length} records`,
                { service: SERVICE },
            );
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
        LoggerService.info("findConversationById called", { service: SERVICE });
        try {
            const result = await prisma.conversation.findUnique({
                where: { conversationId: Number(id) },
                include: { prompts: true },
            });
            LoggerService.info(
                `findConversationById returned ${result ? 1 : 0} record`,
                { service: SERVICE },
            );
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
        LoggerService.info("updateConversationFeedback called", {
            service: SERVICE,
        });
        try {
            const result = await prisma.conversation.update({
                where: { conversationId },
                data: {
                    userFeedback,
                    userFeedbackMessage,
                },
                include: { prompts: true },
            });
            LoggerService.info(
                `updateConversationFeedback returned ${result ? 1 : 0} record`,
                { service: SERVICE },
            );
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

    // Prompt operations
    async findPaginatedPrompts(offset: number, limit: number) {
        LoggerService.info("findPaginatedPrompts called", { service: SERVICE });
        try {
            const result = await prisma.prompt.findMany({
                orderBy: { promptId: "desc" },
                skip: offset,
                take: limit,
                include: { conversation: true },
            });
            LoggerService.info(
                `findPaginatedPrompts returned ${result.length} records`,
                { service: SERVICE },
            );
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

    async countPrompts() {
        LoggerService.info("countPrompts called", { service: SERVICE });
        try {
            const result = await prisma.prompt.count();
            LoggerService.info(`countPrompts returned ${result} records`, {
                service: SERVICE,
            });
            return result;
        } catch (error) {
            LoggerService.logError(error as Error, "countPrompts failed", {
                service: SERVICE,
            });
            throw error;
        }
    },

    async findAllPrompts() {
        LoggerService.info("findAllPrompts called", { service: SERVICE });
        try {
            const result = await prisma.prompt.findMany({
                orderBy: { promptId: "desc" },
                include: { conversation: true },
            });
            LoggerService.info(
                `findAllPrompts returned ${result.length} records`,
                { service: SERVICE },
            );
            return result;
        } catch (error) {
            LoggerService.logError(error as Error, "findAllPrompts failed", {
                service: SERVICE,
            });
            throw error;
        }
    },

    async deletePrompt(id: number) {
        LoggerService.info("deletePrompt called", { service: SERVICE });
        try {
            const result = await prisma.prompt.delete({
                where: { promptId: Number(id) },
            });
            LoggerService.info(
                `deletePrompt returned ${result ? 1 : 0} record`,
                { service: SERVICE },
            );
            return result.promptId;
        } catch (error) {
            LoggerService.logError(error as Error, "deletePrompt failed", {
                service: SERVICE,
            });
            throw error;
        }
    },
};
