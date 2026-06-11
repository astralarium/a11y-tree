import { createContext, useContext } from "react";
import type tunnel from "tunnel-rat";

export interface A11yTunnelContextValue {
  /** The tunnel-rat instance for this subtree. */
  tunnel: ReturnType<typeof tunnel>;
}

/** React context for the nearest a11y tunnel. */
export const A11yTunnelContext = createContext<A11yTunnelContextValue | null>(
  null,
);

/** Returns the nearest a11y tunnel. Throws if used outside A11yTreeProvider. */
export function useA11yTunnel() {
  const ctx = useContext(A11yTunnelContext);
  if (!ctx)
    throw new Error("useA11yTunnel must be used within A11yTreeProvider");
  return ctx;
}
