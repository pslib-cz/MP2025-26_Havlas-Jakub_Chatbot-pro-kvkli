import { prismaService } from "../services/prisma.service";
import { AddConvoFeedbackArgs, FindConversationArgs } from "../../types";
import { GraphQLError } from "graphql";




export const conversationResolvers = {
    Query: {
        conversations: async (_: unknown, __: unknown, context: any) => {
            return prismaService.findAllConversations();
        },
        conversation: async (
            _: unknown,
            { id }: FindConversationArgs,
            context: any,
        ) => {
            return prismaService.findConversationById(id);
        },
    },
    Mutation: {
        addConvoFeedback: async (
            _: unknown,
            {
                conversationId,
                userFeedbackMessage,
                userFeedback,
            }: AddConvoFeedbackArgs,
            context: any,
        ) => {
            return prismaService.updateConversationFeedback(
                conversationId,
                userFeedbackMessage,
                userFeedback,
            );
        },
    },
};
