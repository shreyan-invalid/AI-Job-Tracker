"use client";

import { signOut } from "next-auth/react";

export function LogoutButton() {
  return (
    <button
      className="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      style={{ width: "auto", padding: "0.5rem 0.9rem" }}
      type="button"
    >
      Logout
    </button>
  );
}
