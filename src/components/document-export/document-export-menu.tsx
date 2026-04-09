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
  const config = useProjectStore((s) => s.config);
  const openFiles = useProjectStore((s) => s.openFiles);
  const activeFilePath = config.activeFilePath;

  if (!activeFilePath) return null;

  const entry = openFiles.get(activeFilePath);
  if (!entry) return null;

  const content = entry.content;
  const basename = defaultExportBasename(
    config.project.title,
    activeFilePath.replace(/\.[^.]+$/, ""),
  );

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
