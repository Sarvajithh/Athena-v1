import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

export type Density = 'calm' | 'detail';

interface DensityContextValue {
  density: Density;
  setDensity: (density: Density) => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

/**
 * Single in-memory density flag shared across the app shell. This is
 * pure UI state — not persisted across launches and not a domain
 * concept (SPRINT2_SPEC.md §18 Definition of Done: "pure UI state — no
 * persistence, no domain logic"). Assumption: the spec shows
 * DensityToggle "present per-screen" but does not require independent
 * per-screen density; a single shared toggle rendered consistently in
 * each screen's top-right slot is the simplest reading that satisfies
 * §4's "rendered in a consistent top-right slot."
 */
export function DensityProvider({ children }: { children: ReactNode }) {
  const [density, setDensity] = useState<Density>('calm');
  const value = useMemo(() => ({ density, setDensity }), [density]);
  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity(): DensityContextValue {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error('useDensity must be used within a DensityProvider');
  return ctx;
}
