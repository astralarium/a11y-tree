/** Classes for A11yTreeRenderer when the tree is shown visually. */
export const VISIBLE_TREE_CLASSNAME =
  "absolute right-4 bottom-4 rounded-lg border border-dashed border-emerald-400 bg-neutral-900/90 p-4";

interface TreeVisibilityToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Switch that shows or hides the sr-only a11y tree visually. */
export function TreeVisibilityToggle({
  checked,
  onChange,
}: TreeVisibilityToggleProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-neutral-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-emerald-400"
      />
      Show a11y tree
    </label>
  );
}
