# Plan: bridged tunnels

## Why

Each `A11yTreeContainer`, `A11yTreeSlotGroup`, and `A11yTreeSlot` wraps
its In content in its-fine's `useContextBridge`: a full provider chain
per component. Any context change above re-renders every bridge.
fiber-tunnel bridged tunnels share one provider instance per source
and re-render only consumers.

## Scope

- Peer and dev dependency `fiber-tunnel` → `^0.3.0` (adds
  `isolate: true`).
- Every tunnel comes from `createA11yTunnel()`
  (`src/create-a11y-tunnel.ts`, internal):
  `fiberTunnel({ isolate: true })` (bridged by default). Content
  errors rise to `A11yTreeRenderer`'s boundary; content suspensions show
  nothing at the Out, and scene transitions never wait for them. Sites:
  - `src/a11y-tree-context.tsx`: `rootTunnel`.
  - `src/a11y-tree-element.tsx`: `ownTunnel`.
  - `src/a11y-tree-multiplexer.tsx`: slot tunnels, `groupTunnel`.
- Drop `useContextBridge` and the `<ContextBridge>` wrapper (with its
  `react-hooks/static-components` disable) from `A11yTreeContainer`,
  `A11yTreeSlotGroup`, and `A11yTreeSlot`.
- Drop its-fine and `A11yTreeProvider`'s `FiberProvider`; it served only
  `useContextBridge`.
- README: content inside nested roots reads providers above its In;
  `FiberAnchor` guidance stays.

## Tests

Bridged content settles asynchronously: tests render and rerender
through async `act`.

- renders a11y content with context provided above its element
- re-renders only consumers when a bridged value changes
- keeps slot content state when a holder moves between slots
- keeps scene content visible while a11y content suspends

## Open items

- Release; eternal-engine bumps with pixi-three.
