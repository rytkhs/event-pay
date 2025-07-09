import React, { useState, useRef, useCallback, forwardRef, useMemo, useEffect } from "react";
import { cn } from "@/lib/utils";

export type TouchVariant = "button" | "link" | "container";

export interface TouchTargetSize {
  readonly width: number;
  readonly height: number;
}

export interface TouchOptimizedProps {
  readonly variant: TouchVariant;
  readonly children: React.ReactNode;
  readonly onClick?: () => void;
  readonly onLongPress?: () => void;
  readonly longPressDelay?: number;
  readonly href?: string;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly ariaDescribedBy?: string;
  readonly ariaPressed?: boolean;
  readonly ariaExpanded?: boolean;
  readonly minTouchTarget?: TouchTargetSize;
  readonly disabled?: boolean;
}

const TouchOptimized = forwardRef<
  HTMLButtonElement | HTMLAnchorElement | HTMLDivElement,
  TouchOptimizedProps
>(
  (
    {
      variant,
      children,
      onClick,
      onLongPress,
      longPressDelay = 500,
      href,
      className,
      ariaLabel,
      ariaDescribedBy,
      ariaPressed,
      ariaExpanded,
      minTouchTarget = { width: 44, height: 44 },
      disabled = false,
    },
    ref
  ) => {
    const [isTouchActive, setIsTouchActive] = useState(false);
    const touchStartPos = useRef<{ x: number; y: number } | null>(null);
    const longPressTimer = useRef<NodeJS.Timeout | null>(null);

    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        if (disabled) return;

        const touch = e.touches[0];
        if (touch) {
          touchStartPos.current = { x: touch.clientX, y: touch.clientY };
          setIsTouchActive(true);

          if (onLongPress) {
            longPressTimer.current = setTimeout(() => {
              onLongPress();
            }, longPressDelay);
          }
        }
      },
      [disabled, onLongPress, longPressDelay]
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent) => {
        if (disabled || !touchStartPos.current) return;

        const touch = e.touches[0];
        if (touch) {
          const deltaX = Math.abs(touch.clientX - touchStartPos.current.x);
          const deltaY = Math.abs(touch.clientY - touchStartPos.current.y);

          if (deltaX > 10 || deltaY > 10) {
            setIsTouchActive(false);
            if (longPressTimer.current) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
            }
          }
        }
      },
      [disabled]
    );

    const cleanupTouchState = useCallback(() => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      setIsTouchActive(false);
      touchStartPos.current = null;
    }, []);

    const handleTouchEnd = useCallback(() => {
      if (disabled) return;

      const wasActive = isTouchActive;
      cleanupTouchState();

      if (wasActive && onClick) {
        try {
          onClick();
        } catch (error) {
          // Error handling for onClick
          if (process.env.NODE_ENV === "development") {
            console.error("TouchOptimized onClick error:", error);
          }
        }
      }
    }, [disabled, isTouchActive, onClick, cleanupTouchState]);

    const handleTouchCancel = useCallback(() => {
      if (disabled) return;
      cleanupTouchState();
    }, [disabled, cleanupTouchState]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        cleanupTouchState();
      };
    }, [cleanupTouchState]);

    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (disabled) return;

        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (onClick) {
            try {
              onClick();
            } catch (error) {
              // Error handling for onClick
              if (process.env.NODE_ENV === "development") {
                console.error("TouchOptimized onClick error:", error);
              }
            }
          }
        }
      },
      [disabled, onClick]
    );

    const baseClasses = useMemo(
      () =>
        cn(
          // Core touch styles
          "touch-optimized touch-transition",
          // Interactive styles
          "cursor-pointer select-none",
          // Focus management
          "outline-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2",
          // Smooth transitions
          "transition-all duration-150 ease-in-out",
          // State-dependent styles
          {
            "touch-feedback-active scale-95 bg-gray-100": isTouchActive,
            "opacity-50 cursor-not-allowed pointer-events-none": disabled,
          },
          className
        ),
      [isTouchActive, disabled, className]
    );

    const touchStyles = useMemo(
      () => ({
        minWidth: `${minTouchTarget.width}px`,
        minHeight: `${minTouchTarget.height}px`,
      }),
      [minTouchTarget.width, minTouchTarget.height]
    );

    const commonProps = useMemo(
      () => ({
        className: baseClasses,
        style: touchStyles,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
        onTouchCancel: handleTouchCancel,
        onKeyDown: handleKeyDown,
        "aria-label": ariaLabel,
        "aria-describedby": ariaDescribedBy,
        "aria-pressed": ariaPressed,
        "aria-expanded": ariaExpanded,
        "aria-disabled": disabled,
        "aria-live": variant === "button" ? ("polite" as const) : undefined,
      }),
      [
        baseClasses,
        touchStyles,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,
        handleTouchCancel,
        handleKeyDown,
        ariaLabel,
        ariaDescribedBy,
        ariaPressed,
        ariaExpanded,
        disabled,
        variant,
      ]
    );

    if (variant === "button") {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          role="button"
          tabIndex={disabled ? -1 : 0}
          disabled={disabled}
          {...commonProps}
        >
          {children}
        </button>
      );
    }

    if (variant === "link") {
      return (
        <a
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          role="link"
          tabIndex={disabled ? -1 : 0}
          {...commonProps}
        >
          {children}
        </a>
      );
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        role="button"
        tabIndex={disabled ? -1 : 0}
        {...commonProps}
      >
        {children}
      </div>
    );
  }
);

TouchOptimized.displayName = "TouchOptimized";

export { TouchOptimized };
