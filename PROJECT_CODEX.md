# FestPlaner - Projekt Codex

## Übersicht
Der **FestPlaner** ist eine umfassende, lokale Webapplikation zur Planung und Organisation von Vereinsfesten (wie z.B. Gründungsfesten, Feuerwehrfesten oder Burschenfesten). 
Die Anwendung ist als Single-Page-Application (SPA) in einem React/Next.js-Umfeld aufgebaut und speichert alle Daten lokal im Browser des Nutzers (`localStorage`). 

## Architektur & Tech-Stack
- **Framework:** Next.js 16 (App Router, Turbopack) mit React 19
- **Sprache:** TypeScript (`app/page.tsx`, `app/layout.tsx`)
- **Styling:** Tailwind CSS 4 (utility-first, responsive, custom colors like `slate`, `blue`, `emerald`, `rose`)
- **Animationen:** Framer Motion (`motion/react`) für Sidebar-Transitions, Tabs und Listen-Animationen.
- **Icons:** Lucide React
- **PDF-Export:** `jspdf` für Schichtplan- und Reservierungs-Exporte
- **Persistenz:** Client-side Custom Web Storage (`localStorage`) plus vorbereitete Supabase-Anbindung

## Datenmodelle (TypeScript)
Die Struktur basiert auf definierten Interfaces im Code:
- `FestInfo`: Allgemeine Event-Daten (Titel, Datum, Ort) und `daysConfig` (Anzahl der Tische pro Tag etc.).
- `ProgramItem`: Programmpunkte mit Zeit, Titel, Ort, Kurzbeschreibung.
- `ChecklistItem`: To-Dos (Task, DueDate, Status, Verantwortlichkeiten).
- `Protocol`: Sitzungsprotokolle (Besprechungspunkte, Entscheidungen, Teilnehmer).
- `Shift`: Schichtplanung (Tag, Zeitraum, Rolle, benötigte Helfer, eingetragene Helfer).
- `Reservation`: Tischreservierungen (Datum, Tisch-ID, Name, Kontakt, Personen).
- `FinancialItem`: Einnahmen & Ausgaben (Kategorie, Summe, Status, Anhänge per Base64).

## Ansichten & Routing (View Modes)
Die App nutzt den Local Scope (bzw. Query-Parameter im getShareableLink), um zwischen drei Hauptansichten zu wechseln:
1. **Admin / Planungsbüro (`appMode = "admin"`)**: Das Haupt-Dashboard mit der vollen Funktionalität, aufgeteilt in 5 Tabs:
   - Info & Programm (Informationen, Programmpunkte bearbeiten)
   - Meetings & To-Dos (Sitzungsprotokolle, Checklisten)
   - Schichtplan & Helfer (Schichten ausschreiben und verwalten)
   - Tischreservierungen (Zeltplan, manuelle Reservierungen verwalten)
   - Finanzen & Budget (Einnahmen, Ausgaben, Belege hochladen)
2. **Helferportal (`?mode=helfer`)**: Ein "Read-only/Action" Bereich für Mitglieder, wo sie verfügbare Schichten sehen und sich mit ihrem Namen eintragen können.
3. **Gäste-Portal (`?mode=reservierung`)**: Ein öffentlicher Bereich für Gäste, in dem noch freie Tische ausgewählt und angefragt/reserviert werden können.

## LocalStorage-Keys
Für die weitere Entwicklung sind folgende Keys im Storage zu beachten:
- `vfp_fest_info`
- `vfp_program_items`
- `vfp_checklist_items`
- `vfp_protocols`
- `vfp_shifts`
- `vfp_reservations`
- `vfp_finances`
- `vfp_budget`

## Weiterentwicklung (Codex)
- **Komponenten-Aufteilung**: Aktuell ist der gesamte Code in `app/page.tsx` monopolisiert. Der nächste sinnvolle architektonische Schritt wäre das Auslagern in einzelne Komponenten (`/components/ui`, `/components/features/...`), wenn das Projekt wächst.
- **Backend-Integration**: Momentan ist es eine Client-only App (Local Storage). Bei Bedarf an echter Multi-User-Kollaboration kann Firebase (Firestore) oder Supabase angedockt werden, um den Inhalt der `localStorage`-Hooks durch Datenbank-Listener zu ersetzen.
- **Zustandsverwaltung**: Aktuell reines lokales React State-Management.

## Supabase-Finalisierung
- **Backend-Ziel**: Supabase ist als Ziel-Backend vorbereitet. Siehe `SUPABASE_SETUP.md` und `supabase/migrations/20260531203000_initial_festplaner_schema.sql`.
- **Aktueller Stand**: `localStorage` bleibt als Fallback aktiv. Supabase-Client, Datenbankschema, Auth-Block und Import der lokalen Planungsdaten sind vorbereitet.
- **Naechster Schritt**: Migration im Supabase-Projekt ausfuehren, im Dashboard anmelden, lokale Daten importieren und danach die laufenden Schreibfunktionen dauerhaft auf Supabase umstellen.
