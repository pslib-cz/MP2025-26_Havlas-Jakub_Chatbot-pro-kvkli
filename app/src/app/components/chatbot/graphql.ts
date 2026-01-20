import { gql } from "@apollo/client";

export const ADD_PROMPT = gql`
  mutation AddPrompt($promptText: String!, $conversationId: Int) {
    addPrompt(promptText: $promptText, conversationId: $conversationId) {
      conversationId
      prompt {
        promptId
        promptText
        answerText
        userFeedback
        conversationId
      }
    }
  }
`;

export const ADD_PROMPT_FEEDBACK = gql`
  mutation AddPromptFeedback($conversationId: Int!, $promptNth: Int!, $userFeedback: Boolean!) {
    addPromptFeedback(conversationId: $conversationId, promptNth: $promptNth, userFeedback: $userFeedback) {
      promptId
      userFeedback
    }
  }
`;
