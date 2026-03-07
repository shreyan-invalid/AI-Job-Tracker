const JOB_SKILL_DICTIONARY = [
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

export function extractJobSkills(description: string): string[] {
  const text = description.toLowerCase();
  const matched = JOB_SKILL_DICTIONARY.filter((skill) => {
    const pattern = new RegExp(`\\b${escapeRegex(skill.toLowerCase())}\\b`, "i");
    return pattern.test(text);
  });

  return Array.from(new Set(matched));
}

export { JOB_SKILL_DICTIONARY };
