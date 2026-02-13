import { useEffect, useState, useRef, useMemo, RefObject } from "react";

interface UseInViewOptions extends IntersectionObserverInit {
  once?: boolean;
}

export function useInView(options: UseInViewOptions = {}): {
  ref: RefObject<HTMLDivElement>;
  isInView: boolean;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const { once = true, root, rootMargin, threshold } = options;

  // IntersectionObserver のオプションをメモ化
  const observerOptions = useMemo(
    () => ({ root, rootMargin, threshold }),
    [root, rootMargin, threshold]
  );

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true);
        if (once) {
          observer.disconnect();
        }
      } else if (!once) {
        setIsInView(false);
      }
    }, observerOptions);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [once, observerOptions]);

  return { ref, isInView };
}
