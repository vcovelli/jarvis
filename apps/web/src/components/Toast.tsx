"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type ToastState = {
  message: string;
  id: number;
};

type ToastContextValue = {
  showToast: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string) => {
    setToast({ message, id: Date.now() });
    const timeout = setTimeout(() => {
      setToast((current) => (current && current.message === message ? null : current));
    }, 2200);
    return () => clearTimeout(timeout);
  }, []);

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div
          className="pointer-events-none fixed z-50 rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-zinc-900 shadow-lg"
          style={{
            left: "calc(env(safe-area-inset-left, 0px) + 1.25rem)",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
          }}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
