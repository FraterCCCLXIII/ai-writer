"use client";

import { useCallback, useEffect, useState } from "react";
import { Minus, Square, X } from "lucide-react";
import { AppMenu } from "@/components/app-menu";
import { DocumentExportMenu } from "@/components/document-export/document-export-menu";
import { useProjectStore } from "@/store/project-store";
import { isElectronApp } from "@/lib/electron-bridge";
import { cn } from "@/lib/utils";

const TITLEBAR_H = "h-9"; /* 36px — must match layout offsets in app-shell / home-screen */

function TrafficLights({
  onClose,
  onMinimize,
  onMaximize,
}: {
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}) {
  return (
    <div className="app-region-no-drag flex items-center gap-2 pl-3">
      <button
        type="button"
        aria-label="Close"
        title="Close"
        className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-[#ff5f57] outline-none ring-offset-background hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onClose}
      />
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-[#febc2e] outline-none ring-offset-background hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onMinimize}
      />
      <button
        type="button"
        aria-label="Zoom"
        title="Zoom"
        className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-[#28c840] outline-none ring-offset-background hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onMaximize}
      />
    </div>
  );
}

function WindowsControls({
  maximized,
  onClose,
  onMinimize,
  onMaximize,
}: {
  maximized: boolean;
  onClose: () => void;
  onMinimize: () => void;
  onMaximize: () => void;
}) {
  return (
    <div className="app-region-no-drag flex items-center pr-1">
      <button
        type="button"
        aria-label="Minimize"
        title="Minimize"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onMinimize}
      >
        <Minus className="h-4 w-4" strokeWidth={2.25} />
      </button>
      <button
        type="button"
        aria-label={maximized ? "Restore" : "Maximize"}
        title={maximized ? "Restore" : "Maximize"}
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={onMaximize}
      >
        {maximized ? (
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 10 10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden
          >
            <path d="M2.5 3.5h5v5h-5z" />
            <path d="M3.5 2.5v-1h5v5h-1" />
          </svg>
        ) : (
          <Square className="h-3.5 w-3.5" strokeWidth={2.25} />
        )}
      </button>
      <button
        type="button"
        aria-label="Close"
        title="Close"
        className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-[#e81123] hover:text-white"
        onClick={onClose}
      >
        <X className="h-4 w-4" strokeWidth={2.25} />
      </button>
    </div>
  );
}

export type ElectronTitleBarProps = {
  /** Shown in the center drag region (e.g. app name). */
  title?: string;
  className?: string;
};

/**
 * Desktop-only window frame: traffic lights on macOS (left), Win/Linux controls on the right.
 */
export function ElectronTitleBar({ title = "Manuscript", className }: ElectronTitleBarProps) {
  const showExport = useProjectStore(
    (s) => s.workspaceScreen === "editor" && s.config.activeFilePath != null,
  );
  const [isMac, setIsMac] = useState(false);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.platform) return;
    setIsMac(api.platform === "darwin");
    void api.windowIsMaximized?.().then(setMaximized);
  }, []);

  const subscribe = useCallback(() => {
    const api = window.electronAPI;
    if (!api?.platform) return () => {};
    return api.subscribeMaximized?.(setMaximized) ?? (() => {});
  }, []);

  useEffect(() => {
    if (!isElectronApp()) return;
    return subscribe();
  }, [subscribe]);

  const close = () => void window.electronAPI?.windowClose?.();
  const minimize = () => void window.electronAPI?.windowMinimize?.();
  const toggleMax = () => void window.electronAPI?.windowToggleMaximize?.();

  if (!isElectronApp()) {
    return null;
  }

  /**
   * Frameless window: only the center strip uses `app-region-drag`. Putting drag on the
   * whole header makes Electron swallow clicks on traffic lights, menus, and window buttons.
   */
  return (
    <header
      className={cn(
        "sticky top-0 z-[60] flex shrink-0 items-center border-b border-border bg-background",
        TITLEBAR_H,
        className,
      )}
    >
      {isMac ? (
        <>
          <TrafficLights
            onClose={close}
            onMinimize={minimize}
            onMaximize={toggleMax}
          />
          <div
            className="app-region-drag flex min-w-0 flex-1 cursor-default items-center justify-center px-3 text-center text-xs font-medium text-muted-foreground"
            onDoubleClick={toggleMax}
          >
            <span className="truncate">{title}</span>
          </div>
          <div className="app-region-no-drag flex max-w-[min(280px,42vw)] shrink-0 items-center justify-end gap-1 pr-1">
            {showExport ? (
              <DocumentExportMenu triggerClassName="h-7 gap-1 px-2 text-xs" />
            ) : null}
            <AppMenu triggerClassName="h-7 w-7" />
          </div>
        </>
      ) : (
        <>
          <div
            className="app-region-drag flex min-w-0 flex-1 cursor-default items-center px-3 text-xs font-medium text-muted-foreground"
            onDoubleClick={toggleMax}
          >
            <span className="truncate">{title}</span>
          </div>
          <div className="app-region-no-drag flex shrink-0 items-center gap-1 pr-0.5">
            {showExport ? (
              <DocumentExportMenu triggerClassName="h-7 gap-1 px-2 text-xs" />
            ) : null}
            <AppMenu triggerClassName="h-7 w-7" />
          </div>
          <WindowsControls
            maximized={maximized}
            onClose={close}
            onMinimize={minimize}
            onMaximize={toggleMax}
          />
        </>
      )}
    </header>
  );
}
