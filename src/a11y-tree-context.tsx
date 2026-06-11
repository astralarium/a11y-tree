import { FiberProvider } from "its-fine";
import { Component, type ErrorInfo, type ReactNode, useState } from "react";
import tunnel from "tunnel-rat";

import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";

export interface A11yTreeProviderProps {
  children: ReactNode;
}

/**
 * Accessibility tree for canvas-based UIs.
 *
 * Wrap canvas in `A11yTreeProvider` and add `A11yTreeRenderer`
 * to the canvas fallback.
 *
 * @example
 * <A11yTreeProvider>
 *   <Canvas fallback={<A11yTreeRenderer />}>
 *     {children}
 *   </Canvas>
 * </A11yTreeProvider>
 */
export function A11yTreeProvider({ children }: A11yTreeProviderProps) {
  const [rootTunnel] = useState(() => tunnel());

  return (
    <FiberProvider>
      <A11yTunnelContext.Provider value={{ tunnel: rootTunnel }}>
        {children}
      </A11yTunnelContext.Provider>
    </FiberProvider>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class TunnelErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("A11y tunnel error:", error, errorInfo);
    console.error("Component stack:", errorInfo.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div role="alert" aria-live="assertive">
          Accessibility tree error:{" "}
          {this.state.error?.message ?? "Unknown error"}
        </div>
      );
    }
    return this.props.children;
  }
}

export interface A11yTreeRendererProps {
  className?: string;
}

export function A11yTreeRenderer({
  className = "sr-only",
}: A11yTreeRendererProps) {
  const { tunnel } = useA11yTunnel();
  return (
    <TunnelErrorBoundary>
      <div className={className}>
        <tunnel.Out />
      </div>
    </TunnelErrorBoundary>
  );
}
