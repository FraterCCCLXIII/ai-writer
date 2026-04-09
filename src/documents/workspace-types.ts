import type { JSONContent } from "novel";
import type { ChatMessage } from "@/documents/types";

/**
 * A node in the workspace file tree. Mirrors the on-disk folder structure
 * but adds ordering and UI state (expanded). The actual file contents live
 * on disk as individual files — the tree only tracks structure and metadata.
 */
export type FileNode = {
  kind: "file";
  id: string;
  name: string;
  /** Relative path from workspace root, e.g. "chapters/chapter-1.md" */
  path: string;
};

export type FolderNode = {
  kind: "folder";
  id: string;
  name: string;
  /** Relative path from workspace root, e.g. "chapters" */
  path: string;
  children: WorkspaceNode[];
  expanded: boolean;
};

export type WorkspaceNode = FileNode | FolderNode;

/**
 * Stored in `.aiwriter/workspace.json` inside the workspace folder.
 * Contains project metadata, tree ordering, and chat — but NOT file contents.
 */
export type WorkspaceConfig = {
  version: 2;
  project: {
    id: string;
    title: string;
    description: string;
  };
  /** Relative path of the currently active file. */
  activeFilePath: string | null;
  /**
   * Ordered tree of files and folders. Defines sidebar ordering and
   * which folders are expanded. Actual file contents come from disk reads.
   */
  tree: WorkspaceNode[];
  chatMessages: ChatMessage[];
  updatedAt: number;
};

/** Loaded file content kept in memory while the workspace is open. */
export type OpenFileEntry = {
  path: string;
  content: JSONContent;
  dirty: boolean;
};

/** Result of reading a directory from the Electron filesystem. */
export type FsDirEntry = {
  name: string;
  isDirectory: boolean;
};

/** Filesystem abstraction exposed by the Electron preload bridge. */
export type WorkspaceFsAPI = {
  /** Show native folder picker, return chosen path or null. */
  openFolder: () => Promise<string | null>;
  /** List immediate children of a directory. */
  readDir: (dirPath: string) => Promise<FsDirEntry[]>;
  /** Read a UTF-8 text file. Returns null if the file doesn't exist. */
  readTextFile: (filePath: string) => Promise<string | null>;
  /** Write a UTF-8 text file (creates parent dirs as needed). */
  writeTextFile: (filePath: string, contents: string) => Promise<void>;
  /** Create a directory (recursive). */
  createDir: (dirPath: string) => Promise<void>;
  /** Delete a file or directory. */
  deletePath: (targetPath: string) => Promise<void>;
  /** Rename or move a file/directory. */
  renamePath: (oldPath: string, newPath: string) => Promise<void>;
  /** Check if a path exists. */
  pathExists: (targetPath: string) => Promise<boolean>;
};

/** Hidden directory inside a workspace folder for app metadata. */
export const WORKSPACE_CONFIG_DIR = ".aiwriter";
export const WORKSPACE_CONFIG_FILE = "workspace.json";
export const WORKSPACE_CONFIG_PATH = `${WORKSPACE_CONFIG_DIR}/${WORKSPACE_CONFIG_FILE}`;

/**
 * Default folder structure for a new blank workspace.
 * Just an empty root with one starter file.
 */
export function buildDefaultTree(): WorkspaceNode[] {
  return [
    {
      kind: "file",
      id: crypto.randomUUID(),
      name: "Untitled.md",
      path: "Untitled.md",
    },
  ];
}

export function buildDefaultConfig(): WorkspaceConfig {
  const tree = buildDefaultTree();
  const firstFile = tree[0] as FileNode;
  return {
    version: 2,
    project: {
      id: crypto.randomUUID(),
      title: "Untitled",
      description: "",
    },
    activeFilePath: firstFile.path,
    tree,
    chatMessages: [],
    updatedAt: Date.now(),
  };
}

export function createId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Walk a tree and collect all file nodes. */
export function collectFiles(nodes: WorkspaceNode[]): FileNode[] {
  const files: FileNode[] = [];
  for (const node of nodes) {
    if (node.kind === "file") {
      files.push(node);
    } else {
      files.push(...collectFiles(node.children));
    }
  }
  return files;
}

/** Find a node by path in the tree. */
export function findNodeByPath(
  nodes: WorkspaceNode[],
  path: string,
): WorkspaceNode | null {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.kind === "folder") {
      const found = findNodeByPath(node.children, path);
      if (found) return found;
    }
  }
  return null;
}

/** Insert a node into the tree at a given parent path (or root if null). */
export function insertNode(
  tree: WorkspaceNode[],
  node: WorkspaceNode,
  parentPath: string | null,
): WorkspaceNode[] {
  if (!parentPath) {
    return [...tree, node];
  }
  return tree.map((n) => {
    if (n.kind === "folder" && n.path === parentPath) {
      return { ...n, children: [...n.children, node] };
    }
    if (n.kind === "folder") {
      return { ...n, children: insertNode(n.children, node, parentPath) };
    }
    return n;
  });
}

/** Remove a node from the tree by path. */
export function removeNode(
  tree: WorkspaceNode[],
  path: string,
): WorkspaceNode[] {
  return tree
    .filter((n) => n.path !== path)
    .map((n) => {
      if (n.kind === "folder") {
        return { ...n, children: removeNode(n.children, path) };
      }
      return n;
    });
}

/** Rename a node (and update paths of all descendants). */
export function renameNodeInTree(
  tree: WorkspaceNode[],
  oldPath: string,
  newName: string,
): WorkspaceNode[] {
  return tree.map((n) => {
    if (n.path === oldPath) {
      const parentDir = oldPath.includes("/")
        ? oldPath.substring(0, oldPath.lastIndexOf("/"))
        : "";
      const newPath = parentDir ? `${parentDir}/${newName}` : newName;

      if (n.kind === "file") {
        return { ...n, name: newName, path: newPath };
      }
      return {
        ...n,
        name: newName,
        path: newPath,
        children: updateChildPaths(n.children, oldPath, newPath),
      };
    }
    if (n.kind === "folder") {
      return { ...n, children: renameNodeInTree(n.children, oldPath, newName) };
    }
    return n;
  });
}

function updateChildPaths(
  children: WorkspaceNode[],
  oldParent: string,
  newParent: string,
): WorkspaceNode[] {
  return children.map((c) => {
    const newPath = c.path.replace(oldParent, newParent);
    if (c.kind === "folder") {
      return {
        ...c,
        path: newPath,
        children: updateChildPaths(c.children, oldParent, newParent),
      };
    }
    return { ...c, path: newPath };
  });
}

/** Toggle expanded state for a folder. */
export function toggleFolderExpanded(
  tree: WorkspaceNode[],
  folderPath: string,
): WorkspaceNode[] {
  return tree.map((n) => {
    if (n.kind === "folder" && n.path === folderPath) {
      return { ...n, expanded: !n.expanded };
    }
    if (n.kind === "folder") {
      return {
        ...n,
        children: toggleFolderExpanded(n.children, folderPath),
      };
    }
    return n;
  });
}
