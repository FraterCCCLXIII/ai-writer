import { create } from "zustand";
import { toast } from "sonner";
import type { JSONContent } from "novel";
import type { ChatMessage } from "@/documents/types";
import type {
  WorkspaceConfig,
  WorkspaceNode,
  FileNode,
  OpenFileEntry,
} from "@/documents/workspace-types";
import {
  buildDefaultConfig,
  collectFiles,
  createId,
  insertNode,
  removeNode,
  renameNodeInTree,
  toggleFolderExpanded,
} from "@/documents/workspace-types";
import {
  writeWorkspaceConfig,
  readWorkspaceFile,
  writeWorkspaceFile,
  createWorkspaceFile,
  createWorkspaceDir,
  deleteWorkspacePath,
  renameWorkspacePath,
  loadWorkspaceIndex,
  openFolderWorkspace,
  type WorkspaceIndexEntry,
} from "@/lib/workspace-fs";
import { jsonContentToMarkdown, markdownToJsonContent, isEditableFile } from "@/lib/markdown-serialize";
import { paragraphDocFromPlainText } from "@/lib/plain-text-insert";
import type { ChatMode, TodoItem, WriteMutation } from "@/lib/ai/types";

const emptyDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export type WorkspaceScreen = "home" | "editor";

type ProjectState = {
  recentProjects: WorkspaceIndexEntry[];

  /**
   * The folder path (Electron) or IDB workspace id (browser) for the
   * currently open workspace. Null until a workspace is opened.
   */
  workspacePath: string | null;

  workspaceScreen: WorkspaceScreen;
  config: WorkspaceConfig;

  /** In-memory file contents, loaded on demand. */
  openFiles: Map<string, OpenFileEntry>;

  focusMode: boolean;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;

  editorContext: {
    text: string;
    filePath: string;
    from: number;
    to: number;
  } | null;

  pendingRevision: {
    filePath: string;
    from: number;
    to: number;
    replacementText: string;
    assistantMessageId: string;
  } | null;

  chatMode: ChatMode;
  agentTodos: TodoItem[];

  fileImportPickRequest: number;

  // --- Actions ---

  setRecentProjectsFromIndex: (entries: WorkspaceIndexEntry[]) => void;

  /** Open a workspace (folder-backed or IDB). Loads config, sets up state. */
  openWorkspace: (workspacePath: string, config: WorkspaceConfig) => void;

  /** Start a new blank workspace. In Electron, prompts for folder first. */
  startNewProject: () => void;

  /** Electron: pick folder, load or init workspace. */
  openFolderProject: () => Promise<void>;

  /** Navigate back to the home screen. */
  goHome: () => void;

  // Tree operations
  selectFile: (path: string) => Promise<void>;
  createFile: (parentPath: string | null, name: string) => Promise<void>;
  createFolder: (parentPath: string | null, name: string) => Promise<void>;
  renameNode: (oldPath: string, newName: string) => Promise<void>;
  deleteNode: (path: string) => Promise<void>;
  toggleFolder: (path: string) => void;

  /** Update the content of the currently active file from editor changes. */
  updateActiveFileContent: (content: JSONContent) => void;

  // Project metadata
  setProjectTitle: (title: string) => void;

  // Chat
  appendChatMessage: (msg: Omit<ChatMessage, "id" | "createdAt">) => ChatMessage;
  patchChatMessage: (id: string, content: string) => void;
  setChatMessages: (messages: ChatMessage[]) => void;
  clearChat: () => void;

  // UI toggles
  setFocusMode: (v: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setEditorContext: (
    ctx: { text: string; filePath: string; from: number; to: number } | null,
  ) => void;
  setPendingRevision: (
    rev: {
      filePath: string;
      from: number;
      to: number;
      replacementText: string;
      assistantMessageId: string;
    } | null,
  ) => void;

  setChatMode: (mode: ChatMode) => void;
  setAgentTodos: (todos: TodoItem[]) => void;
  requestFileImport: () => void;

  /** Persist the current workspace config to disk/IDB. */
  flushWorkspace: () => void;

  /** Apply write mutations from the AI agent. */
  applyWriteMutations: (mutations: WriteMutation[]) => void;

  // Convenience getters
  getActiveFilePath: () => string | null;
  getActiveFileContent: () => JSONContent | null;
  getTree: () => WorkspaceNode[];
};

export const useProjectStore = create<ProjectState>((set, get) => {
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const schedulePersist = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const s = get();
      if (!s.workspacePath) return;

      const updatedConfig: WorkspaceConfig = {
        ...s.config,
        updatedAt: Date.now(),
      };

      void writeWorkspaceConfig(s.workspacePath, updatedConfig).then(async () => {
        const entries = await loadWorkspaceIndex();
        set({ recentProjects: entries });
      });
    }, 400);
  };

  const scheduleFileSave = (filePath: string) => {
    const s = get();
    if (!s.workspacePath) return;

    const entry = s.openFiles.get(filePath);
    if (!entry || !entry.dirty) return;

    const md = jsonContentToMarkdown(entry.content);
    void writeWorkspaceFile(s.workspacePath, filePath, md).then(() => {
      const current = get();
      const updated = new Map(current.openFiles);
      const existing = updated.get(filePath);
      if (existing) {
        updated.set(filePath, { ...existing, dirty: false });
        set({ openFiles: updated });
      }
    });
  };

  const defaultConfig = buildDefaultConfig();

  return {
    recentProjects: [],
    workspacePath: null,
    workspaceScreen: "home",
    config: defaultConfig,
    openFiles: new Map(),
    focusMode: false,
    leftSidebarOpen: true,
    rightSidebarOpen: true,
    editorContext: null,
    pendingRevision: null,
    chatMode: "ask" as ChatMode,
    agentTodos: [],
    fileImportPickRequest: 0,

    setRecentProjectsFromIndex: (entries) => set({ recentProjects: entries }),

    openWorkspace: (workspacePath, config) => {
      set({
        workspacePath,
        config,
        openFiles: new Map(),
        workspaceScreen: "editor",
        editorContext: null,
        pendingRevision: null,
        focusMode: false,
        leftSidebarOpen: true,
      });

      if (config.activeFilePath) {
        void get().selectFile(config.activeFilePath);
      }
    },

    startNewProject: () => {
      const isElectron =
        typeof window !== "undefined" && Boolean(window.electronAPI);
      if (isElectron) {
        void get().openFolderProject();
        return;
      }

      const config = buildDefaultConfig();
      const wsId = config.project.id;

      set({
        workspacePath: wsId,
        config,
        openFiles: new Map(),
        workspaceScreen: "editor",
        editorContext: null,
        pendingRevision: null,
        focusMode: false,
        leftSidebarOpen: true,
      });

      void (async () => {
        const firstFile = collectFiles(config.tree)[0];
        if (firstFile) {
          await createWorkspaceFile(wsId, firstFile.path, "");
        }
        await writeWorkspaceConfig(wsId, config);
        const entries = await loadWorkspaceIndex();
        set({ recentProjects: entries });

        if (config.activeFilePath) {
          await get().selectFile(config.activeFilePath);
        }
      })();
    },

    openFolderProject: async () => {
      const api =
        typeof window !== "undefined" ? window.electronAPI : undefined;
      if (!api) return;

      const dirPath = await api.openFolder();
      if (!dirPath) return;

      try {
        const { config } = await openFolderWorkspace(dirPath);
        get().openWorkspace(dirPath, config);
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Could not open that folder.",
        );
      }
    },

    goHome: () => {
      const s = get();
      if (s.workspacePath && s.config) {
        void writeWorkspaceConfig(s.workspacePath, {
          ...s.config,
          updatedAt: Date.now(),
        }).then(async () => {
          const entries = await loadWorkspaceIndex();
          set({ recentProjects: entries });
        });
      }

      set({
        workspaceScreen: "home",
        focusMode: false,
        editorContext: null,
        pendingRevision: null,
      });
    },

    selectFile: async (filePath) => {
      const s = get();

      set((prev) => ({
        config: { ...prev.config, activeFilePath: filePath },
        editorContext: null,
        pendingRevision: null,
      }));

      if (s.openFiles.has(filePath)) {
        schedulePersist();
        return;
      }

      if (s.workspacePath && isEditableFile(filePath)) {
        const raw = await readWorkspaceFile(s.workspacePath, filePath);
        const content = raw ? markdownToJsonContent(raw) : emptyDoc;

        set((prev) => {
          const updated = new Map(prev.openFiles);
          updated.set(filePath, { path: filePath, content, dirty: false });
          return { openFiles: updated };
        });
      }

      schedulePersist();
    },

    createFile: async (parentPath, name) => {
      const s = get();
      if (!s.workspacePath) return;

      const relativePath = parentPath ? `${parentPath}/${name}` : name;

      const node: FileNode = {
        kind: "file",
        id: createId(),
        name,
        path: relativePath,
      };

      set((prev) => ({
        config: {
          ...prev.config,
          tree: insertNode(prev.config.tree, node, parentPath),
          activeFilePath: relativePath,
        },
      }));

      await createWorkspaceFile(s.workspacePath, relativePath, "");

      const updated = new Map(get().openFiles);
      updated.set(relativePath, { path: relativePath, content: emptyDoc, dirty: false });
      set({ openFiles: updated });

      schedulePersist();
    },

    createFolder: async (parentPath, name) => {
      const s = get();
      if (!s.workspacePath) return;

      const relativePath = parentPath ? `${parentPath}/${name}` : name;

      const node: WorkspaceNode = {
        kind: "folder",
        id: createId(),
        name,
        path: relativePath,
        children: [],
        expanded: true,
      };

      set((prev) => ({
        config: {
          ...prev.config,
          tree: insertNode(prev.config.tree, node, parentPath),
        },
      }));

      await createWorkspaceDir(s.workspacePath, relativePath);
      schedulePersist();
    },

    renameNode: async (oldPath, newName) => {
      const s = get();
      if (!s.workspacePath) return;

      const oldParent = oldPath.includes("/")
        ? oldPath.substring(0, oldPath.lastIndexOf("/"))
        : "";
      const newPath = oldParent ? `${oldParent}/${newName}` : newName;

      set((prev) => {
        const newTree = renameNodeInTree(prev.config.tree, oldPath, newName);
        const newActiveFilePath =
          prev.config.activeFilePath === oldPath
            ? newPath
            : prev.config.activeFilePath?.startsWith(oldPath + "/")
              ? prev.config.activeFilePath.replace(oldPath, newPath)
              : prev.config.activeFilePath;

        const newOpenFiles = new Map<string, OpenFileEntry>();
        for (const [key, entry] of prev.openFiles) {
          if (key === oldPath) {
            newOpenFiles.set(newPath, { ...entry, path: newPath });
          } else if (key.startsWith(oldPath + "/")) {
            const updated = key.replace(oldPath, newPath);
            newOpenFiles.set(updated, { ...entry, path: updated });
          } else {
            newOpenFiles.set(key, entry);
          }
        }

        return {
          config: {
            ...prev.config,
            tree: newTree,
            activeFilePath: newActiveFilePath,
          },
          openFiles: newOpenFiles,
        };
      });

      await renameWorkspacePath(s.workspacePath, oldPath, newPath);
      schedulePersist();
    },

    deleteNode: async (path) => {
      const s = get();
      if (!s.workspacePath) return;

      const tree = removeNode(s.config.tree, path);
      let activeFilePath = s.config.activeFilePath;

      if (activeFilePath === path || activeFilePath?.startsWith(path + "/")) {
        const allFiles = collectFiles(tree);
        activeFilePath = allFiles[0]?.path ?? null;
      }

      set((prev) => {
        const newOpenFiles = new Map(prev.openFiles);
        for (const key of newOpenFiles.keys()) {
          if (key === path || key.startsWith(path + "/")) {
            newOpenFiles.delete(key);
          }
        }
        return {
          config: { ...prev.config, tree, activeFilePath },
          openFiles: newOpenFiles,
        };
      });

      await deleteWorkspacePath(s.workspacePath, path);

      if (activeFilePath && !s.openFiles.has(activeFilePath)) {
        await get().selectFile(activeFilePath);
      }

      schedulePersist();
    },

    toggleFolder: (folderPath) => {
      set((prev) => ({
        config: {
          ...prev.config,
          tree: toggleFolderExpanded(prev.config.tree, folderPath),
        },
      }));
      schedulePersist();
    },

    updateActiveFileContent: (content) => {
      const s = get();
      const filePath = s.config.activeFilePath;
      if (!filePath) return;

      set((prev) => {
        const updated = new Map(prev.openFiles);
        updated.set(filePath, { path: filePath, content, dirty: true });
        return { openFiles: updated };
      });

      scheduleFileSave(filePath);
      schedulePersist();
    },

    setProjectTitle: (title) => {
      set((prev) => ({
        config: {
          ...prev.config,
          project: { ...prev.config.project, title },
        },
      }));
      schedulePersist();
    },

    appendChatMessage: (msg) => {
      const full: ChatMessage = {
        ...msg,
        id: createId(),
        createdAt: Date.now(),
      };
      set((prev) => ({
        config: {
          ...prev.config,
          chatMessages: [...prev.config.chatMessages, full],
        },
      }));
      schedulePersist();
      return full;
    },

    patchChatMessage: (id, content) => {
      set((prev) => ({
        config: {
          ...prev.config,
          chatMessages: prev.config.chatMessages.map((m) =>
            m.id === id ? { ...m, content } : m,
          ),
        },
      }));
    },

    setChatMessages: (messages) => {
      set((prev) => ({
        config: { ...prev.config, chatMessages: messages },
      }));
      schedulePersist();
    },

    clearChat: () => {
      set((prev) => ({
        config: { ...prev.config, chatMessages: [] },
        pendingRevision: null,
      }));
      schedulePersist();
    },

    flushWorkspace: () => {
      const s = get();
      if (!s.workspacePath) return;

      const updatedConfig: WorkspaceConfig = {
        ...s.config,
        updatedAt: Date.now(),
      };

      void writeWorkspaceConfig(s.workspacePath, updatedConfig).then(async () => {
        const entries = await loadWorkspaceIndex();
        set({ recentProjects: entries });
      });
    },

    setFocusMode: (v) => set({ focusMode: v }),
    toggleLeftSidebar: () =>
      set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
    toggleRightSidebar: () =>
      set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
    setEditorContext: (ctx) => set({ editorContext: ctx }),
    setPendingRevision: (rev) => set({ pendingRevision: rev }),
    setChatMode: (mode) => set({ chatMode: mode }),
    setAgentTodos: (todos) => set({ agentTodos: todos }),
    requestFileImport: () =>
      set((s) => ({ fileImportPickRequest: s.fileImportPickRequest + 1 })),

    applyWriteMutations: (mutations) => {
      if (mutations.length === 0) return;
      const s = get();

      for (const mutation of mutations) {
        if (mutation.type === "edit_chapter") {
          const filePath = s.config.activeFilePath;
          if (!filePath) continue;

          const content = paragraphDocFromPlainText(mutation.newPlainText);

          set((prev) => {
            const updated = new Map(prev.openFiles);
            updated.set(filePath, { path: filePath, content, dirty: true });
            return { openFiles: updated };
          });

          scheduleFileSave(filePath);
        } else if (mutation.type === "create_chapter") {
          const name = mutation.title.replace(/[/\\?%*:|"<>]/g, "-") + ".md";
          void get().createFile(null, name);
        }
      }

      schedulePersist();
    },

    getActiveFilePath: () => get().config.activeFilePath,

    getActiveFileContent: () => {
      const s = get();
      const fp = s.config.activeFilePath;
      if (!fp) return null;
      return s.openFiles.get(fp)?.content ?? null;
    },

    getTree: () => get().config.tree,
  };
});
