import { A11yTreeRenderer } from "@astralarium/a11y-tree";
import { EyeIcon, EyeOffIcon } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "#components/ui/sheet";

interface TreeVisibilityToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Icon+text button that shows or hides the a11y tree sheet. */
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

interface TreeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Non-modal sheet showing the a11y tree visually.
 *
 * Must be rendered inside an A11yTreeProvider. While the sheet is
 * closed, the tree stays in the document as sr-only so screen
 * readers always have access to it.
 */
export function TreeSheet({ open, onOpenChange }: TreeSheetProps) {
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        modal={false}
        disablePointerDismissal
      >
        <SheetContent
          side="right"
          showOverlay={false}
          showCloseButton={false}
          initialFocus={false}
          className="data-[side=right]:sm:max-w-2xs"
        >
          {/* pt-24 clears the page header so the title sits below the toggle/source controls */}
          <SheetHeader className="pt-24">
            <SheetTitle>A11y tree</SheetTitle>
            <SheetDescription>What screen readers see</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            <A11yTreeRenderer className="not-sr-only" />
          </div>
        </SheetContent>
      </Sheet>
      {!open && <A11yTreeRenderer className="sr-only" />}
    </>
  );
}
