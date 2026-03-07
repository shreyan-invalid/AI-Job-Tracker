import { NextResponse } from "next/server";
import { runJobIngestion } from "@/services/jobFetcher";
import { runUserJobIngestionCron } from "@/services/userJobFetcher";

export const runtime = "nodejs";

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const mode = process.env.JOB_CRON_MODE || "user";
    const result =
      mode === "global"
        ? await runJobIngestion()
        : await runUserJobIngestionCron();

    return NextResponse.json({
      message: `Job ingestion completed in '${mode}' mode`,
      result
    });
  } catch (error) {
    console.error("Cron job ingestion failed", error);
    return NextResponse.json({ message: "Job ingestion failed" }, { status: 500 });
  }
}
