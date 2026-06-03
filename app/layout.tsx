import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { PwaRegister } from './pwa-register';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: {
    default: 'Vereinsfest Planer',
    template: '%s | Vereinsfest Planer',
  },
  description: 'Zentrale Vereinsverwaltung und FestPlaner für Schichtpläne, Reservierungen und Finanzen.',
  applicationName: 'FestPlaner',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'FestPlaner',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0f172a',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const creditName = process.env.NEXT_PUBLIC_APP_CREDIT_NAME?.trim() || 'FestPlaner';
  const creditUrl = process.env.NEXT_PUBLIC_APP_CREDIT_URL?.trim();
  const creditContact = process.env.NEXT_PUBLIC_APP_CREDIT_CONTACT?.trim();

  return (
    <html lang="de" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning className="min-h-screen antialiased font-sans bg-slate-50 text-slate-900">
        <PwaRegister />
        {children}
        <footer className="border-t border-slate-200/70 bg-white/70 px-4 py-4 text-center text-[10px] font-medium leading-relaxed text-slate-400">
          <span>Erstellt von </span>
          {creditUrl ? (
            <a
              href={creditUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-slate-500 hover:text-slate-700"
            >
              {creditName}
            </a>
          ) : (
            <span className="font-semibold text-slate-500">{creditName}</span>
          )}
          {creditContact ? (
            <>
              <span> · Kontakt / Impressum: </span>
              <span className="font-semibold text-slate-500">{creditContact}</span>
            </>
          ) : (
            <span> · Mini-Impressum</span>
          )}
        </footer>
      </body>
    </html>
  );
}
