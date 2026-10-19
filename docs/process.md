# How CRM Pay Line treats the data

The app is local. SQLite lives at `data/crm.sqlite` (override with `CRM_DB_PATH`). The first call to the database seeds empty tables from `data/imports/`. Dates below use the export day, 15 Oct 2026, as “today” when the machine clock is that day. Overdue and warranty checks use the machine’s current date.

## Comités

One JSON document per committee is stored in `committee_docs`. The current document is comité 7, held 14 Oct 2026. The calendar is:

| # | Date |
| --- | --- |
| 1 | 2026-09-01 |
| 2 | 2026-09-07 |
| 3 | 2026-09-14 |
| 4 | 2026-09-21 |
| 5 | 2026-09-28 |
| 6 | 2026-10-05 |
| 7 | 2026-10-14 |

Seeded counts on 15 Oct 2026: 64 pendientes (34 open, 30 closed), 7 overdue, 17 open items carried for 2 or more committees, 9 topics (topics 1 and 4 fully closed).

Carry is `current committee number − born committee number`. An item born in comité 7 shows “Nuevo”. An item born in comité 1 shows 6 committees. “Arrastrado” means open and carry ≥ 2. Amber is carry 1; red is carry ≥ 2.

Overdue means the item is still open and `dueOn` is strictly before today. On 15 Oct 2026, dues through 14 Oct are overdue. A due date equal to the meeting day is not overdue that morning.

“Nuevo comité” archives the current document and copies only open pendientes, plus empty placeholder puntos. The born committee stays, so age goes up by one. Closed-only puntos are dropped. Topics left with no puntos are dropped.

Closed topics sit under TEMAS CERRADOS. With “ver cerrados” off, closed-only puntos are hidden, which leaves 9 visible actas out of 20.

The summary email subject is `Comité Out of Stores · 14 oct · Decisiones y pendientes`, signed Andrea. “Cerrado desde el último comité” is the 11 items tagged as closed in comité 7. Per-person tables sort by carry descending, then due date ascending. The clipboard copy includes HTML and plain text. An empty Don Eloy title is written once as `(Don Eloy)`.

Person chips use open-item counts. Unassigned items stay in “Sin responsable”, which is always last in the email. Owners can be added beyond the seed list. A punto or pendiente can store a link to a CRM lead; the link is local text plus an optional lead key.

Committees 1–6 in the history menu are cohorts inside the current document (items born that week), not full snapshots. After “Nuevo comité”, stored documents can be diffed on `/comites/comparar`.

## Pay Line

Leads come from `data/imports/crm_leads.xlsx` (699), activities from `crm_activities.xlsx` (72, all Vencidas), teams from `crm_teams.xlsx` (32). A blank team name continues the previous team’s members.

Stage order:

1. LEAD
2. CONTACTO/VISITA /LLAMADA EN FRIO
3. IMPACTADO
4. PRESENTACIÓN/DISCOVERY
5. OFERTA COMERCIAL
6. NEGOCIACIÓN
7. CIERRE/ GANADO
8. CLIENTE RECURRENTE
9. OPORTUNIDAD PERDIDA

Seeded stage counts: LEAD 59, Contacto 95, Impactado 6, Discovery 17, Oferta 85, Negociación 29, Ganado 185, Recurrente 40, Perdida 183.

Drag-and-drop writes `lead_edits`. `npm run import:odoo` deletes and reloads the three exports, then reapplies those patches. The import key is a hash of name, customer, salesperson, created date, team, revenue, probability, and the duplicate index. It stays stable if those fields and the order of exact duplicates stay stable.

Activities attach to a lead by document name, then by name plus salesperson. Some activity names match more than one lead, so a few stay unlinked.

`OdooSyncAdapter` is the phase-2 interface. `pull*` throws “not implemented” and does not call the network.

## KPIs

Classification follows Odoo `active` and `won_status`. Stage is the fallback only while the status is still Pendiente. A local stage edit does not change `won_status` or `active`.

On the 15 Oct 2026 export:

- Open: 169
- Won: 182 (Ganado, including one lead that is still in an open stage)
- Lost: 309 (Perdido, inactive, or stage OPORTUNIDAD PERDIDA)
- Recurrente: 39, excluded from the win rate

Win rate is won / (won + lost) = 182 / 491. Expected revenue sums ingreso esperado on open leads only (about 302.9 million COP). Leads with null or zero expected revenue are counted as missing revenue (96 open leads in this export). Weighted revenue multiplies that by probability / 100.

Stage age is days since `created_at`. The export has no stage-entry date, so the board says so. It is not time-in-stage.

Overdue activities are the 72 activity rows whose state is Vencidas or whose deadline is before today. They are counted by assignee and are not added again from the lead’s next-activity fields.

Inactive leads are counted separately. In this export, `active = 0` matches `won_status = Perdido` (160).

Targets are rows of salesperson, metric, and period. An empty salesperson means the whole team. No numeric targets are seeded. Metrics: open count, won count, win rate, expected revenue, overdue activities, max average stage age.

## Comodatos

Seeded from `data/imports/listado_equipos.csv` (224 rows). Serial is unique and is the key. `info_proveedores.csv` fills the supplier catalog. Suppliers whose Odoo name matches `/revisar/i`, or whose NIT is empty, are flagged `needs_review`. Empty supplier names are skipped. The equipment’s own “Referencia de Proveedor” is kept; it is not replaced by the supplier crosswalk.

### Asset number and store code

Asset numbers are `ACT-0001` … in CSV order, company-wide, and they do not change. The first CSV row, serial `C24001551`, is `ACT-0001` and store code `ZG-001`. The list on screen is sorted by site, then sequence, so the first visible row is not ACT-0001.

Store code is `{site id}-{sequence}` with the sequence padded to 3 digits, matching the sheet formula `=CONCATENATE(E,"-",TEXT(F,"00#"))`. The sequence is the sheet’s `idnum`, stored on the row. Changing site assigns `max(sequence at the new site) + 1` and does not renumber other machines. After the seed, the next Comercial machine is `COM-039`. Moving that machine to Zona G becomes `ZG-021`.

### Lists, client, warranty, status

Sede, categoría, proveedor, and cliente are fixed lists. “Agregar a la lista” appends to the catalog so a new client does not become free text on the equipment row.

Sites (id, count, display name): COM 38 Comercial, USQ 24 Usaquén, CL79 23 Calle 79, 122B 22, ZG 20 Zona G, CL85 20 Calle 85, CL93 20 Calle 93, CL109 18 Calle 109, FIC48 17, SP 12 Specialized, GET 10 Getsemaní. Trailing spaces are trimmed. Getsemaní and Usaquén use the accented names.

Categories collapse “Filtro de agua”, “Filtros de agua”, and the same text with a trailing space into “Filtros de agua”. Other categories stay distinct after trim.

Suppliers collapse Amor perfecto / Amor Perfecto, Dalla corte / Dallacorte, and Comek / COMEK SAS.

The client column is filled on the 38 Comercial rows only. Client, address, and city are split in `lib/equipment/clients.ts`. Named clients include La Artesa SAS, Sociedad Hotelera Chico, Organic Baobab SAS, Hotel Cartagena Plaza de la Aduana, Libertario Coffee, Terra Om Studio SAS, Dekarla SAS, Medios y Programas SAS, Puro Vino SAS, Food Fans SAS, and Hoteles Estelar. `GEN-COM018` and `GEN-COM019` are addresses with no client name: client stays empty, city is Bogotá, status is en comodato.

`city_source` is `sheet` when the city is written in the cell, `inferred` for Bogotá-pattern addresses that do not name the city, or empty. Cartagena, Cali, and Usaquén are taken from the sheet when the text says so.

Warranty is a date when one can be read. “Ya paso fecha de garantía” is state `vencida` with a null date. “En garantía” is `vigente` with a null date. Empty is `desconocida`. “Nueva, garantía Junio 2027” on `GEN-COM037` is until 2027-06-30 and vigente. When a date exists, the badge compares it with today.

Status is `en_comodato` when the location text is present, otherwise `en_tienda`. The other statuses are `en_bodega`, `en_mantenimiento`, `devuelto`, and `baja`. Delivery date and salesperson are empty on seed. Choosing a client in the form sets status to en comodato.

Modelo is empty on all 224 listado rows. The Odoo maintenance export was not used to fill it.

### Maintenance cost and life sheet

Annual cost is `(365 / everyDays) * (((hoursMin + hoursMax) / 2) * hourlyRate)`. The default rate is 50,000 COP per hour, stored in `app_settings` as `maintenance_hourly_rate_cop`. It is a configurable assumption, not a price from the sheet. A logged visit costs `hours * rate + parts`.

Hours text “1 - 3 Dependiendo el daño del equipo” is min 1, max 3, midpoint 2. Frequency is 90, 183, 30, 360, or 60 days. Eight rows have neither frequency nor hours, so they have no annual cost.

Next maintenance is the last log date plus the frequency. With no logs and no delivery date, the life sheet says “Sin fecha base”.

`/comodatos/{serial}` is the life sheet: identity, history, warranty, cost, maintenance log, and the form (date, preventivo/correctivo, hours, parts cost, technician, notes, condition after). The QR code points at that URL. History records site, client, address, city, status, salesperson, delivery date, store code, alta, and maintenance.

## Google Sheets

The live workbook the team uses is “Listado Equipos”, spreadsheet id `1mrb-s2PbDOEvNwdAs2zMyT7czMxx1tqcYGuwk4FQks4`. This app does not call it. The id is not a default in code. A future operator sets `GOOGLE_SHEETS_SPREADSHEET_ID` themselves.

The adapter upserts by serial, never by row number. It keeps the sheet’s columns and order. It never deletes rows. Formula columns `Codigo Tienda` and `idnum` are never written. `Duracción` keeps the sheet’s spelling.

Until a field is edited, a push writes the original cell, so the seed diff is empty. Editing a field writes the canonical value. A new machine (`sheet_serial` null) is an insert. Pull does not delete local rows that are missing from the sheet. Row number is only a label after the serial match. The first data row is spreadsheet row 2.

When site is dirty, the note says the local code and sequence changed, and the formula columns stay untouched. Outbound `Ubicación` is the site name. Outbound `ID` is the site id.

`getSheetsAdapter()` returns the dry-run adapter unless `SHEETS_SYNC_ENABLED` is exactly `true`. Only then does it load `lib/sheets/live.ts`. The live constructor throws if that variable is not `true`. Credentials, when used later, are `GOOGLE_SHEETS_CLIENT_EMAIL`, `GOOGLE_SHEETS_PRIVATE_KEY`, `GOOGLE_SHEETS_SPREADSHEET_ID`, and optional `GOOGLE_SHEETS_TAB` (default `Listado Equipos`). **Ver diff** plans against the bundled CSV and reports that nothing was written.

## Correos

Templates are seeded in `email_templates` and rendered in the browser. Copy puts plain text on the clipboard. There is no `mailto` and no mail transport.
