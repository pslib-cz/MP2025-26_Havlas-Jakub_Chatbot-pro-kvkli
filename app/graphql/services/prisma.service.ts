import { prisma } from "../../lib/prisma";
import { log, logError } from "../../lib/logger";

const SERVICE = "prisma";

export const prismaService = {
    // Conversation operations
    async findAllConversations() {
        log(SERVICE, "findAllConversations called");
        try {
            const result = await prisma.conversation.findMany({
                include: { prompts: true },
            });
            log(SERVICE, `findAllConversations returned ${result.length} records`);
            return result;
        } catch (error) {
            logError(SERVICE, "findAllConversations failed", error);
            throw error;
        }
    },

    async findConversationById(id: string) {
        log(SERVICE, "findConversationById called");
        try {
            const result = await prisma.conversation.findUnique({
                where: { conversationId: Number(id) },
                include: { prompts: true },
            });
            log(SERVICE, `findConversationById returned ${result ? 1 : 0} record`);
            return result;
        } catch (error) {
            logError(SERVICE, "findConversationById failed", error);
            throw error;
        }
    },

    async updateConversationFeedback(
        conversationId: number,
        userFeedbackMessage: string | undefined,
        userFeedback: boolean | null,
    ) {
        log(SERVICE, "updateConversationFeedback called");
        try {
            const result = await prisma.conversation.update({
                where: { conversationId },
                data: {
                    userFeedback,
                    userFeedbackMessage,
                },
                include: { prompts: true },
            });
            log(SERVICE, `updateConversationFeedback returned ${result ? 1 : 0} record`);
            return result;
        } catch (error) {
            logError(SERVICE, "updateConversationFeedback failed", error);
            throw error;
        }
    },

    // Prompt operations
    async findPaginatedPrompts(offset: number, limit: number) {
        log(SERVICE, "findPaginatedPrompts called");
        try {
            const result = await prisma.prompt.findMany({
                orderBy: { promptId: "desc" },
                skip: offset,
                take: limit,
                include: { conversation: true },
            });
            log(SERVICE, `findPaginatedPrompts returned ${result.length} records`);
            return result;
        } catch (error) {
            logError(SERVICE, "findPaginatedPrompts failed", error);
            throw error;
        }
    },

    async countPrompts() {
        log(SERVICE, "countPrompts called");
        try {
            const result = await prisma.prompt.count();
            log(SERVICE, `countPrompts returned ${result} records`);
            return result;
        } catch (error) {
            logError(SERVICE, "countPrompts failed", error);
            throw error;
        }
    },

    async findAllPrompts() {
        log(SERVICE, "findAllPrompts called");
        try {
            const result = await prisma.prompt.findMany({
                orderBy: { promptId: "desc" },
                include: { conversation: true },
            });
            log(SERVICE, `findAllPrompts returned ${result.length} records`);
            return result;
        } catch (error) {
            logError(SERVICE, "findAllPrompts failed", error);
            throw error;
        }
    },

    async deletePrompt(id: number) {
        log(SERVICE, "deletePrompt called");
        try {
            const result = await prisma.prompt.delete({
                where: { promptId: Number(id) },
            });
            log(SERVICE, `deletePrompt returned ${result ? 1 : 0} record`);
            return result.promptId;
        } catch (error) {
            logError(SERVICE, "deletePrompt failed", error);
            throw error;
        }
    },
};
