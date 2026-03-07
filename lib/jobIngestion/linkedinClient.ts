import axios, { type AxiosInstance } from "axios";

const DEFAULT_RAPIDAPI_HOST = "linkedin-job-search-api.p.rapidapi.com";
const DEFAULT_BASE_URL = `https://${DEFAULT_RAPIDAPI_HOST}`;

let cachedClient: AxiosInstance | null = null;

export function getLinkedInClient(): AxiosInstance {
  if (cachedClient) {
    return cachedClient;
  }

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = process.env.RAPIDAPI_HOST || DEFAULT_RAPIDAPI_HOST;
  const baseURL = process.env.RAPIDAPI_BASE_URL || DEFAULT_BASE_URL;

  if (!rapidApiKey) {
    throw new Error("RAPIDAPI_KEY is not set");
  }

  cachedClient = axios.create({
    baseURL,
    timeout: 20_000,
    headers: {
      "X-RapidAPI-Key": rapidApiKey,
      "X-RapidAPI-Host": rapidApiHost,
      "Content-Type": "application/json"
    }
  });

  return cachedClient;
}
