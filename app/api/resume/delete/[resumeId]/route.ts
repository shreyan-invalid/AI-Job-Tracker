import { unlink } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function getSafeFilePath(fileUrl: string): string | null {
  if (!fileUrl.startsWith("file://")) {
    return null;
  }

  try {
    const filePath = decodeURIComponent(new URL(fileUrl).pathname);
    const storageDir = process.env.RESUME_STORAGE_DIR || path.join("/tmp", "ai-job-matcher", "resumes");

    if (!filePath.startsWith(storageDir)) {
      return null;
    }

    return filePath;
  } catch {
    return null;
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ resumeId: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const { resumeId } = await context.params;

    if (!resumeId) {
      return NextResponse.json({ message: "Resume ID is required." }, { status: 400 });
    }

    const resume = await prisma.resume.findFirst({
      where: {
        id: resumeId,
        userId: session.user.id
      },
      select: {
        id: true,
        fileUrl: true
      }
    });

    if (!resume) {
      return NextResponse.json({ message: "Resume not found." }, { status: 404 });
    }

    await prisma.resume.delete({
      where: {
        id: resume.id
      }
    });

    const filePath = getSafeFilePath(resume.fileUrl);

    if (filePath) {
      try {
        await unlink(filePath);
      } catch (fileDeleteError) {
        const err = fileDeleteError as NodeJS.ErrnoException;

        if (err.code !== "ENOENT") {
          console.error("Failed to delete stored resume file", err);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Resume deletion failed", error);
    return NextResponse.json({ message: "Unable to delete resume" }, { status: 500 });
  }
}
