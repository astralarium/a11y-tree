import { useContextBridge } from "its-fine";
import {
  createContext,
  type Key,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { isDevEnv } from "./env";
import { type FiberTunnel, fiberTunnel } from "./fiber-tunnel";
import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";
import { useIsomorphicLayoutEffect } from "./util";

interface SlotData {
  tunnel: FiberTunnel;
  parentTunnel: FiberTunnel;
  refCount: number;
}

interface A11yTreeMultiplexerContextValue {
  getOrCreateSlot: (id: string, parentTunnel: FiberTunnel) => SlotData;
  acquireSlot: (id: string, parentTunnel: FiberTunnel) => void;
  releaseSlot: (id: string) => void;
  getSlot: (id: string) => SlotData | undefined;
  /**
   * Bumped when a slot may appear or disappear. Never read, but keeps
   * the compiler-memoized context value fresh so consumers re-render
   * on refCount changes (slot state lives in a ref).
   */
  version: number;
}

const A11yTreeMultiplexerContext =
  createContext<A11yTreeMultiplexerContextValue | null>(null);

/** The enclosing group's tunnel, unaffected by A11yTunnelContext
 * overrides nested between the group and its slots. */
const A11ySlotGroupContext = createContext<FiberTunnel | null>(null);

export interface A11yTreeMultiplexerItem {
  slotId: string;
  key?: Key;
  render: ReactNode;
}

export interface A11yTreeMultiplexerProps {
  /** Items routed to slots, automatically wrapped in A11yTreeSlotIn. */
  items: A11yTreeMultiplexerItem[];
  /** Slot structure (A11yTreeSlot, A11yTreeSlotGroup). */
  children: ReactNode;
}

/**
 * Item identity, used both as the SlotIn React key and in the order
 * fingerprint so the fingerprint changes exactly when React moves a
 * child. Matches React's key coercion.
 */
function itemKey(item: A11yTreeMultiplexerItem, index: number): string {
  return String(item.key ?? index);
}

/**
 * Multiplexes a11y content from multiple slots into a single tree.
 *
 * Define slots with A11yTreeSlot / A11yTreeSlotGroup as `children`.
 * Route content into slots via `items`.
 */
export function A11yTreeMultiplexer({
  items,
  children,
}: A11yTreeMultiplexerProps) {
  const slotsRef = useRef(new Map<string, SlotData>());
  const [version, setVersion] = useState(0);

  function getOrCreateSlot(id: string, parentTunnel: FiberTunnel): SlotData {
    const existing = slotsRef.current.get(id);
    if (existing) return existing;

    const newSlot: SlotData = {
      tunnel: fiberTunnel({
        multipleOutsWarning:
          `Multiple A11yTreeSlots with id "${id}" are mounted; only the ` +
          `most recently mounted one renders content. Use distinct slot ` +
          `ids, or A11yTreeSlotGroup to scope ids per context`,
      }),
      parentTunnel,
      refCount: 0,
    };
    slotsRef.current.set(id, newSlot);
    return newSlot;
  }

  function acquireSlot(id: string, parentTunnel: FiberTunnel) {
    const slot = getOrCreateSlot(id, parentTunnel);
    if (isDevEnv && slot.parentTunnel !== parentTunnel) {
      console.warn(
        `A11yTreeSlot "${id}": acquired under a different tunnel context ` +
          `than the slot was created in; a standalone slot keeps rendering ` +
          `into the original. Wrap the slot in A11yTreeSlotGroup or use ` +
          `distinct slot ids per context.`,
      );
    }
    slot.refCount++;
    setVersion((v) => v + 1);
  }

  function releaseSlot(id: string) {
    const slot = slotsRef.current.get(id);
    if (!slot) return;

    slot.refCount--;
    if (slot.refCount <= 0) {
      slotsRef.current.delete(id);
      setVersion((v) => v + 1);
    }
  }

  function getSlot(id: string) {
    return slotsRef.current.get(id);
  }

  // Keyed reorders of memoized items never re-render the moved Ins, so
  // refresh slot tunnels when key order changes. Any other items change
  // updates the tunnels via the affected Ins.
  const itemOrderFingerprint = JSON.stringify(items.map(itemKey));
  useIsomorphicLayoutEffect(() => {
    for (const slot of slotsRef.current.values()) {
      slot.tunnel.refresh();
    }
  }, [itemOrderFingerprint]);

  // Drop slots created during discarded renders. Must be a passive
  // effect: child SlotIn acquire effects run first, so every slot from
  // a committed render holds a ref by now; survivors at refCount 0 were
  // never committed. No version bump — they were never rendered.
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
        getSlot,
        version,
      }}
    >
      {children}
      {items.map((item, idx) => (
        <A11yTreeSlotIn key={itemKey(item, idx)} slotId={item.slotId}>
          {item.render}
        </A11yTreeSlotIn>
      ))}
    </A11yTreeMultiplexerContext.Provider>
  );
}

export interface A11yTreeSlotGroupProps {
  /** Slots within this group. */
  children: ReactNode;
  /** Wraps the group content, e.g. `(content) => <NavigableRoot>{content}</NavigableRoot>`. */
  render: (content: ReactNode) => ReactNode;
}

/** Groups multiple A11yTreeSlot components under a shared wrapper. */
export function A11yTreeSlotGroup({
  children,
  render,
}: A11yTreeSlotGroupProps) {
  const { tunnel: parentTunnel } = useA11yTunnel();
  const [groupTunnel] = useState(() => fiberTunnel());
  const ContextBridge = useContextBridge();

  return (
    <>
      <parentTunnel.In>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <ContextBridge>{render(<groupTunnel.Out />)}</ContextBridge>
      </parentTunnel.In>
      <A11yTunnelContext.Provider value={{ tunnel: groupTunnel }}>
        <A11ySlotGroupContext.Provider value={groupTunnel}>
          {children}
        </A11ySlotGroupContext.Provider>
      </A11yTunnelContext.Provider>
    </>
  );
}

export interface A11yTreeSlotProps {
  /** Unique identifier for this slot. */
  id: string;
  /** Wraps the slot content, e.g. `(content) => <NavigableList>{content}</NavigableList>`. */
  render: (content: ReactNode) => ReactNode;
}

/**
 * Defines a slot in the a11y tree structure.
 *
 * Grouped slots render into the enclosing A11yTreeSlotGroup. Standalone
 * slots render into the tunnel context captured when the slot was first
 * created, even if later items acquire it from elsewhere (dev warns).
 */
export function A11yTreeSlot({ id, render }: A11yTreeSlotProps) {
  const ctx = useContext(A11yTreeMultiplexerContext);
  const groupTunnel = useContext(A11ySlotGroupContext);
  const ContextBridge = useContextBridge();

  if (!ctx) return null;

  const slot = ctx.getSlot(id);
  if (!slot || slot.refCount <= 0) return null;

  // Grouped slots render into the group tunnel; standalone slots into
  // the parent tunnel captured at slot creation.
  const parentTunnel = groupTunnel ?? slot.parentTunnel;

  return (
    <parentTunnel.In>
      {/* eslint-disable-next-line react-hooks/static-components */}
      <ContextBridge>{render(<slot.tunnel.Out />)}</ContextBridge>
    </parentTunnel.In>
  );
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
