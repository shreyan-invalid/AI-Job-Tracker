"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ExperienceItem = {
  title: string;
  company?: string;
};

type EducationItem = {
  degree: string;
  institution?: string;
};

type StructuredResumeData = {
  name: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience: ExperienceItem[];
  education: EducationItem[];
};

type UploadSuccessResponse = {
  message: string;
  data: {
    id: string;
    userId: string;
    fileUrl: string;
    skills: string[];
    structuredData: StructuredResumeData;
  };
};

type UploadErrorResponse = {
  message?: string;
};

type ResumeListItem = {
  id: string;
  fileUrl: string;
  skills: string[];
  createdAt: string;
};

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
const MAX_RESUME_COUNT = 3;
const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);
const ACCEPTED_EXTENSIONS = [".pdf", ".docx"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isAcceptedFile(file: File): boolean {
  const extension = file.name.toLowerCase().slice(Math.max(0, file.name.lastIndexOf(".")));

  return ACCEPTED_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.includes(extension);
}

function getFileNameFromUrl(fileUrl: string): string {
  try {
    if (fileUrl.startsWith("file://")) {
      return decodeURIComponent(new URL(fileUrl).pathname.split("/").pop() || "Resume file");
    }

    const normalized = fileUrl.split("?")[0];
    const filename = normalized.split("/").pop();
    return filename || "Resume file";
  } catch {
    return "Resume file";
  }
}

function formatDate(value: string): string {
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

export function ResumeUploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetchingJobsAfterUpload, setIsFetchingJobsAfterUpload] = useState(false);
  const [deletingResumeId, setDeletingResumeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [result, setResult] = useState<UploadSuccessResponse["data"] | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const hasReachedLimit = resumes.length >= MAX_RESUME_COUNT;
  const isBusy =
    isUploading || isFetchingJobsAfterUpload || isLoadingResumes || deletingResumeId !== null;

  const fileMetadata = useMemo(() => {
    if (!file) {
      return null;
    }

    return `${file.name} (${formatBytes(file.size)})`;
  }, [file]);

  const loadResumes = useCallback(async () => {
    setIsLoadingResumes(true);
    setListError(null);

    try {
      const response = await fetch("/api/resume/list", { cache: "no-store" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as UploadErrorResponse;
        throw new Error(payload.message ?? "Failed to fetch your resumes.");
      }

      const payload = (await response.json()) as ResumeListItem[];
      setResumes(payload);
    } catch (fetchError) {
      console.error(fetchError);
      setListError(fetchError instanceof Error ? fetchError.message : "Failed to fetch your resumes.");
    } finally {
      setIsLoadingResumes(false);
    }
  }, []);

  useEffect(() => {
    void loadResumes();
  }, [loadResumes]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;

    setError(null);
    setSuccessMessage(null);

    if (!selected) {
      setFile(null);
      return;
    }

    if (!isAcceptedFile(selected)) {
      setFile(null);
      setError("Unsupported file type. Please upload a PDF or DOCX file.");
      return;
    }

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      setFile(null);
      setError("File is too large. Maximum allowed size is 8MB.");
      return;
    }

    setFile(selected);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError("Please choose a resume file before uploading.");
      return;
    }

    if (hasReachedLimit) {
      setError("You have reached the maximum of 3 resumes. Delete one to upload a new resume.");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccessMessage(null);

    let uploadedSuccessfully = false;

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/resume/upload", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const data = (await response.json()) as UploadErrorResponse;
        setResult(null);
        setError(data.message ?? "Resume upload failed.");
        return;
      }

      const data = (await response.json()) as UploadSuccessResponse;
      setResult(data.data);
      setSuccessMessage(data.message);
      setFile(null);
      await loadResumes();
      uploadedSuccessfully = true;
    } catch (uploadError) {
      console.error("Upload request failed", uploadError);
      setResult(null);
      setError("Something went wrong while uploading your resume.");
    } finally {
      setIsUploading(false);
    }

    if (!uploadedSuccessfully) {
      return;
    }

    setIsFetchingJobsAfterUpload(true);

    try {
      const response = await fetch("/api/jobs/fetch", { method: "POST" });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as UploadErrorResponse;
        throw new Error(payload.message ?? "Resume uploaded, but failed to fetch jobs.");
      }

      setSuccessMessage("Resume uploaded and jobs fetched. Redirecting to Jobs...");
      router.push("/jobs");
      router.refresh();
    } catch (jobFetchError) {
      console.error(jobFetchError);
      setError(jobFetchError instanceof Error ? jobFetchError.message : "Failed to fetch jobs.");
    } finally {
      setIsFetchingJobsAfterUpload(false);
    }
  };

  const handleDelete = async (resumeId: string) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this resume?");

    if (!confirmDelete) {
      return;
    }

    setDeletingResumeId(resumeId);
    setError(null);
    setSuccessMessage(null);

    try {
      const response = await fetch(`/api/resume/delete/${encodeURIComponent(resumeId)}`, {
        method: "DELETE"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as UploadErrorResponse;
        throw new Error(payload.message ?? "Failed to delete resume.");
      }

      setSuccessMessage("Resume deleted successfully.");
      await loadResumes();
    } catch (deleteError) {
      console.error(deleteError);
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete resume.");
    } finally {
      setDeletingResumeId(null);
    }
  };

  return (
    <div className="stack">
      <section className="result-card stack">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Your Resumes</h2>
          <span className="muted">
            {resumes.length}/{MAX_RESUME_COUNT} uploaded
          </span>
        </div>

        {isLoadingResumes ? <p className="muted">Loading resumes...</p> : null}
        {listError ? <p className="alert error">{listError}</p> : null}

        {!isLoadingResumes && !listError && resumes.length === 0 ? (
          <p className="muted">No resumes uploaded yet.</p>
        ) : null}

        {!isLoadingResumes && !listError && resumes.length > 0 ? (
          <div className="stack">
            {resumes.map((resume) => (
              <article key={resume.id} className="resume-item stack" style={{ gap: "0.45rem" }}>
                <p style={{ margin: 0, fontWeight: 600 }}>{getFileNameFromUrl(resume.fileUrl)}</p>
                <p className="muted" style={{ margin: 0 }}>
                  Uploaded: {formatDate(resume.createdAt)}
                </p>
                <p style={{ margin: 0 }}>
                  <strong>Skills:</strong>{" "}
                  {resume.skills.length > 0 ? resume.skills.slice(0, 5).join(", ") : "No skills extracted"}
                </p>
                <div>
                  <button
                    className="button danger"
                    type="button"
                    disabled={deletingResumeId === resume.id}
                    onClick={() => void handleDelete(resume.id)}
                    style={{ width: "auto" }}
                  >
                    {deletingResumeId === resume.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {hasReachedLimit ? (
        <p className="alert error">
          You have reached the maximum of 3 resumes. Delete one to upload a new resume.
        </p>
      ) : null}

      <form className="stack" onSubmit={handleSubmit}>
        <label className="upload-label" htmlFor="resume-file">
          Select resume (PDF or DOCX)
        </label>
        <input
          id="resume-file"
          className="input"
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={hasReachedLimit || isBusy}
          onChange={handleFileChange}
        />

        {fileMetadata ? <p className="muted">Selected: {fileMetadata}</p> : null}

        <button className="button" type="submit" disabled={isBusy || !file || hasReachedLimit}>
          {isUploading
            ? "Uploading and parsing..."
            : isFetchingJobsAfterUpload
              ? "Fetching jobs from resumes..."
              : "Upload Resume"}
        </button>
      </form>

      {error ? <p className="alert error">{error}</p> : null}
      {successMessage ? <p className="alert success">{successMessage}</p> : null}

      {result ? (
        <section className="result-card stack">
          <h2 style={{ margin: 0, fontSize: "1.1rem" }}>Parsed Resume Output</h2>
          <p className="muted" style={{ margin: 0 }}>
            Resume ID: {result.id}
          </p>

          <div className="stack" style={{ gap: "0.4rem" }}>
            <p style={{ margin: 0 }}>
              <strong>Name:</strong> {result.structuredData.name ?? "Not detected"}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Email:</strong> {result.structuredData.email ?? "Not detected"}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Phone:</strong> {result.structuredData.phone ?? "Not detected"}
            </p>
          </div>

          <div className="stack" style={{ gap: "0.45rem" }}>
            <p style={{ margin: 0 }}>
              <strong>Detected Skills</strong>
            </p>
            <div className="skills-wrap">
              {result.skills.length > 0 ? (
                result.skills.map((skill) => (
                  <span key={skill} className="skill-chip">
                    {skill}
                  </span>
                ))
              ) : (
                <span className="muted">No known skills found in dictionary.</span>
              )}
            </div>
          </div>

          <details className="json-details">
            <summary>Structured JSON</summary>
            <pre className="result-json">
              {JSON.stringify(result.structuredData, null, 2)}
            </pre>
          </details>
        </section>
      ) : null}
    </div>
  );
}
