import { createFileRoute, Link } from "@tanstack/react-router";

import { EXAMPLES } from "./-examples";

export const Route = createFileRoute("/example/")({
  component: ExamplesIndex,
});

function ExamplesIndex() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4">
      <h1 className="mb-8 text-3xl font-bold">
        A11y<span className="text-emerald-400">Tree</span> Examples
      </h1>
      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        {EXAMPLES.map((example) => (
          <Link
            key={example.to}
            to={example.to}
            className="rounded-lg border border-neutral-800 p-4 transition-colors hover:bg-neutral-900"
          >
            <h2 className="mb-2 font-semibold">{example.label}</h2>
            <p className="text-sm text-neutral-400">{example.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
