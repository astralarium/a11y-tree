import { type FiberTunnel, fiberTunnel } from "fiber-tunnel";

/** Creates an a11y tunnel: content reads context at its In; content
 * errors and suspensions stay at the Out. */
export function createA11yTunnel(): FiberTunnel {
  return fiberTunnel({ isolate: true });
}
