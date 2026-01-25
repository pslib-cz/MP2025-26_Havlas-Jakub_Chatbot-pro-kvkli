import { promptService } from "../services/prompt.service";
import { prismaService } from "../services/prisma.service";
import { AddPromptArgs, AddPromptFeedbackArgs } from "../../types";

export const promptResolvers = {
    Query: {
        prompts: async () => {
            try {
                const prompts = await prismaService.findAllPrompts();
                return prompts || [];
            } catch (error) {
                console.error("Error fetching prompts:", error);
                return [];
            }
        },
    },
    Mutation: {
        addPrompt: async (_: unknown, args: AddPromptArgs) => {
            return promptService.addPrompt(args);
        },

        addPromptFeedback: async (_: unknown, args: AddPromptFeedbackArgs) => {
            return promptService.addPromptFeedback(args);
        },

        deletePrompt: async (_: unknown, { id }: { id: number }) => {
            return prismaService.deletePrompt(id);
        },
    },
};
