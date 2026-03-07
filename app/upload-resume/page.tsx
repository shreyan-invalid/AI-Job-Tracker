import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ResumeUploadForm } from "@/components/resume-upload-form";

export default async function UploadResumePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <section className="card stack">
      <h1 className="page-title">Resume Manager</h1>
      <p className="muted">
        Upload up to 3 PDF or DOCX resumes. You can review existing uploads, delete old resumes, and add new
        ones as needed.
      </p>
      <ResumeUploadForm />
    </section>
  );
}
