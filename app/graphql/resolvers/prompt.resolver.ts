import { prismaService } from "../services/prisma.service";
import { aiService } from "../services/ai.service";
import { AddPromptArgs, AddPromptFeedbackArgs } from "../../types";
import { promptService } from "graphql/services/prompt.service";

export const promptResolvers = {
    Query: {
        prompts: async () => {
            return prismaService.findAllPrompts();
        },
    },
    Mutation: {
        addPrompt: async (
            _: unknown,
            { promptText, conversationId }: AddPromptArgs,
        ) => {
            // Get conversation history if conversationId exists
            let conversationHistory: Array<{ question: string; answer: string }> = [];
            
            if (conversationId) {
                const conversation = await prismaService.findConversationById(
                    conversationId.toString()
                );
                
                if (conversation?.prompts) {
                    // Get last 5 exchanges for context (to avoid token limits)
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
                    conversationId,
                });

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

        deletePrompt: async (_: unknown, { id }: { id: string }) => {
            return prismaService.deletePrompt(Number(id));
        },
    },
};
