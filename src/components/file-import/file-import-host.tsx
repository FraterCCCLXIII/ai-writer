"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { FILE_PICKER_ACCEPT_ALL } from "@/lib/document-import/document-import-constants";
import { useProjectStore } from "@/store/project-store";

/**
 * Global hidden file input for importing files into the workspace.
 */
export function FileImportHost() {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickRequest = useProjectStore((s) => s.fileImportPickRequest);
  const createFile = useProjectStore((s) => s.createFile);

  useEffect(() => {
    if (pickRequest === 0) return;
    inputRef.current?.click();
  }, [pickRequest]);

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const name = file.name || "Imported.md";
    void (async () => {
      try {
        await createFile(null, name);
        toast.success(`Created ${name}`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not import that file.",
        );
      }
    })();
  };

  return (
    <input
      ref={inputRef}
      type="file"
      className="hidden"
      accept={FILE_PICKER_ACCEPT_ALL}
      onChange={onChange}
    />
  );
}
