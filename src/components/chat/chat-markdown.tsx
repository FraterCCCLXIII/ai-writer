"use client";

import { useMemo } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";

type Props = {
  content: string;
  className?: string;
};

/**
 * Renders AI assistant markdown responses as sanitized HTML inside the chat
 * panel. Uses the same marked + DOMPurify pipeline as the document importer.
 */
export function ChatMarkdown({ content, className }: Props) {
  const html = useMemo(() => {
    if (!content) return "";
    try {
      const raw = marked.parse(content, { async: false }) as string;
      return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
    } catch {
      return content;
    }
  }, [content]);

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words",
        // Tighten default prose spacing for the narrow chat panel
        "[&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm",
        "[&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5",
        "[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted/60 [&_pre]:p-2 [&_pre]:text-xs",
        "[&_code]:rounded [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        "[&_hr]:border-border",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
