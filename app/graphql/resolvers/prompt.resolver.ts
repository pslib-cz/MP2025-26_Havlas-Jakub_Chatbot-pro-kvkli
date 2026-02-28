import { prismaService } from "../services/prisma.service";
import { aiService } from "../services/ai.service";
import { AddPromptArgs, AddPromptFeedbackArgs, PaginatedPromptsArgs, DeletePromptArgs, ConversationHistoryEntry } from "../../types";
import { promptService } from "graphql/services/prompt.service";
import { authService } from "../services/auth.service";
import { GraphQLError } from "graphql";

function requireAuth(context: { token?: string }) {
    if (!context.token || !authService.verifyToken(context.token)) {
        throw new GraphQLError("Unauthorized", {
            extensions: { code: "UNAUTHENTICATED" },
        });
    }
}

export const promptResolvers = {
    Query: {
        prompts: async (_: unknown, __: unknown, context: { token?: string }) => {
            requireAuth(context);
            return prismaService.findAllPrompts();
        },
        paginatedPrompts: async (
            _: unknown,
            { offset, limit }: PaginatedPromptsArgs,
            context: { token?: string },
        ) => {
            requireAuth(context);
            const [prompts, totalCount] = await Promise.all([
                prismaService.findPaginatedPrompts(offset, limit),
                prismaService.countPrompts(),
            ]);
            return { prompts, totalCount };
        },
        reports: async (_: unknown, __: unknown, context: { token?: string }) => {
            requireAuth(context);
            return promptService.getReports();
        },
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
                await promptService.addPrompt({
                    promptText,
                    answerText,
                    conversationId,
                } as any);

            return {
                conversationId: newConversationId,
                prompt,
            };
        },

        addPromptFeedback: async (
            _: unknown,
            { conversationId, promptNth, userFeedback }: AddPromptFeedbackArgs,
        ) => {
            return promptService.addPromptFeedback({
                conversationId,
                promptNth,
                userFeedback,
            });
        },

        deletePrompt: async (_: unknown, { id }: DeletePromptArgs, context: { token?: string }) => {
            requireAuth(context);
            return prismaService.deletePrompt(Number(id));
        },

        addConvoFeedback: async (
            _: unknown,
            { conversationId, userFeedbackMessage, userFeedback }: {
                conversationId: number;
                userFeedbackMessage?: string;
                userFeedback?: boolean | null;
            },
        ) => {
            return prismaService.updateConversationFeedback(
                conversationId,
                userFeedbackMessage,
                userFeedback ?? null,
            );
        },
    },
};
