# A11yTree

Accessibility for any React component.

Build a parallel DOM accessibility tree for UIs that render outside the DOM — WebGL canvases, react-three-fiber scenes, Pixi stages, game UIs.
Components declare their accessible markup where they live in the scene graph, and it is tunneled into a screen-reader-friendly DOM tree that mirrors the scene structure.

[Docs](https://astralarium.github.io/a11y-tree/)
| [Github](https://github.com/astralarium/a11y-tree)
| [NPM](https://www.npmjs.com/package/@astralarium/a11y-tree)

## Installation

```bash
npm i @astralarium/a11y-tree its-fine tunnel-rat
```

## Usage

- [`<A11yTreeProvider>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeProvider.html): Root provider. Wrap your canvas (and the renderer) in it.

- [`<A11yTreeRenderer>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeRenderer.html): Renders the accessibility tree into the DOM. Place it in the canvas fallback or next to the canvas, visually hidden.

- [`<A11yTreeElement>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeElement.html): Tunnels accessible markup from a scene component into the tree.

- [`<A11yTreeContainer>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeContainer.html): Wraps a subtree, so nested elements land inside its rendered wrapper. Containers nest.

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

When items move between visual containers (a card from hand to board), remounting would drop focus and screen-reader position.
[`<A11yTreeMultiplexer>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeMultiplexer.html) routes stable items into slots without remounting them:

- [`<A11yTreeSlot>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeSlot.html): Defines a slot in the tree structure. Only renders while an item occupies it.

- [`<A11yTreeSlotGroup>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeSlotGroup.html): Groups slots under a shared wrapper, ordered by their position in the React tree.

```tsx
<A11yTreeMultiplexer
  items={cards.map((card) => ({
    key: card.id,
    slotId: card.zone, // "hand" | "board"
    render: (
      <A11yTreeElement>
        <div role="option">{card.name}</div>
      </A11yTreeElement>
    ),
  }))}
>
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
</A11yTreeMultiplexer>
```

Items keep their React identity (by `key`) when `slotId` changes, so focus and component state survive zone changes.

### Notes

- `A11yTreeRenderer` defaults to `className="sr-only"` — provide a visually-hidden utility class (Tailwind ships one) or pass your own.
- Context from the scene tree is bridged into tunneled markup via [its-fine](https://github.com/pmndrs/its-fine), so providers above an `A11yTreeElement` are visible to its children.

[See examples on the documentation website](https://astralarium.github.io/a11y-tree)

## Development

```bash
pnpm install
pnpm dev
```

This project uses React Compiler.
