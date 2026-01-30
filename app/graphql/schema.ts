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
  }

  type Query {
    conversations: [Conversation!]!
    conversation(id: ID!): Conversation
    prompts: [Prompt!]!
    crawlProgress: CrawlProgress!
  }

  type Mutation {
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
  }
`;
