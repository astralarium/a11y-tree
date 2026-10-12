import { type ReactNode, useState } from "react";

import { createA11yTunnel } from "./create-a11y-tunnel";
import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";

export interface A11yTreeElementProps {
  /** Elements rendered in the a11y tree. */
  children: ReactNode;
}

/** Tunnels children into the a11y tree. */
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
