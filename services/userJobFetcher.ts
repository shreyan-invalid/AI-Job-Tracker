import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { rapidApiGet } from "@/lib/rapidapi";
import { generateJobQueries } from "@/services/queryGenerator";

type ResumeRecord = {
  skills: string[];
  structuredData: Prisma.JsonValue | null;
  parsedText: string | null;
};

type UserResumeData = {
  titles: string[];
  skills: string[];
  experience: string | null;
};

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

export type FetchJobsForUserResult = {
  userId: string;
  resumeCount: number;
  generatedQueries: string[];
  totalFetched: number;
  totalNormalized: number;
  jobsInserted: number;
  userJobsLinked: number;
  skipped: number;
};

type UserIngestionFailure = {
  userId: string;
  error: string;
};

export type UserCronIngestionResult = {
  mode: "user";
  totalUsersWithResumes: number;
  processedUsers: number;
  succeededUsers: number;
  failedUsers: number;
  totalFetched: number;
  totalNormalized: number;
  totalJobsInserted: number;
  totalUserJobsLinked: number;
  totalSkipped: number;
  failures: UserIngestionFailure[];
};

const JSEARCH_SEARCH_PATH = process.env.JSEARCH_SEARCH_PATH || "/search";
const JSEARCH_COUNTRY = process.env.JSEARCH_COUNTRY || "in";
const JSEARCH_DATE_POSTED = process.env.JSEARCH_DATE_POSTED || "week";
const JSEARCH_PAGES = Number(process.env.JSEARCH_PAGES || "1");
const JOB_QUERY_LOCATION = process.env.JOB_QUERY_LOCATION || "India";
const MAX_QUERIES = Number(process.env.JOB_QUERY_COUNT || "5");
const CRON_USER_BATCH_SIZE = Number(process.env.CRON_USER_BATCH_SIZE || "25");
const CRON_USER_DELAY_MS = Number(process.env.CRON_USER_DELAY_MS || "500");
const CRON_USER_LIMIT = Number(process.env.CRON_USER_LIMIT || "0");

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
  "Redis",
  "NestJS",
  "Express",
  "GraphQL"
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractExperienceTitles(structuredData: Prisma.JsonValue | null): string[] {
  if (!isRecord(structuredData)) {
    return [];
  }

  const experience = structuredData.experience;

  if (!Array.isArray(experience)) {
    return [];
  }

  const titles: string[] = [];

  for (const item of experience) {
    if (!isRecord(item)) {
      continue;
    }

    const rawTitle = item.title;
    if (typeof rawTitle === "string" && rawTitle.trim()) {
      titles.push(rawTitle.trim());
    }
  }

  return titles;
}

function extractSkillsFromStructuredData(structuredData: Prisma.JsonValue | null): string[] {
  if (!isRecord(structuredData)) {
    return [];
  }

  return asStringArray(structuredData.skills);
}

function extractExperienceYearsFromText(parsedText: string | null): number | null {
  if (!parsedText) {
    return null;
  }

  const matches = [...parsedText.matchAll(/(\d{1,2})\+?\s*(?:years?|yrs?)/gi)];

  if (matches.length === 0) {
    return null;
  }

  const years = matches
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (years.length === 0) {
    return null;
  }

  return Math.max(...years);
}

function normalizeSkills(skills: string[]): string[] {
  const dictionary = new Map(SKILL_DICTIONARY.map((item) => [item.toLowerCase(), item]));
  const unique = new Set<string>();

  for (const skill of skills) {
    const normalized = skill.trim();
    if (!normalized) {
      continue;
    }

    const mapped = dictionary.get(normalized.toLowerCase()) ?? normalized;
    unique.add(mapped);
  }

  return Array.from(unique);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getUserResumeData(userId: string): Promise<UserResumeData> {
  const resumes = await prisma.resume.findMany({
    where: { userId },
    select: {
      skills: true,
      structuredData: true,
      parsedText: true
    }
  });

  if (resumes.length === 0) {
    throw new Error("No resumes found for this user. Upload a resume first.");
  }

  const titleSet = new Set<string>();
  const skillSet = new Set<string>();
  let maxYears: number | null = null;

  for (const resume of resumes as ResumeRecord[]) {
    for (const title of extractExperienceTitles(resume.structuredData)) {
      titleSet.add(title);
    }

    const collectedSkills = [
      ...resume.skills,
      ...extractSkillsFromStructuredData(resume.structuredData)
    ];

    for (const skill of collectedSkills) {
      skillSet.add(skill);
    }

    const years = extractExperienceYearsFromText(resume.parsedText);
    if (years !== null) {
      maxYears = maxYears === null ? years : Math.max(maxYears, years);
    }
  }

  const titles = Array.from(titleSet);
  const skills = normalizeSkills(Array.from(skillSet));
  const experience = maxYears !== null ? `${maxYears} years` : null;

  return {
    titles,
    skills,
    experience
  };
}

function buildLocation(job: JSearchJob): string | null {
  const parts = [job.job_city, job.job_state, job.job_country]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : null;
}

function parsePostedAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function extractJobSkills(description: string | null): string[] {
  if (!description) {
    return [];
  }

  const content = description.toLowerCase();
  const matches = SKILL_DICTIONARY.filter((skill) => {
    const pattern = new RegExp(`\\b${skill.toLowerCase().replace(/[.*+?^${}()|[\\]\\]/g, "\\\\$&")}\\b`, "i");
    return pattern.test(content);
  });

  return Array.from(new Set(matches));
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

function normalizeJob(raw: JSearchJob): NormalizedJob | null {
  const externalId = raw.job_id?.trim();
  const title = raw.job_title?.trim();
  const company = raw.employer_name?.trim();

  if (!externalId || !title || !company) {
    return null;
  }

  const skills = extractJobSkills(raw.job_description ?? null);

  return {
    externalId,
    title,
    company,
    location: buildLocation(raw),
    description: raw.job_description?.trim() || null,
    applyUrl: raw.job_apply_link?.trim() || null,
    source: "linkedin",
    employmentType: normalizeEmploymentType(raw),
    postedAt: parsePostedAt(raw.job_posted_at_datetime_utc),
    skills: skills as unknown as Prisma.InputJsonValue
  };
}

async function fetchRawJobsForQuery(query: string): Promise<JSearchJob[]> {
  const allJobs: JSearchJob[] = [];
  const safePages = Number.isFinite(JSEARCH_PAGES) && JSEARCH_PAGES > 0 ? Math.floor(JSEARCH_PAGES) : 1;

  for (let page = 1; page <= safePages; page += 1) {
    const response = await rapidApiGet<JSearchResponse>(JSEARCH_SEARCH_PATH, {
      query,
      page: String(page),
      num_pages: "1",
      country: JSEARCH_COUNTRY,
      date_posted: JSEARCH_DATE_POSTED
    });

    if (Array.isArray(response.data)) {
      allJobs.push(...response.data);
    }
  }

  return allJobs;
}

async function saveJobsAndLinkToUser(userId: string, jobs: NormalizedJob[]): Promise<{ jobsInserted: number; userJobsLinked: number; skipped: number }> {
  if (jobs.length === 0) {
    return { jobsInserted: 0, userJobsLinked: 0, skipped: 0 };
  }

  const dedupedByExternalId = new Map<string, NormalizedJob>();
  for (const job of jobs) {
    dedupedByExternalId.set(job.externalId, job);
  }

  const dedupedJobs = Array.from(dedupedByExternalId.values());
  const externalIds = dedupedJobs.map((job) => job.externalId);

  const existingJobs = await prisma.job.findMany({
    where: { externalId: { in: externalIds } },
    select: { id: true, externalId: true }
  });

  const existingExternalIdSet = new Set(existingJobs.map((job) => job.externalId));

  const jobsToInsert = dedupedJobs.filter((job) => !existingExternalIdSet.has(job.externalId));

  if (jobsToInsert.length > 0) {
    await prisma.job.createMany({
      data: jobsToInsert,
      skipDuplicates: true
    });
  }

  const allPersistedJobs = await prisma.job.findMany({
    where: { externalId: { in: externalIds } },
    select: { id: true }
  });

  const jobIds = allPersistedJobs.map((job) => job.id);

  const existingLinks = await prisma.userJob.findMany({
    where: {
      userId,
      jobId: { in: jobIds }
    },
    select: { jobId: true }
  });

  const existingLinkSet = new Set(existingLinks.map((link) => link.jobId));
  const linksToInsert = jobIds
    .filter((jobId) => !existingLinkSet.has(jobId))
    .map((jobId) => ({ userId, jobId }));

  if (linksToInsert.length > 0) {
    await prisma.userJob.createMany({
      data: linksToInsert,
      skipDuplicates: true
    });
  }

  return {
    jobsInserted: jobsToInsert.length,
    userJobsLinked: linksToInsert.length,
    skipped: dedupedJobs.length - jobsToInsert.length
  };
}

export async function fetchJobsForUser(userId: string): Promise<FetchJobsForUserResult> {
  const resumeData = await getUserResumeData(userId);

  const generatedQueries = await generateJobQueries(
    {
      titles: resumeData.titles,
      skills: resumeData.skills,
      experience: resumeData.experience,
      location: JOB_QUERY_LOCATION
    },
    { limit: MAX_QUERIES }
  );

  const normalizedJobs: NormalizedJob[] = [];
  let totalFetched = 0;

  for (const query of generatedQueries) {
    try {
      const rawJobs = await fetchRawJobsForQuery(query);
      totalFetched += rawJobs.length;

      for (const rawJob of rawJobs) {
        const normalized = normalizeJob(rawJob);
        if (normalized) {
          normalizedJobs.push(normalized);
        }
      }
    } catch (error) {
      console.error(`Failed job fetch for user='${userId}' query='${query}'`, error);
    }
  }

  const saveResult = await saveJobsAndLinkToUser(userId, normalizedJobs);

  const resumeCount = await prisma.resume.count({ where: { userId } });

  return {
    userId,
    resumeCount,
    generatedQueries,
    totalFetched,
    totalNormalized: normalizedJobs.length,
    jobsInserted: saveResult.jobsInserted,
    userJobsLinked: saveResult.userJobsLinked,
    skipped: saveResult.skipped
  };
}

async function getUserIdsWithResumes(): Promise<string[]> {
  const userIds: string[] = [];
  const safeBatchSize =
    Number.isFinite(CRON_USER_BATCH_SIZE) && CRON_USER_BATCH_SIZE > 0
      ? Math.floor(CRON_USER_BATCH_SIZE)
      : 25;
  const safeLimit =
    Number.isFinite(CRON_USER_LIMIT) && CRON_USER_LIMIT > 0 ? Math.floor(CRON_USER_LIMIT) : 0;

  let cursor: string | null = null;

  while (true) {
    const queryArgs: Prisma.UserFindManyArgs = {
      where: {
        resumes: {
          some: {}
        }
      },
      select: {
        id: true
      },
      orderBy: {
        id: "asc"
      },
      take: safeBatchSize
    };

    if (cursor) {
      queryArgs.cursor = { id: cursor };
      queryArgs.skip = 1;
    }

    const users = await prisma.user.findMany(queryArgs);

    if (users.length === 0) {
      break;
    }

    for (const user of users) {
      userIds.push(user.id);
      if (safeLimit > 0 && userIds.length >= safeLimit) {
        return userIds;
      }
    }

    cursor = users[users.length - 1]?.id ?? null;
  }

  return userIds;
}

export async function runUserJobIngestionCron(): Promise<UserCronIngestionResult> {
  const userIds = await getUserIdsWithResumes();
  const safeDelay =
    Number.isFinite(CRON_USER_DELAY_MS) && CRON_USER_DELAY_MS > 0 ? Math.floor(CRON_USER_DELAY_MS) : 0;

  const failures: UserIngestionFailure[] = [];
  let succeededUsers = 0;
  let totalFetched = 0;
  let totalNormalized = 0;
  let totalJobsInserted = 0;
  let totalUserJobsLinked = 0;
  let totalSkipped = 0;

  for (let index = 0; index < userIds.length; index += 1) {
    const userId = userIds[index];

    try {
      const result = await fetchJobsForUser(userId);
      succeededUsers += 1;
      totalFetched += result.totalFetched;
      totalNormalized += result.totalNormalized;
      totalJobsInserted += result.jobsInserted;
      totalUserJobsLinked += result.userJobsLinked;
      totalSkipped += result.skipped;
    } catch (error) {
      console.error(`[userJobCron] failed for userId='${userId}'`, error);
      failures.push({
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
    }

    if (safeDelay > 0 && index < userIds.length - 1) {
      await sleep(safeDelay);
    }
  }

  return {
    mode: "user",
    totalUsersWithResumes: userIds.length,
    processedUsers: userIds.length,
    succeededUsers,
    failedUsers: failures.length,
    totalFetched,
    totalNormalized,
    totalJobsInserted,
    totalUserJobsLinked,
    totalSkipped,
    failures
  };
}
