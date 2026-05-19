import cron from "node-cron";
import { runWeeklyBookUpdate } from "./addWeeklyBook.service";
import { LoggerService } from "./logger.service";

/**
 * Schedule weekly book updates
 * Runs every Sunday at 2:00 AM
 */
export function startWeeklyBookScheduler() {
    // Cron format: minute hour day month weekday
    // "0 2 * * 0" = Every Sunday at 2:00 AM
    const schedule = process.env.BOOK_UPDATE_SCHEDULE || "0 2 * * 0";

    LoggerService.info("Scheduling weekly book updates", { schedule });

    cron.schedule(schedule, async () => {
        LoggerService.info("Scheduled weekly book update starting");
        try {
            await runWeeklyBookUpdate();
            LoggerService.info("Scheduled update completed successfully");
        } catch (error) {
            LoggerService.logError(error as Error, "scheduled weekly book update");
            // Optionally: send notification/alert
        }
    });

    LoggerService.info("Weekly book scheduler started");
}

/**
 * Run update immediately (for manual triggers)
 */
export async function triggerManualUpdate() {
    LoggerService.info("Manual update triggered");
    return runWeeklyBookUpdate();
}
