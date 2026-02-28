import { gql } from "@apollo/client";

export const LOGIN = gql`
  mutation Login($username: String!, $password: String!) {
    login(username: $username, password: $password) {
      token
    }
  }
`;

export const GET_PAGINATED_PROMPTS = gql`
  query GetPaginatedPrompts($offset: Int!, $limit: Int!) {
    paginatedPrompts(offset: $offset, limit: $limit) {
      prompts {
        conversationId
        promptId
        promptText
        answerText
        userFeedback
        conversation {
          userFeedback
          userFeedbackMessage
        }
      }
      totalCount
    }
  }
`;

export const GET_ALL_PROMPTS = gql`
  query GetAllPrompts {
    prompts {
      conversationId
      promptId
      promptText
      answerText
      userFeedback
      conversation {
        userFeedback
        userFeedbackMessage
      }
    }
  }
`;

export const GET_REPORTS = gql`
  query GetReports {
    reports {
      positive
      negative
      noFeedback
      total
    }
  }
`;

export const DELETE_PROMPT = gql`
  mutation DeletePrompt($id: ID!) {
    deletePrompt(id: $id)
  }
`;

export const PAGE_SIZE = 50;
