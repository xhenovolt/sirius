"use client";

import { useEffect } from "react";
import Link from "next/link";
import { classifyError } from "@/lib/errors";
import ShellIcon from "./ShellIcon";

export default function RouteError({ error, retry }) {
  const classified = classifyError(error);

  useEffect(() => {
    console.error("Route error", { class: classified.code, digest: error?.digest, message: error?.message });
  }, [error, classified.code]);

  return (
    <main className="dashboard">
      <div className="empty-state route-error" role="alert">
        <ShellIcon name="alert" className="route-error-icon" />
        <strong>{classified.title}</strong>
        <p>{classified.hint}</p>
        {classified.code === "SESSION" ? (
          <Link className="button button-primary" href="/login">Sign in again</Link>
        ) : (
          <button type="button" className="button button-primary" onClick={() => retry()}>Try again</button>
        )}
        {error?.digest && <p className="route-error-digest">Reference: {error.digest}</p>}
      </div>
    </main>
  );
}