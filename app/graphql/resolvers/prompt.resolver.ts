import { prismaService } from "../services/prisma.service";
import { aiService } from "../services/ai.service";
import { AddPromptArgs, AddPromptFeedbackArgs, PaginatedPromptsArgs, DeletePromptArgs, ConversationHistoryEntry, AddConvoFeedbackArgs } from "../../types";
import { withAuth } from "../utils/resolver.utils";

export const promptResolvers = {
    Query: {
        prompts: withAuth(async () => prismaService.findAllPrompts()),
        paginatedPrompts: withAuth(async (_: unknown, { offset, limit }: PaginatedPromptsArgs) => {
            const [prompts, totalCount] = await Promise.all([
                prismaService.findPaginatedPrompts(offset, limit),
                prismaService.countPrompts(),
            ]);
            return { prompts, totalCount };
        }),
        reports: withAuth(async () => prismaService.getReports()),
    },
    Mutation: {
        addPrompt: async (
            _: unknown,
            { promptText, conversationId }: AddPromptArgs,
        ) => {
            let conversationHistory: ConversationHistoryEntry[] = [];
            
            if (conversationId) {
                const conversation = await prismaService.findConversationById(
                    conversationId.toString()
                );
                
                if (conversation?.prompts) {
                    conversationHistory = conversation.prompts
                        .slice(-5)
                        .filter(p => p.promptText && p.answerText)
                        .map(p => ({
                            question: p.promptText,
                            answer: p.answerText
                        }));
                }
            }

            const answerText = await aiService.generateAnswer({ 
                promptText,
                conversationHistory 
            });

            const { conversationId: newConversationId, prompt } =
                await prismaService.addPrompt({
                    promptText,
                    answerText,
                    conversationId,
                } satisfies AddPromptArgs);

            return {
                conversationId: newConversationId,
                prompt,
            };
        },

        addPromptFeedback: async (
            _: unknown,
            { conversationId, promptNth, userFeedback }: AddPromptFeedbackArgs,
        ) => {
            return prismaService.addPromptFeedback({
                conversationId,
                promptNth,
                userFeedback,
            });
        },

        deletePrompt: withAuth(async (_: unknown, { id }: DeletePromptArgs) =>
            prismaService.deletePrompt(Number(id))
        ),

        addConvoFeedback: async (
            _: unknown,
            { conversationId, userFeedbackMessage, userFeedback }: AddConvoFeedbackArgs,
        ) => {
            return prismaService.updateConversationFeedback(
                conversationId,
                userFeedbackMessage,
                userFeedback ?? null,
            );
        },
    },
};
