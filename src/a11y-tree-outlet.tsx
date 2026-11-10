import { useSyncExternalStore } from "react";

import type { A11yTreeMirrorListElement } from "./a11y-tree-mirror";
import { type A11yTreeOutletHandle, hostStyle, outletOf } from "./mirror-store";
import { useA11yTunnel } from "./use-a11y-tunnel";

export interface A11yTreeOutletProps {
  /** From {@link useA11yTreeOutlet}. */
  outlet: A11yTreeOutletHandle;
}

/**
 * Renders the `A11yTreeMirror` list naming `outlet`, at this position in
 * tree order. The list's presence, visibility and order follow this
 * element; its `render` reads context here. Mount one per handle.
 */
export function A11yTreeOutlet({ outlet }: A11yTreeOutletProps) {
  const { tunnel } = useA11yTunnel();
  const state = outletOf(outlet);
  const content = useSyncExternalStore(
    state.subscribe,
    state.getContent,
    () => null,
  );
  if (!content) return null;
  const render = content.render ?? defaultRender;
  return <tunnel.In>{render(content.List)}</tunnel.In>;
}

function defaultRender(List: A11yTreeMirrorListElement) {
  return <List style={hostStyle} />;
}
