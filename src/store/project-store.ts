import { create } from "zustand";
import type { JSONContent } from "novel";
import type {
  Chapter,
  ChatMessage,
  PersistedWorkspace,
  ProjectIndexEntry,
  ProjectMeta,
} from "@/documents/types";
import {
  loadProjectIndex,
  saveWorkspaceForProject,
} from "@/lib/persistence";
import { paragraphDocFromPlainText } from "@/lib/plain-text-insert";
import { parsePersistedWorkspace } from "@/lib/workspace-schema";

const emptyDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

function createId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function snapshotFromState(state: {
  project: ProjectMeta;
  chapters: Chapter[];
  activeChapterId: string | null;
  openTabs: string[];
  chatMessages: ChatMessage[];
}): PersistedWorkspace {
  return {
    version: 1,
    project: state.project,
    chapters: state.chapters,
    activeChapterId: state.activeChapterId,
    openTabs: state.openTabs,
    chatMessages: state.chatMessages,
    updatedAt: Date.now(),
  };
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

export type WorkspaceScreen = "home" | "editor";

type ProjectState = {
  /** Recent projects (IndexedDB index), for the home screen. */
  recentProjects: ProjectIndexEntry[];
  /**
   * When non-null (Electron), the workspace is saved under this folder as
   * `manuscript.workspace.json` instead of only in IndexedDB.
   */
  activeFolderPath: string | null;
  workspaceScreen: WorkspaceScreen;
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
  setRecentProjectsFromIndex: (entries: ProjectIndexEntry[]) => void;
  startNewProject: () => void;
  startNewProjectFromPrompt: (prompt: string) => void;
  openPersistedWorkspace: (
    data: PersistedWorkspace,
    folderPath?: string | null,
  ) => void;
  openProjectFromJson: (data: unknown) => void;
  /** Electron: pick a folder; load existing workspace file or create a new project there. */
  openFolderProject: () => Promise<void>;
  goHome: () => void;
};

export const useProjectStore = create<ProjectState>((set, get) => {
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const s = get();
      const data = snapshotFromState(s);
      void saveWorkspaceForProject(s.project.id, data, {
        folderPath: s.activeFolderPath ?? undefined,
      }).then(async () => {
        const entries = await loadProjectIndex();
        set({ recentProjects: entries });
      });
    }, 400);
  };

  const defaults = buildDefaultProject();
  return {
    recentProjects: [],
    activeFolderPath: null,
    workspaceScreen: "home",
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

    setProjectField: (patch) => {
      set((s) => ({ project: { ...s.project, ...patch } }));
      schedulePersist();
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
      schedulePersist();
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
      schedulePersist();
    },

    renameChapter: (id, title) => {
      set((s) => ({
        chapters: s.chapters.map((c) => (c.id === id ? { ...c, title } : c)),
      }));
      schedulePersist();
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
      schedulePersist();
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
      schedulePersist();
    },

    updateChapterContent: (id, content) => {
      set((s) => ({
        chapters: s.chapters.map((c) =>
          c.id === id ? { ...c, content } : c,
        ),
      }));
      schedulePersist();
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
      schedulePersist();
    },

    appendChatMessage: (msg) => {
      const full: ChatMessage = {
        ...msg,
        id: createId(),
        createdAt: Date.now(),
      };
      set((s) => ({ chatMessages: [...s.chatMessages, full] }));
      schedulePersist();
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
      schedulePersist();
    },

    flushWorkspace: () => {
      const s = get();
      const data = snapshotFromState(s);
      void saveWorkspaceForProject(s.project.id, data, {
        folderPath: s.activeFolderPath ?? undefined,
      }).then(async () => {
        const entries = await loadProjectIndex();
        set({ recentProjects: entries });
      });
    },

    clearChat: () => {
      set({ chatMessages: [], pendingRevision: null });
      schedulePersist();
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
      schedulePersist();
    },

    setRecentProjectsFromIndex: (entries) => set({ recentProjects: entries }),

    startNewProject: () => {
      set({ activeFolderPath: null });
      const neo = buildDefaultProject();
      get().importWorkspace({
        project: neo.project,
        chapters: neo.chapters,
        activeChapterId: neo.chapters[0]!.id,
        openTabs: [neo.chapters[0]!.id],
        chatMessages: [],
      });
      set({
        workspaceScreen: "editor",
        editorContext: null,
        pendingRevision: null,
        focusMode: false,
      });
    },

    startNewProjectFromPrompt: (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed) return;
      const firstLine =
        trimmed
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 0) ?? trimmed;
      const title =
        firstLine.length > 72
          ? `${firstLine.slice(0, 69)}…`
          : firstLine || "Untitled manuscript";
      const cid = createId();
      const project: ProjectMeta = {
        id: createId(),
        title,
        description: trimmed,
      };
      const chapter: Chapter = {
        id: cid,
        title: "Chapter 1",
        content: paragraphDocFromPlainText(trimmed),
        order: 0,
      };
      set({ activeFolderPath: null });
      get().importWorkspace({
        project,
        chapters: [chapter],
        activeChapterId: cid,
        openTabs: [cid],
        chatMessages: [],
      });
      set({
        workspaceScreen: "editor",
        editorContext: null,
        pendingRevision: null,
        focusMode: false,
      });
    },

    openPersistedWorkspace: (data, folderPath = null) => {
      set({ activeFolderPath: folderPath });
      get().importWorkspace({
        project: data.project,
        chapters: data.chapters,
        activeChapterId: data.activeChapterId,
        openTabs:
          data.openTabs.length > 0
            ? data.openTabs
            : ([data.chapters[0]?.id].filter(Boolean) as string[]),
        chatMessages: data.chatMessages,
      });
      set({
        workspaceScreen: "editor",
        editorContext: null,
        pendingRevision: null,
        focusMode: false,
      });
    },

    openProjectFromJson: (data: unknown) => {
      const parsed = parsePersistedWorkspace(data);
      if (!parsed) {
        throw new Error("INVALID_WORKSPACE_FILE");
      }
      get().openPersistedWorkspace(parsed, null);
    },

    openFolderProject: async () => {
      const api =
        typeof window !== "undefined" ? window.electronAPI : undefined;
      if (!api) return;
      const dirPath = await api.openFolder();
      if (!dirPath) return;
      const res = await api.readWorkspaceFile(dirPath);
      if (res.ok) {
        let raw: unknown;
        try {
          raw = JSON.parse(res.data) as unknown;
        } catch {
          throw new Error("INVALID_WORKSPACE_FILE");
        }
        const parsed = parsePersistedWorkspace(raw);
        if (!parsed) {
          throw new Error("INVALID_WORKSPACE_FILE");
        }
        get().openPersistedWorkspace(parsed, dirPath);
        return;
      }
      if (res.missing) {
        set({ activeFolderPath: dirPath });
        const neo = buildDefaultProject();
        get().importWorkspace({
          project: neo.project,
          chapters: neo.chapters,
          activeChapterId: neo.chapters[0]!.id,
          openTabs: [neo.chapters[0]!.id],
          chatMessages: [],
        });
        set({
          workspaceScreen: "editor",
          editorContext: null,
          pendingRevision: null,
          focusMode: false,
        });
        get().flushWorkspace();
        return;
      }
    },

    goHome: () => {
      const s = get();
      const data = snapshotFromState(s);
      void saveWorkspaceForProject(s.project.id, data, {
        folderPath: s.activeFolderPath ?? undefined,
      }).then(async () => {
        const entries = await loadProjectIndex();
        set({
          recentProjects: entries,
          workspaceScreen: "home",
          focusMode: false,
          editorContext: null,
          pendingRevision: null,
        });
      });
    },
  };
});
