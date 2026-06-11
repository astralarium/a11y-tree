import { A11yTreeProvider, A11yTreeRenderer } from "@astralarium/a11y-tree";
import { Canvas } from "@react-three/fiber";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";

import { FocusableCube } from "../components/focusable-cube";

export const Route = createFileRoute("/")({
  component: LandingPageClient,
  pendingComponent: LandingPage,
  ssr: false,
});

function LandingPage({ children }: PropsWithChildren) {
  return (
    <div className="flex h-[calc(100svh-3rem)] flex-col items-center">
      <div className="mx-2 mt-12 text-center">
        <h1 className="text-6xl font-bold">
          A11y<span className="text-emerald-400">Tree</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-lg text-neutral-400">
          Accessibility for any React component.
        </p>
      </div>

      <div className="min-h-0 w-full grow">{children}</div>

      <div className="mb-8 flex gap-4">
        <a
          href="/a11y-tree/docs/"
          className="rounded-lg bg-neutral-100 px-6 py-3 font-medium text-neutral-900 hover:bg-white"
        >
          Docs
        </a>
        <Link
          to="/example"
          className="rounded-lg border border-neutral-700 px-6 py-3 font-medium hover:bg-neutral-900"
        >
          Examples
        </Link>
      </div>
    </div>
  );
}

function LandingPageClient() {
  return (
    <LandingPage>
      <A11yTreeProvider>
        <div className="relative h-full">
          <Canvas camera={{ position: [0, 0, 7] }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[5, 5, 5]} intensity={2} />
            <FocusableCube
              label="First cube"
              position={[-2.7, 0.6, -0.5]}
              rotation={[0.5, 0.7, 0.1]}
              size={1.7}
            />
            <FocusableCube
              label="Second cube"
              position={[-0.2, -0.4, 0]}
              rotation={[0.3, -0.5, 0.2]}
              size={2}
            />
            <FocusableCube
              label="Third cube"
              position={[2.6, 0.5, -0.8]}
              rotation={[-0.4, 0.4, -0.2]}
              size={1.4}
            />
          </Canvas>
          <A11yTreeRenderer />
        </div>
      </A11yTreeProvider>
    </LandingPage>
  );
}
