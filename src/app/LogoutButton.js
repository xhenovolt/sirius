"use client";

import { useEffect, useState } from "react";

export default function LogoutButton() {
  const [user, setUser] = useState(null);
  useEffect(() => { fetch("/api/auth/session").then((response) => response.ok ? response.json() : null).then((result) => setUser(result?.user || null)); }, []);
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  const initials = user?.displayName?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "S";
  return <button className="profile-button" type="button" onClick={logout} aria-label={`Sign out ${user?.displayName || "user"}`}><span className="avatar">{initials}</span><span className="profile-name">{user?.displayName || "Account"}</span></button>;
}