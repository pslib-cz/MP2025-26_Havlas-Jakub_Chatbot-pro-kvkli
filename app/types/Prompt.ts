export type Prompt = {
  promptId: number;
  conversationId: number;
  promptText: string;
  answerText: string;
  userFeedback: boolean | null;
  createdAt?: string | null;
  conversation?: {
    userFeedback: boolean | null;
    userFeedbackMessage: string | null;
  } | null;
};
