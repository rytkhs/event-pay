"use client";

import * as React from "react";

type MobileChromeContextValue = {
  isBottomOverlayOpen: boolean;
  setBottomOverlayActive: (id: string, active: boolean) => void;
};

const MobileChromeContext = React.createContext<MobileChromeContextValue | null>(null);

export function MobileChromeProvider({ children }: { children: React.ReactNode }) {
  const overlayIdsRef = React.useRef(new Set<string>());
  const [isBottomOverlayOpen, setIsBottomOverlayOpen] = React.useState(false);

  const setBottomOverlayActive = React.useCallback((id: string, active: boolean) => {
    const overlayIds = overlayIdsRef.current;

    if (active) {
      overlayIds.add(id);
    } else {
      overlayIds.delete(id);
    }

    setIsBottomOverlayOpen(overlayIds.size > 0);
  }, []);

  const value = React.useMemo<MobileChromeContextValue>(
    () => ({
      isBottomOverlayOpen,
      setBottomOverlayActive,
    }),
    [isBottomOverlayOpen, setBottomOverlayActive]
  );

  return <MobileChromeContext.Provider value={value}>{children}</MobileChromeContext.Provider>;
}

export function useMobileChrome() {
  const context = React.useContext(MobileChromeContext);

  if (!context) {
    throw new Error("useMobileChrome must be used within a MobileChromeProvider.");
  }

  return context;
}

export function useMobileBottomOverlay(active: boolean) {
  const { setBottomOverlayActive } = useMobileChrome();
  const overlayId = React.useId();

  React.useEffect(() => {
    setBottomOverlayActive(overlayId, active);

    return () => {
      setBottomOverlayActive(overlayId, false);
    };
  }, [active, overlayId, setBottomOverlayActive]);
}
