"use client";

import { generateHTML } from "@tiptap/core";
import type { JSONContent } from "novel";
import {
  Document as DocxDocument,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import TurndownService from "turndown";
import { saveAs } from "file-saver";
import { jsonToPlainText } from "@/lib/tiptap-plain-text";
import { importExportExtensions } from "@/lib/document-import/import-extensions";

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

function safeFilenameStem(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, "-").trim() || "document";
}

export function defaultExportBasename(projectTitle: string, singleFileName?: string): string {
  if (singleFileName) {
    return safeFilenameStem(singleFileName.replace(/\.[^.]+$/, "") || projectTitle);
  }
  return safeFilenameStem(projectTitle);
}

export function exportAsHtmlFile(content: JSONContent, basename: string): void {
  const body = generateHTML(content, importExportExtensions);
  const full = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(basename)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
  img { max-width: 100%; height: auto; }
</style>
</head>
<body>
${body}
</body>
</html>`;
  const blob = new Blob([full], { type: "text/html;charset=utf-8" });
  saveAs(blob, `${basename}.html`);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function exportAsMarkdownFile(content: JSONContent, basename: string): void {
  const html = generateHTML(content, importExportExtensions);
  const md = turndown.turndown(`<div>${html}</div>`);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  saveAs(blob, `${basename}.md`);
}

export function exportAsTextFile(content: JSONContent, basename: string): void {
  const text = jsonToPlainText(content);
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  saveAs(blob, `${basename}.txt`);
}

function headingLevelFromAttrs(level: number | undefined): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
  const lv = Math.min(6, Math.max(1, level ?? 1));
  const map = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ] as const;
  return map[lv - 1]!;
}

function runsFromInline(nodes: JSONContent[] | undefined): TextRun[] {
  if (!nodes?.length) return [new TextRun("")];
  const runs: TextRun[] = [];
  for (const n of nodes) {
    if (n.type === "text" && typeof n.text === "string") {
      const marks = n.marks ?? [];
      const bold = marks.some((m) => m.type === "bold");
      const italics = marks.some((m) => m.type === "italic");
      const underline = marks.some((m) => m.type === "underline");
      runs.push(
        new TextRun({
          text: n.text,
          bold: bold || undefined,
          italics: italics || undefined,
          underline: underline ? { type: "single" } : undefined,
        }),
      );
    } else if (n.type === "hardBreak") {
      runs.push(new TextRun({ break: 1 }));
    }
  }
  return runs.length ? runs : [new TextRun("")];
}

function collectText(node: JSONContent): string {
  if (node.text) return node.text;
  if (node.content) return node.content.map(collectText).join("");
  return "";
}

function walkListItem(item: JSONContent, depth: number): Paragraph[] {
  const out: Paragraph[] = [];
  for (const child of item.content ?? []) {
    if (child.type === "paragraph") {
      out.push(
        new Paragraph({
          bullet: { level: depth },
          children: runsFromInline(child.content),
        }),
      );
    } else if (child.type === "bulletList" || child.type === "orderedList") {
      for (const sub of child.content ?? []) {
        if (sub.type === "listItem") {
          out.push(...walkListItem(sub, depth + 1));
        }
      }
    } else {
      out.push(...walkBlock(child, depth));
    }
  }
  return out;
}

function walkBlock(node: JSONContent, listDepth: number): Paragraph[] {
  const out: Paragraph[] = [];
  if (!node) return out;

  switch (node.type) {
    case "doc":
      for (const c of node.content ?? []) {
        out.push(...walkBlock(c, listDepth));
      }
      break;
    case "paragraph":
      out.push(new Paragraph({ children: runsFromInline(node.content) }));
      break;
    case "heading": {
      const hl = headingLevelFromAttrs(node.attrs?.level as number | undefined);
      out.push(
        new Paragraph({
          heading: hl,
          children: runsFromInline(node.content),
        }),
      );
      break;
    }
    case "blockquote":
      for (const c of node.content ?? []) {
        out.push(...walkBlock(c, listDepth));
      }
      break;
    case "bulletList":
    case "orderedList":
      for (const item of node.content ?? []) {
        if (item.type === "listItem") {
          out.push(...walkListItem(item, listDepth));
        }
      }
      break;
    case "codeBlock": {
      const text = collectText(node);
      out.push(new Paragraph({ children: [new TextRun({ text })] }));
      break;
    }
    case "horizontalRule":
      out.push(new Paragraph({ children: [new TextRun("—")] }));
      break;
    default:
      break;
  }
  return out;
}

function jsonContentToDocxParagraphs(doc: JSONContent): Paragraph[] {
  const out = walkBlock(doc, 0);
  if (out.length === 0) {
    out.push(new Paragraph({ children: [new TextRun("")] }));
  }
  return out;
}

export async function exportAsDocxFile(
  content: JSONContent,
  basename: string,
): Promise<void> {
  const paragraphs = jsonContentToDocxParagraphs(content);
  const doc = new DocxDocument({
    sections: [{ children: paragraphs }],
  });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${basename}.docx`);
}
