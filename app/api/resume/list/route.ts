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

    const resumes = await prisma.resume.findMany({
      where: {
        userId: session.user.id
      },
      orderBy: {
        createdAt: "desc"
      },
      select: {
        id: true,
        fileUrl: true,
        skills: true,
        createdAt: true
      }
    });

    return NextResponse.json(resumes);
  } catch (error) {
    console.error("Resume list fetch failed", error);
    return NextResponse.json({ message: "Unable to fetch resumes" }, { status: 500 });
  }
}
