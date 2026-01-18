import { describe, it, expect } from '@jest/globals';
import type { AddPromptData, FeedbackData } from '../types/chatbot';

describe('Chatbot Types', () => {
  describe('AddPromptData', () => {
    it('should have correct structure', () => {
      const mockData: AddPromptData = {
        addPrompt: {
          conversationId: 1,
          prompt: {
            promptId: 1,
            promptText: 'Test prompt',
            answerText: 'Test answer',
          },
        },
      };

      expect(mockData.addPrompt.conversationId).toBe(1);
      expect(mockData.addPrompt.prompt.promptId).toBe(1);
      expect(mockData.addPrompt.prompt.promptText).toBe('Test prompt');
      expect(mockData.addPrompt.prompt.answerText).toBe('Test answer');
    });
  });

  describe('FeedbackData', () => {
    it('should have correct structure for positive feedback', () => {
      const mockFeedback: FeedbackData = {
        addPrompt: {
          conversationId: 1,
          promptNth: 0,
          userFeedback: true,
        },
      };

      expect(mockFeedback.addPrompt.conversationId).toBe(1);
      expect(mockFeedback.addPrompt.promptNth).toBe(0);
      expect(mockFeedback.addPrompt.userFeedback).toBe(true);
    });

    it('should have correct structure for negative feedback', () => {
      const mockFeedback: FeedbackData = {
        addPrompt: {
          conversationId: 1,
          promptNth: 0,
          userFeedback: false,
        },
      };

      expect(mockFeedback.addPrompt.userFeedback).toBe(false);
    });
  });
});
