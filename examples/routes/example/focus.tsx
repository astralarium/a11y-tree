import { A11yTreeContainer, A11yTreeProvider } from "@astralarium/a11y-tree";
import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { FocusableCube } from "#components/focusable-cube";
import {
  TreePanel,
  TreeVisibilityToggle,
} from "#components/tree-visibility-toggle";

import { Frame } from "./-frame";

export const Route = createFileRoute("/example/focus")({
  component: Focus,
});

function Focus() {
  const [showTree, setShowTree] = useState(true);

  return (
    <Frame
      title="Focus"
      subtitle="Hover a cube or press Tab to focus it in the a11y tree"
      sourceUrl="https://github.com/astralarium/a11y-tree/blob/main/examples/routes/example/focus.tsx"
      controls={
        <TreeVisibilityToggle checked={showTree} onChange={setShowTree} />
      }
    >
      <A11yTreeProvider>
        <div className="relative min-h-0 flex-1">
          <Canvas camera={{ position: [0, 0, 7] }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={2} />
            <A11yTreeContainer
              render={(content) => (
                <div
                  role="group"
                  aria-label="Cubes"
                  className="flex flex-col gap-2"
                >
                  {content}
                </div>
              )}
            >
              <FocusableCube
                label="Left cube"
                position={[-2.6, 0.2, 0]}
                rotation={[0.4, 0.6, 0]}
              />
              <FocusableCube
                label="Middle cube"
                position={[0, -0.3, 0]}
                rotation={[0.2, -0.4, 0.1]}
              />
              <FocusableCube
                label="Right cube"
                position={[2.6, 0.3, 0]}
                rotation={[-0.3, 0.3, -0.1]}
              />
            </A11yTreeContainer>
          </Canvas>
          <TreePanel open={showTree} onOpenChange={setShowTree} />
        </div>
      </A11yTreeProvider>
    </Frame>
  );
}
