import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rapidApiGet } from "@/lib/rapidapi";

const JSEARCH_SEARCH_PATH = process.env.JSEARCH_SEARCH_PATH || "/search";
const DEFAULT_COUNTRY = process.env.JSEARCH_COUNTRY || "us";
const DEFAULT_DATE_POSTED = process.env.JSEARCH_DATE_POSTED || "week";
const DEFAULT_PAGE_COUNT = Number(process.env.JSEARCH_PAGES || "1");
const PAGE_DELAY_MS = Number(process.env.JSEARCH_PAGE_DELAY_MS || "1000");
const FAIL_FAST = process.env.JOB_INGEST_FAIL_FAST === "true";

const DEFAULT_QUERIES = (process.env.JOB_INGEST_QUERIES ||
  "software engineer,frontend developer,backend developer,full stack engineer")
  .split(",")
  .map((query) => query.trim())
  .filter(Boolean);

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

type JSearchJob = {
  job_id?: string;
  job_title?: string;
  employer_name?: string;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_description?: string | null;
  job_apply_link?: string | null;
  job_employment_type?: string | null;
  job_employment_types?: string[];
  job_posted_at_datetime_utc?: string | null;
};

type JSearchResponse = {
  status?: string;
  data?: JSearchJob[];
};

type NormalizedJob = {
  externalId: string;
  title: string;
  company: string;
  location: string | null;
  description: string | null;
  applyUrl: string | null;
  source: string;
  employmentType: string | null;
  postedAt: Date | null;
  skills: Prisma.InputJsonValue;
};

export type FetchJobsResult = {
  query: string;
  fetched: number;
  normalized: number;
  inserted: number;
  skipped: number;
};

export type MultiQueryIngestionResult = {
  totalFetched: number;
  totalNormalized: number;
  totalInserted: number;
  totalSkipped: number;
  results: FetchJobsResult[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSkills(description: string | null): string[] {
  if (!description) {
    return [];
  }

  const text = description.toLowerCase();
  const detected = SKILL_DICTIONARY.filter((skill) => {
    const pattern = new RegExp(`\\b${escapeRegex(skill.toLowerCase())}\\b`, "i");
    return pattern.test(text);
  });

  return Array.from(new Set(detected));
}

function buildLocation(job: JSearchJob): string | null {
  const parts = [job.job_city, job.job_state, job.job_country]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  return parts.join(", ");
}

function parsePostedAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeEmploymentType(job: JSearchJob): string | null {
  if (Array.isArray(job.job_employment_types) && job.job_employment_types.length > 0) {
    return job.job_employment_types.join(", ");
  }

  if (typeof job.job_employment_type === "string" && job.job_employment_type.trim()) {
    return job.job_employment_type.trim();
  }

  return null;
}

function normalizeJob(job: JSearchJob): NormalizedJob | null {
  const externalId = job.job_id?.trim();
  const title = job.job_title?.trim();
  const company = job.employer_name?.trim();

  if (!externalId || !title || !company) {
    return null;
  }

  const skills = extractSkills(job.job_description ?? null);

  return {
    externalId,
    title,
    company,
    location: buildLocation(job),
    description: job.job_description?.trim() || null,
    applyUrl: job.job_apply_link?.trim() || null,
    source: "linkedin",
    employmentType: normalizeEmploymentType(job),
    postedAt: parsePostedAt(job.job_posted_at_datetime_utc),
    skills: skills as unknown as Prisma.InputJsonValue
  };
}

async function fetchPage(query: string, page: number): Promise<JSearchJob[]> {
  const response = await rapidApiGet<JSearchResponse>(JSEARCH_SEARCH_PATH, {
    query,
    page: String(page),
    num_pages: "1",
    country: DEFAULT_COUNTRY,
    date_posted: DEFAULT_DATE_POSTED
  });

  return Array.isArray(response.data) ? response.data : [];
}

async function saveNormalizedJobs(jobs: NormalizedJob[]): Promise<{ inserted: number; skipped: number }> {
  if (jobs.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const dedupedByExternalId = new Map<string, NormalizedJob>();

  for (const job of jobs) {
    dedupedByExternalId.set(job.externalId, job);
  }

  const dedupedJobs = Array.from(dedupedByExternalId.values());

  const existingJobs = await prisma.job.findMany({
    where: {
      externalId: {
        in: dedupedJobs.map((job) => job.externalId)
      }
    },
    select: {
      externalId: true
    }
  });

  const existingIds = new Set(existingJobs.map((job) => job.externalId));
  const jobsToInsert = dedupedJobs.filter((job) => !existingIds.has(job.externalId));

  if (jobsToInsert.length > 0) {
    await prisma.job.createMany({
      data: jobsToInsert,
      skipDuplicates: true
    });
  }

  return {
    inserted: jobsToInsert.length,
    skipped: jobs.length - jobsToInsert.length
  };
}

export async function fetchJobs(query: string): Promise<FetchJobsResult> {
  const safePageCount = Number.isFinite(DEFAULT_PAGE_COUNT) && DEFAULT_PAGE_COUNT > 0
    ? Math.floor(DEFAULT_PAGE_COUNT)
    : 1;

  const rawJobs: JSearchJob[] = [];

  for (let page = 1; page <= safePageCount; page += 1) {
    try {
      const pageJobs = await fetchPage(query, page);
      rawJobs.push(...pageJobs);

      if (PAGE_DELAY_MS > 0 && page < safePageCount) {
        await sleep(PAGE_DELAY_MS);
      }
    } catch (error) {
      console.error(`Failed to fetch jobs for query='${query}', page=${page}`, error);
      if (FAIL_FAST) {
        throw error;
      }
      // Continue ingestion for other queries/pages when provider fails.
      break;
    }
  }

  const normalizedJobs = rawJobs.map(normalizeJob).filter((job): job is NormalizedJob => job !== null);
  const saveResult = await saveNormalizedJobs(normalizedJobs);

  const result: FetchJobsResult = {
    query,
    fetched: rawJobs.length,
    normalized: normalizedJobs.length,
    inserted: saveResult.inserted,
    skipped: saveResult.skipped
  };

  console.log(
    `[jobFetcher] query='${query}' fetched=${result.fetched} normalized=${result.normalized} inserted=${result.inserted} skipped=${result.skipped}`
  );

  return result;
}

export async function fetchJobsForQueries(queries: string[]): Promise<MultiQueryIngestionResult> {
  const results: FetchJobsResult[] = [];
  let totalFetched = 0;
  let totalNormalized = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (const query of queries) {
    const result = await fetchJobs(query);
    results.push(result);
    totalFetched += result.fetched;
    totalNormalized += result.normalized;
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
  }

  const summary: MultiQueryIngestionResult = {
    totalFetched,
    totalNormalized,
    totalInserted,
    totalSkipped,
    results
  };

  console.log("[jobFetcher] ingestion summary", summary);
  return summary;
}

export async function runJobIngestion(): Promise<MultiQueryIngestionResult> {
  return fetchJobsForQueries(DEFAULT_QUERIES);
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].includes("jobFetcher.ts");

if (isDirectRun) {
  runJobIngestion()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error("Job ingestion failed", error);
      process.exit(1);
    });
}
