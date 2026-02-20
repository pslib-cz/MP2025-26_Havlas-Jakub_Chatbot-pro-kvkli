import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { startWeeklyBookScheduler, triggerManualUpdate } from '../../app/graphql/services/weeklyBookScheduler';

// Mock node-cron
jest.mock('node-cron', () => ({
    schedule: jest.fn((schedule, callback) => {
        console.log(`Scheduled task with pattern: ${schedule}`);
        return {
            start: jest.fn(),
            stop: jest.fn(),
            destroy: jest.fn(),
        };
    }),
}));

// Mock the book update service
jest.mock('../../app/graphql/services/addWeeklyBook.service', () => ({
    runWeeklyBookUpdate: jest.fn().mockResolvedValue(undefined),
}));

describe('WeeklyBookScheduler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('startWeeklyBookScheduler', () => {
        it('should schedule weekly book updates', () => {
            const cron = require('node-cron');
            
            startWeeklyBookScheduler();
            
            expect(cron.schedule).toHaveBeenCalled();
            
            // Verify the schedule pattern (default or from env)
            const calls = cron.schedule.mock.calls;
            expect(calls.length).toBeGreaterThan(0);
            
            const [schedule] = calls[0];
            expect(typeof schedule).toBe('string');
        });

        it('should use custom schedule from environment variable', () => {
            const customSchedule = '0 3 * * 1'; // Monday at 3 AM
            process.env.BOOK_UPDATE_SCHEDULE = customSchedule;
            
            const cron = require('node-cron');
            
            startWeeklyBookScheduler();
            
            const calls = cron.schedule.mock.calls;
            const [schedule] = calls[calls.length - 1];
            
            expect(schedule).toBe(customSchedule);
        });

        it('should use default schedule when env var is not set', () => {
            delete process.env.BOOK_UPDATE_SCHEDULE;
            
            const cron = require('node-cron');
            
            startWeeklyBookScheduler();
            
            const calls = cron.schedule.mock.calls;
            const [schedule] = calls[calls.length - 1];
            
            // Default is "0 2 * * 0" (Sunday at 2 AM)
            expect(schedule).toBe('0 2 * * 0');
        });

        it('should handle errors in scheduled task', async () => {
            const { runWeeklyBookUpdate } = require('../../app/graphql/services/addWeeklyBook.service');
            runWeeklyBookUpdate.mockRejectedValueOnce(new Error('Test error'));
            
            const cron = require('node-cron');
            
            startWeeklyBookScheduler();
            
            // Get the callback function
            const calls = cron.schedule.mock.calls;
            const [, callback] = calls[calls.length - 1];
            
            // Execute the callback
            await expect(callback()).resolves.not.toThrow();
        });
    });

    describe('triggerManualUpdate', () => {
        it('should trigger manual update', async () => {
            const { runWeeklyBookUpdate } = require('../../app/graphql/services/addWeeklyBook.service');
            
            await triggerManualUpdate();
            
            expect(runWeeklyBookUpdate).toHaveBeenCalled();
        });

        it('should handle errors in manual update', async () => {
            const { runWeeklyBookUpdate } = require('../../app/graphql/services/addWeeklyBook.service');
            runWeeklyBookUpdate.mockRejectedValueOnce(new Error('Manual update failed'));
            
            await expect(triggerManualUpdate()).rejects.toThrow('Manual update failed');
        });

        it('should return result from runWeeklyBookUpdate', async () => {
            const { runWeeklyBookUpdate } = require('../../app/graphql/services/addWeeklyBook.service');
            const mockResult = { success: true, recordsProcessed: 100 };
            runWeeklyBookUpdate.mockResolvedValueOnce(mockResult);
            
            const result = await triggerManualUpdate();
            
            expect(result).toEqual(mockResult);
        });
    });

    describe('Cron Pattern Validation', () => {
        it('should accept valid cron patterns', () => {
            const validPatterns = [
                '0 2 * * 0',     // Every Sunday at 2 AM
                '0 0 * * *',     // Every day at midnight
                '*/30 * * * *',  // Every 30 minutes
                '0 9-17 * * 1-5', // Business hours on weekdays
            ];

            const cron = require('node-cron');

            validPatterns.forEach((pattern) => {
                process.env.BOOK_UPDATE_SCHEDULE = pattern;
                expect(() => startWeeklyBookScheduler()).not.toThrow();
            });
        });
    });
});
