# FestPlaner

FestPlaner ist eine Next.js-Webapp zur Planung von Vereinsfesten mit Supabase-Backend. Die App unterstützt mehrere Vereine, getrennte Vereinsdaten, öffentliche Helfer- und Reservierungslinks sowie eine Systemverwaltung unter `/sysadmin`.

## Lokal starten

1. Abhängigkeiten installieren:
   `npm install`
2. `.env.local` mit Supabase-Werten anlegen:
   ```env
   NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"
   ```
3. App starten:
   `npm run dev`

## Wichtige Bereiche

- `/` ist die Vereins-App für angemeldete Vereinsnutzer.
- `/sysadmin` ist die Systemverwaltung für globale Systemadmins.
- `/helfer/:token` ist der öffentliche Helferlink eines Vereins.
- `/reservierung/:token` ist der öffentliche Reservierungslink eines Vereins.
- Reservierungsbestätigungen können über vereinseigene SMTP-Einstellungen per E-Mail gesendet werden.

## Supabase

Schemaänderungen liegen in `supabase/migrations`. Edge Functions liegen in `supabase/functions` und müssen nach Änderungen ins Supabase-Projekt deployed werden.

Öffentliche Links sind tokenisiert und werden serverseitig gegen Verein, Festival, Status und Linktyp validiert.

Für den Mailversand muss zusätzlich das Supabase Secret `MAIL_SETTINGS_ENCRYPTION_KEY` gesetzt sein. Die Functions `club-mail-settings` und `send-reservation-confirmation` müssen deployed werden.
