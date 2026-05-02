"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { File as FileIcon, FileArchive, FileAudio, FileCode2, FileImage, FileJson2, FilePlus, FileSpreadsheet, FileTerminal, FileText, FileType2, FileVideo, FolderOpen, MoreHorizontal, Plus, Trash2, Upload } from "lucide-react";
import { ActionMenu } from "@/components/ui/action-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { actionToast } from "@/components/ui/action-toast";
import { useTranslation } from "@/lib/store/i18nStore";
import type { ProjectSource } from "@/lib/store/projectStore";
import { useGooglePicker } from "@/lib/useGooglePicker";
import { cn } from "@/lib/utils";

const MAX_FILE_MB = 20;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const CODE_EXTENSIONS = new Set([
  "js","jsx","ts","tsx","vue","svelte","py","rb","go","rs","java","kt","swift",
  "c","cpp","cc","h","hpp","cs","php","scala","dart","lua","r","m","sh","bash",
  "zsh","fish","ps1","html","htm","css","scss","sass","less","xml","svg","yaml",
  "yml","toml","ini","cfg","env","dockerfile","makefile","gradle","cmake",
]);
const JSON_EXTENSIONS = new Set(["json","jsonl","json5","geojson"]);
const ARCHIVE_EXTENSIONS = new Set(["zip","rar","tar","gz","bz2","7z","xz","tgz"]);

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

function getTypeLabelKey(mime: string, filename: string): string {
  const ext = getExt(filename);
  if (mime === "application/pdf" || ext === "pdf") return "sources.typePdf";
  if (mime.includes("word") || mime.includes("wordprocessingml") || ext === "doc" || ext === "docx") return "sources.typeDocument";
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("spreadsheetml") || ext === "xlsx" || ext === "xls") return "sources.typeSpreadsheet";
  if (ext === "csv") return "sources.typeSpreadsheet";
  if (mime.startsWith("image/")) return "sources.typeImage";
  if (mime.startsWith("video/")) return "sources.typeVideo";
  if (mime.startsWith("audio/")) return "sources.typeAudio";
  if (JSON_EXTENSIONS.has(ext) || mime.includes("json")) return "sources.typeJson";
  if (ext === "html" || ext === "htm") return "sources.typeHtml";
  if (ext === "css" || ext === "scss" || ext === "sass") return "sources.typeStylesheet";
  if (ext === "xml") return "sources.typeXml";
  if (ext === "sh" || ext === "bash" || ext === "zsh") return "sources.typeScript";
  if (CODE_EXTENSIONS.has(ext)) return "sources.typeCode";
  if (ARCHIVE_EXTENSIONS.has(ext) || mime.includes("zip") || mime.includes("tar")) return "sources.typeArchive";
  if (mime === "text/plain" || ext === "txt" || ext === "md") return "sources.typeText";
  return "sources.typeFile";
}

function SourceIcon({ mime, thumbnailData, filename }: { mime: string; thumbnailData?: string | null; filename: string }) {
  if (mime.startsWith("image/") && thumbnailData) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={thumbnailData}
        alt=""
        className="h-9 w-9 shrink-0 rounded-[8px] object-cover ring-1 ring-gray-alpha-200"
      />
    );
  }

  const ext = getExt(filename);
  const iconProps = { size: 18, strokeWidth: 1.75, className: "text-white" };
  let icon;

  if (mime === "application/pdf" || ext === "pdf") icon = <FileType2 {...iconProps} />;
  else if (mime.includes("word") || mime.includes("wordprocessingml") || ext === "doc" || ext === "docx") icon = <FileText {...iconProps} />;
  else if (mime.includes("sheet") || mime.includes("excel") || mime.includes("spreadsheetml") || ext === "xlsx" || ext === "xls" || ext === "csv") icon = <FileSpreadsheet {...iconProps} />;
  else if (mime.startsWith("image/")) icon = <FileImage {...iconProps} />;
  else if (mime.startsWith("video/")) icon = <FileVideo {...iconProps} />;
  else if (mime.startsWith("audio/")) icon = <FileAudio {...iconProps} />;
  else if (JSON_EXTENSIONS.has(ext) || mime.includes("json")) icon = <FileJson2 {...iconProps} />;
  else if (CODE_EXTENSIONS.has(ext) || mime.includes("javascript") || mime.includes("typescript") || mime.includes("html") || mime.includes("css")) icon = <FileCode2 {...iconProps} />;
  else if (ext === "sh" || ext === "bash" || ext === "zsh" || mime.includes("shell")) icon = <FileTerminal {...iconProps} />;
  else if (ARCHIVE_EXTENSIONS.has(ext) || mime.includes("zip") || mime.includes("tar") || mime.includes("gzip")) icon = <FileArchive {...iconProps} />;
  else icon = <FileText {...iconProps} />;

  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] bg-[var(--ds-blue-700)]">
      {icon}
    </div>
  );
}

// ── Add Source Modal ───────────────────────────────────────────────────────────
function AddSourceModal({
  open,
  onOpenChange,
  onUpload,
  onTextDoc,
  projectId,
  onReload,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpload: (files: FileList) => void;
  onTextDoc: () => void;
  projectId: string;
  onReload: () => void;
}) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [driveLoading, setDriveLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { openPicker } = useGooglePicker({
    onFiles: async (files, accessToken) => {
      setDriveLoading(true);
      onOpenChange(false);
      let added = 0;
      for (const driveFile of files) {
        try {
          const dlRes = await fetch("/api/google-drive/download", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileId: driveFile.id, accessToken, fileName: driveFile.name, mimeType: driveFile.mimeType }),
          });
          if (!dlRes.ok) throw new Error(await dlRes.text());
          const exportMime = dlRes.headers.get("X-Export-Mime") ?? driveFile.mimeType;
          const blob = await dlRes.blob();

          // Map Google Docs mime to file extension
          let filename = driveFile.name;
          if (driveFile.mimeType === "application/vnd.google-apps.document" && !filename.endsWith(".docx")) filename += ".docx";
          else if (driveFile.mimeType === "application/vnd.google-apps.spreadsheet" && !filename.endsWith(".xlsx")) filename += ".xlsx";

          const file = new globalThis.File([blob], filename, { type: exportMime });
          const form = new FormData();
          form.append("file", file);
          const uploadRes = await fetch(`/api/projects/${projectId}/sources`, { method: "POST", body: form });
          if (!uploadRes.ok) throw new Error(await uploadRes.text());
          added++;
          onReload();
        } catch (err) {
          console.error("[Drive import]", driveFile.name, err);
          actionToast.error(`${t("sources.importError")} "${driveFile.name}"`);
        }
      }
      if (added > 0) {
        actionToast.success(added === 1 ? t("sources.importSuccess") : `${added} ${t("sources.importSuccess")}`);
      } else {
        actionToast.error(t("sources.importAllError"));
      }
      setDriveLoading(false);
    },
    onError: (err) => actionToast.error(err),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader withSeparator={false} className="px-6 pt-6 pb-4">
          <DialogTitle>{t("sources.addSource")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 px-6 pb-6">
          {/* Drop zone — same style as DropZone in sources tab */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                onUpload(e.target.files);
                onOpenChange(false);
              }
            }}
          />
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (e.dataTransfer.files.length) {
                onUpload(e.dataTransfer.files);
                onOpenChange(false);
              }
            }}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "w-full cursor-pointer rounded-lg border bg-background-100 px-[70px] py-[40px] transition-colors",
              dragging
                ? "border-dashed border-[var(--ds-gray-alpha-500)]"
                : "border-dashed border-[var(--ds-gray-alpha-300)] hover:border-[var(--ds-gray-alpha-500)]",
            )}
          >
            <div className="flex flex-col items-center justify-center gap-6 text-center">
              <div className="flex items-center justify-center rounded-lg border-[0.8px] border-[var(--ds-gray-alpha-400)] bg-background-100 p-[14px]">
                <FolderOpen size={20} strokeWidth={1.5} className="text-ds-text-secondary" />
              </div>
              <div className="flex flex-col gap-2">
                <p className="text-balance text-[16px] font-medium leading-6 text-ds-text">{t("sources.dropFilesHere")}</p>
                <p className="text-balance text-[14px] leading-5 text-ds-text-secondary">{t("sources.clickToBrowse")}</p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-gray-alpha-200 bg-background-100 py-4 text-[13px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-100"
            >
              <Upload size={22} strokeWidth={1.5} className="text-ds-text-secondary" />
              {t("sources.uploadFile")}
            </button>
            <button
              type="button"
              onClick={() => { onTextDoc(); onOpenChange(false); }}
              className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-gray-alpha-200 bg-background-100 py-4 text-[13px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-100"
            >
              <FileText size={22} strokeWidth={1.5} className="text-ds-text-secondary" />
              {t("sources.addTextContentBtn")}
            </button>
            <button
              type="button"
              onClick={() => { openPicker(); }}
              disabled={driveLoading}
              className="flex flex-1 flex-col items-center gap-2 rounded-xl border border-gray-alpha-200 bg-background-100 py-4 text-[13px] font-medium text-ds-text transition-colors hover:bg-gray-alpha-100 disabled:opacity-50"
            >
              {driveLoading ? (
                <span className="h-[22px] w-[22px] animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <svg width="22" height="22" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                </svg>
              )}
              {t("sources.googleDrive")}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Text Document Modal ────────────────────────────────────────────────────────
function TextDocModal({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (title: string, content: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setTitle(""); setContent(""); }
  }, [open]);

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    try {
      await onAdd(title.trim(), content.trim());
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[540px]">
        <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}>
          <DialogHeader>
            <DialogTitle>{t("sources.addTextContent")}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div className="space-y-2">
              <label className="block text-[13.5px] text-ds-text-secondary">{t("sources.titleLabel")}</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("sources.titlePlaceholder")}
                autoFocus
                size="md"
                inputClassName="text-[14px]"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[13.5px] text-ds-text-secondary">{t("sources.contentLabel")}</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t("sources.contentPlaceholder")}
                className="min-h-[180px] resize-none text-[14px]"
              />
            </div>
          </div>

          <DialogFooter>
            <div className="flex w-full items-center justify-end gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
                {t("renameChat.cancel")}
              </Button>
              <Button
                type="submit"
                variant="default"
                size="sm"
                disabled={!title.trim() || !content.trim() || loading}
                isLoading={loading}
              >
                {t("sources.addContent")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Source Item ────────────────────────────────────────────────────────────────
function SourceItem({
  source,
  locale,
  onDelete,
}: {
  source: ProjectSource;
  locale: string;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const dotsRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <div className="group grid w-full cursor-default items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-gray-alpha-200 grid-cols-[minmax(0,1fr)_36px]">
        <div className="flex min-w-0 items-center gap-3">
          <SourceIcon mime={source.mime_type} thumbnailData={source.thumbnail_data} filename={source.filename} />
          <div className="min-w-0 flex flex-col gap-0.5">
            <p className="truncate text-[15px] font-medium leading-6 text-ds-text">
              {source.title || source.filename}
            </p>
            <p className="text-[13px] tabular-nums text-ds-text-tertiary">
              {t(getTypeLabelKey(source.mime_type, source.filename))} · {formatBytes(source.size_bytes)} · {formatDate(source.created_at, locale)}
            </p>
          </div>
        </div>
        <button
          ref={dotsRef}
          type="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-ds-text-tertiary opacity-0 transition-all group-hover:opacity-100 hover:bg-gray-alpha-300 hover:text-ds-text"
          aria-label={t("sources.deleteConfirmTitle")}
        >
          <MoreHorizontal size={16} strokeWidth={2} />
        </button>
      </div>
      {menuOpen && (
        <ActionMenu
          align="end"
          anchorEl={dotsRef.current}
          onClose={() => setMenuOpen(false)}
          items={[
            {
              label: t("sources.deleteConfirmAction"),
              icon: <Trash2 size={14} strokeWidth={2} />,
              onClick: () => { setMenuOpen(false); onDelete(); },
              variant: "danger",
              confirm: {
                title: t("sources.deleteConfirmTitle"),
                description: t("sources.deleteConfirmDesc"),
                actionLabel: t("sources.deleteConfirmAction"),
              },
            },
          ]}
        />
      )}
    </>
  );
}

// ── Drop Zone (empty state) ────────────────────────────────────────────────────
function DropZone({ onFiles }: { onFiles: (files: FileList) => void }) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "w-full cursor-pointer rounded-lg border bg-background-100 px-[70px] py-[48px] text-ds-text transition-colors",
        dragging
          ? "border-dashed border-[var(--ds-gray-alpha-500)] bg-background-100"
          : "border-dashed border-[var(--ds-gray-alpha-300)] hover:border-[var(--ds-gray-alpha-500)]",
      )}
    >
      <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) onFiles(e.target.files); }} />
      <div className="flex flex-col items-center justify-center gap-6 text-center">
        <div className="flex items-center justify-center rounded-lg border-[0.8px] border-[var(--ds-gray-alpha-400)] bg-background-100 p-[14px]">
          <FolderOpen size={20} strokeWidth={1.5} className="text-ds-text-secondary" />
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-balance text-[16px] font-medium leading-6 text-ds-text">{t("sources.dropFilesHere")}</p>
          <p className="text-balance text-[14px] leading-5 text-ds-text-secondary">{t("sources.clickToBrowse")}</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function ProjectSources({ projectId }: { projectId: string }) {
  const { language, t } = useTranslation();
  const locale = language === "uk" ? "uk-UA" : "en-US";

  const [sources, setSources] = useState<ProjectSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [textModalOpen, setTextModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sources`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      setSources(await res.json() as ProjectSource[]);
    } catch {
      actionToast.error(t("sources.loadError"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const uploadFiles = useCallback(async (files: FileList) => {
    setUploading(true);
    let added = 0;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        actionToast.error(`${file.name} ${t("sources.fileSizeExceeded")} ${MAX_FILE_MB} MB`);
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch(`/api/projects/${projectId}/sources`, { method: "POST", body: form });
        if (!res.ok) throw new Error(await res.text());
        const src = await res.json() as ProjectSource;
        setSources((prev) => [src, ...prev]);
        added++;
      } catch {
        actionToast.error(`${t("sources.uploadError")} ${file.name}`);
      }
    }
    if (added > 0) actionToast.success(t("sources.importSuccess"));
    setUploading(false);
  }, [projectId]);

  const addTextSource = useCallback(async (title: string, content: string) => {
    const res = await fetch(`/api/projects/${projectId}/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    if (!res.ok) throw new Error(await res.text());
    const src = await res.json() as ProjectSource;
    setSources((prev) => [src, ...prev]);
    actionToast.success(t("sources.documentAdded"));
  }, [projectId]);

  const deleteSource = useCallback(async (sourceId: string) => {
    setSources((prev) => prev.filter((s) => s.id !== sourceId));
    try {
      const res = await fetch(`/api/projects/${projectId}/sources/${sourceId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[ProjectSources] delete failed", res.status, body);
        actionToast.error(t("sources.deleteError"));
        void load();
      } else {
        actionToast.deleted(t("sources.deleteSuccess"));
      }
    } catch (err) {
      console.error("[ProjectSources] delete error", err);
      actionToast.error(t("sources.deleteError"));
      void load();
    }
  }, [projectId, load]);

  if (loading) {
    return (
      <div className="space-y-0.5 px-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5 min-h-[52px]">
            <Skeleton width={32} height={32} shape="rounded" />
            <div className="flex flex-col gap-1.5 flex-1">
              <Skeleton height={14} width="60%" />
              <Skeleton height={11} width="40%" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {sources.length === 0 ? (
        <DropZone onFiles={(files) => void uploadFiles(files)} />
      ) : (
        <>
          {/* Add source row — never scrolls */}
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            disabled={uploading}
            className="group grid w-full shrink-0 cursor-pointer items-center gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-gray-alpha-200 grid-cols-[minmax(0,1fr)_36px] disabled:opacity-50"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center text-ds-text">
                {uploading
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  : <Plus size={20} strokeWidth={2} />}
              </div>
              <p className="text-[15px] font-medium leading-6 text-ds-text">
                {t("sources.addSource")}
              </p>
            </div>
            <span />
          </button>

          {/* Source list — scrollable */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-0.5">
              {sources.map((s) => (
                <SourceItem
                  key={s.id}
                  source={s}
                  locale={locale}
                  onDelete={() => void deleteSource(s.id)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      <AddSourceModal
        open={addModalOpen}
        onOpenChange={setAddModalOpen}
        onUpload={(files) => { void uploadFiles(files); }}
        onTextDoc={() => setTextModalOpen(true)}
        projectId={projectId}
        onReload={() => void load()}
      />

      <TextDocModal
        open={textModalOpen}
        onOpenChange={setTextModalOpen}
        onAdd={addTextSource}
      />
    </div>
  );
}
