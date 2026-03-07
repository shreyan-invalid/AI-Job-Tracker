import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { JobsPageClient } from "@/components/jobs-page-client";

export default async function JobsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const resumeCount = await prisma.resume.count({
    where: { userId: session.user.id }
  });

  if (resumeCount === 0) {
    redirect("/upload-resume");
  }

  return <JobsPageClient />;
}
