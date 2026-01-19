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
