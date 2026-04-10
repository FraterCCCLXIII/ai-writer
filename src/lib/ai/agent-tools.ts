import { tool } from "ai";
import { z } from "zod";
import type {
  AgentWorkspaceSnapshot,
  ChatMode,
  TodoItem,
  WriteMutation,
} from "./types";
import {
  splitResearchIntoChunks,
  buildIdfFromChunks,
  tfidfVectorFromChunks,
  cosineSimilarityVectors,
  tokenize,
} from "@/lib/research/live-notes";

/**
 * Mutable session state threaded through all tool executions within a single
 * agent run. The route handler creates this once per request and closes over it.
 */
export type AgentSessionState = {
  snapshot: AgentWorkspaceSnapshot;
  mutations: WriteMutation[];
  todos: TodoItem[];
};

function createId(): string {
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function findChapter(
  snapshot: AgentWorkspaceSnapshot,
  title?: string,
  index?: number,
): { id: string; title: string; plainText: string } | null {
  if (title) {
    const lower = title.toLowerCase();
    return (
      snapshot.chapters.find((c) => c.title.toLowerCase() === lower) ?? null
    );
  }
  if (index != null) {
    const sorted = [...snapshot.chapters].sort((a, b) => a.order - b.order);
    return sorted[index - 1] ?? null;
  }
  return null;
}

/**
 * Build all writing tools bound to a shared session state object.
 * The route handler passes the state in and reads mutations/todos back after streaming.
 *
 * In "ask" mode only read-only tools are provided; write tools (edit, create,
 * folder/file management) are excluded so the AI cannot modify the workspace.
 *
 * Note: AI SDK v6 uses `inputSchema` (not `parameters`) and `execute` takes
 * `(input, options)` rather than destructured args.
 */
export function buildWritingTools(
  state: AgentSessionState,
  mode: ChatMode = "agent",
) {
  const readOnlyTools = {
    list_chapters: tool({
      description:
        "List all chapters in the manuscript with their titles and order. Call this before reading or editing to know what chapters exist.",
      inputSchema: z.object({}),
      execute: async () => {
        const sorted = [...state.snapshot.chapters].sort(
          (a, b) => a.order - b.order,
        );
        if (sorted.length === 0) return "No chapters found.";
        return sorted
          .map((c, i) => `${i + 1}. "${c.title}" (id: ${c.id})`)
          .join("\n");
      },
    }),

    read_chapter: tool({
      description:
        "Read the full text content of a chapter. Provide either chapterTitle (exact name) or chapterIndex (1-based position).",
      inputSchema: z.object({
        chapterTitle: z
          .string()
          .optional()
          .describe("Exact chapter title to read"),
        chapterIndex: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("1-based chapter index to read"),
      }),
      execute: async (input) => {
        const ch = findChapter(
          state.snapshot,
          input.chapterTitle,
          input.chapterIndex,
        );
        if (!ch)
          return `Chapter not found. Use list_chapters to see available chapters.`;
        const preview = ch.plainText.trim();
        if (!preview) return `Chapter "${ch.title}" is empty.`;
        return `## Chapter: "${ch.title}"\n\n${preview}`;
      },
    }),

    search_research: tool({
      description:
        "Search through research notes for content relevant to a query. Returns the top matching excerpts.",
      inputSchema: z.object({
        query: z.string().describe("Natural language search query"),
      }),
      execute: async (input) => {
        const docs = state.snapshot.researchDocuments;
        if (docs.length === 0) return "No research documents found.";

        type ChunkMeta = {
          docId: string;
          title: string;
          text: string;
          tokens: string[];
        };

        const chunkMetas: ChunkMeta[] = [];
        for (const doc of docs) {
          const chunks = splitResearchIntoChunks(doc.plainText);
          for (const text of chunks) {
            const tokens = tokenize(text);
            if (tokens.length > 0) {
              chunkMetas.push({
                docId: doc.id,
                title: doc.title,
                text,
                tokens,
              });
            }
          }
        }

        if (chunkMetas.length === 0) return "Research documents are empty.";

        const queryTokens = tokenize(input.query);
        const idf = buildIdfFromChunks(chunkMetas.map((c) => c.tokens));
        const queryVec = tfidfVectorFromChunks(queryTokens, idf);

        const scored = chunkMetas.map((c) => ({
          ...c,
          score: cosineSimilarityVectors(
            queryVec,
            tfidfVectorFromChunks(c.tokens, idf),
          ),
        }));
        scored.sort((a, b) => b.score - a.score);

        const top = scored.slice(0, 5);
        if (top.every((h) => h.score === 0)) {
          return "No relevant research found for that query.";
        }

        return top
          .filter((h) => h.score > 0)
          .map((h, i) => `### ${i + 1}. From "${h.title}"\n${h.text}`)
          .join("\n\n");
      },
    }),

    read_research: tool({
      description:
        "Read the full content of a research document by its exact title.",
      inputSchema: z.object({
        documentTitle: z.string().describe("Exact research document title"),
      }),
      execute: async (input) => {
        const lower = input.documentTitle.toLowerCase();
        const doc = state.snapshot.researchDocuments.find(
          (d) => d.title.toLowerCase() === lower,
        );
        if (!doc) {
          const names = state.snapshot.researchDocuments
            .map((d) => `"${d.title}"`)
            .join(", ");
          return `Document not found. Available: ${names || "none"}.`;
        }
        const text = doc.plainText.trim();
        if (!text) return `Research document "${doc.title}" is empty.`;
        return `## Research: "${doc.title}"\n\n${text}`;
      },
    }),

    list_workspace_tree: tool({
      description:
        "Show the full workspace folder and file structure as an indented tree. Call this before creating folders or files to understand the current layout.",
      inputSchema: z.object({}),
      execute: async () => {
        if (state.snapshot.folderTree) {
          return state.snapshot.folderTree;
        }
        return "Workspace tree is not available.";
      },
    }),
  };

  if (mode === "ask") return readOnlyTools;

  const writeTools = {
    edit_chapter: tool({
      description:
        "Replace the content of a chapter with new text. The change is staged and applied after the agent run completes. Provide either chapterTitle or chapterIndex plus the new plain-text content.",
      inputSchema: z.object({
        chapterTitle: z
          .string()
          .optional()
          .describe("Exact chapter title to edit"),
        chapterIndex: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("1-based chapter index to edit"),
        newContent: z
          .string()
          .describe(
            "The new chapter text as plain text paragraphs separated by blank lines.",
          ),
      }),
      execute: async (input) => {
        const ch = findChapter(
          state.snapshot,
          input.chapterTitle,
          input.chapterIndex,
        );
        if (!ch)
          return `Chapter not found. Use list_chapters to see available chapters.`;
        state.mutations.push({
          type: "edit_chapter",
          chapterId: ch.id,
          newPlainText: input.newContent,
        });
        ch.plainText = input.newContent;
        return `Chapter "${ch.title}" has been updated.`;
      },
    }),

    create_chapter: tool({
      description:
        "Create a new chapter at the end of the manuscript. Returns the new chapter title.",
      inputSchema: z.object({
        title: z.string().describe("Title for the new chapter"),
        content: z
          .string()
          .optional()
          .default("")
          .describe("Initial plain-text content for the chapter"),
      }),
      execute: async (input) => {
        state.mutations.push({
          type: "create_chapter",
          title: input.title,
          plainText: input.content,
        });
        state.snapshot.chapters.push({
          id: `new-${Date.now()}`,
          title: input.title,
          order: state.snapshot.chapters.length,
          plainText: input.content,
        });
        return `Chapter "${input.title}" has been created.`;
      },
    }),

    create_folder: tool({
      description:
        "Create a new folder in the workspace. Use list_workspace_tree first to see the current structure. Provide a parentPath to nest inside an existing folder, or omit it to create at the root level.",
      inputSchema: z.object({
        name: z.string().describe("Name for the new folder"),
        parentPath: z
          .string()
          .nullable()
          .optional()
          .default(null)
          .describe(
            "Relative path of the parent folder (e.g. 'Research' or 'Chapters/Part 1'). Null or omitted to create at the workspace root.",
          ),
      }),
      execute: async (input) => {
        const sanitized = input.name.replace(/[/\\?%*:|"<>]/g, "-").trim();
        if (!sanitized) return "Folder name cannot be empty.";
        state.mutations.push({
          type: "create_folder",
          parentPath: input.parentPath ?? null,
          name: sanitized,
        });
        return `Folder "${sanitized}" will be created${input.parentPath ? ` inside "${input.parentPath}"` : " at the workspace root"}.`;
      },
    }),

    create_file: tool({
      description:
        "Create a new file in the workspace. Use list_workspace_tree first to see the current structure. The file can optionally be pre-filled with content.",
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            "Filename including extension (e.g. 'Chapter 1.md', 'notes.txt'). Use .md for manuscript files.",
          ),
        parentPath: z
          .string()
          .nullable()
          .optional()
          .default(null)
          .describe(
            "Relative path of the parent folder to create the file in. Null or omitted to create at the workspace root.",
          ),
        content: z
          .string()
          .optional()
          .default("")
          .describe("Initial text content for the file"),
      }),
      execute: async (input) => {
        const sanitized = input.name.replace(/[\\?%*:|"<>]/g, "-").trim();
        if (!sanitized) return "File name cannot be empty.";
        state.mutations.push({
          type: "create_file",
          parentPath: input.parentPath ?? null,
          name: sanitized,
          content: input.content,
        });
        return `File "${sanitized}" will be created${input.parentPath ? ` inside "${input.parentPath}"` : " at the workspace root"}${input.content ? " with initial content" : ""}.`;
      },
    }),

    manage_todo_list: tool({
      description:
        "Maintain a visible task list for the current session. Call this at the start of complex tasks to outline your plan, then update as you complete steps.",
      inputSchema: z.object({
        action: z
          .enum(["add", "update", "complete", "clear"])
          .describe(
            "add: add a new todo; update: change content/status of existing; complete: mark done; clear: remove all",
          ),
        todoId: z
          .string()
          .optional()
          .describe(
            "ID of todo to update/complete (required for update/complete)",
          ),
        content: z
          .string()
          .optional()
          .describe("Todo text (required for add; optional for update)"),
        status: z
          .enum(["pending", "in_progress", "completed"])
          .optional()
          .describe("Status for update action"),
      }),
      execute: async (input) => {
        const { action, todoId, content, status } = input;

        if (action === "clear") {
          state.todos.length = 0;
          return "Todo list cleared.";
        }
        if (action === "add") {
          if (!content) return "content is required to add a todo.";
          const id = createId();
          state.todos.push({ id, content, status: "pending" });
          return `Todo added (id: ${id}): ${content}`;
        }
        if (action === "update" || action === "complete") {
          if (!todoId) return "todoId is required.";
          const todo = state.todos.find((t) => t.id === todoId);
          if (!todo) return `Todo ${todoId} not found.`;
          if (content) todo.content = content;
          todo.status =
            action === "complete" ? "completed" : (status ?? todo.status);
          return `Todo updated: [${todo.status}] ${todo.content}`;
        }
        return "Unknown action.";
      },
    }),
  };

  return { ...readOnlyTools, ...writeTools };
}
