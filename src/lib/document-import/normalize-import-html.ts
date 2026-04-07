import DOMPurify from "dompurify";

/**
 * Post-process HTML from Word / RTF converters so the editor doesn't get one
 * TipTap paragraph per visual line when the source used hard paragraph breaks
 * mid-sentence.
 */

function sanitizeImportHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

/** Fix entities, merge broken paragraphs, then sanitize (DOCX / RTF import). */
export function prepareWordLikeHtml(html: string): string {
  const fixed = fixDoubleEncodedHtmlEntities(html);
  const merged = mergeAdjacentParagraphsForImport(fixed);
  return sanitizeImportHtml(merged);
}

/** Undo one extra layer of entity encoding (e.g. `&amp;#39;` → `&#39;`). */
export function fixDoubleEncodedHtmlEntities(html: string): string {
  return html
    .replace(/&amp;(#(?:x[0-9a-fA-F]+|[0-9]+);)/gi, "&$1")
    .replace(/&amp;([a-zA-Z][a-zA-Z0-9]*);/g, "&$1;");
}

/**
 * Whether two adjacent block paragraphs should be merged into one (joined with `<br>`).
 * Conservative: avoids merging titles, years, and complete sentences.
 */
export function shouldMergeAdjacentParagraphs(prev: string, next: string): boolean {
  const a = prev.replace(/\s+/g, " ").trim();
  const b = next.replace(/\s+/g, " ").trim();
  if (!a || !b) return false;

  // Clear sentence / block end
  if (/[.!?…]["'»)\]]*\s*$/u.test(a)) return false;

  // Next line is a new URL, bullet, or year-led timeline row
  if (/^(?:https?:\/\/|www\.)/i.test(b)) return false;
  if (/^[-•·]\s/.test(b)) return false;
  if (/^\d{4}\s*[-–—]/.test(b)) return false;

  // Standalone label / title (short first block)
  const aWords = a.split(/\s+/).filter(Boolean);
  if (aWords.length <= 3 && a.length < 48) return false;

  // Likely heading / title line (closes with parenthesis / bracket)
  if (/[)»\]]\s*$/.test(a)) return false;

  // Strong continuation signals
  if (/^[\p{Ll}]/u.test(b)) return true;
  if (/[,;:—–-]\s*$/.test(a)) return true;

  // Long run-on without terminal punctuation (Word hard-break mid-sentence).
  // Require several words so "Compiled by Paul Bloch" + "Prologue" stays split.
  if (aWords.length >= 5 && a.length >= 22) return true;

  return false;
}

/**
 * Merge consecutive `<p>` siblings where `shouldMergeAdjacentParagraphs` applies.
 * Runs recursively so nested `<div><p>…` shapes are handled.
 */
export function mergeAdjacentParagraphsForImport(html: string): string {
  if (typeof document === "undefined") return html;

  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(
      `<div id="import-normalize-root">${html}</div>`,
      "text/html",
    );
  } catch {
    return html;
  }

  const root = doc.getElementById("import-normalize-root");
  if (!root) return html;

  mergeParagraphsInContainer(root);

  return root.innerHTML;
}

function mergeParagraphsInContainer(container: Element): void {
  for (const child of [...container.children]) {
    if (child instanceof Element) {
      mergeParagraphsInContainer(child);
    }
  }

  let el = container.firstElementChild;
  while (el) {
    const next = el.nextElementSibling;
    if (
      el.tagName === "P" &&
      next?.tagName === "P" &&
      shouldMergeAdjacentParagraphs(
        el.textContent ?? "",
        next.textContent ?? "",
      )
    ) {
      el.innerHTML = `${el.innerHTML}<br>${next.innerHTML}`;
      next.remove();
      continue;
    }
    el = el.nextElementSibling;
  }
}
