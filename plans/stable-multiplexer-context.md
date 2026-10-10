# Plan: stable multiplexer context

`A11yTreeMultiplexerContext`'s value changes on every slot acquire and
release (`version`). Every context-bridging descendant re-renders,
including all visual content routed through the multiplexer.

In eternal-engine, one cross-tableau move re-renders all 384 pixi-three
texture bridges (its-fine `useContextBridge`) and redraws all 96 cards:
~230 ms, dev build. StrictMode effect replays do the same on reorders.

## Scope

- The context value holds only ref-reading functions, stable for the
  multiplexer's lifetime (React Compiler memoizes them). `version` is
  deleted.
- Slot presence is a subscription:
  - Per-slot listener sets, notified when `refCount` crosses 0 ↔ 1.
  - `A11yTreeSlot` reads its slot via `useSyncExternalStore`; snapshot
    = slot while `refCount > 0`, server snapshot = none.
- A slot and its tunnel survive `refCount` 0 until the multiplexer's
  passive sweep, for same-commit re-acquires (StrictMode replay, swap).
- Each first holder (0 → 1) recaptures the slot's `parentTunnel`.
- `A11yTreeSlotIn` renders only from its own props and contexts.

## Tests

Probes bridge every ancestor context. The isolation suite runs plain
and under StrictMode.

- An unmoved item renders once across another item's move between
  slots.
- A moved item renders once per move (its `A11yTunnelContext` changes).
- A reorder within a slot renders no item.
- Multiplexer children outside slots render once across slot acquire
  and release.
- A slot's content renders once while another slot gains its first
  item.
- A slot remounted under a new container renders into it without a
  warning.
- Existing suites pass unchanged.

## Verification

Release a patch version. In eternal-engine, measure
`/debug/zoo/layout/tableau_stress` (eternal-engine
`docs/skills/tableau-perf`). Target: a cross-column move commits only
the moved card's textures; a StrictMode reorder redraws none.

## Related

pixi-three `plans/texture-redraw.md`: bridges that re-render on any
ancestor context change, and textures that redraw on every render.
