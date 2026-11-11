"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export default function AccountMenu({ user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    function closeOnOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) setIsOpen(false);
    }
    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  async function logout() {
    setIsLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Sign out request failed.");
      window.location.href = "/login";
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
      setIsLoggingOut(false);
    }
  }

  const initials = user?.displayName?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "S";
  return (
    <div className="account-menu" ref={menuRef}>
      <button
        ref={triggerRef}
        className="profile-button"
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label={`Account menu for ${user?.displayName || "user"}`}
        aria-expanded={isOpen}
        aria-controls={isOpen ? "account-dropdown" : undefined}
      >
        <span className="avatar">{initials}</span>
        <span className="profile-name">{user?.displayName || "Account"}</span>
        <span className="chevron" aria-hidden="true">⌄</span>
      </button>
      {isOpen && (
        <div className="account-dropdown" id="account-dropdown">
          <div className="account-summary">
            <span className="account-summary-name">{user?.displayName || "Your account"}</span>
            {user?.email && <span className="account-summary-email">{user.email}</span>}
          </div>
          <nav className="account-links" aria-label="Account options">
            <Link href="/profile" onClick={() => setIsOpen(false)}>View profile</Link>
            {user?.isSchoolAdmin && <Link href="/settings/school" onClick={() => setIsOpen(false)}>School settings</Link>}
          </nav>
          <div className="account-dropdown-footer">
            {logoutError && <p className="account-menu-error" role="alert">{logoutError}</p>}
            <button type="button" onClick={logout} disabled={isLoggingOut}>
              {isLoggingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}