import type { FiberTunnel } from "fiber-tunnel";
import {
  createContext,
  type Key,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { createA11yTunnel } from "./create-a11y-tunnel";
import { isDevEnv } from "./env";
import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";

interface SlotData {
  tunnel: FiberTunnel;
  /** Tunnel context of the latest first holder (refCount 0 → 1). */
  parentTunnel: FiberTunnel;
  refCount: number;
}

/** Slot registry, stable for the multiplexer's lifetime. */
interface A11yTreeMultiplexerContextValue {
  getOrCreateSlot: (id: string, parentTunnel: FiberTunnel) => SlotData;
  acquireSlot: (id: string, parentTunnel: FiberTunnel) => void;
  releaseSlot: (id: string) => void;
  /** Slot `id` while refCount > 0. */
  getHeldSlot: (id: string) => SlotData | undefined;
  /** Calls `onChange` when slot `id` crosses refCount 0 ↔ 1.
   * Returns unsubscribe. */
  subscribeSlot: (id: string, onChange: () => void) => () => void;
}

const A11yTreeMultiplexerContext =
  createContext<A11yTreeMultiplexerContextValue | null>(null);

function noop() {}

/** The enclosing group's tunnel, unaffected by A11yTunnelContext
 * overrides nested between the group and its slots. */
const A11ySlotGroupContext = createContext<FiberTunnel | null>(null);

/** A11y content routed to a slot. */
export interface A11yTreeMultiplexerItem {
  /** Target A11yTreeSlot id. Changing it moves the content, keeping
   * React identity, focus, and component state. */
  slotId: string;
  /** Identity across reorders and slot moves. Defaults to array index. */
  key?: Key;
  /** A11y content. Memoized elements skip re-renders on reorder. */
  render: ReactNode;
}

export interface A11yTreeMultiplexerProps {
  /** Items routed to slots, automatically wrapped in A11yTreeSlotIn. */
  items: A11yTreeMultiplexerItem[];
  /** Slot structure (A11yTreeSlot, A11yTreeSlotGroup). */
  children: ReactNode;
}

/**
 * Multiplexes a11y content from multiple slots into a single tree.
 *
 * Define slots with A11yTreeSlot / A11yTreeSlotGroup as `children`.
 * Route content into slots via `items`. Items move between slots and
 * reorder as data: memoized content keeps its mount and skips re-renders.
 */
export function A11yTreeMultiplexer({
  items,
  children,
}: A11yTreeMultiplexerProps) {
  const slotsRef = useRef(new Map<string, SlotData>());
  const listenersRef = useRef(new Map<string, Set<() => void>>());

  function notifySlot(id: string) {
    for (const onChange of listenersRef.current.get(id) ?? []) onChange();
  }

  function getOrCreateSlot(id: string, parentTunnel: FiberTunnel): SlotData {
    const existing = slotsRef.current.get(id);
    if (existing) return existing;

    const newSlot: SlotData = {
      tunnel: createA11yTunnel(),
      parentTunnel,
      refCount: 0,
    };
    slotsRef.current.set(id, newSlot);
    return newSlot;
  }

  function acquireSlot(id: string, parentTunnel: FiberTunnel) {
    const slot = getOrCreateSlot(id, parentTunnel);
    if (slot.refCount === 0) {
      slot.parentTunnel = parentTunnel;
    } else if (isDevEnv && slot.parentTunnel !== parentTunnel) {
      console.warn(
        `A11yTreeSlot "${id}": acquired under a different tunnel context ` +
          `than the slot's first holder; a standalone slot keeps rendering ` +
          `into the first holder's. Wrap the slot in A11yTreeSlotGroup or ` +
          `use distinct slot ids per context.`,
      );
    }
    slot.refCount++;
    if (slot.refCount === 1) notifySlot(id);
  }

  // Slot and tunnel outlive refCount 0 until the sweep below, for
  // re-acquires in the same commit (StrictMode replay, item swap).
  function releaseSlot(id: string) {
    const slot = slotsRef.current.get(id);
    if (!slot) return;

    slot.refCount--;
    if (slot.refCount === 0) notifySlot(id);
  }

  function getHeldSlot(id: string) {
    const slot = slotsRef.current.get(id);
    return slot && slot.refCount > 0 ? slot : undefined;
  }

  function subscribeSlot(id: string, onChange: () => void) {
    let listeners = listenersRef.current.get(id);
    if (!listeners) {
      listeners = new Set();
      listenersRef.current.set(id, listeners);
    }
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
      if (listeners.size === 0) listenersRef.current.delete(id);
    };
  }

  // Drop slots at refCount 0. Passive: child SlotIn acquire effects run
  // first, so every committed slot is held by now.
  useEffect(() => {
    for (const [id, slot] of slotsRef.current) {
      if (slot.refCount <= 0) slotsRef.current.delete(id);
    }
  });

  return (
    <A11yTreeMultiplexerContext.Provider
      value={{
        getOrCreateSlot,
        acquireSlot,
        releaseSlot,
        getHeldSlot,
        subscribeSlot,
      }}
    >
      {children}
      {items.map((item, idx) => (
        <A11yTreeSlotIn key={item.key ?? idx} slotId={item.slotId}>
          {item.render}
        </A11yTreeSlotIn>
      ))}
    </A11yTreeMultiplexerContext.Provider>
  );
}

export interface A11yTreeSlotGroupProps {
  /** Slots within this group. */
  children: ReactNode;
  /** Wraps the group content, e.g. `(content) => <NavigableRoot>{content}</NavigableRoot>`.
   * Place `content` once. */
  render: (content: ReactNode) => ReactNode;
}

/** Groups multiple A11yTreeSlot components under a shared wrapper. */
export function A11yTreeSlotGroup({
  children,
  render,
}: A11yTreeSlotGroupProps) {
  const { tunnel: parentTunnel } = useA11yTunnel();
  const [groupTunnel] = useState(() => createA11yTunnel());

  return (
    <>
      <parentTunnel.In>{render(<groupTunnel.Out />)}</parentTunnel.In>
      <A11yTunnelContext.Provider value={{ tunnel: groupTunnel }}>
        <A11ySlotGroupContext.Provider value={groupTunnel}>
          {children}
        </A11ySlotGroupContext.Provider>
      </A11yTunnelContext.Provider>
    </>
  );
}

export interface A11yTreeSlotProps {
  /** Unique identifier for this slot. Slots sharing an id each render
   * a copy of its content. */
  id: string;
  /** Wraps the slot content, e.g. `(content) => <NavigableList>{content}</NavigableList>`.
   * Place `content` once. */
  render: (content: ReactNode) => ReactNode;
}

/**
 * Defines a slot in the a11y tree structure. Renders while an item
 * routes into it.
 *
 * Grouped slots render into the enclosing A11yTreeSlotGroup. Standalone
 * slots render into their first holder's tunnel context; holders from
 * other contexts trigger a dev warning.
 */
export function A11yTreeSlot({ id, render }: A11yTreeSlotProps) {
  const ctx = useContext(A11yTreeMultiplexerContext);
  const groupTunnel = useContext(A11ySlotGroupContext);
  const slot = useSyncExternalStore(
    (onChange) => ctx?.subscribeSlot(id, onChange) ?? noop,
    () => ctx?.getHeldSlot(id),
    // Holders acquire in effects, which skip the server.
    () => undefined,
  );

  if (!slot) return null;

  // Grouped slots render into the group tunnel; standalone slots into
  // the parent tunnel captured at slot creation.
  const parentTunnel = groupTunnel ?? slot.parentTunnel;

  return <parentTunnel.In>{render(<slot.tunnel.Out />)}</parentTunnel.In>;
}

export interface A11yTreeSlotInProps {
  /** The slot ID to route a11y content to. */
  slotId: string;
  /** Visual children. A11y content from these will tunnel to the slot. */
  children: ReactNode;
}

/**
 * Routes a11y content from children to the specified slot.
 * Creates slot on render, releases on unmount.
 * Key by entity ID to prevent remounts when items move between slots.
 */
export function A11yTreeSlotIn({ slotId, children }: A11yTreeSlotInProps) {
  const ctx = useContext(A11yTreeMultiplexerContext);
  const { tunnel: parentTunnel } = useA11yTunnel();
  const acquiredSlotRef = useRef<string | null>(null);

  const acquire = useEffectEvent((id: string) => {
    if (!ctx) return;
    ctx.acquireSlot(id, parentTunnel);
    acquiredSlotRef.current = id;
  });

  const release = useEffectEvent((id: string) => {
    if (!ctx) return;
    ctx.releaseSlot(id);
    if (acquiredSlotRef.current === id) {
      acquiredSlotRef.current = null;
    }
  });

  useEffect(() => {
    const prevSlotId = acquiredSlotRef.current;

    if (prevSlotId !== null && prevSlotId !== slotId) {
      release(prevSlotId);
    }

    acquire(slotId);

    return () => {
      // Release the slot actually held; slotId may have changed since.
      const toRelease = acquiredSlotRef.current;
      if (toRelease !== null) {
        release(toRelease);
      }
    };
  }, [slotId]);

  if (!ctx) return <>{children}</>;

  const slot = ctx.getOrCreateSlot(slotId, parentTunnel);

  return (
    <A11yTunnelContext.Provider value={{ tunnel: slot.tunnel }}>
      {children}
    </A11yTunnelContext.Provider>
  );
}
