import type { JSONContent } from "novel";

export function jsonToPlainText(doc: JSONContent | null | undefined): string {
  if (!doc) return "";
  const lines: string[] = [];

  function walk(node: JSONContent) {
    if (node.text) lines.push(node.text);
    if (node.type === "hardBreak") lines.push("\n");
    if (node.content) {
      for (const child of node.content) {
        walk(child);
      }
      if (
        node.type === "paragraph" ||
        node.type === "heading" ||
        node.type === "blockquote" ||
        node.type === "listItem" ||
        node.type === "codeBlock"
      ) {
        lines.push("\n");
      }
    }
  }

  walk(doc);
  return lines.join("").replace(/\n{3,}/g, "\n\n").trim();
}
