"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Texto editable con afordancia visible: se ve como texto, al pasar el ratón muestra
 * un lápiz y un subrayado punteado, y al hacer clic se convierte en campo.
 * Confirma al salir del campo o con Enter (Cmd/Ctrl+Enter en multilínea); Esc cancela.
 * Solo llama a `onCommit` cuando el valor cambió, así no se guarda en cada tecla.
 */
export function EditableText({
  value,
  onCommit,
  placeholder = "Escribe aquí",
  multiline = false,
  disabled = false,
  className,
  inputClassName,
  as: Tag = "span",
  type = "text",
  ariaLabel,
  autoEdit = false,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "div";
  type?: "text" | "number";
  ariaLabel?: string;
  /** Empieza en modo edición (para registros recién creados). */
  autoEdit?: boolean;
}) {
  const [editing, setEditing] = React.useState(autoEdit && !disabled);
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  React.useEffect(() => {
    if (editing) {
      ref.current?.focus();
      if (ref.current && "select" in ref.current && type === "text" && !multiline) ref.current.select();
    }
  }, [editing, multiline, type]);

  function commit() {
    setEditing(false);
    if (draft !== value) onCommit(draft);
  }
  function cancel() {
    setDraft(value);
    setEditing(false);
  }

  if (editing) {
    const shared = {
      ref: ref as React.RefObject<HTMLInputElement & HTMLTextAreaElement>,
      value: draft,
      placeholder,
      "aria-label": ariaLabel,
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(event.target.value),
      onBlur: commit,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        } else if (event.key === "Enter" && (!multiline || event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commit();
        }
      },
      className: cn("w-full rounded-md border border-navy-2 bg-surface px-2 py-1 text-inherit outline-none ring-2 ring-navy-2/20", inputClassName),
    };
    return multiline ? <textarea {...shared} rows={Math.max(2, Math.min(8, draft.split("\n").length + 1))} /> : <input {...shared} type={type} />;
  }

  const empty = !value;
  return (
    <Tag
      role={disabled ? undefined : "button"}
      tabIndex={disabled ? undefined : 0}
      aria-label={ariaLabel}
      onClick={() => !disabled && setEditing(true)}
      onKeyDown={(event: React.KeyboardEvent) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          setEditing(true);
        }
      }}
      className={cn(
        "group/edit inline-flex max-w-full items-start gap-1.5 rounded-md px-2 py-1 -mx-2 -my-1 text-inherit",
        !disabled && "cursor-text hover:bg-accent-soft/60 focus-visible:ring-2 focus-visible:ring-navy-2/30",
        empty && "text-ink-3 italic",
        multiline && "whitespace-pre-wrap",
        className,
      )}
    >
      <span className={cn("min-w-0 break-words", !disabled && "decoration-dotted decoration-ink-3/60 underline-offset-4 group-hover/edit:underline")}>{empty ? placeholder : value}</span>
      {!disabled && <Pencil className="mt-[0.35em] size-3 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover/edit:opacity-100 group-focus-visible/edit:opacity-100" aria-hidden />}
    </Tag>
  );
}
