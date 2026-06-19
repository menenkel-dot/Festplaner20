# FestPlaner - Projektkontext

## Überblick

FestPlaner ist eine Next.js-App zur Organisation von Vereinsfesten. Die App unterstützt mehrere Vereine, getrennte Vereinsdaten, rollenbasierte Benutzer, öffentliche Helfer- und Reservierungslinks sowie eine globale Systemverwaltung.

## Architektur

- Next.js App Router mit React und TypeScript
- Tailwind CSS für das UI
- Supabase für Auth, Postgres, Storage und Edge Functions
- `jspdf` für Schicht- und Reservierungslisten
- PWA-Service-Worker für App-Metadaten und statische Assets

## Hauptbereiche

- Vereins-App unter `/`
- Systemverwaltung unter `/sysadmin`
- Helferportal unter `/helfer/:token`
- Reservierungsportal unter `/reservierung/:token`

## Mandantenfähigkeit

Alle produktiven Vereinsdaten hängen an `club_id`. Normale Vereinsnutzer sehen nur aktive Vereine, denen sie über `club_memberships` zugeordnet sind. Systemadmins werden über `system_admins` berechtigt.

Öffentliche Links sind tokenisiert und werden über Edge Functions validiert. Links eines Vereins dürfen nie Daten eines anderen Vereins laden.

## Entwicklungshinweise

- `app/page.tsx` ist aktuell noch sehr groß; größere UI-Arbeiten sollten schrittweise in Komponenten ausgelagert werden.
- Belege und Anhänge sollten langfristig aus Tabellen-Base64 in Supabase Storage verschoben werden.
- Nach Supabase-Migrationen Advisors prüfen und Edge Functions bei Bedarf neu deployen.
