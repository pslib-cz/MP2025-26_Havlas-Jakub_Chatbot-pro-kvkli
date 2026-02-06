import fs from 'fs';
import path from 'path';

const logDir = path.join(process.cwd(), 'logs');
const MAX_AGE_DAYS = 30;

async function cleanupOldLogs() {
  try {
    if (!fs.existsSync(logDir)) {
      console.log('Logs directory does not exist');
      return;
    }

    const files = fs.readdirSync(logDir);
    const now = Date.now();
    let deletedCount = 0;

    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      
      const filePath = path.join(logDir, file);
      const stats = fs.statSync(filePath);
      const ageInDays = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);

      if (ageInDays > MAX_AGE_DAYS) {
        fs.unlinkSync(filePath);
        console.log(`Deleted old log file: ${file} (${Math.floor(ageInDays)} days old)`);
        deletedCount++;
      }
    }

    console.log(`Cleanup complete. Deleted ${deletedCount} log file(s).`);
  } catch (error) {
    console.error('Error during log cleanup:', error);
  }
}

cleanupOldLogs();
