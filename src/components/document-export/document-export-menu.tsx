"use client";

import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  defaultExportBasename,
  exportAsDocxFile,
  exportAsHtmlFile,
  exportAsMarkdownFile,
  exportAsTextFile,
} from "@/lib/document-export/export-document";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";

type Props = {
  triggerClassName?: string;
};

export function DocumentExportMenu({ triggerClassName }: Props) {
  const project = useProjectStore((s) => s.project);
  const activeChapterId = useProjectStore((s) => s.activeChapterId);
  const chapters = useProjectStore((s) => s.chapters);

  if (project.editorLayout !== "singleDocument") return null;

  const content = chapters.find((c) => c.id === activeChapterId)?.content;
  if (!content) return null;

  const basename = defaultExportBasename(project.title, project.singleFileName);

  const run = (label: string, fn: () => void | Promise<void>) => {
    void (async () => {
      try {
        await fn();
        toast.success(`Exported ${label}`);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : `Could not export as ${label}.`,
        );
      }
    })();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            "app-region-no-drag gap-2 shrink-0",
            triggerClassName,
          )}
          title="Export document"
        >
          <FileDown className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Save as
        </DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() => run("Plain text", () => exportAsTextFile(content, basename))}
        >
          Plain text (.txt)
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => run("HTML", () => exportAsHtmlFile(content, basename))}
        >
          Web page (.html)
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            run("Markdown", () => exportAsMarkdownFile(content, basename))
          }
        >
          Markdown (.md)
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            run("Word", () => exportAsDocxFile(content, basename))
          }
        >
          Word (.docx)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
