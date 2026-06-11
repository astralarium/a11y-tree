import { FiberProvider } from "its-fine";
import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { fiberTunnel } from "./fiber-tunnel";
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
  const [rootTunnel] = useState(() => fiberTunnel());

  return (
    <FiberProvider>
      <A11yTunnelContext.Provider value={{ tunnel: rootTunnel }}>
        {children}
      </A11yTunnelContext.Provider>
    </FiberProvider>
  );
}

export interface A11yTreeErrorFallbackProps {
  /** Error thrown from tunneled content. */
  error: Error | null;
  /** Clears the error and re-renders the tree. */
  reset: () => void;
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

export interface A11yTreeFallbackRendererProps {
  /** Fallback UI. */
  children: ReactNode;
  /** Portal children to `document.body`, out of the (possibly
   * visually hidden) tree container. Renders in place during SSR. */
  portal?: boolean;
}

/**
 * Renders fallback UI for the a11y tree. With `portal`, content
 * escapes the tree container, where in-place content is never painted;
 * the built-in error dialog uses this.
 */
export function A11yTreeFallbackRenderer({
  children,
  portal = false,
}: A11yTreeFallbackRendererProps) {
  if (!portal || typeof document === "undefined") {
    return children;
  }
  return createPortal(children, document.body);
}

function TunnelErrorDialog({
  error,
  onDismiss,
}: {
  error: Error | null;
  onDismiss: () => void;
}) {
  return (
    <A11yTreeFallbackRenderer portal>
      <dialog open onClose={onDismiss} style={errorDialogStyle}>
        <div role="alert" aria-live="assertive">
          Accessibility tree error: {error?.message ?? "Unknown error"}
        </div>
        <button type="button" onClick={onDismiss}>
          Dismiss
        </button>
      </dialog>
    </A11yTreeFallbackRenderer>
  );
}

class TunnelErrorBoundary extends Component<
  {
    children: ReactNode;
    fallback?: (props: A11yTreeErrorFallbackProps) => ReactNode;
  },
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
      if (this.props.fallback) {
        return this.props.fallback({
          error: this.state.error,
          reset: this.handleDismiss,
        });
      }
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
  /**
   * Custom error UI replacing the built-in dialog. Renders in place of
   * the tree container (which may be visually hidden); wrap in
   * `A11yTreeFallbackRenderer` with `portal` if the error should be
   * visible.
   */
  fallback?: (props: A11yTreeErrorFallbackProps) => ReactNode;
}

export function A11yTreeRenderer({
  className = "sr-only",
  fallback,
}: A11yTreeRendererProps) {
  const { tunnel } = useA11yTunnel();
  return (
    <TunnelErrorBoundary fallback={fallback}>
      <div className={className}>
        <tunnel.Out />
      </div>
    </TunnelErrorBoundary>
  );
}
