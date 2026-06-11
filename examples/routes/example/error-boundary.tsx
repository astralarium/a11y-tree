import { A11yTreeContainer, A11yTreeProvider } from "@astralarium/a11y-tree";
import { Canvas } from "@react-three/fiber";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { FocusableCube } from "#components/focusable-cube";
import {
  TreeSheet,
  TreeVisibilityToggle,
} from "#components/tree-visibility-toggle";
import { UnstableCube } from "#components/unstable-cube";

import { Frame } from "./-frame";

export const Route = createFileRoute("/example/error-boundary")({
  component: ErrorBoundary,
});

function ErrorBoundary() {
  const [showTree, setShowTree] = useState(true);

  return (
    <Frame
      title="Error boundary"
      subtitle="Click the red cube to crash the a11y tree; the error surfaces in a dismissable dialog"
      sourceUrl="https://github.com/astralarium/a11y-tree/blob/main/examples/routes/example/error-boundary.tsx"
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
                label="Stable cube"
                position={[-1.8, 0, 0]}
                rotation={[0.4, 0.6, 0]}
              />
              <UnstableCube
                label="Unstable cube"
                position={[1.8, 0, 0]}
                rotation={[-0.3, 0.3, -0.1]}
              />
            </A11yTreeContainer>
          </Canvas>
          <TreeSheet open={showTree} onOpenChange={setShowTree} />
        </div>
      </A11yTreeProvider>
    </Frame>
  );
}
