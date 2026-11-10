import {
  type ContextBridgeValue,
  createContextBridgeShape,
  type FiberTunnel,
} from "fiber-tunnel";
import type { ReactNode } from "react";

import type {
  A11yTreeMirrorList,
  A11yTreeMirrorListElement,
  A11yTreeMirrorRenderNode,
} from "./a11y-tree-mirror";
import { createA11yTunnel } from "./create-a11y-tunnel";
import { isDevEnv } from "./env";
import { placeNodes } from "./place-nodes";
import type { A11yTunnelContextValue } from "./use-a11y-tunnel";

declare const outletBrand: unique symbol;

/** A list's place in tree order, from `useA11yTreeOutlet`. */
export interface A11yTreeOutletHandle {
  readonly [outletBrand]: true;
}

/** What an outlet renders. */
export interface OutletContent {
  render: A11yTreeMirrorList<unknown>["render"];
  /** The list's element component. */
  List: A11yTreeMirrorListElement;
}

/** How node elements are made. */
export interface NodeElementOptions {
  nodeElement: keyof HTMLElementTagNameMap | undefined;
  nodeAttributes: Readonly<Record<string, string>>;
}

/** An outlet's content and subscribers. */
class Outlet {
  content: OutletContent | null = null;
  private listeners = new Set<() => void>();

  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    return () => void this.listeners.delete(onChange);
  };

  getContent = () => this.content;

  set(content: OutletContent | null) {
    if (this.content === content) return;
    this.content = content;
    for (const onChange of this.listeners) onChange();
  }
}

export function createOutlet() {
  return new Outlet() as unknown as A11yTreeOutletHandle;
}

export function outletOf(handle: A11yTreeOutletHandle) {
  return handle as unknown as Outlet;
}

/** A mounted list element. */
export interface ListHostRecord {
  readonly element: HTMLElement;
  /** The providers above the list element. */
  readonly bridge: ContextBridgeValue;
}

/** A node's props and where it renders. */
export interface NodeRecord<P> {
  readonly props: P;
  /** Null until its list first mounts. */
  readonly list: ListHostRecord | null;
  /** The id of the list `list` belongs to. */
  readonly listId: string | null;
  /** The node's element; portal target, set with `list`. */
  readonly host: HTMLElement | null;
  /** Renders the node's `A11yTreeMirrorIn` content at its Out. */
  readonly tunnel: NodeTunnel;
}

/** What the node pool renders. */
export interface PoolSnapshot<P> {
  /** Fixed per key: keys append on entry. */
  readonly keys: readonly string[];
  readonly nodes: ReadonlyMap<string, NodeRecord<P>>;
  readonly renderNode: A11yTreeMirrorRenderNode<P>;
}

/** A node's tunnel; content from `A11yTreeMirrorIn` renders at its Out. */
export interface NodeTunnel {
  readonly tunnel: FiberTunnel;
  readonly value: A11yTunnelContextValue;
  /** Mounted `A11yTreeMirrorIn`s. */
  holders: number;
}

export const identity = (content: ReactNode) => content;

/** Makes list `id`'s element component. */
type ListElementFactory<P> = (
  store: MirrorStore<P>,
  id: string,
) => A11yTreeMirrorListElement;

const emptyPoolValue: PoolSnapshot<unknown> = {
  keys: [],
  nodes: new Map(),
  renderNode: identity,
};

/** The pool before the first publish, and on the server. */
export function emptyPool<P>() {
  return emptyPoolValue as PoolSnapshot<P>;
}

function shallowEqual(a: unknown, b: unknown) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) {
    return false;
  }
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      Object.is(a[key as keyof typeof a], b[key as keyof typeof b]),
  );
}

/** Default list and node elements add no box. */
export const hostStyle = { display: "contents" } as const;

/** Lists, list hosts, node hosts and node tunnels of one mirror. */
export class MirrorStore<P> {
  private lists: readonly A11yTreeMirrorList<P>[] = [];
  private renderNode: A11yTreeMirrorRenderNode<P> = identity;
  private elementOptions: NodeElementOptions = {
    nodeElement: undefined,
    nodeAttributes: {},
  };
  private snapshot = emptyPool<P>();
  private listeners = new Set<() => void>();
  /** Mounted list elements by list id. */
  private attached = new Map<string, ListHostRecord>();
  /** Last element per list id: one shown again keeps its record. */
  private known = new Map<string, ListHostRecord>();
  private outlets = new Map<Outlet, OutletContent>();
  private contents = new Map<string, OutletContent>();
  /** Node elements by key; portal targets. */
  private hosts = new Map<string, HTMLElement>();
  private tunnels = new Map<string, NodeTunnel>();
  private warned = new Set<string>();
  /** Every list's contexts: a node keeps its mount across lists. */
  readonly shape = createContextBridgeShape();
  private listElement: ListElementFactory<P>;

  constructor(listElement: ListElementFactory<P>) {
    this.listElement = listElement;
  }

  subscribe = (onChange: () => void) => {
    this.listeners.add(onChange);
    return () => void this.listeners.delete(onChange);
  };

  getSnapshot = () => this.snapshot;

  /** Takes new lists: outlets render their wrappers, nodes follow. */
  publish(
    lists: readonly A11yTreeMirrorList<P>[],
    renderNode: A11yTreeMirrorRenderNode<P>,
    elementOptions: NodeElementOptions,
  ) {
    const byId = new Map<string, A11yTreeMirrorList<P>>();
    for (const list of lists) {
      if (byId.has(list.id)) {
        this.warnOnce(
          `id ${list.id}`,
          `lists share id "${list.id}"; the last one renders.`,
        );
      }
      byId.set(list.id, list);
    }
    this.lists = [...byId.values()];
    this.renderNode = renderNode;
    this.elementOptions = elementOptions;
    const outlets = new Map<Outlet, OutletContent>();
    const contents = new Map<string, OutletContent>();
    const outletIds = new Map<Outlet, string>();
    for (const list of this.lists) {
      const outlet = outletOf(list.outlet);
      const shared = outletIds.get(outlet);
      if (shared !== undefined) {
        this.warnOnce(
          `outlet ${list.id}`,
          `lists "${shared}" and "${list.id}" share an outlet; ` +
            `"${list.id}" renders.`,
        );
      }
      outletIds.set(outlet, list.id);
      const { render } = list;
      const old = this.contents.get(list.id);
      const content =
        old && old.render === render
          ? old
          : { render, List: old?.List ?? this.listElement(this, list.id) };
      contents.set(list.id, content);
      outlets.set(outlet, content);
    }
    for (const [outlet, content] of this.outlets) {
      if (!outlets.has(outlet) && outlet.content === content) outlet.set(null);
    }
    for (const [outlet, content] of outlets) outlet.set(content);
    this.outlets = outlets;
    this.contents = contents;
    this.update();
  }

  /** Empties every outlet; the next publish refills them. */
  clear() {
    for (const [outlet, content] of this.outlets) {
      if (outlet.content === content) outlet.set(null);
    }
    this.outlets = new Map();
  }

  /** Registers list `id`'s element. Returns unregister. */
  attach(id: string, element: HTMLElement, bridge: ContextBridgeValue) {
    const known = this.known.get(id);
    const record =
      known?.element === element && known.bridge === bridge
        ? known
        : { element, bridge };
    this.known.set(id, record);
    this.attached.set(id, record);
    this.update();
    return () => {
      if (this.attached.get(id) === record) this.attached.delete(id);
    };
  }

  /** List `id`'s mounted element. */
  elementOf(id: string) {
    return this.attached.get(id)?.element ?? null;
  }

  /** Node `key`'s tunnel, created on first use. */
  tunnelOf(key: string) {
    let entry = this.tunnels.get(key);
    if (!entry) {
      const tunnel = createA11yTunnel();
      entry = { tunnel, value: { tunnel }, holders: 0 };
      this.tunnels.set(key, entry);
    }
    return entry;
  }

  /** Makes `entry` node `key`'s tunnel while held. Returns release. */
  hold(key: string, entry: NodeTunnel) {
    entry.holders++;
    const current = this.tunnels.get(key);
    if (current !== entry) {
      this.tunnels.set(key, entry);
      if (current) this.update();
    }
    return () => {
      entry.holders--;
      this.drop(key);
    };
  }

  /** The element list `id`'s nodes render in: its mounted element, else
   * its last one while hidden in place. */
  private targetOf(id: string) {
    const known = this.known.get(id);
    return (
      this.attached.get(id) ??
      (known?.element.isConnected ? known : undefined) ??
      null
    );
  }

  /** Drops elements of removed nodes and of departed, unmounted lists;
   * orders each list's node elements. */
  private place(placements: ReadonlyMap<ListHostRecord, HTMLElement[]>) {
    const { nodes } = this.snapshot;
    for (const [key, host] of this.hosts) {
      if (nodes.has(key)) continue;
      host.remove();
      this.hosts.delete(key);
    }
    const ids = new Set(this.lists.map((list) => list.id));
    for (const [id, record] of this.known) {
      if (!ids.has(id) && !record.element.isConnected) this.known.delete(id);
    }
    for (const [list, hosts] of placements) placeNodes(list.element, hosts);
  }

  /** Recomputes node records and places their hosts; notifies on
   * change. A node whose list has no element stays in the element of
   * its last list. */
  private update() {
    const previous = this.snapshot;
    const nodes = new Map<string, NodeRecord<P>>();
    const owners = new Map<string, string>();
    /** Node elements by list element, in order; nodes waiting in another
     * list's element join it when they are elsewhere. */
    const placements = new Map<ListHostRecord, HTMLElement[]>();
    const placed = (list: ListHostRecord) => {
      let hosts = placements.get(list);
      if (!hosts) placements.set(list, (hosts = []));
      return hosts;
    };
    for (const { id, nodes: entries } of this.lists) {
      const target = this.targetOf(id);
      if (target) placed(target);
      for (const { key, props } of entries) {
        const owner = owners.get(key);
        if (owner !== undefined) {
          this.warnDuplicate(key, owner, id);
          continue;
        }
        owners.set(key, id);
        const old = previous.nodes.get(key);
        const listId = target ? id : (old?.listId ?? null);
        const list =
          target ??
          (listId === null ? null : (this.targetOf(listId) ?? old!.list));
        const host = list && this.hostFor(key, list);
        if (host && (list === target || host.parentNode !== list.element)) {
          placed(list).push(host);
        }
        const tunnel = this.tunnelOf(key);
        const sameProps = old !== undefined && shallowEqual(old.props, props);
        nodes.set(
          key,
          sameProps &&
            old.list === list &&
            old.listId === listId &&
            old.host === host &&
            old.tunnel === tunnel
            ? old
            : {
                props: sameProps ? old.props : props,
                list,
                listId,
                host,
                tunnel,
              },
        );
      }
    }
    const keys = previous.keys.filter((key) => nodes.has(key));
    const kept = keys.length;
    for (const key of nodes.keys()) {
      if (!previous.nodes.has(key)) keys.push(key);
    }
    const changed =
      this.renderNode !== previous.renderNode ||
      kept !== previous.keys.length ||
      keys.length !== kept ||
      keys.some((key) => nodes.get(key) !== previous.nodes.get(key));
    if (changed) this.snapshot = { keys, nodes, renderNode: this.renderNode };
    this.place(placements);
    if (!changed) return;
    for (const key of previous.keys) {
      if (!nodes.has(key)) this.drop(key);
    }
    for (const onChange of this.listeners) onChange();
  }

  /** Drops node `key`'s tunnel once no list or `A11yTreeMirrorIn` holds
   * it; a StrictMode replay's `hold` restores it. */
  private drop(key: string) {
    const entry = this.tunnels.get(key);
    if (entry?.holders === 0 && !this.snapshot.nodes.has(key)) {
      this.tunnels.delete(key);
    }
  }

  /** Node `key`'s element, created once per stay in the lists. */
  private hostFor(key: string, list: ListHostRecord) {
    let host = this.hosts.get(key);
    if (!host) {
      const { nodeElement, nodeAttributes } = this.elementOptions;
      host = list.element.ownerDocument.createElement(nodeElement ?? "div");
      if (!nodeElement) Object.assign(host.style, hostStyle);
      for (const [name, value] of Object.entries(nodeAttributes)) {
        host.setAttribute(name, value);
      }
      this.hosts.set(key, host);
    }
    return host;
  }

  private warnDuplicate(key: string, first: string, second: string) {
    this.warnOnce(
      `node ${key}`,
      first === second
        ? `node "${key}" repeats in list "${first}"; the first stays.`
        : `node "${key}" is in lists "${first}" and "${second}"; ` +
            `it stays in "${first}".`,
    );
  }

  /** Dev: warns once per `tag`. */
  private warnOnce(tag: string, message: string) {
    if (!isDevEnv || this.warned.has(tag)) return;
    this.warned.add(tag);
    console.warn(`A11yTreeMirror: ${message}`);
  }
}
