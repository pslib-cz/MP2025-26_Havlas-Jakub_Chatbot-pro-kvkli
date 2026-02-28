import { prisma } from "../../lib/prisma";

export const prismaService = {
    // Conversation operations
    async findAllConversations() {
        return prisma.conversation.findMany({
            include: { prompts: true },
        });
    },

    async findConversationById(id: string) {
        return prisma.conversation.findUnique({
            where: { conversationId: Number(id) },
            include: { prompts: true },
        });
    },

    async updateConversationFeedback(
        conversationId: number,
        userFeedbackMessage: string | undefined,
        userFeedback: boolean | null,
    ) {
        return prisma.conversation.update({
            where: { conversationId },
            data: {
                userFeedback,
                userFeedbackMessage,
            },
            include: { prompts: true },
        });
    },

    // Prompt operations
    async findPaginatedPrompts(offset: number, limit: number) {
        return prisma.prompt.findMany({
            orderBy: { promptId: "desc" },
            skip: offset,
            take: limit,
            include: { conversation: true },
        });
    },

    async countPrompts() {
        return prisma.prompt.count();
    },

    async findAllPrompts() {
        const prompts = await prisma.prompt.findMany({
            orderBy: { promptId: "desc" },
            include: { conversation: true },
        });
        return prompts || [];
    },

    async deletePrompt(id: number) {
        const deletedPrompt = await prisma.prompt.delete({
            where: { promptId: Number(id) },
        });
        return deletedPrompt.promptId;
    },
};
