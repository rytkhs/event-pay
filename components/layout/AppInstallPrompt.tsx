"use client";

import * as React from "react";

import { Download, MoreVertical, Share, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type InstallPromptMode = "native" | "ios" | "generic";

const INSTALL_CONFIRMED_STORAGE_KEY = "event-pay:pwa-installed";
const MOBILE_QUERY = "(max-width: 767px)";
const STANDALONE_QUERY = "(display-mode: standalone)";

function isIosLike(navigatorValue: Navigator) {
  const userAgent = navigatorValue.userAgent.toLowerCase();

  return (
    /iphone|ipad|ipod/.test(userAgent) ||
    (navigatorValue.platform === "MacIntel" && navigatorValue.maxTouchPoints > 1)
  );
}

function isStandaloneDisplay() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia(STANDALONE_QUERY).matches || navigatorWithStandalone.standalone === true
  );
}

function hasConfirmedInstall() {
  try {
    return window.localStorage.getItem(INSTALL_CONFIRMED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function rememberConfirmedInstall() {
  try {
    window.localStorage.setItem(INSTALL_CONFIRMED_STORAGE_KEY, "true");
  } catch {
    // Storage availability should not affect the install flow.
  }
}

function resolveFallbackMode() {
  return isIosLike(navigator) ? "ios" : "generic";
}

export function AppInstallPrompt() {
  const deferredPromptRef = React.useRef<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = React.useState<InstallPromptMode | null>(null);
  const [isGuideOpen, setIsGuideOpen] = React.useState(false);

  React.useEffect(() => {
    const mobileMedia = window.matchMedia(MOBILE_QUERY);
    const standaloneMedia = window.matchMedia(STANDALONE_QUERY);

    const syncMode = () => {
      if (!mobileMedia.matches || isStandaloneDisplay() || hasConfirmedInstall()) {
        setMode(null);
        setIsGuideOpen(false);
        return;
      }

      setMode(deferredPromptRef.current ? "native" : resolveFallbackMode());
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      deferredPromptRef.current = event as BeforeInstallPromptEvent;
      syncMode();
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      rememberConfirmedInstall();
      setMode(null);
      setIsGuideOpen(false);
    };

    syncMode();

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    mobileMedia.addEventListener("change", syncMode);
    standaloneMedia.addEventListener("change", syncMode);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
      mobileMedia.removeEventListener("change", syncMode);
      standaloneMedia.removeEventListener("change", syncMode);
    };
  }, []);

  const handleInstallClick = React.useCallback(async () => {
    if (mode !== "native" || !deferredPromptRef.current) {
      setIsGuideOpen(true);
      return;
    }

    const promptEvent = deferredPromptRef.current;
    deferredPromptRef.current = null;

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;

      if (choice.outcome === "accepted") {
        rememberConfirmedInstall();
        setMode(null);
        return;
      }
    } catch {
      setIsGuideOpen(true);
    }

    setMode(resolveFallbackMode());
  }, [mode]);

  if (!mode) {
    return null;
  }

  const isIosGuide = mode === "ios";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0 rounded-full"
        aria-label="アプリをインストール"
        onClick={handleInstallClick}
      >
        <Download className="h-4 w-4" />
      </Button>

      <Dialog open={isGuideOpen} onOpenChange={setIsGuideOpen}>
        <DialogContent className="mx-auto w-[calc(100vw-2rem)] max-w-sm rounded-xl p-5 md:hidden">
          <DialogHeader className="pr-7 text-left">
            <DialogTitle>アプリとして使う</DialogTitle>
            <DialogDescription>
              {isIosGuide
                ? "共有メニューからホーム画面に追加できます。"
                : "ブラウザのメニューからインストールできます。"}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 space-y-3">
            {isIosGuide ? (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm">
                  <Share className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>共有ボタンを開く</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm">
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>ホーム画面に追加を選ぶ</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm">
                  <MoreVertical className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>ブラウザのメニューを開く</span>
                </div>
                <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-card px-4 py-3 text-sm">
                  <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span>インストール、またはホーム画面に追加を選ぶ</span>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
