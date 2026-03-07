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
  "MongoDB"
] as const;

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractSkills(text: string): string[] {
  const normalizedText = text.toLowerCase();
  const matchedSkills: string[] = [];

  for (const skill of SKILL_DICTIONARY) {
    const pattern = new RegExp(`\\b${escapeRegex(skill.toLowerCase())}\\b`, "i");

    if (pattern.test(normalizedText)) {
      matchedSkills.push(skill);
    }
  }

  return matchedSkills;
}

export { SKILL_DICTIONARY };
