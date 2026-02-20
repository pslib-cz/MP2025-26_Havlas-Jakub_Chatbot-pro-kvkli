import { jest } from '@jest/globals';

// Mock environment variables
process.env.OPENAI_API_KEY = 'test-api-key';
process.env.CHROMA_HOST = 'localhost';
process.env.CHROMA_PORT = '8000';
process.env.BOOK_UPDATE_SCHEDULE = '0 2 * * 0';

// Global test timeout
jest.setTimeout(30000);
