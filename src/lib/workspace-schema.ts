import type { PersistedWorkspace } from "@/documents/types";

/**
 * Minimal validation for opening a workspace JSON file.
 */
export function parsePersistedWorkspace(
  json: unknown,
): PersistedWorkspace | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!o.project || typeof o.project !== "object") return null;
  const proj = o.project as Record<string, unknown>;
  if (typeof proj.id !== "string" || typeof proj.title !== "string")
    return null;
  if (!Array.isArray(o.chapters) || o.chapters.length === 0) return null;
  return json as PersistedWorkspace;
}
