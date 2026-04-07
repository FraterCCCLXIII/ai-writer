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
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 20,
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
      </body>
    </html>
  );
}
