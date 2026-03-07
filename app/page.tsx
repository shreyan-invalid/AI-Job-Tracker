import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function HomePage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (userId) {
    const resumeCount = await prisma.resume.count({
      where: { userId }
    });

    redirect(resumeCount > 0 ? "/jobs" : "/upload-resume");
  }

  return (
    <section className="card stack">
      <h1 className="page-title">AI Job Matcher</h1>
      <p className="muted">
        Upload resumes, extract skills with AI, and rank jobs by match score.
      </p>
      <Link className="button" href="/login">
        Login
      </Link>
      <Link className="button" href="/register">
        Create Account
      </Link>
    </section>
  );
}
