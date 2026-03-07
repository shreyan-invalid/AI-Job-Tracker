import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { extractSkills } from "@/lib/skillExtractor";

export type ResumeFileType = "pdf" | "docx";

export type ExperienceItem = {
  title: string;
  company?: string;
};

export type EducationItem = {
  degree: string;
  institution?: string;
};

export type StructuredResumeData = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
};

const EXPERIENCE_HEADINGS = [
  "experience",
  "work experience",
  "employment history",
  "professional experience"
];

const EDUCATION_HEADINGS = ["education", "academic background", "academic qualifications"];

const SECTION_HEADINGS = [
  ...EXPERIENCE_HEADINGS,
  ...EDUCATION_HEADINGS,
  "skills",
  "projects",
  "certifications",
  "summary",
  "profile"
];

function cleanPlainText(value: string): string {
  return value
    .replace(/\u0000/g, " ")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00A0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractResumeText(buffer: Buffer, fileType: ResumeFileType): Promise<string> {
  if (fileType === "pdf") {
    const parsedPdf = await pdfParse(buffer);
    return cleanPlainText(parsedPdf.text || "");
  }

  if (fileType === "docx") {
    const parsedDoc = await mammoth.extractRawText({ buffer });
    return cleanPlainText(parsedDoc.value || "");
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

function getLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function inferName(lines: string[]): string | null {
  for (const line of lines.slice(0, 8)) {
    if (line.length < 2 || line.length > 60) {
      continue;
    }

    if (/@/.test(line) || /\d/.test(line) || /[:|]/.test(line)) {
      continue;
    }

    if (/\b(resume|curriculum|vitae|experience|education|skills|summary|profile)\b/i.test(line)) {
      continue;
    }

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 4) {
      return line;
    }
  }

  return null;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/);
  return match ? match[0] : null;
}

function isSectionHeading(line: string): boolean {
  const normalized = line.toLowerCase().replace(/[:\-\s]+$/g, "").trim();
  return SECTION_HEADINGS.includes(normalized);
}

function sectionLines(lines: string[], headings: string[]): string[] {
  let startIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    const normalized = lines[index].toLowerCase().replace(/[:\-\s]+$/g, "").trim();
    if (headings.includes(normalized)) {
      startIndex = index + 1;
      break;
    }
  }

  if (startIndex < 0) {
    return [];
  }

  const collected: string[] = [];

  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    if (isSectionHeading(line)) {
      break;
    }
    collected.push(line);
  }

  return collected;
}

function parseExperienceLine(line: string): ExperienceItem | null {
  const cleaned = line.replace(/^[•\-*]\s*/, "").trim();

  const atMatch = cleaned.match(/^(.{2,80})\s+(?:at|@)\s+(.{2,80})$/i);
  if (atMatch) {
    return { title: atMatch[1].trim(), company: atMatch[2].trim() };
  }

  const splitByPipeOrDash = cleaned.split(/\s(?:\||-)\s/).map((part) => part.trim());
  if (splitByPipeOrDash.length >= 2 && splitByPipeOrDash[0].length > 1) {
    return {
      title: splitByPipeOrDash[0],
      company: splitByPipeOrDash[1]
    };
  }

  if (/\b(engineer|developer|manager|analyst|consultant|specialist|intern)\b/i.test(cleaned)) {
    return { title: cleaned };
  }

  return null;
}

function parseEducationLine(line: string): EducationItem | null {
  const cleaned = line.replace(/^[•\-*]\s*/, "").trim();

  const hasDegreeKeyword =
    /\b(bachelor|master|phd|b\.tech|m\.tech|b\.sc|m\.sc|mba|associate|diploma|certificate)\b/i.test(
      cleaned
    );

  if (!hasDegreeKeyword) {
    return null;
  }

  const parts = cleaned.split(/\s(?:\||-|,)\s/).map((part) => part.trim());

  if (parts.length >= 2) {
    return {
      degree: parts[0],
      institution: parts[1]
    };
  }

  return { degree: cleaned };
}

function uniqueExperience(items: ExperienceItem[]): ExperienceItem[] {
  const seen = new Set<string>();
  const unique: ExperienceItem[] = [];

  for (const item of items) {
    const key = `${item.title.toLowerCase()}|${item.company?.toLowerCase() ?? ""}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

function uniqueEducation(items: EducationItem[]): EducationItem[] {
  const seen = new Set<string>();
  const unique: EducationItem[] = [];

  for (const item of items) {
    const key = `${item.degree.toLowerCase()}|${item.institution?.toLowerCase() ?? ""}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  return unique;
}

export function parseStructuredResumeData(
  text: string,
  preExtractedSkills?: string[]
): StructuredResumeData {
  const cleanText = cleanPlainText(text);
  const lines = getLines(cleanText);

  const skills = preExtractedSkills ?? extractSkills(cleanText);

  const experienceSection = sectionLines(lines, EXPERIENCE_HEADINGS);
  const educationSection = sectionLines(lines, EDUCATION_HEADINGS);

  const parsedExperience = uniqueExperience(
    (experienceSection.length > 0 ? experienceSection : lines)
      .map(parseExperienceLine)
      .filter((value): value is ExperienceItem => Boolean(value))
      .slice(0, 12)
  );

  const parsedEducation = uniqueEducation(
    (educationSection.length > 0 ? educationSection : lines)
      .map(parseEducationLine)
      .filter((value): value is EducationItem => Boolean(value))
      .slice(0, 8)
  );

  return {
    name: inferName(lines),
    email: extractEmail(cleanText),
    phone: extractPhone(cleanText),
    skills,
    experience: parsedExperience,
    education: parsedEducation
  };
}
