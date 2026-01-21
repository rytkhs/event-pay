"use client";

import { useEffect } from "react";

import { logError } from "./error-logger";

export function GlobalErrorListener() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      logError(
        {
          code: "500",
          category: "client",
          severity: "high",
          title: "Uncaught Error",
          message: event.message,
        },
        event.error
      );
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      logError(
        {
          code: "500",
          category: "client",
          severity: "high",
          title: "Unhandled Promise Rejection",
          message: String(event.reason),
        },
        event.reason instanceof Error ? event.reason : undefined
      );
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return null;
}
