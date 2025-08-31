"use client";

import { useState, useCallback } from "react";
import { logger } from "@/lib/logging/app-logger";

export function useClipboard() {
  const [isCopied, setIsCopied] = useState(false);

  const copyToClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      // モダンブラウザのClipboard APIを使用
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        return true;
      }

      // フォールバック: 古いブラウザ対応
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);

      if (successful) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Failed to copy text to clipboard", {
        tag: "clipboardCopy",
        error_name: error instanceof Error ? error.name : "Unknown",
        error_message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }, []);

  return { copyToClipboard, isCopied };
}
