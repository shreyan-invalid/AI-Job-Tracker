import OpenAI from "openai";
import { z } from "zod";

const SYSTEM_PROMPT = `You are an expert resume parsing system used in a recruitment platform.

Your task is to extract structured information from resumes.

Rules:

1. Only return valid JSON.
2. Do not include explanations.
3. If information is missing return null.
4. Normalize skill names (React.js -> React).
5. Detect skills even if they appear outside the Skills section.
6. Extract experience entries even if formatting is inconsistent.
7. Handle both single-column and two-column resumes.`;

const USER_PROMPT_TEMPLATE = `Extract structured resume information from the following resume text.

Return JSON with this exact schema:

{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "skills": string[],
  "experience": [
    {
      "company": string | null,
      "title": string | null,
      "start_date": string | null,
      "end_date": string | null,
      "description": string | null
    }
  ],
  "education": [
    {
      "institution": string | null,
      "degree": string | null,
      "field": string | null,
      "start_date": string | null,
      "end_date": string | null
    }
  ],
  "summary": string | null
}

Resume text:

"""
{{resumeText}}
"""`;

const experienceSchema = z
  .object({
    company: z.string().nullable(),
    title: z.string().nullable(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    description: z.string().nullable()
  })
  .strict();

const educationSchema = z
  .object({
    institution: z.string().nullable(),
    degree: z.string().nullable(),
    field: z.string().nullable(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable()
  })
  .strict();

const aiResumeSchema = z
  .object({
    name: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
    skills: z.array(z.string()),
    experience: z.array(experienceSchema),
    education: z.array(educationSchema),
    summary: z.string().nullable()
  })
  .strict();

export type ParsedResume = z.infer<typeof aiResumeSchema>;

const SKILL_NORMALIZATION_ENTRIES: Array<[string, string]> = [
  ["reactjs", "React"],
  ["react.js", "React"],
  ["react", "React"],
  ["nextjs", "Next.js"],
  ["next.js", "Next.js"],
  ["nodejs", "Node.js"],
  ["node.js", "Node.js"],
  ["node", "Node.js"],
  ["aws cloud", "AWS"],
  ["amazon web services", "AWS"],
  ["aws", "AWS"],
  ["typescript", "TypeScript"],
  ["javascript", "JavaScript"],
  ["postgres", "PostgreSQL"],
  ["postgresql", "PostgreSQL"],
  ["mongo", "MongoDB"],
  ["mongodb", "MongoDB"],
  ["k8s", "Kubernetes"],
  ["kubernetes", "Kubernetes"],
  ["redis", "Redis"],
  ["python", "Python"],
  ["docker", "Docker"]
];

const SKILL_NORMALIZATION_MAP = new Map(
  SKILL_NORMALIZATION_ENTRIES.map(([key, value]) => [normalizeLookupKey(key), value])
);

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function normalizeLookupKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9+.#\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNullableString(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSkillName(skill: string): string {
  const key = normalizeLookupKey(skill);
  const mapped = SKILL_NORMALIZATION_MAP.get(key);

  if (mapped) {
    return mapped;
  }

  if (!key) {
    return "";
  }

  return skill.trim();
}

function normalizeSkills(skills: string[]): string[] {
  const unique = new Set<string>();

  for (const skill of skills) {
    const normalized = normalizeSkillName(skill);

    if (!normalized) {
      continue;
    }

    unique.add(normalized);
  }

  return Array.from(unique);
}

function normalizeParsedResume(parsed: ParsedResume): ParsedResume {
  return {
    ...parsed,
    name: normalizeNullableString(parsed.name),
    email: normalizeNullableString(parsed.email)?.toLowerCase() ?? null,
    phone: normalizeNullableString(parsed.phone),
    summary: normalizeNullableString(parsed.summary),
    skills: normalizeSkills(parsed.skills),
    experience: parsed.experience.map((item) => ({
      company: normalizeNullableString(item.company),
      title: normalizeNullableString(item.title),
      start_date: normalizeNullableString(item.start_date),
      end_date: normalizeNullableString(item.end_date),
      description: normalizeNullableString(item.description)
    })),
    education: parsed.education.map((item) => ({
      institution: normalizeNullableString(item.institution),
      degree: normalizeNullableString(item.degree),
      field: normalizeNullableString(item.field),
      start_date: normalizeNullableString(item.start_date),
      end_date: normalizeNullableString(item.end_date)
    }))
  };
}

function extractJsonString(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  }

  return trimmed;
}

function parseJsonContent(content: string): unknown {
  const candidate = extractJsonString(content);

  try {
    return JSON.parse(candidate);
  } catch {
    const firstBrace = candidate.indexOf("{");
    const lastBrace = candidate.lastIndexOf("}");

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const jsonSlice = candidate.slice(firstBrace, lastBrace + 1);
      return JSON.parse(jsonSlice);
    }

    throw new Error("Model response did not contain valid JSON");
  }
}

function ensureEmailShape(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return EMAIL_REGEX.test(value) ? value : null;
}

function buildUserPrompt(resumeText: string): string {
  return USER_PROMPT_TEMPLATE.replace("{{resumeText}}", resumeText);
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  return new OpenAI({ apiKey });
}

async function parseOnce(client: OpenAI, resumeText: string): Promise<ParsedResume> {
  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt(resumeText) }
    ]
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI response did not include content");
  }

  const asJson = parseJsonContent(content);
  const validated = aiResumeSchema.parse(asJson);
  const normalized = normalizeParsedResume(validated);

  return {
    ...normalized,
    email: ensureEmailShape(normalized.email)
  };
}

export async function parseResumeWithAI(resumeText: string): Promise<ParsedResume> {
  const client = getClient();
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await parseOnce(client, resumeText);
    } catch (error) {
      lastError = error;
      if (attempt === 2) {
        break;
      }
    }
  }

  throw new Error(`AI resume parsing failed after retry: ${String(lastError)}`);
}
