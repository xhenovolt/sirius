import Link from "next/link";
import LogoutButton from "./LogoutButton";

export default function AccessDenied() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/profile"><span className="brand-mark">S</span><span>Sirius</span></Link>
        <LogoutButton />
      </header>
      <main className="dashboard">
        <div className="empty-state">
          <strong>Access denied.</strong>
          <p>Your school role does not have permission to view this page.</p>
        </div>
      </main>
    </div>
  );
}
