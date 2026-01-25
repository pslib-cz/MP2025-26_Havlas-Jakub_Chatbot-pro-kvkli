import { conversationResolvers } from "./conversation.resolver";
import { crawlResolvers } from "./crawl.resolver";
import { promptResolvers } from "./prompt.resolver";

export const resolvers = {
  Query: {
    ...conversationResolvers.Query,
    ...crawlResolvers.Query,
    ...promptResolvers.Query,
  },
  Mutation: {
    ...conversationResolvers.Mutation,
    ...crawlResolvers.Mutation,
    ...promptResolvers.Mutation,
  },
};
