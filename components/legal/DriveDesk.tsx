"use client";

import { useCallback, useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import { ChevronRight, Download, Folder, FolderInput, FolderPlus, LayoutGrid, List, MoreVertical, Pencil, Search, Trash2, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/components/legal/labels";
import { cn } from "@/lib/utils";

type FolderItem = { id: number; parent_id: number | null; name: string };
type FileItem = { id: number; folder_id: number | null; name: string; size_bytes: number; sha256: string; kind: string; updated_at: string };
type Crumb = { id: number | null; name: string };

type Listing = { folders: FolderItem[]; files: FileItem[]; breadcrumbs: Crumb[]; canManage: boolean };

export function DriveDesk({ canManage }: { canManage: boolean }) {
  const { toast } = useToast();
  const [folderId, setFolderId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [previewId, setPreviewId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<
    | { kind: "folder" }
    | { kind: "rename-folder" | "rename-file"; id: number; name: string }
    | { kind: "move-folder" | "move-file"; id: number; name: string }
    | { kind: "delete-folder" | "delete-file"; id: number; name: string }
    | null
  >(null);
  const [draftName, setDraftName] = useState("");
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [tree, setTree] = useState<FolderItem[]>([]);

  const load = useCallback(async (nextFolder: number | null, q: string) => {
    setError("");
    const params = new URLSearchParams();
    if (nextFolder != null) params.set("folder", String(nextFolder));
    if (q) params.set("q", q);
    const response = await fetch(`/api/legal/drive?${params.toString()}`);
    const body = (await response.json()) as Listing & { error?: string };
    if (!response.ok) {
      setError(body.error || "No se pudo abrir la carpeta.");
      return;
    }
    setListing(body);
  }, []);

  useEffect(() => {
    void load(folderId, activeQuery);
  }, [folderId, activeQuery, load]);

  async function openTree() {
    const response = await fetch("/api/legal/drive?tree=1");
    if (!response.ok) return;
    const body = (await response.json()) as { folders: FolderItem[] };
    setTree(body.folders);
  }

  function enter(id: number | null) {
    setPreviewId(null);
    setActiveQuery("");
    setQuery("");
    setFolderId(id);
  }

  async function uploadFiles(files: FileList | File[]) {
    if (!canManage) return;
    const pdfs = [...files].filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      toast({ title: "Solo PDF", description: "Arrastra o elige archivos PDF.", tone: "danger" });
      return;
    }
    setBusy(true);
    try {
      for (const file of pdfs) {
        const form = new FormData();
        form.set("file", file);
        form.set("name", file.name);
        if (folderId != null) form.set("folder_id", String(folderId));
        const response = await fetch("/api/legal/files", { method: "POST", body: form });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          toast({ title: "No se subió", description: body.error || file.name, tone: "danger" });
          return;
        }
      }
      toast({ title: pdfs.length === 1 ? "PDF subido" : "PDFs subidos", tone: "ok" });
      await load(folderId, activeQuery);
    } finally {
      setBusy(false);
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer.files.length) void uploadFiles(event.dataTransfer.files);
  }

  async function submitDialog(event: FormEvent) {
    event.preventDefault();
    if (!dialog) return;
    setBusy(true);
    try {
      let response: Response;
      if (dialog.kind === "folder") {
        response = await fetch("/api/legal/drive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: draftName, parent_id: folderId }),
        });
      } else if (dialog.kind === "rename-folder") {
        response = await fetch(`/api/legal/folders/${dialog.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: draftName }),
        });
      } else if (dialog.kind === "rename-file") {
        response = await fetch(`/api/legal/files/${dialog.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: draftName }),
        });
      } else if (dialog.kind === "move-folder" || dialog.kind === "move-file") {
        const parent = moveTarget === "" ? null : Number(moveTarget);
        const path = dialog.kind === "move-folder" ? `/api/legal/folders/${dialog.id}` : `/api/legal/files/${dialog.id}`;
        response = await fetch(path, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent_id: dialog.kind === "move-folder" ? parent : undefined, folder_id: dialog.kind === "move-file" ? parent : undefined }),
        });
      } else {
        const path = dialog.kind === "delete-folder" ? `/api/legal/folders/${dialog.id}` : `/api/legal/files/${dialog.id}`;
        response = await fetch(path, { method: "DELETE" });
      }
      const body = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast({ title: "No se pudo completar", description: body.error, tone: "danger" });
        return;
      }
      setDialog(null);
      if ((dialog.kind === "delete-folder" || dialog.kind === "delete-file") && previewId === dialog.id) setPreviewId(null);
      await load(folderId, activeQuery);
    } finally {
      setBusy(false);
    }
  }

  const paths = useMemo(() => folderPaths(tree), [tree]);
  const preview = listing?.files.find((file) => file.id === previewId) ?? null;

  return (
    <div className="space-y-4" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-0 flex-1 items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setPreviewId(null);
            setActiveQuery(query.trim());
          }}
        >
          <div className="relative min-w-[180px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre" className="pl-9" aria-label="Buscar archivos" />
          </div>
          <Button type="submit" variant="secondary">Buscar</Button>
        </form>
        <div className="inline-flex rounded-md border border-line-2 bg-surface-2 p-0.5">
          <button type="button" aria-label="Cuadrícula" className={cn("grid size-9 place-items-center rounded-[7px]", view === "grid" && "bg-surface text-ink shadow-sm")} onClick={() => setView("grid")}>
            <LayoutGrid className="size-4" />
          </button>
          <button type="button" aria-label="Lista" className={cn("grid size-9 place-items-center rounded-[7px]", view === "list" && "bg-surface text-ink shadow-sm")} onClick={() => setView("list")}>
            <List className="size-4" />
          </button>
        </div>
        {canManage && (
          <>
            <Button type="button" variant="secondary" onClick={() => { setDraftName(""); setDialog({ kind: "folder" }); }}>
              <FolderPlus /> Carpeta
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept="application/pdf,.pdf"
                multiple
                className="sr-only"
                onChange={(event) => {
                  if (event.target.files) void uploadFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              <span className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-navy px-3 text-sm font-medium text-crema">
                <Upload className="size-4" /> Subir PDF
              </span>
            </label>
          </>
        )}
      </div>

      <nav aria-label="Ruta" className="flex flex-wrap items-center gap-1 text-sm text-ink-2">
        {(listing?.breadcrumbs ?? [{ id: null, name: "Contratos" }]).map((crumb, index, all) => (
          <span key={`${crumb.id ?? "root"}-${index}`} className="inline-flex items-center gap-1">
            {index > 0 && <ChevronRight className="size-3.5 text-ink-3" />}
            <button type="button" className={cn("rounded px-1 py-0.5 hover:bg-accent-soft", index === all.length - 1 && "font-medium text-ink")} onClick={() => enter(crumb.id)}>
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!listing ? (
        <p className="text-sm text-ink-3">Cargando archivos…</p>
      ) : listing.folders.length === 0 && listing.files.length === 0 ? (
        <EmptyState
          icon={<Folder />}
          title={activeQuery ? "Sin resultados" : "Carpeta vacía"}
          description={canManage ? "Crea una carpeta o suelta un PDF aquí." : "Todavía no hay archivos en esta carpeta."}
        />
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listing.folders.map((folder) => (
            <li key={`f-${folder.id}`} className="rounded-lg border border-line-2 bg-surface">
              <button type="button" className="flex w-full items-center gap-2 px-3 py-3 text-left" onClick={() => enter(folder.id)}>
                <Folder className="size-5 shrink-0 text-navy" />
                <span className="truncate text-sm font-medium">{folder.name}</span>
              </button>
              {canManage && <ItemMenu onRename={() => openRename("rename-folder", folder.id, folder.name)} onMove={() => openMove("move-folder", folder.id, folder.name)} onDelete={() => setDialog({ kind: "delete-folder", id: folder.id, name: folder.name })} />}
            </li>
          ))}
          {listing.files.map((file) => (
            <li key={`a-${file.id}`} className={cn("rounded-lg border bg-surface", previewId === file.id ? "border-navy" : "border-line-2")}>
              <button type="button" className="block w-full px-3 py-3 text-left" onClick={() => setPreviewId(file.id)}>
                <span className="block truncate text-sm font-medium">{file.name}</span>
                <span className="mt-1 block text-xs text-ink-3">{formatBytes(file.size_bytes)}</span>
              </button>
              {canManage && <ItemMenu onRename={() => openRename("rename-file", file.id, file.name)} onMove={() => openMove("move-file", file.id, file.name)} onDelete={() => setDialog({ kind: "delete-file", id: file.id, name: file.name })} />}
            </li>
          ))}
        </ul>
      ) : (
        <ul className="divide-y divide-line-2 overflow-hidden rounded-lg border border-line-2 bg-surface">
          {listing.folders.map((folder) => (
            <li key={`f-${folder.id}`} className="flex items-center gap-2 px-3 py-2">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => enter(folder.id)}>
                <Folder className="size-4 text-navy" />
                <span className="truncate text-sm">{folder.name}</span>
              </button>
              <Badge size="sm">Carpeta</Badge>
              {canManage && <ItemMenu onRename={() => openRename("rename-folder", folder.id, folder.name)} onMove={() => openMove("move-folder", folder.id, folder.name)} onDelete={() => setDialog({ kind: "delete-folder", id: folder.id, name: folder.name })} />}
            </li>
          ))}
          {listing.files.map((file) => (
            <li key={`a-${file.id}`} className="flex items-center gap-2 px-3 py-2">
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => setPreviewId(file.id)}>{file.name}</button>
              <span className="text-xs text-ink-3">{formatBytes(file.size_bytes)}</span>
              {canManage && <ItemMenu onRename={() => openRename("rename-file", file.id, file.name)} onMove={() => openMove("move-file", file.id, file.name)} onDelete={() => setDialog({ kind: "delete-file", id: file.id, name: file.name })} />}
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <section className="overflow-hidden rounded-lg border border-line-2 bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-2 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{preview.name}</p>
              <p className="text-xs text-ink-3">{formatBytes(preview.size_bytes)} · {preview.sha256.slice(0, 12)}</p>
            </div>
            <a className="inline-flex h-9 items-center gap-2 rounded-md border border-line px-3 text-sm" href={`/api/legal/files/${preview.id}?download=1`}>
              <Download className="size-4" /> Descargar
            </a>
          </div>
          <iframe title={preview.name} src={`/api/legal/files/${preview.id}`} className="h-[70vh] w-full bg-surface-2" />
        </section>
      )}

      <Dialog open={!!dialog} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent title={dialogTitle(dialog)} description={dialog && dialog.kind.startsWith("delete") ? "Se oculta del archivo. El PDF firmado se conserva en el almacén." : undefined}>
          <form onSubmit={submitDialog}>
            <div className="space-y-3 px-5 py-4">
              {dialog && (dialog.kind === "folder" || dialog.kind.startsWith("rename")) && (
                <Field label="Nombre" htmlFor="drive-name">
                  <Input id="drive-name" value={draftName} onChange={(event) => setDraftName(event.target.value)} required autoFocus />
                </Field>
              )}
              {dialog && dialog.kind.startsWith("move") && (
                <Field label="Destino" htmlFor="drive-move">
                  <Select id="drive-move" value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
                    <option value="">Contratos (raíz)</option>
                    {paths.filter((item) => dialog.kind !== "move-folder" || item.id !== dialog.id).map((item) => (
                      <option key={item.id} value={item.id}>{item.path}</option>
                    ))}
                  </Select>
                </Field>
              )}
              {(dialog?.kind === "delete-folder" || dialog?.kind === "delete-file") && <p className="text-sm text-ink-2">¿Eliminar “{dialog.name}”?</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialog(null)}>Cancelar</Button>
              <Button type="submit" loading={busy} variant={dialog?.kind.startsWith("delete") ? "danger" : "primary"}>{dialog?.kind.startsWith("delete") ? "Eliminar" : "Guardar"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );

  function openRename(kind: "rename-folder" | "rename-file", id: number, name: string) {
    setDraftName(name);
    setDialog({ kind, id, name });
  }

  function openMove(kind: "move-folder" | "move-file", id: number, name: string) {
    setMoveTarget("");
    setDialog({ kind, id, name });
    void openTree();
  }
}

function ItemMenu({ onRename, onMove, onDelete }: { onRename: () => void; onMove: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end px-2 pb-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="grid size-8 place-items-center rounded-md text-ink-3 hover:bg-accent-soft" aria-label="Acciones">
          <MoreVertical className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onSelect={onRename}><Pencil /> Renombrar</DropdownMenuItem>
          <DropdownMenuItem onSelect={onMove}><FolderInput /> Mover</DropdownMenuItem>
          <DropdownMenuItem danger onSelect={onDelete}><Trash2 /> Eliminar</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function dialogTitle(dialog: { kind: string } | null): string {
  if (!dialog) return "";
  if (dialog.kind === "folder") return "Nueva carpeta";
  if (dialog.kind.startsWith("rename")) return "Renombrar";
  if (dialog.kind.startsWith("move")) return "Mover";
  return "Eliminar";
}

function folderPaths(folders: FolderItem[]): { id: number; path: string }[] {
  const byParent = new Map<number | null, FolderItem[]>();
  for (const folder of folders) {
    const list = byParent.get(folder.parent_id) ?? [];
    list.push(folder);
    byParent.set(folder.parent_id, list);
  }
  const out: { id: number; path: string }[] = [];
  const walk = (parent: number | null, prefix: string) => {
    for (const folder of byParent.get(parent) ?? []) {
      const path = prefix ? `${prefix} / ${folder.name}` : folder.name;
      out.push({ id: folder.id, path });
      walk(folder.id, path);
    }
  };
  walk(null, "");
  return out;
}
