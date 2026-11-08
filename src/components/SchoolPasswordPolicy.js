"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SCHOOL_PASSWORD_POLICY } from "@/lib/passwordPolicyRules";

export function useSchoolPasswordPolicy() {
  const [policy, setPolicy] = useState(DEFAULT_SCHOOL_PASSWORD_POLICY);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/auth/password-policy", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Unable to load password policy.");
        if (active) setPolicy(result.policy);
      })
      .catch((error) => {
        console.error("Password policy load failed", error);
        if (active) setLoadError("Current password rules could not be loaded. The server will still validate your password.");
      });
    return () => { active = false; };
  }, []);

  return { policy, loadError };
}
