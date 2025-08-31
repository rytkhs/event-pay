import { useState, useEffect } from "react";

/**
 * メディアクエリの状態を管理するカスタムフック
 * パフォーマンス最適化のため、リスナーベースで状態を更新
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia(query);
    if (!mediaQuery) return;

    setMatches(mediaQuery.matches || false);

    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    try {
      mediaQuery.addEventListener("change", handleChange);
    } catch {
      // Fallback for older browsers or test environments
      if (mediaQuery.addListener) {
        mediaQuery.addListener(handleChange);
      }
    }

    return () => {
      try {
        mediaQuery.removeEventListener("change", handleChange);
      } catch {
        // Fallback for older browsers or test environments
        if (mediaQuery.removeListener) {
          mediaQuery.removeListener(handleChange);
        }
      }
    };
  }, [query]);

  return matches;
}

/**
 * よく使用されるメディアクエリのカスタムフック
 */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}

export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 768px)");
}
