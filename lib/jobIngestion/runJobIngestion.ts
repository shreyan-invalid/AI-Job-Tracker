import { extractJobSkills } from "@/lib/jobIngestion/extractJobSkills";
import { fetchLinkedInJobs, type LinkedInRawJob } from "@/lib/jobIngestion/fetchLinkedInJobs";
import { saveJobs, type NormalizedJobInput } from "@/lib/jobIngestion/saveJobs";

const FALLBACK_QUERIES = ["software engineer", "frontend developer", "backend engineer"];
const DEFAULT_QUERIES = process.env.JOB_INGEST_QUERIES
  ? process.env.JOB_INGEST_QUERIES.split(",")
      .map((query) => query.trim())
      .filter(Boolean)
  : FALLBACK_QUERIES;
const DEFAULT_LOCATION = process.env.JOB_INGEST_LOCATION || "India";
const START_PAGE = Number(process.env.JOB_INGEST_START_PAGE || 1);
const END_PAGE = Number(process.env.JOB_INGEST_END_PAGE || 5);
const DELAY_MS = Number(process.env.JOB_INGEST_DELAY_MS || 1200);

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function firstStringFromArrays(...values: unknown[]): string | null {
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim().length > 0) {
          return item.trim();
        }
      }
    }
  }

  return null;
}

function locationFromLocationsRaw(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const first = value[0];

  if (!first || typeof first !== "object") {
    return null;
  }

  const record = first as Record<string, unknown>;
  const address = record.address;

  if (!address || typeof address !== "object") {
    return null;
  }

  const addressRecord = address as Record<string, unknown>;
  const locality =
    (typeof addressRecord.addressLocality === "string" && addressRecord.addressLocality) || "";
  const region =
    (typeof addressRecord.addressRegion === "string" && addressRecord.addressRegion) || "";
  const country =
    (typeof addressRecord.addressCountry === "string" && addressRecord.addressCountry) || "";

  const combined = [locality, region, country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");

  return combined || null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePostedDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeJob(raw: LinkedInRawJob): NormalizedJobInput | null {
  const title = firstString(raw.title, raw.job_title, raw.position, raw.jobTitle, raw.job_position);
  const company = firstString(
    raw.company,
    raw.organization,
    raw.company_name,
    raw.companyName,
    raw.employer,
    raw.organization
  );
  const location =
    firstString(
    raw.location,
    raw.job_location,
    raw.city,
    raw.formattedLocation,
    raw.primary_location
    ) ??
    firstStringFromArrays(raw.locations_derived, raw.countries_derived, raw.cities_derived) ??
    locationFromLocationsRaw(raw.locations_raw);
  const description = firstString(
    raw.description_text,
    raw.description,
    raw.job_description,
    raw.jobDescription,
    raw.snippet,
    raw.details,
    raw.linkedin_org_description
  );
  const sourceUrl = firstString(
    raw.job_url,
    raw.url,
    raw.linkedin_url,
    raw.job_link,
    raw.link,
    raw.job_url_direct
  );

  if (!title || !company || !description || !sourceUrl) {
    return null;
  }

  const datePosted = parsePostedDate(raw.date_posted ?? raw.datePosted ?? raw.date_published);

  return {
    title,
    company,
    location,
    description,
    sourceUrl,
    skills: extractJobSkills(description),
    datePosted
  };
}

export type JobIngestionResult = {
  totalFetched: number;
  totalParsed: number;
  inserted: number;
  skipped: number;
};

export async function runJobIngestion(
  queries: string[] = DEFAULT_QUERIES,
  location: string = DEFAULT_LOCATION
): Promise<JobIngestionResult> {
  const parsedJobs: NormalizedJobInput[] = [];
  let totalFetched = 0;

  for (const query of queries) {
    for (let page = START_PAGE; page <= END_PAGE; page += 1) {
      try {
        const rawJobs = await fetchLinkedInJobs(query, location, page);

        if (rawJobs.length === 0) {
          // No further records for this query/page window.
          break;
        }

        totalFetched += rawJobs.length;

        for (const rawJob of rawJobs) {
          const normalized = normalizeJob(rawJob);
          if (normalized) {
            parsedJobs.push(normalized);
          }
        }
      } catch (error) {
        console.error(`Failed ingestion for query='${query}', page=${page}`, error);
      }

      if (DELAY_MS > 0) {
        await sleep(DELAY_MS);
      }
    }
  }

  const saveResult = await saveJobs(parsedJobs);

  return {
    totalFetched,
    totalParsed: parsedJobs.length,
    inserted: saveResult.inserted,
    skipped: saveResult.skipped
  };
}

const isDirectRun =
  typeof process !== "undefined" &&
  process.argv[1] &&
  process.argv[1].includes("runJobIngestion.ts");

if (isDirectRun) {
  runJobIngestion()
    .then((result) => {
      console.log("Job ingestion completed", result);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Job ingestion failed", error);
      process.exit(1);
    });
}
