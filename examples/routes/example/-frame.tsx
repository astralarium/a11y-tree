import type { ReactNode } from "react";

interface FrameProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  sourceUrl?: string;
  /** Extra controls rendered in the header, e.g. the a11y tree visibility switch. */
  controls?: ReactNode;
}

export function Frame({
  children,
  title,
  subtitle,
  sourceUrl,
  controls,
}: FrameProps) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="text-neutral-400">{subtitle}</p>}
        <div className="ml-auto flex items-center gap-6">
          {controls}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-neutral-400 hover:underline"
            >
              Source
            </a>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
