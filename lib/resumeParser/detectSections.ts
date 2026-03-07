export type ResumeSections = {
  summary: string | null;
  skills: string | null;
  experience: string | null;
  education: string | null;
  projects: string | null;
  certifications: string | null;
};

const SECTION_ALIASES: Record<keyof ResumeSections, string[]> = {
  summary: ["summary", "professional summary", "profile", "about"],
  skills: ["skills", "technical skills", "core skills", "tech stack"],
  experience: [
    "experience",
    "work experience",
    "professional experience",
    "employment history"
  ],
  education: ["education", "academic background", "academic qualifications"],
  projects: ["projects", "personal projects", "academic projects"],
  certifications: ["certifications", "licenses", "certificates"]
};

const EMPTY_SECTIONS: ResumeSections = {
  summary: null,
  skills: null,
  experience: null,
  education: null,
  projects: null,
  certifications: null
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeHeading(line: string): string {
  return line.toLowerCase().replace(/[^a-z0-9+.# ]/g, " ").replace(/\s+/g, " ").trim();
}

function isLikelyUnknownHeading(line: string): boolean {
  const trimmed = line.trim();

  if (!trimmed || trimmed.length > 45) {
    return false;
  }

  // ALL CAPS style headings: ACHIEVEMENTS, INTERESTS, LANGUAGES, etc.
  const alphaOnly = trimmed.replace(/[^A-Za-z ]/g, "").trim();
  const wordCount = alphaOnly.split(/\s+/).filter(Boolean).length;
  const isUppercaseHeading = alphaOnly.length >= 4 && alphaOnly === alphaOnly.toUpperCase();

  if (isUppercaseHeading && wordCount >= 1 && wordCount <= 4) {
    return true;
  }

  // Title case short headings not in known aliases.
  const isTitleLike = /^[A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,3}$/.test(trimmed);
  return isTitleLike;
}

export function detectSectionKey(line: string): keyof ResumeSections | null {
  const normalized = normalizeHeading(line);

  for (const [key, aliases] of Object.entries(SECTION_ALIASES) as [keyof ResumeSections, string[]][]) {
    if (aliases.some((alias) => normalized === alias || normalized === `${alias} section`)) {
      return key;
    }
  }

  return null;
}

function detectSectionStart(line: string): { key: keyof ResumeSections; remainder: string } | null {
  const trimmed = line.trim();

  for (const [key, aliases] of Object.entries(SECTION_ALIASES) as [keyof ResumeSections, string[]][]) {
    for (const alias of aliases) {
      const aliasPattern = escapeRegex(alias);
      const exact = new RegExp(`^${aliasPattern}\\s*$`, "i");

      if (exact.test(trimmed)) {
        return { key, remainder: "" };
      }

      const inline = new RegExp(`^${aliasPattern}(?:\\s*[:\\-|]\\s*|\\s+)(.+)$`, "i");
      const inlineMatch = trimmed.match(inline);

      if (inlineMatch?.[1]) {
        const remainder = inlineMatch[1].trim();
        return { key, remainder };
      }
    }
  }

  return null;
}

export function detectSections(text: string): ResumeSections {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const buckets: Record<keyof ResumeSections, string[]> = {
    summary: [],
    skills: [],
    experience: [],
    education: [],
    projects: [],
    certifications: []
  };

  let currentSection: keyof ResumeSections | null = null;
  let hasKnownSection = false;

  for (const line of lines) {
    const sectionStart = detectSectionStart(line);

    if (sectionStart) {
      currentSection = sectionStart.key;
      hasKnownSection = true;

      if (sectionStart.remainder) {
        buckets[currentSection].push(sectionStart.remainder);
      }

      continue;
    }

    if (isLikelyUnknownHeading(line)) {
      currentSection = null;
      continue;
    }

    if (currentSection) {
      buckets[currentSection].push(line);
    }
  }

  if (!hasKnownSection) {
    // Fallback for non-sectioned resumes.
    const merged = lines.join("\n").trim();
    return {
      ...EMPTY_SECTIONS,
      summary: merged || null
    };
  }

  return {
    summary: buckets.summary.length > 0 ? buckets.summary.join("\n") : EMPTY_SECTIONS.summary,
    skills: buckets.skills.length > 0 ? buckets.skills.join("\n") : EMPTY_SECTIONS.skills,
    experience:
      buckets.experience.length > 0 ? buckets.experience.join("\n") : EMPTY_SECTIONS.experience,
    education: buckets.education.length > 0 ? buckets.education.join("\n") : EMPTY_SECTIONS.education,
    projects: buckets.projects.length > 0 ? buckets.projects.join("\n") : EMPTY_SECTIONS.projects,
    certifications:
      buckets.certifications.length > 0
        ? buckets.certifications.join("\n")
        : EMPTY_SECTIONS.certifications
  };
}
