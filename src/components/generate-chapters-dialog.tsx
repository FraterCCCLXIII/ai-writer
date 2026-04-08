"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getAiOverridesForRequest } from "@/lib/ai-settings";
import {
  buildResearchCorpus,
  buildStyleHintBeforeRange,
  chapterHasContent,
  fetchGenerateChaptersFromResearch,
  resolveChapterRange,
  type ResolveChapterRangeOk,
} from "@/lib/generate-chapters-from-research";
import { paragraphDocFromPlainText } from "@/lib/plain-text-insert";
import { useProjectStore } from "@/store/project-store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When opening from chat, pre-fill the range. */
  initialRange?: { start: number; end: number };
};

export function GenerateChaptersDialog({
  open,
  onOpenChange,
  initialRange,
}: Props) {
  const [phase, setPhase] = useState<"form" | "confirm">("form");
  const [startStr, setStartStr] = useState("1");
  const [endStr, setEndStr] = useState("1");
  const [pending, setPending] = useState<ResolveChapterRangeOk | null>(null);
  const [overwriteTitles, setOverwriteTitles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const project = useProjectStore((s) => s.project);
  const chapters = useProjectStore((s) => s.chapters);
  const researchDocuments = useProjectStore((s) => s.researchDocuments);
  const updateChapterContent = useProjectStore((s) => s.updateChapterContent);
  const selectChapter = useProjectStore((s) => s.selectChapter);
  const flushWorkspace = useProjectStore((s) => s.flushWorkspace);

  useEffect(() => {
    if (!open) return;
    setPhase("form");
    setPending(null);
    setOverwriteTitles([]);
    setLoading(false);
    if (initialRange) {
      setStartStr(String(initialRange.start));
      setEndStr(String(initialRange.end));
    } else {
      setStartStr("1");
      setEndStr("1");
    }
  }, [open, initialRange]);

  const runApi = async (resolved: ResolveChapterRangeOk) => {
    const corpus = buildResearchCorpus(researchDocuments);
    if (!corpus.trim()) {
      toast.error("Add research notes first.");
      return;
    }
    setLoading(true);
    try {
      const styleHint = buildStyleHintBeforeRange(chapters, resolved.start);
      const result = await fetchGenerateChaptersFromResearch({
        startChapter: resolved.start,
        endChapter: resolved.end,
        chapterTargets: resolved.targets,
        researchCorpus: corpus,
        styleHint,
        ...getAiOverridesForRequest(),
      });

      for (const ch of result.chapters) {
        const id = resolved.targets.find((t) => t.index === ch.index)?.id;
        if (!id) continue;
        updateChapterContent(id, paragraphDocFromPlainText(ch.plainText));
      }
      selectChapter(resolved.targets[0]!.id);
      flushWorkspace();
      toast.success(
        `Updated chapters ${resolved.start}–${resolved.end} from research.`,
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitForm = () => {
    if (project.editorLayout === "singleDocument") {
      toast.error("Switch to a manuscript project to generate chapters.");
      return;
    }
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      toast.error("Enter valid chapter numbers.");
      return;
    }
    const resolved = resolveChapterRange(start, end, chapters);
    if ("error" in resolved) {
      toast.error(resolved.error);
      return;
    }
    const titles = resolved.targets
      .map((t) => chapters.find((c) => c.id === t.id))
      .filter((c): c is NonNullable<typeof c> => c != null)
      .filter(chapterHasContent)
      .map((c) => c.title);

    if (titles.length > 0) {
      setPending(resolved);
      setOverwriteTitles(titles);
      setPhase("confirm");
      return;
    }
    void runApi(resolved);
  };

  const onConfirmOverwrite = () => {
    if (!pending) return;
    void runApi(pending);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {phase === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Generate chapters from research</DialogTitle>
              <DialogDescription>
                Drafts prose for the chapter range using your research notes.
                Say in chat:{" "}
                <span className="font-mono text-foreground">
                  build chapters 3-5
                </span>
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="gen-ch-start"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    First chapter (1-based)
                  </label>
                  <Input
                    id="gen-ch-start"
                    type="number"
                    min={1}
                    className="mt-1"
                    value={startStr}
                    onChange={(e) => setStartStr(e.target.value)}
                    disabled={loading}
                  />
                </div>
                <div>
                  <label
                    htmlFor="gen-ch-end"
                    className="text-xs font-medium text-muted-foreground"
                  >
                    Last chapter (inclusive)
                  </label>
                  <Input
                    id="gen-ch-end"
                    type="number"
                    min={1}
                    className="mt-1"
                    value={endStr}
                    onChange={(e) => setEndStr(e.target.value)}
                    disabled={loading}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void onSubmitForm()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Generate"
                )}
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Replace existing text?</DialogTitle>
              <DialogDescription>
                These chapters already have content. Continuing will replace
                their body text with new drafts from research.
              </DialogDescription>
            </DialogHeader>
            <ul className="max-h-36 list-inside list-disc overflow-y-auto text-sm text-foreground">
              {overwriteTitles.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPhase("form");
                  setPending(null);
                }}
                disabled={loading}
              >
                Back
              </Button>
              <Button
                type="button"
                onClick={() => void onConfirmOverwrite()}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
