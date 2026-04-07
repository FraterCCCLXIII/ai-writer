"use client";

/**
 * Renders when the root layout throws. Must define html/body (replaces root layout).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          background: "#0c0c0e",
          color: "#fafafa",
        }}
      >
        <h1 style={{ fontSize: "1.25rem" }}>Manuscript could not load</h1>
        <pre
          style={{
            marginTop: 16,
            color: "#f87171",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            fontSize: 13,
          }}
        >
          {error.message}
        </pre>
        {error.digest ? (
          <p style={{ color: "#a1a1aa", fontSize: 12 }}>Digest: {error.digest}</p>
        ) : null}
        <div style={{ marginTop: 20, display: "flex", flexWrap: "wrap", gap: 12 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #3f3f46",
              background: "#18181b",
              color: "#fafafa",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              window.location.reload();
            }}
            style={{
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid #3b82f6",
              background: "#1e3a5f",
              color: "#eff6ff",
              cursor: "pointer",
            }}
          >
            Reload page
          </button>
        </div>
        <p style={{ marginTop: 16, color: "#a1a1aa", fontSize: 12, maxWidth: 420 }}>
          If this keeps happening after a force-reload, stop the dev server and run{" "}
          <code style={{ color: "#e4e4e7" }}>npm run dev</code> again, or quit and reopen the
          desktop app.
        </p>
      </body>
    </html>
  );
}
