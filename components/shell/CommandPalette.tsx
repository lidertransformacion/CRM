"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Coffee, Search, SquareKanban, Users } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { NAV, type NavItem } from "@/components/shell/nav";
import { Kbd } from "@/components/ui/kbd";

type Results = {
  leads: { import_key: string; name: string; customer: string; stage: string }[];
  equipment: { serial: string; name: string; store_code: string; client_name: string | null }[];
  clients: { customer: string; opportunities: number; comodatos: number }[];
};

const EMPTY: Results = { leads: [], equipment: [], clients: [] };

/** Buscador global (⌘K): navega a secciones y encuentra clientes, equipos y oportunidades. */
export function CommandPalette({ open, onOpenChange, sections: sectionItems = NAV }: { open: boolean; onOpenChange: (open: boolean) => void; sections?: NavItem[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<Results>(EMPTY);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
    }
  }, [open]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (response.ok) setResults((await response.json()) as Results);
      } catch {
        /* petición cancelada */
      } finally {
        setLoading(false);
      }
    }, 150);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  const needle = query.trim().toLowerCase();
  const sections = sectionItems.filter((item) => !needle || item.label.toLowerCase().includes(needle) || item.description.toLowerCase().includes(needle));
  const nothing = !loading && sections.length === 0 && results.leads.length === 0 && results.equipment.length === 0 && results.clients.length === 0;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="anim-fade-in fixed inset-0 z-40 bg-navy-deep/45 backdrop-blur-[1px]" />
        <DialogPrimitive.Content className="anim-pop-in fixed left-1/2 top-[18vh] z-50 w-[calc(100%-1.5rem)] max-w-[600px] -translate-x-1/2 -translate-y-0 overflow-hidden rounded-xl border border-line-2 bg-surface shadow-pop outline-none">
          <DialogPrimitive.Title className="sr-only">Buscar en el CRM</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Escribe para ir a una sección o encontrar un cliente, equipo u oportunidad.</DialogPrimitive.Description>
          <Command shouldFilter={false} label="Buscar">
            <div className="flex items-center gap-2 border-b border-line-2 px-4">
              <Search className="size-4 shrink-0 text-ink-3" />
              <Command.Input value={query} onValueChange={setQuery} placeholder="Ir a una sección o buscar cliente, equipo, oportunidad…" className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-ink-3" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[52vh] overflow-y-auto p-2">
              {nothing && <Command.Empty className="px-3 py-8 text-center text-sm text-ink-3">Sin resultados para “{query}”.</Command.Empty>}
              {sections.length > 0 && (
                <Command.Group heading="Ir a" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-3">
                  {sections.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Item key={item.href} value={`nav:${item.href}`} onSelect={() => go(item.href)}>
                        <Icon className="size-4 text-ink-3" />
                        <span className="font-medium">{item.label}</span>
                        <span className="truncate text-ink-3">{item.description}</span>
                      </Item>
                    );
                  })}
                </Command.Group>
              )}
              {results.clients.length > 0 && (
                <Group heading="Clientes">
                  {results.clients.map((client) => (
                    <Item key={client.customer} value={`client:${client.customer}`} onSelect={() => go(`/clientes?cliente=${encodeURIComponent(client.customer)}`)}>
                      <Users className="size-4 text-ink-3" />
                      <span className="font-medium">{client.customer}</span>
                      <span className="truncate text-ink-3">{client.opportunities} oportunidades · {client.comodatos} equipos</span>
                    </Item>
                  ))}
                </Group>
              )}
              {results.leads.length > 0 && (
                <Group heading="Oportunidades">
                  {results.leads.map((lead) => (
                    <Item key={lead.import_key} value={`lead:${lead.import_key}`} onSelect={() => go(`/pipeline?lead=${encodeURIComponent(lead.import_key)}`)}>
                      <SquareKanban className="size-4 text-ink-3" />
                      <span className="font-medium">{lead.customer || lead.name}</span>
                      <span className="truncate text-ink-3">{lead.name} · {lead.stage}</span>
                    </Item>
                  ))}
                </Group>
              )}
              {results.equipment.length > 0 && (
                <Group heading="Equipos">
                  {results.equipment.map((row) => (
                    <Item key={row.serial} value={`eq:${row.serial}`} onSelect={() => go(`/comodatos/${encodeURIComponent(row.serial)}`)}>
                      <Coffee className="size-4 text-ink-3" />
                      <span className="font-medium">{row.store_code} · {row.name}</span>
                      <span className="truncate text-ink-3">{row.serial}{row.client_name ? ` · ${row.client_name}` : ""}</span>
                    </Item>
                  ))}
                </Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group heading={heading} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-ink-3">
      {children}
    </Command.Group>
  );
}

function Item({ value, onSelect, children }: { value: string; onSelect: () => void; children: React.ReactNode }) {
  return (
    <Command.Item value={value} onSelect={onSelect} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-ink data-[selected=true]:bg-accent-soft [&>span:last-child]:ml-auto [&>span:last-child]:max-w-[50%] [&>span:last-child]:text-xs">
      {children}
    </Command.Item>
  );
}
