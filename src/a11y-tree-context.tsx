import { FiberProvider } from "its-fine";
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

import { isDevEnv } from "./env";
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
  const [rootTunnel] = useState(() =>
    fiberTunnel({
      multipleOutsWarning:
        "Multiple A11yTreeRenderers are mounted for the same a11y tree; " +
        "only the most recently mounted one renders content. " +
        "Keep a single renderer mounted and toggle its className instead",
    }),
  );

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

/**
 * Dev-only: warns when the tree container renders visibly with the
 * default `"sr-only"` className, i.e. no visually-hidden CSS rule
 * backs it. Custom classNames are trusted. No-op in production and
 * where ResizeObserver is absent.
 */
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
  /**
   * Custom error UI replacing the built-in dialog. Renders in place of
   * the tree container (which may be visually hidden); wrap in
   * `A11yTreeFallbackRenderer` with `portal` if the error should be
   * visible.
   */
  fallback?: (props: A11yTreeErrorFallbackProps) => ReactNode;
}

/**
 * Renders the a11y tree into the DOM, visually hidden by default.
 *
 * Mount one per tree: with several, only the most recently mounted
 * renders content (dev warns). To show or hide the tree, toggle
 * className rather than swapping renderers. A renderer hidden by
 * Suspense/Activity keeps its claim until revealed or unmounted.
 *
 * The tree appears in a follow-up render after the renderer's mount
 * commit: layout effects in that commit must not measure or focus the
 * rendered tree.
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
