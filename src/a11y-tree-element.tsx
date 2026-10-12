import { type ReactNode, useState } from "react";

import { createA11yTunnel } from "./create-a11y-tunnel";
import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";

export interface A11yTreeElementProps {
  /** Elements rendered in the a11y tree. */
  children: ReactNode;
}

/**
 * Tunnels children into the a11y tree.
 *
 * Content orders by React tree position, so the a11y tree follows scene
 * order. Content reads the providers above this element; a context
 * change re-renders only the markup that reads it.
 *
 * Updates whenever its parent re-renders, and each update re-derives
 * order by walking the React tree. Keep elements out of components that
 * re-render every frame, or route them through A11yTreeMultiplexer as
 * memoized items.
 */
export function A11yTreeElement({ children }: A11yTreeElementProps) {
  const { tunnel: parentTunnel } = useA11yTunnel();

  return <parentTunnel.In>{children}</parentTunnel.In>;
}

export interface A11yTreeContainerProps {
  /** Canvas children that may contain nested a11y elements to be wrapped. */
  children: ReactNode;
  /** Wraps the subtree content, e.g. `(content) => <div role="group">{content}</div>`.
   * Place `content` once. */
  render: (content: ReactNode) => ReactNode;
}

/** Container that wraps the a11y subtree. */
export function A11yTreeContainer({
  children,
  render,
}: A11yTreeContainerProps) {
  const [ownTunnel] = useState(() => createA11yTunnel());
  const { tunnel: parentTunnel } = useA11yTunnel();

  return (
    <>
      <parentTunnel.In>{render(<ownTunnel.Out />)}</parentTunnel.In>
      <A11yTunnelContext.Provider value={{ tunnel: ownTunnel }}>
        {children}
      </A11yTunnelContext.Provider>
    </>
  );
}
