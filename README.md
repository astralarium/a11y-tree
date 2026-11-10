# A11yTree

Accessibility for any React component.

Build a parallel DOM accessibility tree for UIs that render outside the DOM: WebGL canvases, react-three-fiber scenes, Pixi stages, game UIs.
Components declare accessible markup wherever they live in the scene graph; it tunnels into a screenreader-friendly DOM tree that mirrors the scene.

[Docs](https://astralarium.github.io/a11y-tree/)
| [Github](https://github.com/astralarium/a11y-tree)
| [NPM](https://www.npmjs.com/package/a11y-tree)

## Installation

```bash
npm i a11y-tree fiber-tunnel
```

Requires React 19.2 or later.

## Usage

- [`<A11yTreeProvider>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeProvider.html):
  Root provider. Wrap your canvas (and `<A11yTreeRenderer>`) in it.

- [`<A11yTreeRenderer>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeRenderer.html):
  Renders the accessibility tree into the DOM, visually hidden by default.

- [`<FiberAnchor>`](https://astralarium.github.io/fiber-tunnel/docs/functions/FiberAnchor.html)
  (from [fiber-tunnel](https://github.com/astralarium/fiber-tunnel)):
  Wrap each nested React root that holds a11y content (an r3f `<Canvas>`, a second canvas).

- [`<A11yTreeElement>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeElement.html):
  Tunnels accessible DOM markup from a scene component into the tree.

- [`<A11yTreeContainer>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeContainer.html):
  Wraps a subtree, so nested a11y tree components land inside.

```tsx
<A11yTreeProvider>
  <FiberAnchor>
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
  </FiberAnchor>
</A11yTreeProvider>
```

The a11y tree mirrors the scene hierarchy:

```html
<div role="listbox" aria-label="Hand">
  <div role="option">Ace of Spades</div>
</div>
```

### Keyed lists

For lists whose items move: nodes keep their state, DOM node and focus across reorders and moves between lists.

- [`<A11yTreeMirror>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeMirror.html):
  Renders ordered lists of keyed nodes.

- [`<A11yTreeOutlet>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeOutlet.html):
  A list's place in the tree, from `useA11yTreeOutlet`.

- [`<A11yTreeMirrorIn>`](https://astralarium.github.io/a11y-tree/docs/functions/A11yTreeMirrorIn.html):
  Routes scene content into a node.

```tsx
const renderHand = (List) => <List as="ul" aria-label="Hand" />;

const hand = useA11yTreeOutlet();
const nodes = cards.map((card) => ({ key: card.id, props: card }));

<A11yTreeMirror
  lists={[{ id: "hand", outlet: hand, nodes, render: renderHand }]}
  nodeElement="li"
>
  <A11yTreeOutlet outlet={hand} />
  {cards.map((card) => (
    <A11yTreeMirrorIn key={card.id} nodeKey={card.id}>
      <Card3D card={card} />
    </A11yTreeMirrorIn>
  ))}
</A11yTreeMirror>;
```

- Lists follow their outlet's visibility and tree order.
- React events from a node bubble to the mirror, skipping its list: handle them in `renderNode`, or add native listeners to the list.
- Keep `render` and `renderNode` stable to avoid re-renders.

### Error handling

`A11yTreeRenderer` catches errors from tunneled content and shows a dismissible dialog;
its `fallback` prop replaces the dialog.

### Tunnels

The tree is built on [fiber-tunnel](https://github.com/astralarium/fiber-tunnel), which orders content by React tree position.

[See examples on the documentation website](https://astralarium.github.io/a11y-tree)

## Development

```bash
pnpm install
pnpm dev
```

This project uses React Compiler.
