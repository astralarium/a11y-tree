import type { Fiber } from "its-fine";

/** Sorts items by their fiber's position in the React tree. */
export function sortByFiberOrder<T extends { fiber?: Fiber | null }>(
  items: T[],
  root: Fiber | null | undefined,
  /** If true, continue descending into children after an item's fiber is found. */
  recurse = false,
): T[] {
  if (items.length <= 1 || !root) return items;

  const targetFibers = recurse
    ? null
    : new Set(items.map((item) => item.fiber).filter((f) => f != null));

  const fiberIndices = new Map<Fiber, number>();
  let index = 0;

  function visit(fiber: Fiber | null | undefined) {
    if (!fiber) return;
    fiberIndices.set(fiber, index++);
    if (!targetFibers?.has(fiber)) {
      visit(fiber.child);
    }
    visit(fiber.sibling);
  }

  fiberIndices.set(root, index++);
  if (!targetFibers?.has(root)) {
    visit(root.child);
  }

  return [...items].sort((a, b) => {
    const idxA = a.fiber ? (fiberIndices.get(a.fiber) ?? Infinity) : Infinity;
    const idxB = b.fiber ? (fiberIndices.get(b.fiber) ?? Infinity) : Infinity;
    return idxA - idxB;
  });
}
