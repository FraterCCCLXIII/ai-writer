import { Fragment, Slice } from "@tiptap/pm/model";
import type { Mark, Node as PMNode, Schema } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import type { JSONContent } from "novel";

/**
 * Remove inline `color` from textStyle marks so pasted text uses editor/theme colors.
 * Other textStyle attrs (e.g. font) are left intact if present.
 */
function stripColorFromMarks(marks: readonly Mark[]): Mark[] {
  return marks
    .map((m) => {
      if (m.type.name !== "textStyle") return m;
      const attrs = { ...m.attrs } as Record<string, unknown>;
      if (!("color" in attrs) || attrs.color == null) return m;
      delete attrs.color;
      const hasOther = Object.values(attrs).some(
        (v) => v != null && v !== "",
      );
      if (!hasOther) return null;
      return m.type.create(attrs);
    })
    .filter((m): m is Mark => m != null);
}

function transformNode(node: PMNode, schema: Schema): PMNode {
  if (node.isText) {
    const marks = stripColorFromMarks(node.marks);
    return schema.text(node.text ?? "", marks);
  }
  if (node.content.size === 0) return node;
  const mapped = mapFragment(node.content, schema);
  return node.copy(mapped);
}

function mapFragment(fragment: Fragment, schema: Schema): Fragment {
  const children: PMNode[] = [];
  fragment.forEach((node) => {
    children.push(transformNode(node, schema));
  });
  return Fragment.fromArray(children);
}

export function stripColorFromPastedSlice(
  slice: Slice,
  view: EditorView,
): Slice {
  const schema = view.state.schema;
  const content = mapFragment(slice.content, schema);
  return new Slice(content, slice.openStart, slice.openEnd);
}

function stripColorFromJsonMarks(
  marks: JSONContent["marks"] | undefined,
): JSONContent["marks"] | undefined {
  if (!marks?.length) return marks;
  let changed = false;
  const next: NonNullable<JSONContent["marks"]> = [];
  for (const m of marks) {
    if (m.type !== "textStyle") {
      next.push(m);
      continue;
    }
    const attrs = { ...(m.attrs ?? {}) } as Record<string, unknown>;
    if (!("color" in attrs) || attrs.color == null) {
      next.push(m);
      continue;
    }
    changed = true;
    delete attrs.color;
    const hasOther = Object.values(attrs).some(
      (v) => v != null && v !== "",
    );
    if (!hasOther) continue;
    next.push({ ...m, attrs });
  }
  if (!changed) return marks;
  return next.length ? next : undefined;
}

function stripColorFromJsonNode(node: JSONContent): JSONContent {
  const out: JSONContent = { ...node };
  if (Object.prototype.hasOwnProperty.call(out, "text")) {
    const marks = stripColorFromJsonMarks(out.marks);
    if (marks !== out.marks) {
      if (marks?.length) out.marks = marks;
      else delete out.marks;
    }
  }
  if (out.content?.length) {
    out.content = out.content.map(stripColorFromJsonNode);
  }
  return out;
}

/**
 * Remove inline `color` from serialized `textStyle` marks (same rules as paste).
 * Use after `generateJSON` from imported HTML so docx/RTF/HTML uses theme foreground.
 */
export function stripColorFromJsonContent(doc: JSONContent): JSONContent {
  return stripColorFromJsonNode(doc);
}
