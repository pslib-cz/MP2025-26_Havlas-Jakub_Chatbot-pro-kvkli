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
};
