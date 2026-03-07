"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getProviders, signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasGoogleProvider, setHasGoogleProvider] = useState(false);

  useEffect(() => {
    const loadProviders = async () => {
      const providers = await getProviders();
      setHasGoogleProvider(Boolean(providers?.google));
    };

    void loadProviders();
  }, []);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    const result = await signIn("credentials", {
      email,
      password,
      callbackUrl,
      redirect: false
    });

    setLoading(false);

    if (result?.error) {
      setError("Invalid email or password.");
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  };

  const onGoogleLogin = async () => {
    const callbackUrl = searchParams.get("callbackUrl") ?? "/";
    await signIn("google", { callbackUrl });
  };

  return (
    <section className="card" style={{ maxWidth: 460, margin: "0 auto" }}>
      <h1 className="page-title">Login</h1>
      <form className="stack" onSubmit={onSubmit}>
        <input
          className="input"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className="input"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <p style={{ color: "#c0392b" }}>{error}</p> : null}
        <button className="button" type="submit" disabled={loading}>
          {loading ? "Signing in..." : "Login"}
        </button>
      </form>

      {hasGoogleProvider ? (
        <>
          <hr style={{ margin: "1rem 0", borderColor: "#e5e7eb" }} />
          <button className="button" type="button" onClick={onGoogleLogin}>
            Continue with Google
          </button>
        </>
      ) : null}

      <p className="muted" style={{ marginTop: "1rem" }}>
        Don&apos;t have an account? <Link href="/register">Create one</Link>
      </p>
    </section>
  );
}
