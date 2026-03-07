"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type UserJob = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  applyUrl: string | null;
  postedAt: string | null;
  source: string;
  employmentType: string | null;
};

type UserJobsResponse = {
  data: UserJob[];
};

type FetchJobsResponse = {
  message: string;
  data: {
    generatedQueries: string[];
    totalFetched: number;
    jobsInserted: number;
    userJobsLinked: number;
  };
};

function formatPostedDate(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

export function JobsPageClient() {
  const [jobs, setJobs] = useState<UserJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetchingNewJobs, setIsFetchingNewJobs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastQueries, setLastQueries] = useState<string[]>([]);
  const isBusy = isLoading || isFetchingNewJobs;

  const loadJobs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/jobs/user", { cache: "no-store" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message || "Failed to load saved jobs.");
      }

      const payload = (await response.json()) as UserJobsResponse;
      setJobs(payload.data ?? []);
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to load jobs");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const handleGenerateJobs = async () => {
    setIsFetchingNewJobs(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/jobs/fetch", {
        method: "POST"
      });

      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        data?: FetchJobsResponse["data"];
      };

      if (!response.ok) {
        throw new Error(payload.message || "Failed to fetch jobs from provider.");
      }

      const data = payload.data;
      setLastQueries(data?.generatedQueries ?? []);
      setSuccess(
        `Fetched ${data?.totalFetched ?? 0} jobs. Inserted ${data?.jobsInserted ?? 0} new jobs and linked ${data?.userJobsLinked ?? 0} jobs to your profile.`
      );

      await loadJobs();
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch jobs");
    } finally {
      setIsFetchingNewJobs(false);
    }
  };

  const hasJobs = jobs.length > 0;

  const queriesText = useMemo(() => {
    if (lastQueries.length === 0) {
      return null;
    }

    return lastQueries.join(" | ");
  }, [lastQueries]);

  return (
    <section className="card stack">
      <h1 className="page-title" style={{ margin: 0 }}>
        Saved Jobs
      </h1>
      <p className="muted" style={{ margin: 0 }}>
        Generate tailored jobs from your uploaded resumes and review your latest saved opportunities.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button className="button" type="button" onClick={handleGenerateJobs} disabled={isBusy}>
          {isFetchingNewJobs ? "Fetching Jobs..." : "Generate jobs from resume"}
        </button>
        <button className="button" type="button" onClick={() => void loadJobs()} disabled={isBusy}>
          Refresh Saved Jobs
        </button>
      </div>

      {error ? <p className="alert error">{error}</p> : null}
      {success ? <p className="alert success">{success}</p> : null}
      {queriesText ? <p className="muted">Queries used: {queriesText}</p> : null}

      {isLoading ? <p className="muted">Loading saved jobs...</p> : null}

      {!isLoading && !hasJobs ? (
        <p className="muted">No jobs saved yet. Click "Generate Jobs From Resumes" to start.</p>
      ) : null}

      {!isLoading && hasJobs ? (
        <div className="stack">
          {jobs.map((job) => (
            <article key={job.id} className="result-card stack" style={{ gap: "0.45rem" }}>
              <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{job.title}</h2>
              <p style={{ margin: 0 }}>
                <strong>{job.company}</strong>
              </p>
              <p className="muted" style={{ margin: 0 }}>
                {job.location ?? "Location not specified"}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                Posted: {formatPostedDate(job.postedAt)}
              </p>
              {job.applyUrl ? (
                <a className="button" href={job.applyUrl} target="_blank" rel="noreferrer">
                  Apply
                </a>
              ) : (
                <span className="muted">No apply link available</span>
              )}
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
