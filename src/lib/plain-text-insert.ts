import type { JSONContent } from "novel";
import { splitPlainTextBlocks } from "@/lib/plain-text-blocks";

/**
 * TipTap `insertContent` with a raw string inherits marks at the cursor (e.g.
 * textStyle color from pasted text), which can force black or off-theme colors.
 * This builds JSON with explicit `marks: []` so inserted text uses normal
 * paragraph / theme styling.
 */
export function plainTextToInsertContent(
  text: string,
): JSONContent | JSONContent[] {
  const blocks = splitPlainTextBlocks(text);
  if (blocks.length === 0) {
    return { type: "paragraph", content: [] };
  }
  if (blocks.length === 1) {
    return [{ type: "text", text: blocks[0], marks: [] }];
  }
  return blocks.map((block) => ({
    type: "paragraph",
    content: block ? [{ type: "text", text: block, marks: [] }] : [],
  }));
}
