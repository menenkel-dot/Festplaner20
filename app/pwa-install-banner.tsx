'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import * as React from 'react';
import { Download, Share2, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
}

const DISMISSED_KEY = 'festplaner-install-banner-dismissed';

function isStandalone() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isPublicPortal(pathname: string) {
  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  const mode = new URLSearchParams(window.location.search).get('mode');

  return normalizedPath === '/helfer' ||
    normalizedPath.startsWith('/helfer/') ||
    normalizedPath === '/reservierung' ||
    normalizedPath.startsWith('/reservierung/') ||
    mode === 'helfer' ||
    mode === 'reservierung';
}

export function PwaInstallBanner() {
  const pathname = usePathname();
  const [installPrompt, setInstallPrompt] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = React.useState(false);
  const [isInstalling, setIsInstalling] = React.useState(false);
  const [isDismissed, setIsDismissed] = React.useState(true);
  const publicPortal = typeof window !== 'undefined' && isPublicPortal(pathname);

  React.useEffect(() => {
    if (isStandalone() || isPublicPortal(pathname)) return;

    const dismissed = window.sessionStorage.getItem(DISMISSED_KEY) === 'true';
    const initializationFrame = window.requestAnimationFrame(() => {
      setIsDismissed(dismissed);
      setShowIosInstructions(!dismissed && isIosDevice());
    });

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowIosInstructions(false);
      setIsDismissed(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.cancelAnimationFrame(initializationFrame);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [pathname]);

  const dismiss = () => {
    window.sessionStorage.setItem(DISMISSED_KEY, 'true');
    setIsDismissed(true);
    setShowIosInstructions(false);
  };

  const install = async () => {
    if (!installPrompt) return;

    setIsInstalling(true);
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
      dismiss();
      setInstallPrompt(null);
    } finally {
      setIsInstalling(false);
    }
  };

  if (publicPortal || isDismissed || (!installPrompt && !showIosInstructions)) return null;

  return (
    <aside
      aria-label="FestPlaner installieren"
      className="fixed inset-x-3 z-[70] mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-3 shadow-[0_16px_50px_rgba(15,23,42,0.22)] sm:p-4"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-start gap-3">
        <Image
          src="/app.png"
          alt=""
          width={48}
          height={48}
          className="h-11 w-11 shrink-0 rounded-lg border border-slate-200 object-cover sm:h-12 sm:w-12"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900">FestPlaner installieren</p>
          {showIosInstructions ? (
            <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
              Tippe in Safari auf <Share2 className="mx-1 inline h-4 w-4 align-text-bottom" aria-hidden="true" />
              <strong>Teilen</strong> und dann auf <strong>Zum Home-Bildschirm</strong>.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-5 text-slate-600 sm:text-sm">
              Öffne die Vereinsverwaltung direkt vom Startbildschirm und nutze sie wie eine App.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label="Installationshinweis schließen"
          title="Später"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {!showIosInstructions && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={install}
            disabled={isInstalling}
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60 sm:w-auto"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {isInstalling ? 'Installationsdialog wird geöffnet ...' : 'App installieren'}
          </button>
        </div>
      )}
    </aside>
  );
}
