import { prismaService } from "../services/prisma.service";
import { AddConvoFeedbackArgs, FindConversationArgs } from "../../types";
import { GraphQLError } from "graphql";
import { withAuth } from "../utils/resolver.utils";



export const conversationResolvers = {
    Query: {
        conversations: withAuth(async () => {
            return prismaService.findAllConversations();
        }),
        conversation: withAuth(async (
            _: unknown,
            { id }: FindConversationArgs,
        ) => {
            return prismaService.findConversationById(id);
        }),
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
