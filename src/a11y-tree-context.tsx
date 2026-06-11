import { FiberProvider } from "its-fine";
import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
  useState,
} from "react";
import { createPortal } from "react-dom";
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

const errorDialogStyle: CSSProperties = {
  position: "fixed",
  top: "1rem",
  right: "1rem",
  left: "auto",
  bottom: "auto",
  margin: 0,
  maxWidth: "24rem",
  padding: "0.75rem 1rem",
  border: "1px solid #b91c1c",
  borderRadius: "0.5rem",
  background: "#fff",
  color: "#1f2937",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
  zIndex: 2147483647,
};

function TunnelErrorDialog({
  error,
  onDismiss,
}: {
  error: Error | null;
  onDismiss: () => void;
}) {
  const content = (
    <dialog open onClose={onDismiss} style={errorDialogStyle}>
      <div role="alert" aria-live="assertive">
        Accessibility tree error: {error?.message ?? "Unknown error"}
      </div>
      <button type="button" onClick={onDismiss}>
        Dismiss
      </button>
    </dialog>
  );
  // Portal out: the renderer lives inside a canvas fallback / sr-only
  // container, where in-place content is never painted.
  if (typeof document === "undefined") {
    return content;
  }
  return createPortal(content, document.body);
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
  handleDismiss = () => {
    this.setState({ hasError: false, error: null });
  };
  render() {
    if (this.state.hasError) {
      return (
        <TunnelErrorDialog
          error={this.state.error}
          onDismiss={this.handleDismiss}
        />
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
