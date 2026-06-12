import { A11yTreeRenderer } from "@astralarium/a11y-tree";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useEffect, useId } from "react";

import { cn } from "#components/lib/utils";

interface TreeVisibilityToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Icon+text button that shows or hides the a11y tree panel. */
export function TreeVisibilityToggle({
  checked,
  onChange,
}: TreeVisibilityToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className="text-muted-foreground flex cursor-pointer items-center gap-1 text-sm hover:underline"
    >
      {checked ? (
        <EyeIcon className="h-4 w-4" />
      ) : (
        <EyeOffIcon className="h-4 w-4" />
      )}
      A11y tree
    </button>
  );
}

interface TreePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Non-modal panel showing the a11y tree visually. Escape closes it.
 *
 * Must be rendered inside an A11yTreeProvider. The single renderer
 * stays mounted at a stable tree position (so refs into the tree stay
 * valid) and only toggles className: open shows the panel, closed
 * collapses to the bare screen-reader-only tree with no landmark,
 * heading, or off-screen content in the tab order.
 */
export function TreePanel({ open, onOpenChange }: TreePanelProps) {
  const headingId = useId();
  const descriptionId = useId();

  // Document-level so Escape works wherever focus is (e.g. still on
  // the toggle button). Widgets that consume Escape preventDefault.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !event.defaultPrevented) {
        onOpenChange(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <div
      role={open ? "complementary" : undefined}
      aria-labelledby={open ? headingId : undefined}
      aria-describedby={open ? descriptionId : undefined}
      className={cn(
        open &&
          "bg-popover text-popover-foreground fixed inset-y-0 right-0 z-50 flex w-3/4 flex-col gap-4 border-l text-sm shadow-lg sm:max-w-2xs",
      )}
    >
      {open && (
        // pt-24 clears the page header so the title sits below the toggle/source controls
        <div className="flex flex-col gap-0.5 p-4 pt-24">
          <h2 id={headingId} className="text-foreground text-base font-medium">
            A11y tree
          </h2>
          <p id={descriptionId} className="text-muted-foreground text-sm">
            What screen readers see
          </p>
        </div>
      )}
      <div className={cn(open && "min-h-0 flex-1 overflow-y-auto px-4 pb-4")}>
        {/* Closing keeps focus where it is: the focused element stays
            focusable in the sr-only tree, preserving tab position. */}
        <A11yTreeRenderer className={open ? "not-sr-only" : "sr-only"} />
      </div>
    </div>
  );
}
