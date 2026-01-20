export type FeedbackData = {
  addPrompt: {
    conversationId: number;
    promptNth: number;
    userFeedback: boolean;
  };
};

export type AddPromptData = {
  addPrompt: {
    conversationId: number;
    prompt: {
      promptId: number;
      promptText: string;
      answerText: string;
    };
  };
};
