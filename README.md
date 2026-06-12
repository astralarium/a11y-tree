# A11yTree

Accessibility for any React component.

Build a parallel DOM accessibility tree for UIs that render outside the DOM: WebGL canvases, react-three-fiber scenes, Pixi stages, game UIs.
Components declare accessible markup wherever they live in the scene graph; it tunnels into a screenreader-friendly DOM tree that mirrors the scene.

[Docs](https://astralarium.github.io/a11y-tree/)
| [Github](https://github.com/astralarium/a11y-tree)
| [NPM](https://www.npmjs.com/package/@astralarium/a11y-tree)

## Installation

```bash
npm i @astralarium/a11y-tree its-fine
```

Requires React 19.2 or later.

## Usage

- [`<A11yTreeProvider>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeProvider.html):
  Root provider. Wrap your canvas (and `<A11yTreeRenderer>`) in it.

- [`<A11yTreeRenderer>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeRenderer.html):
  Renders the accessibility tree into the DOM. Default class `"sr-only"` (ie. visually hidden in Tailwind).

- [`<A11yTreeElement>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeElement.html):
  Tunnels accessible DOM markup from a scene component into the tree.

- [`<A11yTreeContainer>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeContainer.html):
  Wraps a subtree, so nested a11y tree components land inside.

```tsx
<A11yTreeProvider>
  <Canvas fallback={<A11yTreeRenderer />}>
    <A11yTreeContainer
      render={(content) => (
        <div role="listbox" aria-label="Hand">
          {content}
        </div>
      )}
    >
      <Card3D>
        <A11yTreeElement>
          <div role="option">Ace of Spades</div>
        </A11yTreeElement>
      </Card3D>
    </A11yTreeContainer>
  </Canvas>
</A11yTreeProvider>
```

The a11y tree mirrors the scene hierarchy:

```html
<div role="listbox" aria-label="Hand">
  <div role="option">Ace of Spades</div>
</div>
```

### Multiplexing

Enables performance-sensitive scenes to use memoized item arrays to avoid re-renders.

- [`<A11yTreeMultiplexer>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeMultiplexer.html):
  Routes items into slots as data; memoized content moves without remounting or re-rendering:

- [`<A11yTreeSlot>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeSlot.html):
  Defines a slot in the tree structure. Only renders while an item is inside.

- [`<A11yTreeSlotGroup>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeSlotGroup.html):
  Groups slots under a shared wrapper, ordered by position in the React tree.

```tsx
const items = useMemo(
  () =>
    cards.map((card) => ({
      key: card.id,
      slotId: card.zone, // "hand" | "board"
      render: (
        <A11yTreeElement>
          <div role="option">{card.name}</div>
        </A11yTreeElement>
      ),
    })),
  [cards],
);

<A11yTreeMultiplexer items={items}>
  <A11yTreeSlotGroup
    render={(content) => (
      <div role="region" aria-label="Battlefield">
        {content}
      </div>
    )}
  >
    <A11yTreeSlot
      id="hand"
      render={(content) => (
        <div role="listbox" aria-label="Hand">
          {content}
        </div>
      )}
    />
    <A11yTreeSlot
      id="board"
      render={(content) => (
        <div role="listbox" aria-label="Board">
          {content}
        </div>
      )}
    />
  </A11yTreeSlotGroup>
</A11yTreeMultiplexer>;
```

Items keep React identity (by `key`) when `slotId` changes, so focus and component state survive zone changes.
Memoized `render` elements do not re-render when they change order.

### Error handling

Errors thrown by tunneled content are caught in `A11yTreeRenderer`; the default UI is a dismissible dialog.
Replace it with the `fallback` prop, wrapped in
[`<A11yTreeFallbackRenderer portal>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeFallbackRenderer.html)
to portal it out of the visually hidden tree container:

```tsx
<A11yTreeRenderer
  fallback={({ error, reset }) => (
    <A11yTreeFallbackRenderer portal>
      <MyErrorToast message={error?.message} onDismiss={reset} />
    </A11yTreeFallbackRenderer>
  )}
/>
```

### Tunnels

The tunnel primitive powering the tree is exported for standalone use:

```tsx
import { fiberTunnel } from "@astralarium/a11y-tree";

const status = fiberTunnel();

// Anywhere in your app — even in a different React root:
<status.In>
  <span>Saving…</span>
</status.In>;

// Content from every In renders here:
<status.Out />;
```

Unlike [tunnel-rat](https://github.com/pmndrs/tunnel-rat), `Out` content is ordered by each `In`'s position in the React tree, not registration order.
Tree ordering requires a `FiberProvider` from [its-fine](https://github.com/pmndrs/its-fine) above the `In`s (`A11yTreeProvider` provides one).

Also unlike tunnel-rat, content is not mirrored: only one `Out` is active at a time — the most recently mounted — and the others render nothing (dev warns).
Unmounting the active `Out` hands back to the previous one.
Hiding the active `Out` (Suspense/Activity) keeps its claim: React preserves its rendered content, and the tunnel renders nothing else until it is revealed or unmounted.
To show content in different places at different times, keep a single `Out` mounted and move or restyle its container rather than mounting several `Out`s.

### Notes

- Tunneled elements are ordered by their position in the React tree, so the a11y tree structure follows scene order.
- Tunnel updates re-derive order by walking the React tree, and an `A11yTreeElement` updates whenever its parent re-renders.
  Keep elements out of components that re-render every frame, or route them through the multiplexer as memoized items.
- Context from the scene tree is bridged into tunneled markup via [its-fine](https://github.com/pmndrs/its-fine),
  so providers above an `A11yTreeElement` are visible to its children.

[See examples on the documentation website](https://astralarium.github.io/a11y-tree)

## Development

```bash
pnpm install
pnpm dev
```

This project uses React Compiler.
