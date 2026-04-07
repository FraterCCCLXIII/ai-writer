/**
 * Picker + docs — safe to import anywhere (no TipTap / Novel / DOM).
 */

/**
 * Broad `accept` so macOS / Electron dialogs don’t grey out files.
 * Unsupported types are rejected in `importFileToEditorContent`.
 */
export const FILE_PICKER_ACCEPT_ALL = "*/*";

/** Reference list of extensions we try to import (not used as HTML `accept`). */
export const EDITABLE_DOCUMENT_ACCEPT =
  ".txt,.text,.md,.markdown,.mdx,.rtf,.html,.htm,.xhtml,.doc,.docx,.docm,.dotx,.csv,.tsv,.log,.json,.xml,.yaml,.yml,.tex";
