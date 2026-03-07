import axios, { AxiosError, type AxiosInstance } from "axios";

const DEFAULT_RAPIDAPI_HOST = "jsearch.p.rapidapi.com";
const DEFAULT_BASE_URL = `https://${DEFAULT_RAPIDAPI_HOST}`;
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1_000;

let cachedClient: AxiosInstance | null = null;
let hasLoggedConfig = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterSeconds(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isNaN(parsed) && parsed >= 0) {
    return parsed;
  }

  return null;
}

function getMaxRetries(): number {
  const parsed = Number(process.env.RAPIDAPI_MAX_RETRIES ?? DEFAULT_MAX_RETRIES);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_MAX_RETRIES;
}

function getBaseRetryDelayMs(): number {
  const parsed = Number(process.env.RAPIDAPI_RETRY_DELAY_MS ?? DEFAULT_RETRY_DELAY_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_RETRY_DELAY_MS;
}

function getRetryDelayMs(error: AxiosError, attempt: number): number {
  const retryAfterSeconds = parseRetryAfterSeconds(error.response?.headers?.["retry-after"] ?? null);

  if (retryAfterSeconds !== null) {
    return retryAfterSeconds * 1000;
  }

  const baseDelay = getBaseRetryDelayMs();
  return baseDelay * 2 ** (attempt - 1);
}

export function getRapidApiClient(): AxiosInstance {
  if (cachedClient) {
    return cachedClient;
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const configuredHost = process.env.JSEARCH_RAPIDAPI_HOST || process.env.RAPIDAPI_HOST;
  const configuredBaseUrl = process.env.JSEARCH_RAPIDAPI_BASE_URL || process.env.RAPIDAPI_BASE_URL;

  // Guardrail: this module is dedicated to JSearch. If env still points to the
  // older LinkedIn provider domain, force JSearch defaults to avoid 404 errors.
  const hasLinkedInHost = typeof configuredHost === "string" && configuredHost.includes("linkedin");
  const hasLinkedInBaseUrl =
    typeof configuredBaseUrl === "string" && configuredBaseUrl.includes("linkedin");

  const rapidApiHost =
    hasLinkedInHost || hasLinkedInBaseUrl ? DEFAULT_RAPIDAPI_HOST : configuredHost || DEFAULT_RAPIDAPI_HOST;
  const baseURL =
    hasLinkedInHost || hasLinkedInBaseUrl ? DEFAULT_BASE_URL : configuredBaseUrl || DEFAULT_BASE_URL;

  if (!rapidApiKey) {
    throw new Error("RAPIDAPI_KEY is not set");
  }

  cachedClient = axios.create({
    baseURL,
    timeout: DEFAULT_TIMEOUT_MS,
    headers: {
      "x-rapidapi-key": rapidApiKey,
      "x-rapidapi-host": rapidApiHost
    }
  });

  if (!hasLoggedConfig) {
    hasLoggedConfig = true;
    console.log(`[rapidapi] using host=${rapidApiHost} baseURL=${baseURL}`);
    if (hasLinkedInHost || hasLinkedInBaseUrl) {
      console.warn(
        "[rapidapi] Detected LinkedIn API host/baseURL in env. Overriding to JSearch defaults for this service."
      );
    }
  }

  return cachedClient;
}

export async function rapidApiGet<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const client = getRapidApiClient();
  const maxRetries = getMaxRetries();

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    try {
      const response = await client.get<T>(path, { params });
      return response.data;
    } catch (error) {
      lastError = error;

      if (!axios.isAxiosError(error)) {
        break;
      }

      const status = error.response?.status;
      const retryable = status === 429 || (typeof status === "number" && status >= 500);

      if (!retryable || attempt > maxRetries) {
        break;
      }

      const delayMs = getRetryDelayMs(error, attempt);
      console.warn(
        `RapidAPI request failed with status ${status}. Retrying in ${delayMs}ms (attempt ${attempt}/${maxRetries}).`
      );
      await sleep(delayMs);
    }
  }

  throw new Error(`RapidAPI request failed: ${String(lastError)}`);
}
