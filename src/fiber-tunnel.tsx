import { type Fiber, useFiber } from "its-fine";
import {
  Fragment,
  type ReactNode,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { isDevEnv } from "./env";
import {
  isFiberHidden,
  isFiberLive,
  sortByFiberOrder,
  useIsomorphicLayoutEffect,
} from "./util";

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

interface OutToken {
  /** Election order. Assigned once, at first registration, so an Out
   * whose effects replay without a real remount (Suspense/Activity
   * hide and reveal) resumes its position instead of stealing the
   * election from a newer Out. */
  seq: number;
  /** The Out's fiber, used to tell hide from unmount at effect
   * teardown and to prune tokens whose subtree left the tree. */
  fiber: Fiber | undefined;
  /** Suspense/Activity-hidden: effects torn down but DOM and state
   * preserved. A hidden token keeps its election claim. */
  hidden: boolean;
  /** Dev: already counted in a multiple-Outs warning. */
  warned: boolean;
}

export interface FiberTunnelOptions {
  /** Dev-only warning logged when several Outs are mounted at the same
   * time, once per offending Out. */
  multipleOutsWarning?: string;
}

export interface FiberTunnelInProps {
  /** Content to render at the tunnel's Out. */
  children: ReactNode;
}

export interface FiberTunnel {
  In: (props: FiberTunnelInProps) => null;
  /**
   * Renders the tunneled content. Several Outs may be mounted, but only
   * one is active at a time — the most recently mounted — and
   * unmounting it hands back to the previous one (dev warns). At most
   * one Out actively renders content: duplicate copies would expose
   * the tree twice and null user refs into the surviving copy when the
   * stale copy unmounts.
   *
   * A Suspense/Activity-hidden active Out keeps its claim: React
   * preserves its rendered copy (display:none, hidden from users and
   * assistive tech), so the tunnel renders nothing visible until the
   * Out is revealed or unmounted.
   *
   * Content appears in a follow-up render after the Out's mount commit:
   * layout effects in the commit that mounts the Out must not measure
   * or focus tunnel DOM.
   */
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
 * components at a single active `Out`, ordered by React tree position.
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
export function fiberTunnel(options: FiberTunnelOptions = {}): FiberTunnel {
  const {
    multipleOutsWarning = "Multiple tunnel Outs are mounted for the same tunnel; " +
      "only the most recently mounted one renders content",
  } = options;
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

  // Out election state. Live Outs — registered or hidden — stay here;
  // the highest seq wins. A hidden winner keeps its claim, so the
  // tunnel renders nothing until it is revealed or leaves the tree.
  const outs = new Set<OutToken>();
  let nextOutSeq = 0;

  function electedOut(): OutToken | null {
    let elected: OutToken | null = null;
    for (const out of outs) {
      if (elected === null || out.seq > elected.seq) {
        elected = out;
      }
    }
    return elected;
  }

  /** A hidden Out deleted along with its boundary never tears down
   * again (its effects were already disconnected at hide), so a hidden
   * token's claim is honored only while its fiber is still in the
   * tree. Checked only when such a token would win — the walk is
   * O(tree) — and at store-event time, never during a render. */
  function pruneDeadWinners() {
    for (;;) {
      const elected = electedOut();
      if (elected === null || !elected.hidden) return;
      if (elected.fiber !== undefined && isFiberLive(elected.fiber)) return;
      outs.delete(elected);
    }
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
  }

  function getItems() {
    return (snapshot ??= [...itemsById.values()]);
  }

  // Election changes notify without invalidating the items snapshot:
  // the items are unchanged, so Outs whose elected status didn't flip
  // skip re-rendering (and re-sorting) entirely.
  function notify() {
    pruneDeadWinners();
    for (const listener of listeners) listener();
  }

  function emit() {
    snapshot = null;
    notify();
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
    const fiber = useFiberSafe();
    // Created at first registration; survives effect replays (Suspense/
    // Activity hide and reveal, StrictMode), so a revived Out resumes
    // its election position. A ref, not state: the store owns it.
    const tokenRef = useRef<OutToken | null>(null);
    // Strict election: render nothing until elected, never on the mount
    // render. Electing only registered Outs keeps two Outs mounting in
    // one commit from both rendering content before either registers.
    // Server snapshot is false: server HTML is identical (Ins register
    // via effects, so items are empty server-side) and hydration renders
    // can't read live items registered by an earlier-hydrated In.
    const active = useSyncExternalStore(
      subscribe,
      () => tokenRef.current !== null && electedOut() === tokenRef.current,
      () => false,
    );
    const current = useSyncExternalStore(subscribe, getItems, getItems);

    useIsomorphicLayoutEffect(() => {
      const token = (tokenRef.current ??= {
        seq: nextOutSeq++,
        fiber: undefined,
        hidden: false,
        warned: false,
      });
      token.fiber = fiber;
      token.hidden = false;
      outs.add(token);
      // Warn once per token: StrictMode replays and hide/reveal cycles
      // don't re-log; a new Out joining a multi-Out state does.
      if (isDevEnv && outs.size > 1 && !token.warned) {
        console.warn(multipleOutsWarning);
        for (const out of outs) out.warned = true;
      }
      notify();
      return () => {
        // Teardown alone can't tell hide from unmount, so inspect the
        // fiber: a hidden Out keeps its claim (rendering null on reveal
        // would destroy the DOM React preserved). Without a
        // FiberProvider the fiber is unknown; teardown counts as
        // unmount.
        if (token.fiber !== undefined && isFiberHidden(token.fiber)) {
          token.hidden = true;
        } else {
          outs.delete(token);
        }
        notify();
      };
    }, [fiber]);

    if (!active) return null;
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
