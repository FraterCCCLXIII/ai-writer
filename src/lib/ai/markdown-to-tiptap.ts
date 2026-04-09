"use client";

import { generateJSON } from "@tiptap/core";
import type { JSONContent } from "novel";
import { marked } from "marked";
import { importExportExtensions } from "@/lib/document-import/import-extensions";
import { plainTextToInsertContent } from "@/lib/plain-text-insert";

/**
 * Convert a markdown string (as returned by the AI) to an array of TipTap
 * block nodes suitable for `editor.commands.insertContent(...)`.
 *
 * Falls back to plain-text paragraph splitting if parsing fails.
 */
export function markdownToTiptapNodes(
  markdown: string,
): JSONContent | JSONContent[] {
  try {
    const html = marked.parse(markdown, { async: false }) as string;
    const doc = generateJSON(`<div>${html}</div>`, importExportExtensions) as JSONContent;
    const nodes = doc?.content ?? [];
    if (nodes.length > 0) return nodes;
  } catch {
    // fall through to plain-text fallback
  }
  return plainTextToInsertContent(markdown);
}
