import type {Metadata} from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css'; // Global styles

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Vereinsfest Planer',
  description: 'Zentrale Vereinsverwaltung & FestPlaner für Schichtpläne und Reservierungen',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="de" suppressHydrationWarning className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body suppressHydrationWarning className="antialiased font-sans bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
