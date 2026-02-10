import cron from "node-cron";
import { runWeeklyBookUpdate } from "./addWeeklyBook.service";

/**
 * Schedule weekly book updates
 * Runs every Sunday at 2:00 AM
 */
export function startWeeklyBookScheduler() {
    // Cron format: minute hour day month weekday
    // "0 2 * * 0" = Every Sunday at 2:00 AM
    const schedule = process.env.BOOK_UPDATE_SCHEDULE || "0 2 * * 0";

    console.log(`📅 Scheduling weekly book updates: ${schedule}`);

    cron.schedule(schedule, async () => {
        console.log("\n⏰ Scheduled weekly book update starting...");
        try {
            await runWeeklyBookUpdate();
            console.log("✅ Scheduled update completed successfully");
        } catch (error) {
            console.error("❌ Scheduled update failed:", error);
            // Optionally: send notification/alert
        }
    });

    console.log("✅ Weekly book scheduler started");
}

/**
 * Run update immediately (for manual triggers)
 */
export async function triggerManualUpdate() {
    console.log("🔧 Manual update triggered");
    return runWeeklyBookUpdate();
}
