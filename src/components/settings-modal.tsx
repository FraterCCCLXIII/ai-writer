"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  loadAiSettings,
  saveAiSettings,
  type AiSettings,
} from "@/lib/ai-settings";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const MODE_LABELS: { key: "ask" | "edit" | "agent"; label: string; hint: string }[] = [
  { key: "ask", label: "Ask", hint: "Conversational / brainstorming (fast model recommended)" },
  { key: "edit", label: "Edit", hint: "Targeted edits to chapters (balanced model)" },
  { key: "agent", label: "Agent", hint: "Autonomous multi-step tasks (most capable model)" },
];

export function SettingsModal({ open, onOpenChange }: Props) {
  const [draft, setDraft] = useState<AiSettings>(() => loadAiSettings());

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setDraft(loadAiSettings()));
    return () => cancelAnimationFrame(id);
  }, [open]);

  const onSave = () => {
    saveAiSettings(draft);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure OpenAI-compatible API access. Keys are stored locally in
            this browser. Server environment variables are used when fields are
            left empty.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <label htmlFor="settings-api-key" className="text-sm font-medium">
              API key
            </label>
            <Input
              id="settings-api-key"
              type="password"
              autoComplete="off"
              placeholder="sk-…"
              value={draft.openaiApiKey}
              onChange={(e) =>
                setDraft((d) => ({ ...d, openaiApiKey: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="settings-base-url" className="text-sm font-medium">
              Base URL
            </label>
            <Input
              id="settings-base-url"
              type="url"
              autoComplete="off"
              placeholder="https://api.openai.com/v1"
              value={draft.openaiBaseUrl}
              onChange={(e) =>
                setDraft((d) => ({ ...d, openaiBaseUrl: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Omit to use the default OpenAI API URL from the server.
            </p>
          </div>
          <div className="grid gap-2">
            <label htmlFor="settings-model" className="text-sm font-medium">
              Default model
            </label>
            <Input
              id="settings-model"
              autoComplete="off"
              placeholder="gpt-4o-mini"
              value={draft.openaiModel}
              onChange={(e) =>
                setDraft((d) => ({ ...d, openaiModel: e.target.value }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Used for all modes unless overridden below.
            </p>
          </div>

          <Separator />

          <div className="grid gap-3">
            <p className="text-sm font-medium">Per-mode model overrides</p>
            <p className="text-xs text-muted-foreground -mt-1">
              Leave blank to use the default model above.
            </p>
            {MODE_LABELS.map(({ key, label, hint }) => (
              <div key={key} className="grid gap-1.5">
                <label
                  htmlFor={`settings-model-${key}`}
                  className="text-sm font-medium"
                >
                  {label}
                </label>
                <Input
                  id={`settings-model-${key}`}
                  autoComplete="off"
                  placeholder={draft.openaiModel || "gpt-4o-mini"}
                  value={draft.modes[key].model}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      modes: {
                        ...d.modes,
                        [key]: { model: e.target.value },
                      },
                    }))
                  }
                />
                <p className="text-xs text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
