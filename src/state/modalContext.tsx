import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * The two named modal exceptions (spec §1.3) plus one more added by a
 * later task, and nothing else may ever occupy this layer (originally
 * SPRINT2_SPEC.md §4: "a hard ceiling, not a starting point"; the
 * scheduled daily-questionnaire prompt is the one deliberate,
 * documented exception to that ceiling — it fires from a real
 * background trigger, `routine_scheduler.rs`, not the dev-only
 * shortcut the other two still use). `'daily-questionnaire'` is
 * dismissible, not hard-blocking, unlike the other two's alert-dialog
 * framing — see `DailyQuestionnaireModal.tsx`'s own doc comment.
 */
export type ActiveModal = 'challenge' | 'deep-work-guard' | 'daily-questionnaire' | null;

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
