import { Code2Icon } from "lucide-react";
import type { ReactNode } from "react";

interface FrameProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  sourceUrl?: string;
  /** Extra controls rendered in the header, e.g. the a11y tree visibility toggle. */
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
        {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
        {/* z-60 keeps the controls clickable above the a11y tree panel (z-50) */}
        <div className="relative z-60 ml-auto flex items-center gap-4">
          {controls}
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground flex items-center gap-1 text-sm hover:underline"
            >
              <Code2Icon className="h-4 w-4" />
              Source
            </a>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}
