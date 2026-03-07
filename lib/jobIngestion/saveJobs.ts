import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export type NormalizedJobInput = {
  title: string;
  company: string;
  location: string | null;
  description: string;
  sourceUrl: string;
  skills: string[];
  datePosted: Date | null;
};

export type SaveJobsResult = {
  inserted: number;
  skipped: number;
};

export async function saveJobs(jobs: NormalizedJobInput[]): Promise<SaveJobsResult> {
  if (jobs.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const uniqueJobsMap = new Map<string, NormalizedJobInput>();

  for (const job of jobs) {
    if (!job.sourceUrl) {
      continue;
    }
    uniqueJobsMap.set(job.sourceUrl, job);
  }

  const uniqueJobs = Array.from(uniqueJobsMap.values());

  if (uniqueJobs.length === 0) {
    return { inserted: 0, skipped: jobs.length };
  }

  const existing = await prisma.job.findMany({
    where: {
      externalId: {
        in: uniqueJobs.map((job) => job.sourceUrl)
      }
    },
    select: {
      externalId: true
    }
  });

  const existingIds = new Set(existing.map((job) => job.externalId));

  const jobsToInsert = uniqueJobs.filter((job) => !existingIds.has(job.sourceUrl));

  if (jobsToInsert.length > 0) {
    const data: Prisma.JobCreateManyInput[] = jobsToInsert.map((job) => ({
      externalId: job.sourceUrl,
      title: job.title,
      company: job.company,
      location: job.location,
      description: job.description,
      applyUrl: job.sourceUrl,
      source: "linkedin",
      employmentType: null,
      postedAt: job.datePosted,
      skills: job.skills as unknown as Prisma.InputJsonValue
    }));

    await prisma.job.createMany({
      data,
      skipDuplicates: true
    });
  }

  return {
    inserted: jobsToInsert.length,
    skipped: jobs.length - jobsToInsert.length
  };
}
