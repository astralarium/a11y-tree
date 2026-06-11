import { useContextBridge } from "its-fine";
import { type ReactNode, useState } from "react";

import { fiberTunnel } from "./fiber-tunnel";
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
  /** Wraps the subtree content, e.g. `(content) => <div role="group">{content}</div>`. */
  render: (content: ReactNode) => ReactNode;
}

/** Container that wraps the a11y subtree. */
export function A11yTreeContainer({
  children,
  render,
}: A11yTreeContainerProps) {
  const [ownTunnel] = useState(() => fiberTunnel());
  const { tunnel: parentTunnel } = useA11yTunnel();
  const ContextBridge = useContextBridge();

  return (
    <>
      <parentTunnel.In>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <ContextBridge>{render(<ownTunnel.Out />)}</ContextBridge>
      </parentTunnel.In>
      <A11yTunnelContext.Provider value={{ tunnel: ownTunnel }}>
        {children}
      </A11yTunnelContext.Provider>
    </>
  );
}
