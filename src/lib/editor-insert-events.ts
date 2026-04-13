export const INSERT_EDITOR_EVENT = "ai-writer:insert-editor" as const;

export type InsertEditorDetail = {
  text: string;
  /** replace selection if any; otherwise insert at cursor */
  mode: "insert" | "replace";
  format?: "markdown" | "plain-text";
  targetRange?: {
    from: number;
    to: number;
  };
};

export function dispatchInsertToEditor(detail: InsertEditorDetail) {
  window.dispatchEvent(
    new CustomEvent<InsertEditorDetail>(INSERT_EDITOR_EVENT, {
      detail,
    }),
  );
}
