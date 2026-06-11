import { A11yTreeProvider, A11yTreeRenderer } from "@astralarium/a11y-tree";
import { Canvas } from "@react-three/fiber";
import { createFileRoute, Link } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";

import { FocusableCube } from "#components/focusable-cube";
import { Button } from "#components/ui/button";

export const Route = createFileRoute("/")({
  component: LandingPageClient,
  pendingComponent: LandingPage,
  ssr: false,
});

function LandingPage({ children }: PropsWithChildren) {
  return (
    <div className="isolate mt-[max(0rem,30svh-16rem)] flex h-[clamp(0rem,100svh-2.5rem,48rem)] flex-col items-center overflow-clip">
      <div className="mx-2 text-center">
        <h1 className="mt-6 text-[clamp(2.5rem,min(24svh-4rem,14svw),8rem)] font-bold [@media(max-height:400px)]:hidden [@media(max-width:250px)]:hidden">
          A11y<span className="text-a11y-green">Tree</span>
        </h1>
        <p className="text-muted-foreground mx-auto mt-2 max-w-md text-lg max-sm:hidden [@media(max-height:800px)]:hidden [@media(max-width:200px)]:hidden">
          Accessibility for any React component.
        </p>
      </div>

      <div className="-z-10 -mt-8 -mb-8 min-h-0 w-full grow">{children}</div>

      <div className="mb-4 flex gap-4 pb-4 [@media(max-width:200px)]:flex-col">
        <Button size="lg" render={<a href="/a11y-tree/docs/" />}>
          Docs
        </Button>
        <Button size="lg" variant="outline" render={<Link to="/example" />}>
          Examples
        </Button>
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
