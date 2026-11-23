import { type ReactNode, useState } from "react";

import { createA11yTunnel } from "./create-a11y-tunnel";
import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";

export interface A11yTreeElementProps {
  /** Elements rendered in the a11y tree. */
  children: ReactNode;
}

/**
 * Tunnels children into the a11y tree, in React tree order. Children read
 * the providers above this element.
 *
 * Each parent re-render re-derives order by walking the React tree; keep
 * it out of per-frame renders, or use `A11yTreeMirror`.
 */
export function A11yTreeElement({ children }: A11yTreeElementProps) {
  const { tunnel: parentTunnel } = useA11yTunnel();

  return <parentTunnel.In>{children}</parentTunnel.In>;
}

export interface A11yTreeContainerProps {
  /** Scene content holding nested a11y elements. */
  children: ReactNode;
  /** Wraps the a11y content, e.g. `(content) => <div role="group">{content}</div>`.
   * Place `content` once. */
  render: (content: ReactNode) => ReactNode;
}

/** Wraps its children's a11y content in `render`. */
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
