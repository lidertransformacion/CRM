"use client";

import { useMemo, useState } from "react";
import { Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { inputClass } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type MailFavorite = { id: number; name: string; to: string[]; cc: string[] };

type Suggestion = {
  key: string;
  label: string;
  detail: string;
  emails: string[];
  cc?: string[];
  group: boolean;
};

function personLabel(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function AddressField({
  id,
  label,
  hint,
  required,
  addresses,
  onChange,
  suggestions,
  onPickGroup,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  addresses: string[];
  onChange: (next: string[]) => void;
  suggestions: Suggestion[];
  onPickGroup?: (suggestion: Suggestion) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const term = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!term) return [];
    return suggestions
      .filter((item) => item.label.toLowerCase().includes(term) || item.detail.toLowerCase().includes(term) || item.emails.some((email) => email.includes(term)))
      .slice(0, 8);
  }, [suggestions, term]);

  function addEmail(email: string) {
    const next = email.trim().toLowerCase();
    if (!next || addresses.includes(next)) return;
    onChange([...addresses, next]);
    setQuery("");
  }

  function commitTyped() {
    const raw = query.trim();
    if (!raw) return;
    const exact = matches.find((item) => !item.group && item.emails[0] === raw.toLowerCase());
    if (exact && !exact.group) {
      addEmail(exact.emails[0] ?? raw);
      return;
    }
    if (matches[0]?.group && onPickGroup) {
      onPickGroup(matches[0]);
      setQuery("");
      return;
    }
    for (const part of raw.split(/[,;]+/)) addEmail(part);
  }

  return (
    <Field label={label} htmlFor={id} hint={hint} required={required}>
      <div className="relative">
        <div className="flex min-h-9 w-full flex-wrap items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 shadow-[inset_0_1px_0_rgba(24,43,85,.02)] focus-within:border-navy-2 focus-within:ring-2 focus-within:ring-navy-2/20 max-sm:min-h-11">
          {addresses.map((email) => (
            <span key={email} className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-ink">
              <span className="truncate">{email}</span>
              <button type="button" className="text-ink-3 hover:text-ink" aria-label={`Quitar ${email}`} onClick={() => onChange(addresses.filter((item) => item !== email))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id={id}
            value={query}
            role="combobox"
            aria-expanded={open && matches.length > 0}
            aria-autocomplete="list"
            aria-controls={`${id}-list`}
            className="min-w-[8rem] flex-1 bg-transparent text-base outline-none placeholder:text-ink-3 sm:text-sm"
            placeholder={addresses.length ? "Agregar otro" : "Nombre o correo"}
            onChange={(event) => {
              setQuery(event.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(() => setOpen(false), 120);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "," || event.key === ";") {
                event.preventDefault();
                commitTyped();
              } else if (event.key === "Backspace" && !query && addresses.length) {
                onChange(addresses.slice(0, -1));
              }
            }}
          />
        </div>
        {open && matches.length > 0 && (
          <ul id={`${id}-list`} role="listbox" className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-pop">
            {matches.map((item) => (
              <li key={item.key} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-accent-soft max-sm:py-3"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    if (item.group && onPickGroup) onPickGroup(item);
                    else addEmail(item.emails[0] ?? "");
                    setOpen(false);
                  }}
                >
                  <span className="block font-medium text-ink">{item.label}</span>
                  <span className="block truncate text-xs text-ink-3">{item.detail}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Field>
  );
}

export function RecipientFields({
  to,
  cc,
  onToChange,
  onCcChange,
  users,
  favorites,
  onApplyFavorite,
  onSaveFavorite,
  onDeleteFavorite,
  savingFavorite,
}: {
  to: string[];
  cc: string[];
  onToChange: (next: string[]) => void;
  onCcChange: (next: string[]) => void;
  users: { email: string }[];
  favorites: MailFavorite[];
  onApplyFavorite: (favorite: MailFavorite) => void;
  onSaveFavorite: (name: string) => Promise<void | boolean>;
  onDeleteFavorite: (id: number) => Promise<void>;
  savingFavorite: boolean;
}) {
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const suggestions = useMemo<Suggestion[]>(() => {
    const people = users.map((user) => ({
      key: `user:${user.email}`,
      label: personLabel(user.email),
      detail: user.email,
      emails: [user.email],
      group: false,
    }));
    const groups = favorites.map((favorite) => ({
      key: `fav:${favorite.id}`,
      label: favorite.name,
      detail: [...favorite.to, ...favorite.cc.map((email) => `cc ${email}`)].join(", "),
      emails: favorite.to,
      cc: favorite.cc,
      group: true,
    }));
    return [...groups, ...people];
  }, [users, favorites]);

  return (
    <div className="space-y-3">
      <AddressField
        id="email-to"
        label="Para"
        required
        hint="Usuarios del CRM y favoritos. Enter o coma agrega el correo."
        addresses={to}
        onChange={onToChange}
        suggestions={suggestions.filter((item) => item.group || !to.includes(item.emails[0] ?? ""))}
        onPickGroup={(item) => {
          const favorite = favorites.find((entry) => entry.id === Number(item.key.replace("fav:", "")));
          if (favorite) onApplyFavorite(favorite);
        }}
      />
      <AddressField
        id="email-cc"
        label="CC"
        hint="Opcional."
        addresses={cc}
        onChange={onCcChange}
        suggestions={suggestions.filter((item) => !item.group && !cc.includes(item.emails[0] ?? ""))}
      />
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-2">Favoritos</p>
        {favorites.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {favorites.map((favorite) => (
              <li key={favorite.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface px-2 py-1 text-xs">
                <button type="button" className="inline-flex min-w-0 items-center gap-1 font-medium text-ink" onClick={() => onApplyFavorite(favorite)}>
                  <Star className="size-3 shrink-0 text-navy-2" />
                  <span className="truncate">{favorite.name}</span>
                </button>
                <button
                  type="button"
                  className="text-ink-3 hover:text-danger"
                  aria-label={confirmId === favorite.id ? `Confirmar quitar ${favorite.name}` : `Quitar ${favorite.name}`}
                  onClick={() => {
                    if (confirmId !== favorite.id) {
                      setConfirmId(favorite.id);
                      return;
                    }
                    setConfirmId(null);
                    void onDeleteFavorite(favorite.id);
                  }}
                >
                  {confirmId === favorite.id ? "Quitar" : <X className="size-3" />}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            const next = name.trim();
            if (!next || !to.length) return;
            void onSaveFavorite(next).then(() => setName("")).catch(() => undefined);
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nombre del grupo"
            aria-label="Nombre del favorito"
            className={cn(inputClass, "sm:max-w-xs")}
          />
          <Button type="submit" variant="secondary" disabled={!to.length || !name.trim() || savingFavorite} loading={savingFavorite}>
            Guardar favorito
          </Button>
        </form>
      </div>
    </div>
  );
}
