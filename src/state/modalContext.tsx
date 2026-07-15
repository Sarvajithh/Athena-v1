import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The two named modal exceptions (spec §1.3) and nothing else may ever
 * occupy this layer (SPRINT2_SPEC.md §4: "a hard ceiling, not a
 * starting point"). Both shells are wired to a dev-only trigger this
 * sprint (§19 manual test #10) — no real trigger logic (Decision
 * Challenge Layer, Deep Work Guard) exists yet.
 */
export type ActiveModal = 'challenge' | 'deep-work-guard' | null;

interface ModalContextValue {
  activeModal: ActiveModal;
  openModal: (modal: Exclude<ActiveModal, null>) => void;
  closeModal: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const value = useMemo(
    () => ({
      activeModal,
      openModal: (modal: Exclude<ActiveModal, null>) => setActiveModal(modal),
      closeModal: () => setActiveModal(null),
    }),
    [activeModal],
  );
  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within a ModalProvider');
  return ctx;
}
