import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Conversation {
    conversationId: ID!
    length: Int!
    userFeedback: Boolean
    userFeedbackMessage: String
    prompts: [Prompt!]!
  }

  type Prompt {
    promptId: ID!
    promptText: String!
    answerText: String!
    userFeedback: Boolean
    conversationId: Int!
    conversation: Conversation
  }

  type CrawlProgress {
    status: String!
    phase: String!
    pagesVisited: Int!
    pagesInQueue: Int!
    totalPages: Int!
    chunksCreated: Int!
    chunksToAdd: Int!
    chunksToRemove: Int!
    currentUrl: String
    startTime: Float
    endTime: Float
    error: String
    embeddingsGenerated: Int!
    embeddingsTotal: Int!
    chunksAddedToDB: Int!
    chunksRemovedFromDB: Int!
  }

  type AuthPayload {
    token: String!
  }

  type PaginatedPrompts {
    prompts: [Prompt!]!
    totalCount: Int!
  }

  type Reports {
    positive: Int!
    negative: Int!
    noFeedback: Int!
    total: Int!
  }

  type Query {
    conversations: [Conversation!]!
    conversation(id: ID!): Conversation
    prompts: [Prompt!]!
    paginatedPrompts(offset: Int!, limit: Int!): PaginatedPrompts!
    crawlProgress: CrawlProgress!
    verifyToken: Boolean!
    heartbeat: Boolean!
    reports: Reports!
  }

  type Mutation {
    login(username: String!, password: String!): AuthPayload!
    addPrompt(promptText: String!, conversationId: Int): AddPromptResponse!
    addPromptFeedback(
      conversationId: Int!
      promptNth: Int!
      userFeedback: Boolean!
    ): Prompt!
    addConvoFeedback(
      conversationId: Int!
      userFeedbackMessage: String
      userFeedback: Boolean
    ): Conversation!
    deletePrompt(id: ID!): Int!
    crawlWebsite(url: String): CrawlResponse!
    stopCrawl: Boolean!
  }

  type CrawlResponse {
    success: Boolean!
    message: String!
    pagesCount: Int!
    outputFile: String!
  }

  type AddPromptResponse {
    conversationId: Int!
    prompt: Prompt!
    rateLimited: Boolean!
    remainingMessages: Int!
  }
`;
