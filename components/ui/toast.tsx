"use client";

import { useEffect, useState } from "react";

import { X } from "lucide-react";

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onClose: (id: string) => void;
}

function ToastComponent({ toast, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // マウント時にフェードイン
    setIsVisible(true);

    // 自動削除タイマー
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => onClose(toast.id), 300); // フェードアウト後に削除
    }, toast.duration || 5000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onClose]);

  const variantStyles = {
    default: "bg-background border-border text-foreground",
    destructive: "bg-destructive/10 border-destructive/20 text-destructive",
    success: "bg-success/10 border-success/20 text-success",
  };

  return (
    <div
      className={`
        ${variantStyles[toast.variant || "default"]}
        border rounded-lg shadow-lg p-4 mb-2 min-w-[300px] max-w-[400px]
        transition-all duration-300 ease-in-out transform
        ${isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
      `}
      role="alert"
      aria-live="polite"
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="font-semibold text-sm">{toast.title}</div>
          {toast.description && <div className="text-sm mt-1 opacity-90">{toast.description}</div>}
        </div>
        <button
          onClick={() => onClose(toast.id)}
          className="ml-3 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="閉じる"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

interface ToasterProps {
  toasts: Toast[];
  onClose: (id: string) => void;
}

export function Toaster({ toasts, onClose }: ToasterProps) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col" aria-label="通知">
      {toasts.map((toast) => (
        <ToastComponent key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}
