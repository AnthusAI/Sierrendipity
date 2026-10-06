import { FilePlus2, FileText, Folder, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { allFolders, type Workspace } from "./projects";

interface Props {
  workspace: Workspace;
  onOpen: (path: string) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="size-6 text-muted-foreground hover:text-foreground" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function FileTree({ workspace, onOpen, onNewFile, onNewFolder, onRename, onDelete }: Props) {
  const entries = [
    ...allFolders(workspace).map((path) => ({ path, folder: true })),
    ...Object.keys(workspace.files).map((path) => ({ path, folder: false })),
  ].sort((a, b) => a.path.localeCompare(b.path));

  return (
    <nav className="flex min-h-0 flex-col border-r bg-card text-card-foreground">
      <div className="flex items-center gap-1 border-b px-2 py-2">
        <Button variant="ghost" size="sm" onClick={onNewFile}>
          <FilePlus2 /> New file
        </Button>
        <Button variant="ghost" size="sm" onClick={onNewFolder}>
          <FolderPlus /> New folder
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <ul role="tree" aria-label="Files" className="py-1">
          {entries.map(({ path, folder }) => {
            const active = path === workspace.active;
            return (
              <li
                key={(folder ? "d:" : "f:") + path}
                role="treeitem"
                aria-label={path}
                aria-selected={folder ? undefined : active}
                className={cn(
                  "group flex h-8 items-center gap-1 pr-1 transition-colors hover:bg-accent",
                  active && "bg-accent font-medium shadow-[inset_2px_0_0_var(--ring)]",
                )}
                style={{ paddingLeft: 8 + 12 * (path.split("/").length - 1) }}
              >
                {folder ? (
                  <>
                    <Folder aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{path.split("/").at(-1)}/</span>
                  </>
                ) : (
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    aria-label={`Open ${path}`}
                    onClick={() => onOpen(path)}
                  >
                    <FileText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{path.split("/").at(-1)}</span>
                  </button>
                )}
                <RowAction label={`Rename ${path}`} onClick={() => onRename(path)}>
                  <Pencil className="!size-3.5" />
                </RowAction>
                <RowAction label={`Delete ${path}`} onClick={() => onDelete(path)}>
                  <Trash2 className="!size-3.5" />
                </RowAction>
              </li>
            );
          })}
        </ul>
      </ScrollArea>
    </nav>
  );
}
