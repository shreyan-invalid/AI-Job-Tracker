import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const jobs = await prisma.job.findMany({
      where: {
        userJobs: {
          some: {
            userId: session.user.id
          }
        }
      },
      orderBy: [{ postedAt: "desc" }, { createdAt: "desc" }],
      take: 50,
      select: {
        id: true,
        title: true,
        company: true,
        location: true,
        applyUrl: true,
        postedAt: true,
        source: true,
        employmentType: true
      }
    });

    return NextResponse.json({ data: jobs });
  } catch (error) {
    console.error("Failed to fetch user jobs", error);
    return NextResponse.json({ message: "Unable to fetch saved jobs" }, { status: 500 });
  }
}
