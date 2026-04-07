import { create } from "zustand";
import type { JSONContent } from "novel";
import type { Chapter, ChatMessage, ProjectMeta } from "@/documents/types";
import { saveWorkspace } from "@/lib/persistence";

const emptyDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildDefaultProject(): { project: ProjectMeta; chapters: Chapter[] } {
  const cid = createId();
  return {
    project: {
      id: createId(),
      title: "Untitled manuscript",
      description: "",
    },
    chapters: [
      {
        id: cid,
        title: "Chapter 1",
        content: emptyDoc,
        order: 0,
      },
    ],
  };
}

type ProjectState = {
  hydrated: boolean;
  project: ProjectMeta;
  chapters: Chapter[];
  activeChapterId: string | null;
  openTabs: string[];
  chatMessages: ChatMessage[];
  focusMode: boolean;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  /** Non-null while a passage is attached as chat context (survives editor blur). */
  editorContext: {
    text: string;
    chapterId: string;
    from: number;
    to: number;
  } | null;
  /** After chat streams a replacement for a selection; manuscript shows approve/cancel. */
  pendingRevision: {
    chapterId: string;
    from: number;
    to: number;
    replacementText: string;
    assistantMessageId: string;
  } | null;

  setHydrated: (v: boolean) => void;
  setProjectField: (patch: Partial<ProjectMeta>) => void;
  selectChapter: (id: string) => void;
  addChapter: () => void;
  renameChapter: (id: string, title: string) => void;
  removeChapter: (id: string) => void;
  reorderChapters: (orderedIds: string[]) => void;
  updateChapterContent: (id: string, content: JSONContent) => void;
  openTab: (id: string) => void;
  closeTab: (id: string) => void;
  appendChatMessage: (msg: Omit<ChatMessage, "id" | "createdAt">) => ChatMessage;
  patchChatMessage: (id: string, content: string) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  clearChat: () => void;
  flushWorkspace: () => void;
  setFocusMode: (v: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setEditorContext: (
    ctx: {
      text: string;
      chapterId: string;
      from: number;
      to: number;
    } | null,
  ) => void;
  setPendingRevision: (
    rev: {
      chapterId: string;
      from: number;
      to: number;
      replacementText: string;
      assistantMessageId: string;
    } | null,
  ) => void;
  importWorkspace: (data: {
    project: ProjectMeta;
    chapters: Chapter[];
    activeChapterId: string | null;
    openTabs: string[];
    chatMessages: ChatMessage[];
  }) => void;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(get: () => ProjectState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const s = get();
    void saveWorkspace({
      version: 1,
      project: s.project,
      chapters: s.chapters,
      activeChapterId: s.activeChapterId,
      openTabs: s.openTabs,
      chatMessages: s.chatMessages,
      updatedAt: Date.now(),
    });
  }, 400);
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const defaults = buildDefaultProject();
  return {
    hydrated: false,
    project: defaults.project,
    chapters: defaults.chapters,
    activeChapterId: defaults.chapters[0]?.id ?? null,
    openTabs: defaults.chapters[0] ? [defaults.chapters[0].id] : [],
    chatMessages: [],
    focusMode: false,
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    editorContext: null,
    pendingRevision: null,

    setHydrated: (v) => set({ hydrated: v }),

    setProjectField: (patch) => {
      set((s) => ({ project: { ...s.project, ...patch } }));
      schedulePersist(get);
    },

    selectChapter: (id) => {
      set((s) => ({
        activeChapterId: id,
        openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
        editorContext:
          s.editorContext?.chapterId === id ? s.editorContext : null,
        pendingRevision:
          s.pendingRevision?.chapterId === id ? s.pendingRevision : null,
      }));
      schedulePersist(get);
    },

    addChapter: () => {
      const nextOrder =
        get().chapters.reduce((m, c) => Math.max(m, c.order), -1) + 1;
      const ch: Chapter = {
        id: createId(),
        title: `Chapter ${nextOrder + 1}`,
        content: emptyDoc,
        order: nextOrder,
      };
      set((s) => ({
        chapters: [...s.chapters, ch].sort((a, b) => a.order - b.order),
        activeChapterId: ch.id,
        openTabs: [...s.openTabs, ch.id],
        editorContext: null,
        pendingRevision: null,
      }));
      schedulePersist(get);
    },

    renameChapter: (id, title) => {
      set((s) => ({
        chapters: s.chapters.map((c) => (c.id === id ? { ...c, title } : c)),
      }));
      schedulePersist(get);
    },

    removeChapter: (id) => {
      set((s) => {
        const remaining = s.chapters.filter((c) => c.id !== id);
        if (remaining.length === 0) {
          const neo = buildDefaultProject();
          return {
            project: neo.project,
            chapters: neo.chapters,
            activeChapterId: neo.chapters[0]!.id,
            openTabs: [neo.chapters[0]!.id],
          };
        }
        const nextActive =
          s.activeChapterId === id
            ? remaining[0]!.id
            : s.activeChapterId;
        return {
          chapters: remaining.map((c, i) => ({ ...c, order: i })),
          activeChapterId: nextActive,
          openTabs: s.openTabs.filter((t) => t !== id),
        };
      });
      schedulePersist(get);
    },

    reorderChapters: (orderedIds) => {
      set((s) => {
        const map = new Map(s.chapters.map((c) => [c.id, c] as const));
        const next: Chapter[] = orderedIds
          .map((id, order) => {
            const c = map.get(id);
            return c ? { ...c, order } : null;
          })
          .filter(Boolean) as Chapter[];
        const rest = s.chapters.filter((c) => !orderedIds.includes(c.id));
        return { chapters: [...next, ...rest].sort((a, b) => a.order - b.order) };
      });
      schedulePersist(get);
    },

    updateChapterContent: (id, content) => {
      set((s) => ({
        chapters: s.chapters.map((c) =>
          c.id === id ? { ...c, content } : c,
        ),
      }));
      schedulePersist(get);
    },

    openTab: (id) =>
      set((s) => ({
        openTabs: s.openTabs.includes(id) ? s.openTabs : [...s.openTabs, id],
        activeChapterId: id,
        editorContext:
          s.editorContext?.chapterId === id ? s.editorContext : null,
        pendingRevision:
          s.pendingRevision?.chapterId === id ? s.pendingRevision : null,
      })),

    closeTab: (id) => {
      set((s) => {
        const openTabs = s.openTabs.filter((t) => t !== id);
        let activeChapterId = s.activeChapterId;
        if (activeChapterId === id) {
          activeChapterId = openTabs[openTabs.length - 1] ?? s.chapters[0]?.id ?? null;
        }
        return {
          openTabs,
          activeChapterId,
          editorContext:
            activeChapterId &&
            s.editorContext?.chapterId === activeChapterId
              ? s.editorContext
              : null,
          pendingRevision:
            activeChapterId &&
            s.pendingRevision?.chapterId === activeChapterId
              ? s.pendingRevision
              : null,
        };
      });
      schedulePersist(get);
    },

    appendChatMessage: (msg) => {
      const full: ChatMessage = {
        ...msg,
        id: createId(),
        createdAt: Date.now(),
      };
      set((s) => ({ chatMessages: [...s.chatMessages, full] }));
      schedulePersist(get);
      return full;
    },

    patchChatMessage: (id, content) => {
      set((s) => ({
        chatMessages: s.chatMessages.map((m) =>
          m.id === id ? { ...m, content } : m,
        ),
      }));
    },

    setChatMessages: (messages) => {
      set({ chatMessages: messages });
      schedulePersist(get);
    },

    flushWorkspace: () => {
      const s = get();
      void saveWorkspace({
        version: 1,
        project: s.project,
        chapters: s.chapters,
        activeChapterId: s.activeChapterId,
        openTabs: s.openTabs,
        chatMessages: s.chatMessages,
        updatedAt: Date.now(),
      });
    },

    clearChat: () => {
      set({ chatMessages: [], pendingRevision: null });
      schedulePersist(get);
    },

    setFocusMode: (v) => set({ focusMode: v }),

    toggleLeftSidebar: () =>
      set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),

    toggleRightSidebar: () =>
      set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),

    setEditorContext: (ctx) => set({ editorContext: ctx }),

    setPendingRevision: (rev) => set({ pendingRevision: rev }),

    importWorkspace: (data) => {
      set({
        project: data.project,
        chapters: data.chapters,
        activeChapterId: data.activeChapterId,
        openTabs:
          data.openTabs.length > 0 ? data.openTabs : [data.chapters[0]?.id].filter(Boolean) as string[],
        chatMessages: data.chatMessages,
      });
      schedulePersist(get);
    },
  };
});
