import { runUserJobIngestionCron } from "@/services/userJobFetcher";

runUserJobIngestionCron()
  .then((result) => {
    console.log("User job cron ingestion completed", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("User job cron ingestion failed", error);
    process.exit(1);
  });
