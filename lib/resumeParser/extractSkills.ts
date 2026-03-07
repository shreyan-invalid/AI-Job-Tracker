import type { ResumeSections } from "@/lib/resumeParser/detectSections";

const SKILL_DICTIONARY = [
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "AWS",
  "Docker",
  "PostgreSQL",
  "TypeScript",
  "JavaScript",
  "MongoDB",
  "Kubernetes",
  "Redis"
] as const;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsKeyword(text: string, keyword: string): boolean {
  const pattern = new RegExp(`(?<![A-Za-z0-9+])${escapeRegex(keyword)}(?![A-Za-z0-9+])`, "i");
  return pattern.test(text);
}

export function extractSkills(fullText: string, sections: ResumeSections): string[] {
  const source = `${sections.skills ?? ""}\n${fullText}`;

  const matches = SKILL_DICTIONARY.filter((skill) => containsKeyword(source, skill));

  return Array.from(new Set(matches));
}

export { SKILL_DICTIONARY };
