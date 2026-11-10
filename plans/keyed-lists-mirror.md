# Plan: keyed-lists mirror (0.7)

## Why

The tableau hand-builds its a11y structure on `A11yTreeMultiplexer`:
one-slot `A11yTreeSlotGroup`s for standalone lists, grouped slots,
`InTunnel`, `empty-` placeholder items, and list order from
`sortByFiberOrder` over registrations carrying `fiber`. That order goes
stale when mounted owners reorder. A node's a11y DOM remounts on every
slot change: its tunnel `In` changes type, so focus and state reset.

The mirror takes ordered lists of keyed nodes and renders each list at
an outlet its owner mounts. Nodes keep their fiber, DOM node and focus
across lists.

## API

```tsx
// Owner: a place in tree order.
const outlet = useA11yTreeOutlet();
<A11yTreeOutlet outlet={outlet} />

// Central: lists and nodes.
<A11yTreeMirror
  lists={[{ id, outlet, nodes: [{ key, props }], render: (List) => <List as="ul" /> }]}
  renderNode={(content, props) => <Item {...props}>{content}</Item>}
  nodeElement="li"
  nodeAttributes={{ role: "none" }}
>
  {items.map((item) => (
    <A11yTreeMirrorIn key={item.key} nodeKey={item.key}>
      <Visual item={item} />
    </A11yTreeMirrorIn>
  ))}
</A11yTreeMirror>
```

- `useA11yTreeOutlet(): A11yTreeOutletHandle`: stable handle.
- `A11yTreeOutlet`: renders its handle's list into the ambient tunnel, at
  its own tree position. One per handle.
- `A11yTreeMirrorList<P>`: `id`, `outlet`, `nodes` (in order),
  `render` (renders the list around its `List` element; default: a
  `display: contents` div).
- `A11yTreeMirrorListElement`: `List`; takes `as` (tag), `ref` and
  element props; renders once, with no React children (passed children
  drop).
- `A11yTreeMirrorNode<P>`: `key` (unique across the mirror), `props`.
- `A11yTreeMirror<P>`: `lists`, `renderNode` (default: content),
  `nodeElement` (tag; default: a `display: contents` div),
  `nodeAttributes` (fixed), `children`.
- `A11yTreeMirrorIn`: routes its children's a11y content into node
  `nodeKey`; sits below the mirror.
- Groups: `A11yTreeContainer` at the group owner, with list outlets below
  it. A standalone list puts its group wrapper in `render`.

## Decisions

- **Replaces the Multiplexer.** `A11yTreeMultiplexer`, `A11yTreeSlotGroup`,
  `A11yTreeSlot`, `A11yTreeSlotIn` and their types are deleted; the
  tableau is the sole consumer and moves in its phase 9.
- **Outlets host lists.** The mirror publishes each list's `id` and
  `render` into its handle in a layout effect; `A11yTreeOutlet`
  subscribes and renders `<ambient.In>{render(List)}</ambient.In>`.
  A list's presence, visibility and position follow its owner;
  fiber-tunnel's commit hook picks up owner moves with no `lists` change.
  List content reads context at the owner.
- **Order at a borrowed fiber is rejected:** an `In` ordered at an owner
  marker would still need the marker, and its mount, hide and transition
  state would diverge from the owner's.
- **Groups are structural.** Outlets below an `A11yTreeContainer` render
  in its wrapper, in owner order; containers order the same way. The
  mirror has no group API; the tableau drops group registration.
- **An empty list renders its wrapper.** Node changes leave list content
  untouched; an outlet re-renders when its list's `render` changes.
- **Node pool:** the mirror renders every node in one flat keyed pool,
  tunneled into the ambient tunnel (react-dom, under the renderer). Pool
  order is fixed per key; moves never move pool fibers.
- **List and node elements:** the list's `List` element is its own
  element (e.g. `ul`), so markup stays valid. Each node portals into its
  node element (`nodeElement`, fixed `nodeAttributes`), created once per
  key; one tag per mirror, since nodes move between lists. Item
  semantics render inside it (`li[role=none] > [role=option]`). React
  owns the list element's props and each node's content; the mirror
  owns only node elements and where they sit, in `place-nodes.ts`.
- **Per-node attributes on node elements are rejected:** they would
  bypass React, and React handlers never fire for events targeting a
  portal container.
- **Placement:** fewest moves (longest increasing subsequence), keeping
  a focused node still within its list. Cross-list moves use `moveBefore`
  where present (Chromium 133+): focus stays, no events. Elsewhere,
  `insertBefore`, then the mirror refocuses the node in the same task
  with `preventScroll`.
- **Placement timing:** the layout effect that changes lists or list
  hosts places nodes; node hosts exist before their nodes render. A node
  moved to a hidden list (host still in the document) hides with it; a
  node whose target list is unmounted keeps its last list, following
  that list's current element, until the target mounts; a new node
  renders once its list mounts. A list whose element is replaced (owner
  remount, `as` change, new outlet) keeps its nodes' state and DOM
  nodes; focus inside it drops, since React removes the old element
  before placement runs.
- **Context:** nodes read context as children of their list's element.
  `List` captures every provider above it into the mirror's
  `ContextBridgeShape`; each node renders its list's capture through a
  `ContextBridge` sharing that shape, so a move between lists swaps
  values in place, whatever their contexts or StrictMode. A context the
  list lacks reads at the mirror. A list mounting with a context, or
  StrictMode, new to the mirror remounts the mounted nodes once, and
  dev warns.
- **Events:** native events bubble through the list's DOM (navigable's
  hotkeys, `contains`, MutationObserver work); React events bubble
  through the pool, past lists. Node handlers go in `renderNode`;
  list handlers are native listeners.
- **Node tunnel:** one per key, carried in the node record; its Out
  sits inside the node. A mounted `A11yTreeMirrorIn` makes its tunnel
  the key's; the tunnel drops once no list or `A11yTreeMirrorIn` holds
  it.
- **Suspense:** each node has its own boundary; a suspending node hides
  only itself.
- **Data flow:** the mirror publishes `lists` to its store in a layout
  effect; the pool subscribes. A node re-renders on shallow `props`
  change, `renderNode` identity change, or list change.
- **Cost at 96 nodes / 8 lists:** a cross-list move renders the moved
  node's bridge slots and their context readers; `renderNode` output
  memoizes on props. A reorder renders no node. react-dom attaches its listeners to
  each node host once, at the node's mount.
- **Dev warnings:** a key in two lists, or twice in one, warns once; the
  first place keeps it. Lists sharing an id or an outlet warn once; the
  last renders. Moves, outlet changes and owner unmounts stay quiet.
- **Peer:** `fiber-tunnel ^0.6.1`.

## fiber-tunnel 0.6.1 (gate)

Lands and releases first, from `astralarium/fiber-tunnel`.

- `ContextCapture`: captures every provider above it; a `shape` collects
  the captured contexts. `local` is gone.
- `ContextBridge`: any root. With a `shape`, it provides every context
  of the shape in one order, and StrictMode once any capture brought
  it, so swaps between captures keep children mounted; a context the
  capture lacks reads at the bridge.
- Outs in one root share one run of the reconciler checks.

## Files

- `src/a11y-tree-outlet.tsx`: `A11yTreeOutlet`.
- `src/use-a11y-tree-outlet.ts`: `useA11yTreeOutlet`.
- `src/a11y-tree-mirror.tsx`: `A11yTreeMirror`, `A11yTreeMirrorIn`,
  pool, `List` element, node view.
- `src/mirror-store.ts`: outlet handles, lists, list hosts and captures,
  node hosts and tunnels, subscriptions.
- `src/place-nodes.ts`: placement.
- `src/a11y-tree-multiplexer.tsx`: deleted. `src/index.ts` updated.

## Sequencing

1. fiber-tunnel 0.6: `ContextCapture`, shaped `ContextBridge`, shared
   Out checks; released.
2. Outlets and list content: wrappers render at owners, in owner order.
3. Store, pool, node hosts, placement, `A11yTreeMirrorIn`.
4. Node context through `ContextCapture` / `ContextBridge`.
5. Delete the Multiplexer and slot API; move surviving tests.
6. StrictMode, nested root, SSR, warning and render-count tests.
7. README, typedoc comments, example route.

## Tests

`src/a11y-tree-mirror.test.tsx`, `src/place-nodes.test.ts`,
`src/a11y-tree.ssr.test.tsx`.

- the mirror renders each list's wrapper at its outlet
- the mirror renders an empty list's wrapper
- a list's nodes render as children of its element, in their node
  elements
- a list element composes with a render prop's ref and children, and
  receives node events natively
- by default, lists and nodes render in display: contents divs
- the mirror renders a list's nodes in order
- a node keeps its state and DOM node when it moves to another list
- `A11yTreeMirrorIn` content renders inside its node
- a node keeps its state, DOM node and focus when it reorders in its list
- with moveBefore, a cross-list move keeps focus with no refocus
- without `moveBefore`, a node regains focus in the same task after a
  cross-list move
- a node reads the contexts above its current list
- a node reads the providers at its list's outlet
- a move between same-shaped lists keeps the node mounted
- a move between lists with different contexts keeps the node mounted
- a list mounting with a context new to the mirror remounts mounted
  nodes once, and dev warns
- a move between a StrictMode list and a loose list keeps the node
  mounted
- lists follow their owners' tree order, whatever their `lists` order
- lists reorder when mounted owners reorder
- a list leaves and hides with its owner
- lists below a container render in its wrapper; containers follow
  owner order
- a node leaves the DOM when its key leaves every list
- a node waits for its list's outlet, then renders there; mounted nodes
  stay mounted
- a node moved to a list with no mounted outlet stays in its last list
  until the outlet mounts
- a node moved to a hidden list hides with it
- a list leaves its outlet when it leaves lists
- a node waiting for its list follows its last list's new element
- a list element's ref follows its element across an `as` change
- a list leaves its outlet when its mirror unmounts
- a key leaving and rejoining its list renders its `A11yTreeMirrorIn`
  content again
- a suspending node leaves the other nodes rendered
- an unmoved node renders once across another node's move
- a cross-list move renders no node content
- a reorder renders no node
- a node move renders no list
- a list hidden and shown renders no node
- a props change renders only that node
- a list's render change renders its wrapper and no node
- a cross-list move at 96 nodes and 8 lists renders no node content
- lists and nodes from owners in a nested React root follow its anchor
- a hidden mirror hides its lists and keeps their nodes
- `A11yTreeMirrorIn` content hidden while its key enters a list renders
  in the node once shown
- moves, reorders and removals keep identity under StrictMode
- nodes return to their lists after the renderer's error boundary resets
- moves, outlet changes and owner unmounts log no warnings or errors
- a key in two lists warns once in dev
- a key repeated in one list warns once in dev and renders once
- of lists sharing an id, the last renders, and dev warns once
- of lists sharing an outlet, the last renders, and dev warns once
- the server renders a mirror scene with an empty tree and no errors
- placement moves the fewest nodes
- placement keeps the focused node still
- placement moves a host in from another parent and refocuses it
- placement moves no child outside the hosts

## Docs

- README: "Keyed lists" replaces "Multiplexing", minimal: outlet,
  mirror, `A11yTreeMirrorIn`, one example, and the contract code can't
  state (outlet order and visibility, React event bubbling, stable
  renders). Groups, context, focus and item roles live in the doc
  comments.
- Example `/example/lists`: cards in two r3f lists; keys move the focused
  card within and across lists, focus stays.

## Open items

- Release (user): 0.7.0.
- Tableau phase 9: item-local `NavigableItem` inputs (`underScrim`, focus
  scroll) move to per-entity lookups; re-measure `tableau_stress`.
- Navigable (stays usable in plain DOM UIs; changes are generic DOM
  behavior):
  - An item registering while it is `document.activeElement` takes the
    highlight and makes its list active. With `moveBefore` a moved item
    fires no focus event; without it, the refocus fires during
    placement, before the item re-registers with its new list.
  - `NavigableRegion` reclaims focus from a native `focusout` listener:
    React `onBlur` misses node blurs when the region sits between the
    mirror and a list.
- Navigable composes with `List` through its `render` prop:
  `<NavigableList render={<List as="ul" />}>`.
- Where `moveBefore` is absent (jsdom included), a cross-list move fires
  blur then focus on the node.
- R3F roots are covered by the example; pixi by the tableau. jsdom tests
  use a nested react-dom root.
