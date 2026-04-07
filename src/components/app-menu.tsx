"use client";

import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";
import { Cog, FileText, Moon, Settings, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SettingsModal } from "@/components/settings-modal";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";

type Props = {
  /** Extra classes for the trigger button (e.g. title bar sizing). */
  triggerClassName?: string;
};

export function AppMenu({ triggerClassName }: Props) {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const requestFileImport = useProjectStore((s) => s.requestFileImport);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "app-region-no-drag shrink-0 text-muted-foreground hover:bg-muted hover:text-foreground",
              triggerClassName,
            )}
            aria-label="App menu"
            title="App menu"
          >
            <Cog className="h-4 w-4" strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Appearance
          </DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={mounted ? isDark : false}
            disabled={!mounted}
            onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex items-center gap-2">
              {mounted && isDark ? (
                <Moon className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <Sun className="h-4 w-4 shrink-0" aria-hidden />
              )}
              Dark mode
            </span>
          </DropdownMenuCheckboxItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            onClick={() => requestFileImport()}
          >
            <FileText className="h-4 w-4 shrink-0" aria-hidden />
            Open file…
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="h-4 w-4 shrink-0" aria-hidden />
            Settings…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
