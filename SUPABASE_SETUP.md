# Supabase Setup für FestPlaner

## Zielbild

FestPlaner läuft mit Supabase für Auth, Mandantenfähigkeit, Persistenz, öffentliche Links, Storage und Edge Functions. `localStorage` bleibt nur als lokaler Fallback und für ältere Datenstände erhalten.

## Environment

```env
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"
```

Die Werte müssen lokal in `.env.local` und im Hosting-Provider gesetzt sein.

## Datenmodell

- `clubs` trennt Vereine/Mandanten.
- `club_memberships` verbindet Benutzer mit Vereinen.
- `app_roles` definiert Rollen pro Verein.
- `system_admins` berechtigt globale Systemadmins für `/sysadmin`.
- `public_links` speichert tokenisierte Helfer- und Reservierungslinks pro Verein/Festival.
- `club-logos` ist ein öffentlicher Storage-Bucket für Vereinslogos.
- `club_mail_settings` speichert SMTP-Konfiguration und Bestätigungstemplate pro Verein.
- `reservation_email_events` protokolliert erfolgreiche und fehlgeschlagene Reservierungsbestätigungen.

## Edge Functions

Aktive Functions:

- `sysadmin-clubs` für Vereine, Logos, Status und initiale Vereinsadmins.
- `admin-users` für Vereinsbenutzer.
- `public-festival` für öffentliche Link-Daten.
- `public-helper-signup` für Helfereintragungen.
- `public-reservation-submit` für Reservierungsanfragen.
- `club-mail-settings` für SMTP-Einstellungen und Testmails.
- `send-reservation-confirmation` für Reservierungsbestätigungen per E-Mail.

Nach Codeänderungen in `supabase/functions` müssen die betroffenen Functions deployed werden.

## Secrets

Zusätzlich zu den Supabase Standard-Secrets wird für verschlüsselte SMTP-Passwörter benötigt:

```env
MAIL_SETTINGS_ENCRYPTION_KEY="<lange-zufällige-geheime-zeichenfolge>"
```

## Betriebshinweise

- Öffentliche Seiten ohne gültigen Token dürfen keine Formulare anzeigen.
- Inaktive oder gelöschte Vereine dürfen über öffentliche Links nicht erreichbar sein.
- In Supabase Auth sollte “Leaked Password Protection” aktiviert werden.
- Supabase Advisors nach Migrationen prüfen.
