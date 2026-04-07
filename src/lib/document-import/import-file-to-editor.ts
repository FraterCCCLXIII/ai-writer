"use client";

import { generateJSON } from "@tiptap/core";
import type { JSONContent } from "novel";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { paragraphDocFromPlainText } from "@/lib/plain-text-insert";
import { stripColorFromJsonContent } from "@/lib/strip-pasted-color";
import { importExportExtensions } from "./import-extensions";
import { prepareWordLikeHtml } from "./normalize-import-html";

const MAX_BYTES = 25 * 1024 * 1024;

function extFromName(fileName: string): string {
  const m = fileName.match(/\.([^.]+)$/);
  return (m?.[1] ?? "").toLowerCase();
}

function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

function htmlStringToDoc(html: string): JSONContent {
  const wrapped = `<div>${html}</div>`;
  const doc = generateJSON(wrapped, importExportExtensions) as JSONContent;
  return stripColorFromJsonContent(doc);
}

async function parseDocViaApi(file: File): Promise<string> {
  const form = new FormData();
  form.set("file", file, file.name);
  const res = await fetch("/api/documents/extract", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? "Could not read that Word document.");
  }
  const data = (await res.json()) as { text?: string };
  if (typeof data.text !== "string") {
    throw new Error("Invalid response from document service.");
  }
  return data.text;
}

/**
 * Convert a user file to TipTap JSON for editing (single-document mode).
 */
export async function importFileToEditorContent(file: File): Promise<JSONContent> {
  if (file.size > MAX_BYTES) {
    throw new Error("That file is too large (max 25 MB).");
  }

  const ext = extFromName(file.name);

  if (ext === "doc") {
    const text = await parseDocViaApi(file);
    return paragraphDocFromPlainText(text);
  }

  if (ext === "docx" || ext === "docm" || ext === "dotx") {
    const mammoth = await import("mammoth");
    const buf = await file.arrayBuffer();
    const result = await mammoth.convertToHtml({ arrayBuffer: buf });
    return htmlStringToDoc(prepareWordLikeHtml(result.value));
  }

  if (ext === "rtf") {
    const buffer = await file.arrayBuffer();
    const { RTFJS, WMFJS, EMFJS } = await import("rtf.js");
    RTFJS.loggingEnabled(false);
    WMFJS.loggingEnabled(false);
    EMFJS.loggingEnabled(false);
    const rtfDoc = new RTFJS.Document(buffer, {});
    const elements = await rtfDoc.render();
    const div = document.createElement("div");
    for (const el of elements) {
      div.appendChild(el);
    }
    return htmlStringToDoc(prepareWordLikeHtml(div.innerHTML));
  }

  if (ext === "md" || ext === "markdown" || ext === "mdx") {
    const raw = await file.text();
    const rendered = marked.parse(raw);
    const html = sanitizeHtml(
      typeof rendered === "string" ? rendered : await rendered,
    );
    return htmlStringToDoc(html);
  }

  if (ext === "html" || ext === "htm" || ext === "xhtml") {
    const raw = await file.text();
    return htmlStringToDoc(sanitizeHtml(raw));
  }

  if (
    ext === "txt" ||
    ext === "text" ||
    ext === "log" ||
    ext === "csv" ||
    ext === "tsv" ||
    ext === "xml" ||
    ext === "yaml" ||
    ext === "yml" ||
    ext === "json" ||
    ext === "tex"
  ) {
    const raw = await file.text();
    if (ext === "json") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return paragraphDocFromPlainText(JSON.stringify(parsed, null, 2));
      } catch {
        return paragraphDocFromPlainText(raw);
      }
    }
    return paragraphDocFromPlainText(raw);
  }

  if (ext === "") {
    const raw = await file.text();
    return paragraphDocFromPlainText(raw);
  }

  const raw = await file.text();
  const printable = [...raw].every((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return (
      (c >= 32 && c !== 127) || c === 9 || c === 10 || c === 13
    );
  });
  if (!printable && raw.length > 0) {
    throw new Error(
      "This binary format is not supported. Try .docx, .rtf, or plain text.",
    );
  }
  return paragraphDocFromPlainText(raw);
}
