"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

import { Toast, ToastOptions, ToasterProps } from "@/types/toast";

interface ToastContextType {
  toast: (options: ToastOptions) => void;
  toasts: Toast[];
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({
  children,
  ToasterComponent,
}: {
  children: ReactNode;
  ToasterComponent?: React.ComponentType<ToasterProps>;
}) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = {
      id,
      ...options,
    };

    setToasts((prev) => [...prev, newToast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast, toasts }}>
      {children}
      {ToasterComponent && <ToasterComponent toasts={toasts} onClose={removeToast} />}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
