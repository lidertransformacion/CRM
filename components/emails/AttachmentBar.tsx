"use client";

import { useRef } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes, type UploadedFile } from "@/components/emails/upload";
import { MAX_MAIL_BYTES } from "@/lib/mail/html";

export function AttachmentBar({
  files,
  totalBytes,
  pending,
  onAdd,
  onRemove,
}: {
  files: UploadedFile[];
  totalBytes: number;
  pending: boolean;
  onAdd: (file: File) => void;
  onRemove: (id: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => input.current?.click()} loading={pending}>
          <Paperclip /> Adjuntar archivo
        </Button>
        <p className="text-xs text-ink-3">{formatBytes(totalBytes)} de {formatBytes(MAX_MAIL_BYTES)}</p>
        <input
          ref={input}
          type="file"
          className="hidden"
          accept="image/jpeg,image/png,image/gif,image/webp,.pdf,.docx,.xlsx,application/pdf"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) onAdd(file);
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((file) => (
            <li key={file.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 text-xs">
              <span className="truncate">{file.filename}</span>
              <span className="text-ink-3">{formatBytes(file.size)}</span>
              <button type="button" aria-label={`Quitar ${file.filename}`} className="text-ink-3 hover:text-danger" onClick={() => onRemove(file.id)}>
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
