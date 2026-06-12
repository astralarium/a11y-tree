import { type Fiber, useFiber } from "its-fine";
import {
  Fragment,
  type ReactNode,
  useState,
  useSyncExternalStore,
} from "react";

import { sortByFiberOrder, useIsomorphicLayoutEffect } from "./util";

/**
 * useFiber, but tolerant of a missing FiberProvider: tunnels used
 * outside A11yTreeProvider fall back to registration order.
 */
function useFiberSafe(): Fiber | undefined {
  try {
    // Hook order is stable: a FiberProvider ancestor cannot appear or
    // disappear without remounting this component.
    return useFiber();
  } catch {
    return undefined;
  }
}

interface FiberTunnelItem {
  id: string;
  children: ReactNode;
  fiber: Fiber | undefined;
}

export interface FiberTunnelInProps {
  /** Content to render at the tunnel's Out. */
  children: ReactNode;
}

export interface FiberTunnel {
  In: (props: FiberTunnelInProps) => null;
  Out: () => ReactNode;
  /**
   * Re-reads item order from the live fiber tree. Call after content
   * may have moved without re-rendering (e.g. a keyed reorder of
   * memoized items).
   */
  refresh: () => void;
}

/**
 * Creates a tunnel that renders content from any number of `In`
 * components at a single `Out`, ordered by React tree position.
 *
 * Items are keyed by a stable per-instance id, so content keeps its
 * identity across re-renders. Each Out render re-sorts items by live
 * fiber position, grouped by React root (roots keep first-registration
 * order); items without a resolvable fiber keep registration order,
 * after the sorted items.
 *
 * Limitation: an In moved without re-rendering (a keyed reorder of
 * memoized items) is unobservable; the Out picks up the new order on
 * its next render. Callers that know content moved can force one with
 * `refresh()`.
 */
export function fiberTunnel(): FiberTunnel {
  // Map insertion order is registration order, the fallback ordering.
  // Set on an existing id keeps its position, matching in-place update.
  const itemsById = new Map<string, FiberTunnelItem>();
  // Snapshot array for useSyncExternalStore: stable identity between
  // changes, rebuilt lazily after each emit.
  let snapshot: readonly FiberTunnelItem[] | null = null;
  const listeners = new Set<() => void>();
  // Per-tunnel counter, not useId: Ins may come from several React
  // roots, and useId is only unique per root.
  let nextId = 0;

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }

  function getItems() {
    return (snapshot ??= [...itemsById.values()]);
  }

  function emit() {
    snapshot = null;
    for (const listener of listeners) listener();
  }

  function upsert(id: string, children: ReactNode, fiber: Fiber | undefined) {
    itemsById.set(id, { id, children, fiber });
    emit();
  }

  function remove(id: string) {
    itemsById.delete(id);
    emit();
  }

  function refresh() {
    emit();
  }

  function In({ children }: FiberTunnelInProps) {
    const [id] = useState(() => `${nextId++}`);
    const fiber = useFiberSafe();

    useIsomorphicLayoutEffect(() => {
      upsert(id, children, fiber);
    }, [id, children, fiber]);

    useIsomorphicLayoutEffect(() => () => remove(id), [id]);

    return null;
  }

  function Out() {
    const current = useSyncExternalStore(subscribe, getItems, getItems);
    // Sort at render time so every Out render re-reads live fiber positions.
    const sorted = sortByFiberOrder(current);
    return (
      <>
        {sorted.map((item) => (
          <Fragment key={item.id}>{item.children}</Fragment>
        ))}
      </>
    );
  }

  return { In, Out, refresh };
}
