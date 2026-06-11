import { Link } from "@tanstack/react-router";

export function Navigation() {
  return (
    <header className="flex h-12 items-center gap-6 border-b border-neutral-800 px-4 text-sm">
      <Link to="/" className="text-base font-bold">
        A11y<span className="text-emerald-400">Tree</span>
      </Link>
      <a href="/a11y-tree/docs/" className="hover:underline">
        Docs
      </a>
      <Link to="/example" className="hover:underline">
        Examples
      </Link>
      <div className="grow" />
      <a
        href="https://github.com/astralarium/a11y-tree"
        className="hover:underline"
      >
        GitHub
      </a>
    </header>
  );
}
