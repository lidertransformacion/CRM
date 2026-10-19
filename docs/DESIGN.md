# Guía de diseño del CRM Libertario

Esta guía define cómo se ve y cómo se comporta la interfaz. Toda pantalla nueva o rediseñada la sigue. El objetivo es uno: que una persona del equipo Comercial entienda cada pantalla sin que nadie se la explique.

## Principios

1. **Primero lo que requiere atención.** Cada pantalla abre con lo vencido, lo arrastrado o lo próximo a vencer. Lo demás viene después.
2. **Una acción principal por pantalla.** Un solo botón `primary` arriba a la derecha. Las demás acciones son `secondary`, `ghost` o van en un menú.
3. **Nada invisible.** Lo editable se ve editable (`EditableText` con lápiz al pasar el ratón, campos con borde). No hay inputs transparentes.
4. **Feedback inmediato.** Cada guardado muestra un toast o un `SaveIndicator`. Cada error dice qué pasó y qué hacer.
5. **Lista + detalle.** Las listas largas (equipos, oportunidades, clientes) se exploran en tabla o tarjetas y el registro se abre en un `Sheet` lateral o en su propia página. El formulario nunca está siempre abierto ocupando media pantalla.
6. **Estados vacíos que enseñan.** `EmptyState` con título, explicación y la acción que resuelve el vacío.
7. **Español claro.** Sin jerga interna sola: "Pipeline (Pay Line)", "Equipos en comodato", "Pendientes arrastrados: llevan 2 o más comités sin cerrarse". Botones con verbo: "Guardar equipo", "Copiar correo", "Crear comité".
8. **Funciona en el portátil y en el celular.** Sidebar en escritorio, menú en móvil; tablas con scroll horizontal; nada se rompe a 390 px de ancho.

## Marca

Tokens en `app/globals.css`, los mismos de libertariocoffee.com y de la app de mantenimiento.

| Uso | Token | Clase Tailwind |
| --- | --- | --- |
| Fondo de página | `--bg` crema claro `#F3F0EB` | `bg-bg` |
| Superficie (tarjetas, tablas) | `--surface` blanco | `bg-surface` |
| Superficie secundaria (cabeceras de tabla, pies) | `--surface-2` | `bg-surface-2` |
| Tinta principal | `--ink` navy `#182B55` | `text-ink` |
| Tinta secundaria / terciaria | `--ink-2`, `--ink-3` | `text-ink-2`, `text-ink-3` |
| Bordes | `--line`, `--line-2` (más suave) | `border-line`, `border-line-2` |
| Acento (botón principal, sidebar) | `--navy` | `bg-navy text-crema` |
| Acento suave (hover, chips) | `--accent-soft` | `bg-accent-soft` |
| Resaltado | `--amarillo` `#FFF4CC` | `bg-amarillo` / `bg-hl` |
| Estados | `ok`, `warn`, `danger`, `info` + variante `-soft` | `text-ok bg-ok-soft`, etc. |
| Radios | 10 / 14 / 18 px | `rounded-md` / `rounded-lg` / `rounded-xl` |
| Sombra | `--shadow` | `shadow-card`; flotantes `shadow-pop` |

Tipografía: **Poppins** para todo (`font-sans`) y **Libre Baskerville** solo para títulos `h1`–`h3` (`font-serif`, ya aplicado por defecto a esas etiquetas). Los números tabulares usan la clase `num`.

Semántica de color (no cambiarla entre pantallas):

- Rojo `danger`: vencido, arrastrado 2+ comités, garantía vencida, error.
- Ámbar `warn`: 1 comité de arrastre, vence pronto (≤ 7 días), garantía por vencer, advertencia.
- Verde `ok`: cerrado, ganado, guardado, vigente.
- Azul `info`: en curso, vínculo con el CRM, información.
- Navy `accent`: selección activa, acción principal.

## Estructura de una pantalla

```tsx
<div className="page">                     {/* o "page page-wide" para kanban/tablas anchas */}
  <PageHeader eyebrow="Comercial" title="Equipos" description="…" actions={<Button>Nuevo equipo</Button>}>
    <Toolbar>…filtros: SearchInput, Segmented, Chip, Select…</Toolbar>
  </PageHeader>
  <StatGrid>…Stat…</StatGrid>             {/* resumen de lo importante, opcional */}
  <Card>…</Card>                          {/* contenido */}
</div>
```

- `page` centra a 1280 px; `page-wide` a 1600 px.
- El `PageHeader` siempre lleva `eyebrow` corto, título de una o dos palabras y una `description` de una frase que explica para qué sirve la pantalla.
- Filtros en una sola fila (`Toolbar`), con el buscador primero.
- Resumen (`StatGrid`) de 3 a 5 indicadores con `href` o `onClick` que filtren la lista de abajo.

## Catálogo de componentes (`components/ui`)

| Componente | Para qué | Notas |
| --- | --- | --- |
| `Button` | Acciones | `variant`: primary, secondary, soft, ghost, danger, danger-soft, link. `size`: sm, md, lg, icon, icon-sm. `loading` muestra spinner. |
| `Input`, `Select`, `Textarea` | Campos | Siempre dentro de `Field`. `Select` es nativo con flecha propia. |
| `Field`, `FieldGrid`, `FieldSection` | Formularios | Etiqueta visible, `hint`, `error`, `required`. Agrupar campos en secciones con título. |
| `SearchInput` | Buscar en listas | Con icono y botón de limpiar. |
| `Segmented` | Alternar vistas o filtros excluyentes | Máximo 5 opciones, admite `count` y `tone`. |
| `Chip` | Filtros acumulables (personas, etiquetas) | `active`, `alert`, `count`. |
| `Badge` | Estados y etiquetas | `tone`: neutral, accent, ok, warn, danger, info, outline. `dot`. |
| `Card`, `CardHeader`, `CardBody`, `CardFooter` | Bloques | `CardHeader` con `title`, `description`, `actions`. |
| `PageHeader`, `Toolbar` | Cabecera de pantalla | Ver arriba. |
| `Stat`, `StatGrid` | Indicadores | `tone`, `hint`, `href` (enlace) o `onClick` + `active` (filtro). `StatGrid cols={2..6}`. |
| `Table`, `TableWrap`, `THead`, `TBody`, `TR`, `TH`, `TD` | Tablas | `TR interactive selected`; `TD align="right"` para números. |
| `EmptyState` | Vacíos | `title`, `description`, `action`, `compact`. |
| `Sheet`, `SheetContent`, `SheetBody`, `SheetFooter` | Panel lateral | `size`: sm, md, lg, xl. Para ver o editar un registro sin perder la lista. |
| `Dialog`, `DialogContent`, `DialogBody`, `DialogFooter` | Confirmaciones y formularios cortos | `title`, `description`, `size`. |
| `Tooltip` | Explicar un término o un icono | `content`; el hijo debe aceptar `ref` (botón, span). |
| `DropdownMenu*` | Menú de acciones secundarias | `DropdownMenuItem danger` para eliminar. |
| `EditableText` | Texto editable en sitio | `multiline`, `type="number"`, `autoEdit`. Solo llama a `onCommit` al confirmar. |
| `useToast`, `SaveIndicator` | Feedback | `toast({ title, description, tone })`. `SaveIndicator state` para autoguardado. |
| `Skeleton`, `Kbd` | Carga y atajos | |

Si hace falta algo que no existe, se crea en `components/ui` siguiendo el mismo estilo y se añade a esta tabla.

## Patrones de interacción

- **Autoguardado** (comités): el indicador `SaveIndicator` va en la cabecera. Si falla, además un toast `danger` con "Reintentar".
- **Guardar con botón** (equipos, metas): botón `primary` en el `SheetFooter`/`DialogFooter`, `loading` mientras guarda, toast `ok` al terminar y el panel se cierra o se queda según el flujo.
- **Eliminar**: siempre confirmación en `Dialog` con el nombre del registro y botón `danger`.
- **Vencimientos**: fecha en texto corto ("14 oct") y `Badge` `danger` "Vencido" o `warn` "Vence en 3 días". El tooltip explica el cálculo cuando no es obvio.
- **Filtros desde los indicadores**: hacer clic en un `Stat` aplica el filtro correspondiente en la lista (`onClick` + `active`, o `href` con parámetro en la URL si el filtro debe ser enlazable).
- **Buscador global desde un componente**: `const { open } = useCommandPalette()` (en `components/shell/command-palette-context.tsx`).
- **Deep links** que otras pantallas usan:
  - `/pipeline?lead=<import_key>` abre el detalle de esa oportunidad.
  - `/clientes?cliente=<nombre>` abre ese cliente.
  - `/comodatos/<serial>` es la hoja de vida del equipo.
  - `/comites?persona=<nombre>` filtra los pendientes de esa persona.

## Móvil

- Una `Card` dentro de un `grid` necesita `grid-cols-1` (o `min-w-0` en la Card) si contiene texto con `truncate`; si no, el grid crece y aparece scroll horizontal.
- Los montos COP en `Stat` van compactos ("$ 442 M") cuando hay 5 o 6 indicadores por fila; el valor completo va en `hint`.
- Tablas: `TableWrap` + `min-w` en la tabla para que desplacen en horizontal sin romper la página.

## Texto

- Oraciones en minúscula inicial normal (no Title Case). Sin puntos finales en etiquetas y botones.
- Fechas: `shortDate` ("14 oct") en listas, `longDate` ("14 de octubre") en cabeceras.
- Dinero: `cop()` (COP sin decimales).
- Plurales correctos: "1 pendiente", "2 pendientes".
- Nombres de vendedor con `displaySeller` (el export de Odoo trae "APELLIDO, Nombre").

## Código

- Código, identificadores y commits en inglés; textos de interfaz y documentación en español.
- Componentes cliente solo donde hay estado (`"use client"`); los `page.tsx` siguen siendo servidor y cargan los datos.
- No editar `lib/db.ts` desde las pantallas. Si una pantalla necesita una consulta nueva, va en `lib/<módulo>/queries.ts` usando `getDb()`.
- Las pruebas de `tests/` deben seguir en verde: no cambiar las reglas de negocio de `lib/`.
