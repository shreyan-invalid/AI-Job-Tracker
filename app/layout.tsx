import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { LogoutButton } from "@/components/logout-button";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Job Matcher",
  description: "Secure auth foundation for AI Job Matcher SaaS"
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const userId = session?.user?.id;

  const hasResume =
    userId !== undefined
      ? (await prisma.resume.count({ where: { userId } })) > 0
      : false;

  return (
    <html lang="en">
      <body>
        <main className="container">
          <nav className="nav">
            <div className="nav-brand">
              <Link className="nav-logo" href="/">
                AI Job Matcher
              </Link>
              <span className="nav-subtitle">Smart resume-to-job matching</span>
            </div>
            <div className="nav-right">
              <div className="nav-links">
                <Link className="nav-link" href="/">
                  Home
                </Link>
                {session?.user ? (
                  <>
                    <Link className="nav-link" href="/upload-resume">
                      Upload Resume
                    </Link>
                    {hasResume ? (
                      <Link className="nav-link" href="/jobs">
                        Jobs
                      </Link>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="nav-actions">
                {session?.user ? (
                  <LogoutButton />
                ) : (
                  <>
                    <Link className="nav-link" href="/login">
                      Login
                    </Link>
                    <Link className="nav-link" href="/register">
                      Register
                    </Link>
                  </>
                )}
              </div>
            </div>
          </nav>
          {children}
        </main>
      </body>
    </html>
  );
}
