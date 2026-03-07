import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchJobsForUser } from "@/services/userJobFetcher";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const result = await fetchJobsForUser(session.user.id);

    return NextResponse.json({
      message: "Jobs fetched and linked to user successfully.",
      data: result
    });
  } catch (error) {
    console.error("User job fetch failed", error);

    const message = error instanceof Error ? error.message : "Unable to fetch jobs for user";
    return NextResponse.json({ message }, { status: 500 });
  }
}
