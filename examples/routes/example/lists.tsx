import {
  A11yTreeMirror,
  A11yTreeMirrorIn,
  type A11yTreeMirrorListElement,
  type A11yTreeMirrorRenderNode,
  A11yTreeOutlet,
  A11yTreeProvider,
  useA11yTreeOutlet,
} from "@astralarium/a11y-tree";
import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { FiberAnchor } from "fiber-tunnel";
import {
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useState,
} from "react";

import { FocusableCube } from "#components/focusable-cube";
import {
  TreePanel,
  TreeVisibilityToggle,
} from "#components/tree-visibility-toggle";

import { Frame } from "./-frame";

export const Route = createFileRoute("/example/lists")({
  component: Lists,
});

type Zone = "board" | "hand";

const zones: Zone[] = ["board", "hand"];

const zoneY: Record<Zone, number> = { board: 1.3, hand: -1.3 };

type Placement = Record<Zone, string[]>;

/** Moves `card` by `step` within its zone, or to `zone`'s end. */
function moveCard(
  placement: Placement,
  card: string,
  { step = 0, zone }: { step?: number; zone?: Zone },
): Placement {
  const from = zones.find((z) => placement[z].includes(card))!;
  const to = zone ?? from;
  const next = {
    ...placement,
    [from]: placement[from].filter((c) => c !== card),
  };
  const index =
    to === from
      ? Math.max(
          0,
          Math.min(next[to].length, placement[from].indexOf(card) + step),
        )
      : next[to].length;
  next[to] = [...next[to].slice(0, index), card, ...next[to].slice(index)];
  return next;
}

/** Stable list renders: an outlet re-renders when its render changes. */
const zoneLists = Object.fromEntries(
  zones.map((zone) => [
    zone,
    (List: A11yTreeMirrorListElement) => (
      <section aria-label={zone} className="flex flex-col gap-2">
        <h3 className="text-muted-foreground text-sm capitalize">{zone}</h3>
        <List as="ul" className="flex flex-col gap-2" />
      </section>
    ),
  ]),
) as Record<Zone, (List: A11yTreeMirrorListElement) => ReactNode>;

const keyMoves: Record<string, { step?: number; zone?: Zone }> = {
  ArrowLeft: { step: -1 },
  ArrowRight: { step: 1 },
  ArrowUp: { zone: "board" },
  ArrowDown: { zone: "hand" },
};

interface CardProps {
  card: string;
  setPlacement: Dispatch<SetStateAction<Placement>>;
}

/** Stable: a new `renderNode` re-renders every node. */
const renderCard: A11yTreeMirrorRenderNode<CardProps> = (
  content,
  { card, setPlacement },
) => (
  <div
    onKeyDown={(event: KeyboardEvent) => {
      const move = keyMoves[event.key];
      if (!move) return;
      event.preventDefault();
      setPlacement((current) => moveCard(current, card, move));
    }}
  >
    {content}
  </div>
);

function Lists() {
  const [showTree, setShowTree] = useState(true);

  return (
    <Frame
      title="Keyed lists"
      subtitle="Focus a card, then press arrow keys to move it; focus stays on the card"
      sourceUrl="https://github.com/astralarium/a11y-tree/blob/main/examples/routes/example/lists.tsx"
      controls={
        <TreeVisibilityToggle checked={showTree} onChange={setShowTree} />
      }
    >
      <A11yTreeProvider>
        <div className="relative min-h-0 flex-1">
          <FiberAnchor>
            <Canvas camera={{ position: [0, 0, 8] }}>
              <ambientLight intensity={0.5} />
              <directionalLight position={[5, 5, 5]} intensity={2} />
              <Table />
            </Canvas>
          </FiberAnchor>
          <TreePanel open={showTree} onOpenChange={setShowTree} />
        </div>
      </A11yTreeProvider>
    </Frame>
  );
}

function Table() {
  const outlets = { board: useA11yTreeOutlet(), hand: useA11yTreeOutlet() };
  const [placement, setPlacement] = useState<Placement>({
    board: ["Ace", "King"],
    hand: ["Queen", "Jack", "Ten"],
  });

  return (
    <A11yTreeMirror
      lists={zones.map((zone) => ({
        id: zone,
        outlet: outlets[zone],
        nodes: placement[zone].map((card) => ({
          key: card,
          props: { card, setPlacement },
        })),
        render: zoneLists[zone],
      }))}
      renderNode={renderCard}
      nodeElement="li"
    >
      {zones.map((zone) => (
        <group key={zone} position={[0, zoneY[zone], 0]}>
          <A11yTreeOutlet outlet={outlets[zone]} />
        </group>
      ))}
      {zones.flatMap((zone) =>
        placement[zone].map((card, index) => (
          <A11yTreeMirrorIn key={card} nodeKey={card}>
            <FocusableCube
              label={card}
              position={[
                (index - (placement[zone].length - 1) / 2) * 1.8,
                zoneY[zone],
                0,
              ]}
              size={1.2}
            />
          </A11yTreeMirrorIn>
        )),
      )}
    </A11yTreeMirror>
  );
}
