"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { WhatsAppModal } from "./WhatsAppModal";

export type FaidaIntent =
  | "connect"
  | "support"
  | "volunteer"
  | "movement"
  | "updates"
  | "opportunity"
  | "donate";

interface FaidaContextValue {
  openFaida: (intent?: FaidaIntent, contextLabel?: string) => void;
  closeFaida: () => void;
}

const FaidaContext = createContext<FaidaContextValue | null>(null);

export function FaidaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [intent, setIntent] = useState<FaidaIntent>("connect");
  const [contextLabel, setContextLabel] = useState<string | undefined>();

  const openFaida = useCallback(
    (nextIntent: FaidaIntent = "connect", label?: string) => {
      setIntent(nextIntent);
      setContextLabel(label);
      setOpen(true);
    },
    []
  );

  const closeFaida = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openFaida, closeFaida }),
    [openFaida, closeFaida]
  );

  return (
    <FaidaContext.Provider value={value}>
      {children}
      <WhatsAppModal
        open={open}
        onClose={closeFaida}
        intent={intent}
        contextLabel={contextLabel}
      />
    </FaidaContext.Provider>
  );
}

export function useFaida() {
  const ctx = useContext(FaidaContext);
  if (!ctx) throw new Error("useFaida must be used within FaidaProvider");
  return ctx;
}
