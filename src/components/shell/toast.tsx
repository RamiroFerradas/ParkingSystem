"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastTone = "success" | "error";
type PushToast = (message: string, tone?: ToastTone) => void;

interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
}

const ToastContext = createContext<PushToast>(() => {});

export function useToast(): PushToast {
  return useContext(ToastContext);
}

/**
 * Confirmación efímera de acciones globales (abrir/cerrar turno). Vive arriba
 * del shell para sobrevivir al router.refresh() que remonta la tarjeta.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback<PushToast>((message, tone = "success") => {
    const id = nextId.current + 1;
    nextId.current = id;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] z-[100] flex flex-col gap-2 lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-80"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={
              "rounded-lg border px-3 py-2 text-sm shadow-xl " +
              (toast.tone === "error"
                ? "border-red-500/40 bg-red-950/95 text-red-200"
                : "border-emerald-500/40 bg-emerald-950/95 text-emerald-200")
            }
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
