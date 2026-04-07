/**
 * Split pasted or inserted plain text into paragraph-sized blocks.
 * - Blank lines → paragraph boundaries (normal prose).
 * - If there is only one “segment” but it still contains newlines, split on
 *   single newlines (typical chat / copied-line-list behavior).
 */
export function splitPlainTextBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return [];

  const byBlank = normalized.split(/\n\s*\n/).map((s) => s.trim());
  const filtered = byBlank.filter(Boolean);
  if (filtered.length > 1) return filtered;

  const single = filtered[0] ?? normalized;
  if (single.includes("\n")) {
    return single
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [single];
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Normalize clipboard HTML so block boundaries become real `<p>` nodes.
 * Used as ProseMirror `transformPastedHTML` when sources (chat, browsers) put
 * everything in one `<div>` or use `<br>` instead of paragraphs.
 */
export function normalizePastedHtmlForParagraphs(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return html;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(trimmed, "text/html");
  } catch {
    return html;
  }

  const body = doc.body;
  if (!body) return html;

  const direct = [...body.children];

  // One wrapper div with multiple inner div/p (common clipboard shape)
  if (direct.length === 1 && direct[0].tagName === "DIV") {
    const inner = [...direct[0].children].filter(
      (c) => c.tagName === "DIV" || c.tagName === "P",
    );
    if (inner.length > 1) {
      const parts = inner
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean);
      if (parts.length > 1) {
        return parts.map((b) => `<p>${escapeHtml(b)}</p>`).join("");
      }
    }
  }

  // Several sibling divs/p (common from chat or Chrome copy)
  if (direct.length > 1) {
    const onlyBlocks = direct.every((c) =>
      /^(DIV|P)$/i.test(c.tagName),
    );
    if (onlyBlocks) {
      const parts = direct
        .map((el) => (el.textContent || "").trim())
        .filter(Boolean);
      if (parts.length > 1) {
        return parts.map((b) => `<p>${escapeHtml(b)}</p>`).join("");
      }
    }
  }

  if (direct.length === 1) {
    const el = direct[0];
    const tag = el.tagName;
    if (tag === "DIV" || tag === "P") {
      const inner = el.innerHTML;
      if (/<br\s*\/?>/i.test(inner)) {
        const segments = inner.split(/<br\s*\/?>/i);
        const blocks = segments
          .map((segment) => {
            const wrap = document.createElement("div");
            wrap.innerHTML = segment;
            return (wrap.textContent || "").trim();
          })
          .filter(Boolean);
        if (blocks.length > 1) {
          return blocks.map((b) => `<p>${escapeHtml(b)}</p>`).join("");
        }
      }
      const text = el.textContent || "";
      if (text.includes("\n")) {
        const blocks = splitPlainTextBlocks(text);
        if (blocks.length > 1) {
          return blocks.map((b) => `<p>${escapeHtml(b)}</p>`).join("");
        }
      }
    }
  }

  return html;
}
