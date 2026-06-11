import { type Fiber, useContextBridge, useFiber } from "its-fine";
import {
  createContext,
  Fragment,
  type Key,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import tunnel from "tunnel-rat";

import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";
import { sortByFiberOrder } from "./util";

interface SlotData {
  tunnel: ReturnType<typeof tunnel>;
  parentTunnel: ReturnType<typeof tunnel>;
  refCount: number;
}

interface A11yTreeMultiplexerContextValue {
  getOrCreateSlot: (
    id: string,
    parentTunnel: ReturnType<typeof tunnel>,
  ) => SlotData;
  acquireSlot: (id: string, parentTunnel: ReturnType<typeof tunnel>) => void;
  releaseSlot: (id: string) => void;
  getSlot: (id: string) => SlotData | undefined;
  bumpVersion: () => void;
  version: number;
}

const A11yTreeMultiplexerContext =
  createContext<A11yTreeMultiplexerContextValue | null>(null);

interface SlotRenderRegistration {
  id: string;
  render: (content: ReactNode) => ReactNode;
  fiber?: Fiber;
}

interface A11ySlotGroupContextValue {
  registerSlotRender: (reg: SlotRenderRegistration) => void;
  unregisterSlotRender: (id: string) => void;
}

const A11ySlotGroupContext = createContext<A11ySlotGroupContextValue | null>(
  null,
);

export interface A11yTreeMultiplexerItem {
  slotId: string;
  key?: Key;
  render: ReactNode;
  /** Parent tunnel override */
  parentTunnel?: ReturnType<typeof tunnel>;
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
 * Route content into slots via `items`.
 */
export function A11yTreeMultiplexer({
  items,
  children,
}: A11yTreeMultiplexerProps) {
  const slotsRef = useRef(new Map<string, SlotData>());
  const [version, setVersion] = useState(0);

  function getOrCreateSlot(
    id: string,
    parentTunnel: ReturnType<typeof tunnel>,
  ): SlotData {
    const existing = slotsRef.current.get(id);
    if (existing) return existing;

    const newSlot: SlotData = { tunnel: tunnel(), parentTunnel, refCount: 0 };
    slotsRef.current.set(id, newSlot);
    return newSlot;
  }

  function acquireSlot(id: string, parentTunnel: ReturnType<typeof tunnel>) {
    const slot = getOrCreateSlot(id, parentTunnel);
    slot.refCount++;
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

  function bumpVersion() {
    setVersion((v) => v + 1);
  }

  return (
    <A11yTreeMultiplexerContext.Provider
      value={{
        getOrCreateSlot,
        acquireSlot,
        releaseSlot,
        getSlot,
        bumpVersion,
        version,
      }}
    >
      {children}
      {items.map((item, idx) => (
        <A11yTreeSlotIn
          key={item.key ?? idx}
          slotId={item.slotId}
          parentTunnel={item.parentTunnel}
        >
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
  /** Parent tunnel override */
  parentTunnel?: ReturnType<typeof tunnel>;
}

/** Groups multiple A11yTreeSlot components under a shared wrapper. */
export function A11yTreeSlotGroup({
  children,
  render,
  parentTunnel: parentTunnelProp,
}: A11yTreeSlotGroupProps) {
  const tunnelKey = useId();
  const { tunnel: contextTunnel } = useA11yTunnel();
  const parentTunnel = parentTunnelProp ?? contextTunnel;
  const [groupTunnel] = useState(() => tunnel());
  const ContextBridge = useContextBridge();
  const ctx = useContext(A11yTreeMultiplexerContext);
  const fiber = useFiber();

  const [slotRenders, setSlotRenders] = useState<SlotRenderRegistration[]>([]);

  function registerSlotRender(reg: SlotRenderRegistration) {
    setSlotRenders((prev) => {
      const existing = prev.findIndex((r) => r.id === reg.id);
      if (existing !== -1) {
        const next = [...prev];
        next[existing] = reg;
        return next;
      }
      return [...prev, reg];
    });
  }

  function unregisterSlotRender(id: string) {
    setSlotRenders((prev) => prev.filter((r) => r.id !== id));
  }

  const activeSlots = sortByFiberOrder(
    slotRenders.filter((reg) => {
      const slot = ctx?.getSlot(reg.id);
      return slot && slot.refCount > 0;
    }),
    fiber,
  );

  return (
    <>
      <parentTunnel.In>
        <Fragment key={tunnelKey}>
          {/* eslint-disable-next-line react-hooks/static-components */}
          <ContextBridge>
            {render(
              <>
                {activeSlots.map((reg) => {
                  const slot = ctx?.getSlot(reg.id);
                  if (!slot) return null;
                  return (
                    <Fragment key={reg.id}>
                      {reg.render(<slot.tunnel.Out />)}
                    </Fragment>
                  );
                })}
              </>,
            )}
          </ContextBridge>
        </Fragment>
      </parentTunnel.In>
      <A11yTunnelContext.Provider value={{ tunnel: groupTunnel }}>
        <A11ySlotGroupContext.Provider
          value={{ registerSlotRender, unregisterSlotRender }}
        >
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

/** Defines a slot in the a11y tree structure. */
export function A11yTreeSlot({ id, render }: A11yTreeSlotProps) {
  const tunnelKey = useId();
  const ctx = useContext(A11yTreeMultiplexerContext);
  const slotGroupContext = useContext(A11ySlotGroupContext);
  const ContextBridge = useContextBridge();
  const fiber = useFiber();

  useEffect(() => {
    if (!slotGroupContext) return;
    slotGroupContext.registerSlotRender({ id, render, fiber });
    return () => slotGroupContext.unregisterSlotRender(id);
  }, [slotGroupContext, id, render, fiber]);

  if (slotGroupContext) return null;
  if (!ctx) return null;

  const slot = ctx.getSlot(id);
  if (!slot || slot.refCount <= 0) return null;

  const parentTunnel = slot.parentTunnel;

  return (
    <parentTunnel.In>
      <Fragment key={tunnelKey}>
        {/* eslint-disable-next-line react-hooks/static-components */}
        <ContextBridge>{render(<slot.tunnel.Out />)}</ContextBridge>
      </Fragment>
    </parentTunnel.In>
  );
}

export interface A11yTreeSlotInProps {
  /** The slot ID to route a11y content to. */
  slotId: string;
  /** Visual children. A11y content from these will tunnel to the slot. */
  children: ReactNode;
  /** Parent tunnel override */
  parentTunnel?: ReturnType<typeof tunnel>;
}

/**
 * Routes a11y content from children to the specified slot.
 * Creates slot on render, releases on unmount.
 * Key by entity ID to prevent remounts when items move between slots.
 */
export function A11yTreeSlotIn({
  slotId,
  children,
  parentTunnel: parentTunnelProp,
}: A11yTreeSlotInProps) {
  const ctx = useContext(A11yTreeMultiplexerContext);
  const { tunnel: contextTunnel } = useA11yTunnel();
  const parentTunnel = parentTunnelProp ?? contextTunnel;
  const acquiredSlotRef = useRef<string | null>(null);

  const acquire = useEffectEvent((id: string) => {
    if (!ctx) return;
    ctx.acquireSlot(id, parentTunnel);
    ctx.bumpVersion();
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

    // Release previous slot if changing to a different one
    if (prevSlotId !== null && prevSlotId !== slotId) {
      release(prevSlotId);
    }

    acquire(slotId);

    return () => {
      // On cleanup, release the slot we actually acquired (tracked in ref)
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
