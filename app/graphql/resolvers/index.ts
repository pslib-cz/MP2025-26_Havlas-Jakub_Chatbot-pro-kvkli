import { conversationResolvers } from "./conversation.resolver";
import { crawlResolvers } from "./crawl.resolver";
import { promptResolvers } from "./prompt.resolver";
import { authResolvers } from "./auth.resolver";

export const resolvers = {
  Query: {
    ...conversationResolvers.Query,
    ...crawlResolvers.Query,
    ...promptResolvers.Query,
    ...authResolvers.Query,
  },
  Mutation: {
    ...conversationResolvers.Mutation,
    ...crawlResolvers.Mutation,
    ...promptResolvers.Mutation,
    ...authResolvers.Mutation,
  },
  // Field resolver: Prisma returns Date objects, GraphQL schema expects String
  Prompt: {
    createdAt: (parent: { createdAt?: Date | string | null }) =>
      parent.createdAt instanceof Date
        ? parent.createdAt.toISOString()
        : parent.createdAt ?? null,
  },
};
