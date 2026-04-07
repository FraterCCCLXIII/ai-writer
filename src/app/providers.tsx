"use client";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner";
import { FileImportHost } from "@/components/file-import/file-import-host";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark">
      {children}
      <FileImportHost />
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  );
}
