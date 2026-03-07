import axios, { type AxiosInstance } from "axios";
import { getLinkedInClient } from "@/lib/jobIngestion/linkedinClient";

export type LinkedInRawJob = {
  [key: string]: unknown;
};

const DEFAULT_SEARCH_PATHS = ["/active-jb-24h"];
const DEFAULT_LIMIT = 10;
const MAX_RETRIES = Number(process.env.RAPIDAPI_MAX_RETRIES || 3);
const RETRY_BASE_DELAY_MS = Number(process.env.RAPIDAPI_RETRY_DELAY_MS || 1200);

function quoted(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed;
  }
  return `"${trimmed}"`;
}

function extractArrayPayload(payload: unknown): LinkedInRawJob[] {
  if (Array.isArray(payload)) {
    return payload as LinkedInRawJob[];
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;

  const nested =
    record.data ??
    record.jobs ??
    record.results ??
    record.response ??
    record.jobList ??
    record.items ??
    record.dataList;

  if (Array.isArray(nested)) {
    return nested as LinkedInRawJob[];
  }

  if (nested && typeof nested === "object") {
    const nestedRecord = nested as Record<string, unknown>;

    for (const key of ["jobs", "results", "data", "items"]) {
      const value = nestedRecord[key];
      if (Array.isArray(value)) {
        return value as LinkedInRawJob[];
      }
    }
  }

  return [];
}

async function requestLinkedInJobs(
  client: AxiosInstance,
  path: string,
  query: string,
  location: string,
  page: number
): Promise<LinkedInRawJob[]> {
  const limit = Number(process.env.RAPIDAPI_PAGE_SIZE || DEFAULT_LIMIT);
  const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT;
  const offset = Math.max(0, (page - 1) * safeLimit);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const response = await client.get(path, {
        params: {
          limit: String(safeLimit),
          offset: String(offset),
          title_filter: quoted(query),
          location_filter: location.includes(" OR ") ? location : quoted(location),
          description_type: "text"
        }
      });

      return extractArrayPayload(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        // This provider frequently returns 404 when no records match this page/filter.
        if (status === 404) {
          return [];
        }

        if (status === 429 && attempt < MAX_RETRIES) {
          const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      throw error;
    }
  }

  return [];
}

export async function fetchLinkedInJobs(
  query: string,
  location: string,
  page: number
): Promise<LinkedInRawJob[]> {
  const client = getLinkedInClient();

  const envPath = process.env.RAPIDAPI_LINKEDIN_SEARCH_PATH;
  const paths = envPath ? [envPath] : DEFAULT_SEARCH_PATHS;

  let lastError: unknown;

  for (const path of paths) {
    try {
      const jobs = await requestLinkedInJobs(client, path, query, location, page);
      if (jobs.length > 0) {
        return jobs;
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw new Error(`LinkedIn fetch failed for query='${query}', page=${page}: ${String(lastError)}`);
  }

  return [];
}
