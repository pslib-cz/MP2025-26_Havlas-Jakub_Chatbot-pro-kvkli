import { prismaService } from "../services/prisma.service";
import { aiService } from "../services/ai.service";
import { AddPromptArgs, AddPromptFeedbackArgs, PaginatedPromptsArgs, DeletePromptArgs, ConversationHistoryEntry, AddConvoFeedbackArgs, AuthContext } from "../../types";
import { withAuth } from "../utils/resolver.utils";
import { promptRateLimiter } from "../middleware/rateLimiter";

const RATE_LIMITED_MESSAGE = "Dosáhli jste maximálního počtu dotazů. Zkuste to prosím později.";

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
            context: AuthContext,
        ) => {
            // ── Rate limit check ──────────────────────────────────────────
            const clientIp = context.clientIp ?? "unknown";
            const rateCheck = promptRateLimiter.check(clientIp);

            if (!rateCheck.allowed) {
                // Return a polite rate-limited response instead of throwing
                const placeholderPrompt = await prismaService.addPrompt({
                    promptText,
                    answerText: RATE_LIMITED_MESSAGE,
                    conversationId,
                });

                return {
                    conversationId: placeholderPrompt.conversationId,
                    prompt: placeholderPrompt.prompt,
                    rateLimited: true,
                    remainingMessages: 0,
                };
            }

            // ── Normal flow ───────────────────────────────────────────────
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
                rateLimited: false,
                remainingMessages: rateCheck.remaining,
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

        deleteConversation: withAuth(async (_: unknown, { id }: { id: string }) =>
            prismaService.deleteConversation(Number(id))
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
