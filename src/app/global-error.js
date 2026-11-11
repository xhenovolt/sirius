"use client";

export default function GlobalError({ error, retry }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#f5f7f6", color: "#172522", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Sirius is temporarily unavailable</h1>
          <p style={{ color: "#6f7d78", fontSize: 14, lineHeight: 1.6 }}>
            Something interrupted the application. Try again; if it keeps happening, contact support
            {error?.digest ? ` and share reference ${error.digest}` : ""}.
          </p>
          <button type="button" onClick={() => retry()}
            style={{ marginTop: 16, padding: "10px 22px", borderRadius: 8, border: 0, background: "#2f6d58", color: "#fff", fontSize: 14, cursor: "pointer" }}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}