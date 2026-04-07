import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const contextHighlightPluginKey = new PluginKey("aiWriterContextHighlight");

export const ContextHighlight = Extension.create({
  name: "contextHighlight",

  addProseMirrorPlugins() {
    const key = contextHighlightPluginKey;
    return [
      new Plugin({
        key,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(key);
            if (meta !== undefined) {
              if (meta === null) return DecorationSet.empty;
              const { from, to } = meta as { from: number; to: number };
              if (from >= to || to > tr.doc.content.size) {
                return DecorationSet.empty;
              }
              try {
                return DecorationSet.create(tr.doc, [
                  Decoration.inline(from, to, {
                    class: "context-selection-highlight",
                  }),
                ]);
              } catch {
                return DecorationSet.empty;
              }
            }
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});
