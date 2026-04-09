"use client";

import { generateHTML, generateJSON } from "@tiptap/core";
import type { JSONContent } from "novel";
import { marked } from "marked";
import TurndownService from "turndown";
import { importExportExtensions } from "@/lib/document-import/import-extensions";

const turndown = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
});

const emptyDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * Convert TipTap JSONContent to a Markdown string for writing to .md files.
 */
export function jsonContentToMarkdown(doc: JSONContent): string {
  try {
    const html = generateHTML(doc, importExportExtensions);
    return turndown.turndown(`<div>${html}</div>`);
  } catch {
    return "";
  }
}

/**
 * Convert a Markdown string (from disk) to TipTap JSONContent for the editor.
 */
export function markdownToJsonContent(markdown: string): JSONContent {
  if (!markdown.trim()) return emptyDoc;
  try {
    const html = marked.parse(markdown, { async: false }) as string;
    const doc = generateJSON(
      `<div>${html}</div>`,
      importExportExtensions,
    ) as JSONContent;
    if (doc?.content && doc.content.length > 0) return doc;
    return emptyDoc;
  } catch {
    return emptyDoc;
  }
}

/** Determine if a file is an editable text/markdown file by extension. */
export function isEditableFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ["md", "markdown", "txt", "text", ""].includes(ext);
}

/** Get file extension (lowercase, no dot). */
export function getFileExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0) return "";
  return filename.slice(idx + 1).toLowerCase();
}
