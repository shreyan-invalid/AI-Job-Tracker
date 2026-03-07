import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const resumeCount = await prisma.resume.count({
    where: { userId: session.user.id }
  });

  redirect(resumeCount > 0 ? "/jobs" : "/upload-resume");
}
