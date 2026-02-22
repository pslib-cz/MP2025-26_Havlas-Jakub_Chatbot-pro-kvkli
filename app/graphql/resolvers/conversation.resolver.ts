import { prismaService } from "../services/prisma.service";
import { AddConvoFeedbackArgs } from "../../types";
import { GraphQLError } from "graphql";

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  // Add your production domain here
  // "https://yourdomain.com"
];

function validateOrigin(context: any) {
  const origin = context?.req?.headers?.origin;
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    throw new GraphQLError("Unauthorized", {
      extensions: { code: "FORBIDDEN" },
    });
  }
}

export const conversationResolvers = {
  Query: {
    conversations: async (_: unknown, __: unknown, context: any) => {
      validateOrigin(context);
      return prismaService.findAllConversations();
    },
    conversation: async (_: unknown, { id }: { id: string }, context: any) => {
      validateOrigin(context);
      return prismaService.findConversationById(id);
    },
  },
  Mutation: {
    addConvoFeedback: async (
      _: unknown,
      { conversationId, userFeedbackMessage, userFeedback }: AddConvoFeedbackArgs,
      context: any
    ) => {
      validateOrigin(context);
      return prismaService.updateConversationFeedback(
        conversationId,
        userFeedbackMessage,
        userFeedback
      );
    },
  },
};