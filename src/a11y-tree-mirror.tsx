import {
  ContextBridge,
  type ContextBridgeShape,
  type ContextBridgeValue,
  ContextCapture,
} from "fiber-tunnel";
import {
  type ComponentType,
  createContext,
  createElement,
  type HTMLAttributes,
  memo,
  type ReactNode,
  type Ref,
  Suspense,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import {
  type A11yTreeOutletHandle,
  emptyPool,
  identity,
  MirrorStore,
  type NodeRecord,
} from "./mirror-store";
import { A11yTunnelContext, useA11yTunnel } from "./use-a11y-tunnel";

/** One node of a mirror list. */
export interface A11yTreeMirrorNode<P> {
  /** Unique across the mirror. The node keeps state, DOM and focus while
   * its key is in any list. */
  key: string;
  /** Passed to `renderNode`; shallow-equal props skip re-render. */
  props: P;
}

/** Props of a list's element. Its children are the list's nodes; passed
 * children are dropped. */
export interface A11yTreeMirrorListElementProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "dangerouslySetInnerHTML"
> {
  /** Tag. Default: `"div"`. */
  as?: keyof HTMLElementTagNameMap;
  ref?: Ref<HTMLElement>;
}

/** A list's element; render it once. */
export type A11yTreeMirrorListElement =
  ComponentType<A11yTreeMirrorListElementProps>;

/** One list of a mirror, rendered at its outlet. */
export interface A11yTreeMirrorList<P> {
  id: string;
  /** Where the list renders; from {@link useA11yTreeOutlet}. */
  outlet: A11yTreeOutletHandle;
  nodes: readonly A11yTreeMirrorNode<P>[];
  /** Renders the list around its element, e.g.
   * `(List) => <List as="ul" aria-label="Hand" />`. Default: a
   * `display: contents` div. */
  render?: (List: A11yTreeMirrorListElement) => ReactNode;
}

/** Renders one node: `content` holds its `A11yTreeMirrorIn` content. */
export type A11yTreeMirrorRenderNode<P> = (
  content: ReactNode,
  props: P,
) => ReactNode;

export interface A11yTreeMirrorProps<P> {
  lists: readonly A11yTreeMirrorList<P>[];
  /** Renders each node inside its element, e.g.
   * `(content, props) => <div role="option">{content}</div>`.
   * Default: content. */
  renderNode?: A11yTreeMirrorRenderNode<P>;
  /** Tag of each node's element, e.g. `"li"` in a `ul`. Default: a
   * `display: contents` div. Read once per node. */
  nodeElement?: keyof HTMLElementTagNameMap;
  /** Attributes of each node's element, e.g. `{ role: "none" }`. Read
   * once per node. */
  nodeAttributes?: Readonly<Record<string, string>>;
  /** Scene content; holds the `A11yTreeMirrorIn`s. */
  children?: ReactNode;
}

const MirrorContext = createContext<MirrorStore<unknown> | null>(null);

/**
 * Mirrors ordered lists of keyed nodes into the a11y tree.
 *
 * Each list renders at its `A11yTreeOutlet`. Nodes keep React state, DOM
 * and focus across reorders and moves between lists.
 *
 * Nodes read context at their list's element, then at the mirror. Native
 * events bubble through the list's DOM; React events bubble from the
 * mirror.
 *
 * @example
 * <A11yTreeMirror
 *   lists={[{
 *     id: "hand",
 *     outlet,
 *     nodes: [{ key: "ace", props: {} }],
 *     render: (List) => <List as="ul" aria-label="Hand" />,
 *   }]}
 *   nodeElement="li"
 * >
 *   <A11yTreeMirrorIn nodeKey="ace">
 *     <Card />
 *   </A11yTreeMirrorIn>
 * </A11yTreeMirror>
 */
export function A11yTreeMirror<P>({
  lists,
  renderNode = identity,
  nodeElement,
  nodeAttributes = noAttributes,
  children,
}: A11yTreeMirrorProps<P>) {
  const { tunnel } = useA11yTunnel();
  const [store] = useState(() => new MirrorStore<P>(listElement));
  useLayoutEffect(() => {
    store.publish(lists, renderNode, { nodeElement, nodeAttributes });
  }, [store, lists, renderNode, nodeElement, nodeAttributes]);
  useLayoutEffect(() => () => store.clear(), [store]);

  return (
    <MirrorContext value={store as MirrorStore<unknown>}>
      {children}
      <tunnel.In>
        <Pool store={store} />
      </tunnel.In>
    </MirrorContext>
  );
}

export interface A11yTreeMirrorInProps {
  /** The node that renders this content. */
  nodeKey: string;
  /** Scene content; its a11y content renders inside the node. */
  children: ReactNode;
}

/** Routes its children's a11y content into node `nodeKey` of the
 * enclosing `A11yTreeMirror`. */
export function A11yTreeMirrorIn({ nodeKey, children }: A11yTreeMirrorInProps) {
  const store = use(MirrorContext);
  if (!store) {
    throw new Error("A11yTreeMirrorIn must be used within A11yTreeMirror");
  }
  const entry = store.tunnelOf(nodeKey);
  useEffect(() => store.hold(nodeKey, entry), [store, nodeKey, entry]);
  return <A11yTunnelContext value={entry.value}>{children}</A11yTunnelContext>;
}

const noAttributes: Readonly<Record<string, string>> = {};

/** List `id`'s element component; captures its providers for the nodes. */
function listElement<P>(store: MirrorStore<P>, id: string) {
  return function List(props: A11yTreeMirrorListElementProps) {
    return (
      <ContextCapture shape={store.shape}>
        {(bridge) => (
          <ListElement store={store} id={id} bridge={bridge} {...props} />
        )}
      </ContextCapture>
    );
  };
}

/** The list's element; the store places node elements in it. */
function ListElement<P>({
  store,
  id,
  bridge,
  as = "div",
  ref,
  ...props
}: A11yTreeMirrorListElementProps & {
  store: MirrorStore<P>;
  id: string;
  bridge: ContextBridgeValue;
}) {
  delete (props as { children?: unknown }).children;
  const attach = useCallback(
    (element: HTMLElement) => store.attach(id, element, bridge),
    [store, id, bridge],
  );
  // Separate from `attach`: a new `ref` identity keeps the list attached.
  useLayoutEffect(
    () => assignRef(ref, store.elementOf(id)),
    [store, id, ref, as],
  );
  return createElement(as, { ...props, ref: attach });
}

/** Sets `ref` to `value`; returns its cleanup. */
function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === "function") {
    const cleanup = ref(value);
    return typeof cleanup === "function" ? cleanup : () => void ref(null);
  }
  if (!ref) return;
  ref.current = value;
  return () => {
    ref.current = null;
  };
}

/** Every node, in fixed key order; nodes portal into their hosts. */
function Pool<P>({ store }: { store: MirrorStore<P> }) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    emptyPool<P>,
  );
  return snapshot.keys.map((key) => (
    <NodeView
      key={key}
      shape={store.shape}
      node={snapshot.nodes.get(key)!}
      renderNode={snapshot.renderNode as NodeViewProps["renderNode"]}
    />
  ));
}

interface NodeViewProps {
  shape: ContextBridgeShape;
  node: NodeRecord<unknown>;
  renderNode: (content: ReactNode, props: unknown) => ReactNode;
}

/** One node, portaled into its host, in its own Suspense boundary. */
const NodeView = memo(function NodeView({
  shape,
  node,
  renderNode,
}: NodeViewProps) {
  if (!node.list || !node.host) return null;
  const { tunnel } = node.tunnel;
  return createPortal(
    <Suspense fallback={null}>
      <ContextBridge bridge={node.list.bridge} shape={shape}>
        {renderNode(<tunnel.Out />, node.props)}
      </ContextBridge>
    </Suspense>,
    node.host,
  );
});
