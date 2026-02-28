export type ConversationHistoryEntry = {
  question: string;
  answer: string;
};

export type GenerateAnswerArgs = {
  promptText: string;
  conversationHistory?: ConversationHistoryEntry[];
};
