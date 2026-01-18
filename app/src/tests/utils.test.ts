import { describe, it, expect } from '@jest/globals';
import { WAITING_MESSAGES } from '../app/components/chatbot/utils';

describe('Chatbot Utils', () => {
  describe('WAITING_MESSAGES', () => {
    it('should contain at least one message', () => {
      expect(WAITING_MESSAGES.length).toBeGreaterThan(0);
    });

    it('should contain only non-empty strings', () => {
      WAITING_MESSAGES.forEach(message => {
        expect(typeof message).toBe('string');
        expect(message.trim().length).toBeGreaterThan(0);
      });
    });

    it('should have the expected messages', () => {
      expect(WAITING_MESSAGES).toContain('Už vařím');
      expect(WAITING_MESSAGES).toContain('Chvilku strpení, prosím');
      expect(WAITING_MESSAGES).toContain('Hledám nejlepší odpověď');
    });
  });
});
