import OpenAI from "openai";
import { z } from "zod";

export type ResumeQueryInput = {
  titles: string[];
  skills: string[];
  experience: string | null;
  location: string;
};

const QUERY_SCHEMA = z.object({
  queries: z.array(z.string().min(1)).min(1)
});

const DEFAULT_QUERY_LIMIT = 5;

function getOpenAiClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  return new OpenAI({ apiKey });
}

function normalizeQueries(queries: string[], limit: number): string[] {
  const unique = new Set<string>();

  for (const query of queries) {
    const normalized = query.replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }
    unique.add(normalized);
  }

  return Array.from(unique).slice(0, limit);
}

function buildFallbackQueries(input: ResumeQueryInput, limit: number): string[] {
  const title = input.titles[0] || "Software Engineer";
  const topSkills = input.skills.slice(0, 3);
  const topSkillPhrase = topSkills.join(" ");

  const fallback = [
    `${title} jobs ${input.location}`,
    topSkillPhrase ? `${title} ${topSkillPhrase} jobs ${input.location}` : `${title} jobs in ${input.location}`,
    input.skills.includes("Node.js") && input.skills.includes("React")
      ? `MERN stack developer jobs ${input.location}`
      : `Full stack developer jobs ${input.location}`,
    `Backend Developer jobs ${input.location}`,
    `SDE 2 jobs ${input.location}`
  ];

  return normalizeQueries(fallback, limit);
}

function buildPrompt(input: ResumeQueryInput, limit: number): string {
  return `Generate exactly ${limit} job search queries for a job board.

Rules:
1. Keep each query short and intent-rich.
2. Prioritize role + skill combinations from the resume.
3. Include location in each query.
4. Output ONLY valid JSON with shape: {"queries": ["..."]}

Resume data:
Titles: ${input.titles.join(", ") || "N/A"}
Skills: ${input.skills.join(", ") || "N/A"}
Experience: ${input.experience ?? "N/A"}
Location: ${input.location}`;
}

function extractJson(content: string): unknown {
  const trimmed = content.trim();

  if (trimmed.startsWith("```") && trimmed.endsWith("```")) {
    const inner = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(inner);
  }

  return JSON.parse(trimmed);
}

async function generateWithOpenAI(input: ResumeQueryInput, limit: number): Promise<string[]> {
  const client = getOpenAiClient();

  if (!client) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You generate high quality job-board search queries from resume signals. Return JSON only."
      },
      {
        role: "user",
        content: buildPrompt(input, limit)
      }
    ]
  });

  const content = response.choices[0]?.message?.content;

  if (!content) {
    throw new Error("OpenAI returned empty query content");
  }

  const parsed = QUERY_SCHEMA.parse(extractJson(content));
  const queries = normalizeQueries(parsed.queries, limit);

  if (queries.length === 0) {
    throw new Error("OpenAI returned no usable queries");
  }

  return queries;
}

export async function generateJobQueries(
  input: ResumeQueryInput,
  options?: { limit?: number }
): Promise<string[]> {
  const limit = options?.limit ?? DEFAULT_QUERY_LIMIT;

  try {
    return await generateWithOpenAI(input, limit);
  } catch (error) {
    console.error("OpenAI query generation failed, falling back to heuristic queries", error);
    return buildFallbackQueries(input, limit);
  }
}
