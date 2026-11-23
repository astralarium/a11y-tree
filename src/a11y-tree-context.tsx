import {
  Component,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { createA11yTunnel } from "./create-a11y-tunnel";
import { isDevEnv } from "./env";
import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";

export interface A11yTreeProviderProps {
  children: ReactNode;
}

/**
 * Accessibility tree for canvas-based UIs.
 *
 * Wrap the canvas in `A11yTreeProvider`; put `A11yTreeRenderer` in its
 * fallback.
 *
 * Wrap each nested React root (e.g. r3f `<Canvas>`) in fiber-tunnel's
 * `FiberAnchor` to order its content at the root's place; unanchored
 * roots are unordered (dev warns). For hosts that skip context bridging,
 * give `FiberAnchor` a function child and wrap the root's content in
 * `ContextBridge` with its bridge.
 *
 * An `<Activity>`-hidden canvas keeps its a11y content unless the host
 * bridges Activity (its-fine 2.1+ `useActivityBridge`).
 *
 * @example
 * <A11yTreeProvider>
 *   <FiberAnchor>
 *     <Canvas fallback={<A11yTreeRenderer />}>
 *       {children}
 *     </Canvas>
 *   </FiberAnchor>
 * </A11yTreeProvider>
 */
export function A11yTreeProvider({ children }: A11yTreeProviderProps) {
  const [rootTunnel] = useState(() => createA11yTunnel());

  return (
    <A11yTunnelContext.Provider value={{ tunnel: rootTunnel }}>
      {children}
    </A11yTunnelContext.Provider>
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
  /** Portals children to `document.body`, out of the hidden tree
   * container. In place during SSR. */
  portal?: boolean;
}

/** Renders fallback UI for the a11y tree. */
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

/** Dev: warns when the default `"sr-only"` container is visible, i.e. no
 * CSS rule hides it. */
function useHiddenContainerWarning(
  ref: RefObject<HTMLDivElement | null>,
  className: string,
) {
  useEffect(() => {
    if (!isDevEnv || className !== "sr-only") return;
    const node = ref.current;
    if (!node || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const { width, height } = node.getBoundingClientRect();
      if (width > 1 || height > 1) {
        observer.disconnect();
        console.warn(
          `A11yTreeRenderer container is visible (${Math.round(width)}×${Math.round(height)}px). ` +
            `No CSS rule hides the default "sr-only" className; ` +
            `add the Tailwind sr-only utility, or pass a different className`,
        );
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, className]);
}

export interface A11yTreeRendererProps {
  className?: string;
  /** Error UI replacing the built-in dialog. Renders in place, where it
   * may be hidden; wrap in `A11yTreeFallbackRenderer` with `portal` to
   * show it. */
  fallback?: (props: A11yTreeErrorFallbackProps) => ReactNode;
}

/**
 * Renders the a11y tree into the DOM, visually hidden by default.
 *
 * Mount one per tree; each extra renderer duplicates the content and
 * nulls its refs on unmount (dev errors). Toggle `className` to show or
 * hide the tree.
 *
 * Content commits a microtask after its element; tests await `act`.
 */
export function A11yTreeRenderer({
  className = "sr-only",
  fallback,
}: A11yTreeRendererProps) {
  const { tunnel } = useA11yTunnel();
  const containerRef = useRef<HTMLDivElement>(null);
  useHiddenContainerWarning(containerRef, className);
  return (
    <TunnelErrorBoundary fallback={fallback}>
      <div ref={containerRef} className={className}>
        <tunnel.Out />
      </div>
    </TunnelErrorBoundary>
  );
}
