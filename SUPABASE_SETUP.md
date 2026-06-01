# Supabase Setup fuer FestPlaner

## Zielbild

Die App soll auf Vercel laufen und Supabase fuer Persistenz, Auth und spaeter Realtime verwenden. Aktuell bleibt `localStorage` als Fallback bestehen, bis die UI-Schreiboperationen Schritt fuer Schritt auf Supabase umgestellt sind.

## Aktueller Frontend-Stack

- Next.js 16 mit App Router und Turbopack
- React 19
- Tailwind CSS 4
- Supabase JS 2 und `@supabase/ssr`

## Lokale Vorbereitung

1. Supabase-Projekt anlegen.
2. In Supabase die Migration aus `supabase/migrations/20260531203000_initial_festplaner_schema.sql` im SQL Editor ausfuehren.
3. Eine `.env.local` anlegen:

```env
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"
```

4. Dieselben Variablen in Vercel unter Project Settings -> Environment Variables setzen.

## Security-Entscheidungen

- Alle Tabellen haben RLS aktiviert.
- Admin-Bereiche sind fuer `authenticated` Nutzer vorgesehen und werden ueber `owner_id = auth.uid()` getrennt.
- Oeffentliche Portale werden im ersten Supabase-Schritt noch nicht direkt auf Tabellen freigegeben.
- Helfer-Eintragungen und Reservierungsanfragen sollen als naechster Schritt ueber tokenisierte Next.js Route Handler laufen.
- Finanzdaten, Checklisten und Protokolle sind nicht fuer `anon` freigegeben.

## Aktueller App-Stand

- `.env.local` wird lokal fuer Next.js verwendet.
- Im Dashboard gibt es einen Supabase-Login in der linken Seitenleiste.
- Nach Login kann der aktuelle `localStorage`-Stand als neues Festival nach Supabase importiert werden.
- Die laufende Bearbeitung schreibt weiterhin lokal, bis die Repository-Funktionen vollstaendig angebunden sind.

## Naechste technische Schritte

1. Migration im Supabase-Projekt ausfuehren.
2. Daten beim App-Start aus Supabase laden, falls ein importiertes Festival vorhanden ist.
3. Schreibfunktionen in `app/page.tsx` von `saveToStorage` auf Repository-Funktionen umstellen.
4. Oeffentliche Links von `?mode=helfer` auf tokenisierte Links erweitern, z.B. `?mode=helfer&festival=<id>&token=<helper-token>`, und die Writes serverseitig validieren.
5. Belege aus Base64 in Supabase Storage verschieben, bevor echte Rechnungen hochgeladen werden.
