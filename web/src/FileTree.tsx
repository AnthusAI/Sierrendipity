import { allFolders, type Workspace } from "./projects";

interface Props {
  workspace: Workspace;
  onOpen: (path: string) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

export function FileTree({ workspace, onOpen, onNewFile, onNewFolder, onRename, onDelete }: Props) {
  const entries = [
    ...allFolders(workspace).map((path) => ({ path, folder: true })),
    ...Object.keys(workspace.files).map((path) => ({ path, folder: false })),
  ].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <nav className="files">
      <div className="toolbar">
        <button onClick={onNewFile}>New file</button>
        <button onClick={onNewFolder}>New folder</button>
      </div>
      <ul role="tree" aria-label="Files">
        {entries.map(({ path, folder }) => (
          <li
            key={(folder ? "d:" : "f:") + path}
            role="treeitem"
            aria-label={path}
            className={path === workspace.active ? "active" : ""}
            style={{ paddingLeft: 8 + 14 * path.split("/").length }}
          >
            {folder ? (
              <span>{path.split("/").at(-1)}/</span>
            ) : (
              <button className="link" aria-label={`Open ${path}`} onClick={() => onOpen(path)}>
                {path.split("/").at(-1)}
              </button>
            )}
            <button className="icon" aria-label={`Rename ${path}`} onClick={() => onRename(path)}>
              ✎
            </button>
            <button className="icon" aria-label={`Delete ${path}`} onClick={() => onDelete(path)}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
