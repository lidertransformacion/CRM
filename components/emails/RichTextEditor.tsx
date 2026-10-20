"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bold, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Table, Underline } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadMailFile } from "@/components/emails/upload";
import { cn } from "@/lib/utils";

function run(command: string, value?: string) {
  document.execCommand(command, false, value);
}

export function RichTextEditor({
  id,
  value,
  onChange,
  onImageUploaded,
}: {
  id?: string;
  value: string;
  onChange: (html: string) => void;
  onImageUploaded?: (file: { id: string; size: number }) => void;
}) {
  const editor = useRef<HTMLDivElement>(null);
  const focused = useRef(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("https://");
  const [error, setError] = useState("");

  useEffect(() => {
    const node = editor.current;
    if (!node || focused.current) return;
    if (node.innerHTML !== value) node.innerHTML = value;
  }, [value]);

  function emit() {
    const html = editor.current?.innerHTML ?? "";
    onChange(html);
  }

  function command(name: string, arg?: string) {
    editor.current?.focus();
    run(name, arg);
    emit();
  }

  async function onImage(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const saved = await uploadMailFile(file);
      onImageUploaded?.({ id: saved.id, size: saved.size });
      editor.current?.focus();
      const alt = saved.filename.replace(/"/g, "");
      run("insertHTML", `<img src="/api/mail/files/${saved.id}" data-file-id="${saved.id}" alt="${alt}">`);
      emit();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudo subir la imagen.");
    }
  }

  return (
    <div className="overflow-hidden rounded-md border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-surface-2 px-2 py-1.5">
        <Tool label="Negrita" onClick={() => command("bold")}><Bold /></Tool>
        <Tool label="Cursiva" onClick={() => command("italic")}><Italic /></Tool>
        <Tool label="Subrayado" onClick={() => command("underline")}><Underline /></Tool>
        <Tool label="Lista" onClick={() => command("insertUnorderedList")}><List /></Tool>
        <Tool label="Lista numerada" onClick={() => command("insertOrderedList")}><ListOrdered /></Tool>
        <Tool label="Título" onClick={() => command("formatBlock", "h2")}><Heading2 /></Tool>
        <Tool label="Enlace" onClick={() => setLinkOpen((open) => !open)}><Link2 /></Tool>
        <label className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs text-ink-2 hover:bg-accent-soft" title="Color del texto">
          Color
          <input
            type="color"
            aria-label="Color del texto"
            className="h-5 w-6 cursor-pointer border-0 bg-transparent p-0"
            defaultValue="#182b55"
            onChange={(event) => command("foreColor", event.target.value)}
          />
        </label>
        <Tool
          label="Tabla"
          onClick={() => command("insertHTML", `<table style="border-collapse:collapse;width:100%"><tr><td style="border:1px solid #c2c2c2;padding:6px">&nbsp;</td><td style="border:1px solid #c2c2c2;padding:6px">&nbsp;</td></tr><tr><td style="border:1px solid #c2c2c2;padding:6px">&nbsp;</td><td style="border:1px solid #c2c2c2;padding:6px">&nbsp;</td></tr></table><p></p>`)}
        >
          <Table />
        </Tool>
        <Tool label="Imagen" onClick={() => imageInput.current?.click()}><ImagePlus /></Tool>
        <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/gif,image/webp" className="hidden" onChange={(event) => void onImage(event.target.files?.[0])} />
      </div>
      {linkOpen && (
        <form
          className="flex flex-col gap-2 border-b border-line px-2 py-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const url = linkUrl.trim();
            if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
              setError("El enlace debe empezar por https:// o mailto:");
              return;
            }
            command("createLink", url);
            setLinkOpen(false);
            setError("");
          }}
        >
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            aria-label="Dirección del enlace"
            className="h-9 flex-1 rounded-md border border-line px-2 text-sm"
          />
          <Button type="submit" variant="secondary" size="sm">Insertar enlace</Button>
        </form>
      )}
      <div
        id={id}
        ref={editor}
        role="textbox"
        aria-multiline="true"
        aria-label="Cuerpo del correo"
        contentEditable
        suppressContentEditableWarning
        className={cn(
          "rich-body min-h-[280px] px-3 py-2 text-base leading-relaxed text-ink outline-none sm:text-sm",
          "[&_a]:text-navy-2 [&_a]:underline [&_h2]:mb-2 [&_h2]:font-sans [&_h2]:text-lg [&_h2]:font-semibold",
          "[&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_table]:w-full [&_table]:border-collapse",
          "[&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:px-2 [&_th]:py-1",
          "[&_ul]:list-disc [&_ul]:pl-5",
        )}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          emit();
        }}
        onInput={emit}
      />
      {error && <p className="border-t border-line px-3 py-2 text-xs text-danger" role="alert">{error}</p>}
    </div>
  );
}

function Tool({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="inline-flex h-8 items-center justify-center rounded-md px-2 text-ink-2 hover:bg-accent-soft hover:text-ink [&_svg]:size-4"
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
