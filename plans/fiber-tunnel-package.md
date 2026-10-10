# Plan: consume `fiber-tunnel`

`fiberTunnel` and its fiber helpers move to `fiber-tunnel`
(`../fiber-tunnel/plans/initial-package.md`). a11y-tree depends on that
package and deletes its copies.

## Scope

- Peer dependency on `fiber-tunnel` ^0.1.0, shared with pixi-three:
  anchors rely on one module-level context, so two installed copies
  disable them. External in the library build.
- Deleted here:
  - `src/fiber-tunnel.tsx`
  - `src/env.ts`, unless a11y-tree still uses `isDevEnv`; then it stays
  - the moved helpers in `src/util.ts`: `sortByFiberOrder`,
    `isFiberLive`, `isFiberHidden`, `useIsomorphicLayoutEffect`
  - the tests that moved
- `isFiberLive` and `isFiberHidden` are deleted with no replacement:
  the package dropped `Out` election, their only use.
- `useIsomorphicLayoutEffect` is deleted with no replacement: the
  multiplexer uses `useLayoutEffect`, which React 19 runs on the server
  without warning.
- Internal imports point at the package.
- One renderer per tree is the user's contract, matching the package's
  one-`Out` contract:
  - `A11yTreeRenderer` docs: mount one per tree; each extra renderer
    renders its own copy, and a copy's unmount sets refs into the tree
    to `null`. Existing content renders in the renderer's mount
    commit; content mounting alongside it appears one commit later.
    Drop the election and hidden-claim wording.
  - `fiberTunnel` takes no options: the root and slot tunnels drop
    their `multipleOutsWarning` messages and use the package's generic
    dev error. `A11yTreeSlotProps.id` docs: slots sharing an id each
    render a copy.
  - The `render` props of `A11yTreeContainer`, `A11yTreeSlotGroup` and
    `A11yTreeSlot` place `content` once; their docs say so.
  - Tests: delete "A11yTreeRenderer election" and "direct tunnel.Out
    instances elect a single active Out". Add one test that a second
    renderer logs the dev error.
- Docs: wrap each nested React root that holds a11y content (an r3f
  `<Canvas>`, a second canvas) in fiber-tunnel's `FiberAnchor`, so its
  content reads at the canvas's place. Unanchored roots have no defined
  order, and fiber-tunnel warns in dev. A canvas hidden by Activity keeps
  its a11y content unless its host bridges Activity (its-fine 2.1+
  `useActivityBridge`).
- The moved symbols leave a11y-tree's exports. Consumers import them from
  `fiber-tunnel`; `FiberTunnel` stays the type of
  `A11yTunnelContextValue.tunnel`.
- Release 0.3.0 (breaking: removed exports; every mounted renderer
  renders the tree).

## Sequencing

Starts after `fiber-tunnel` 0.1.0 is published.
README links to fiber-tunnel's API docs resolve once its docs site
deploys (`../fiber-tunnel/plans/docs-site.md`).
eternal-engine moves its `sortByFiberOrder` import to the new package
when it adopts a11y-tree 0.3. It is on a11y-tree 0.1.0, so its calls
also drop the root-fiber argument: `sortByFiberOrder(groups, fiber)`
becomes `sortByFiberOrder(groups)` (changed in 0.2).
