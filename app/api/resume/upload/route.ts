import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { parseResumeWithAI, type ParsedResume } from "@/lib/aiResumeParser";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cleanText } from "@/lib/resumeParser/cleanText";
import { detectLayout } from "@/lib/resumeParser/detectLayout";
import type { ResumeFileType } from "@/lib/resumeParser/extractText";
import { extractText } from "@/lib/resumeParser/extractText";
import { normalizeColumns } from "@/lib/resumeParser/normalizeColumns";
import { parseStructuredResumeData } from "@/lib/resumeParser";
import { detectSections } from "@/lib/resumeParser/detectSections";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;

const SUPPORTED_MIME_TYPES = {
  pdf: new Set(["application/pdf"]),
  docx: new Set(["application/vnd.openxmlformats-officedocument.wordprocessingml.document"])
};

function getFileType(file: File): ResumeFileType | null {
  const mimeType = file.type.toLowerCase();
  const extension = path.extname(file.name).toLowerCase();

  if (SUPPORTED_MIME_TYPES.pdf.has(mimeType) || extension === ".pdf") {
    return "pdf";
  }

  if (SUPPORTED_MIME_TYPES.docx.has(mimeType) || extension === ".docx") {
    return "docx";
  }

  return null;
}

function extensionForType(fileType: ResumeFileType): string {
  return fileType === "pdf" ? ".pdf" : ".docx";
}

function buildHeuristicFallback(parsedText: string): ParsedResume {
  const legacy = parseStructuredResumeData(parsedText);
  const sections = detectSections(parsedText);

  return {
    name: legacy.name,
    email: legacy.email,
    phone: legacy.phone,
    skills: legacy.skills,
    experience: legacy.experience.map((item) => ({
      company: item.company ?? null,
      title: item.title ?? null,
      start_date: null,
      end_date: null,
      description: null
    })),
    education: legacy.education.map((item) => ({
      institution: item.institution ?? null,
      degree: item.degree ?? null,
      field: null,
      start_date: null,
      end_date: null
    })),
    summary: sections.summary
  };
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true }
    });

    if (!existingUser) {
      return NextResponse.json(
        { message: "Session is invalid for this database. Please log in again." },
        { status: 401 }
      );
    }

    const userId = existingUser.id;
    const resumeCount = await prisma.resume.count({
      where: { userId }
    });

    if (resumeCount >= 3) {
      return NextResponse.json(
        { message: "Resume upload limit reached. Maximum 3 resumes allowed." },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ message: "A resume file is required." }, { status: 400 });
    }

    if (file.size <= 0) {
      return NextResponse.json({ message: "Uploaded file is empty." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { message: "File is too large. Maximum allowed size is 8MB." },
        { status: 400 }
      );
    }

    const fileType = getFileType(file);

    if (!fileType) {
      return NextResponse.json(
        { message: "Unsupported file type. Only PDF and DOCX are allowed." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const fileBuffer = Buffer.from(bytes);

    const storageDir = process.env.RESUME_STORAGE_DIR || path.join("/tmp", "ai-job-matcher", "resumes");
    await mkdir(storageDir, { recursive: true });

    const storedFileName = `${randomUUID()}${extensionForType(fileType)}`;
    const storedFilePath = path.join(storageDir, storedFileName);

    await writeFile(storedFilePath, fileBuffer);

    const extracted = await extractText(fileBuffer, fileType);
    const layoutDetails = detectLayout(extracted.blocks);
    const normalized = normalizeColumns(extracted, layoutDetails);
    const parsedText = cleanText(normalized.normalizedText || extracted.rawText);

    if (!parsedText) {
      return NextResponse.json(
        { message: "Unable to extract readable text from the resume." },
        { status: 422 }
      );
    }

    let structuredData: ParsedResume;
    let parserMode: "ai" | "heuristic-fallback" = "ai";

    try {
      structuredData = await parseResumeWithAI(parsedText);
    } catch (aiError) {
      console.error("AI parser failed, using heuristic fallback", aiError);
      structuredData = buildHeuristicFallback(parsedText);
      parserMode = "heuristic-fallback";
    }

    const resume = await prisma.resume.create({
      data: {
        userId,
        fileUrl: `file://${storedFilePath}`,
        parsedText,
        structuredData: structuredData as Prisma.InputJsonValue,
        skills: structuredData.skills
      }
    });

    return NextResponse.json(
      {
        message: "Resume uploaded and parsed successfully.",
        data: {
          id: resume.id,
          userId: resume.userId,
          fileUrl: resume.fileUrl,
          layout: layoutDetails.layout,
          parser: parserMode,
          skills: structuredData.skills,
          structuredData
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Resume upload error", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
