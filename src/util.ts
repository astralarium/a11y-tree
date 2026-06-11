import type { Fiber } from "its-fine";
import { useEffect, useLayoutEffect } from "react";

/** useLayoutEffect, but useEffect during SSR where React warns on it. */
export const useIsomorphicLayoutEffect =
  typeof document !== "undefined" ? useLayoutEffect : useEffect;

interface FiberRootLike {
  current?: Fiber;
}

/**
 * Finds the fiber's FiberRoot, or null if detached. Reliable even via
 * a stale return chain: fibers never change roots and both HostRoot
 * generations share one stateNode.
 */
function getFiberRoot(fiber: Fiber): FiberRootLike | null {
  let node = fiber;
  while (node.return) node = node.return;
  const root = node.stateNode as FiberRootLike | null;
  return root?.current ? root : null;
}

/**
 * Assigns tree-order indices to the target fibers (and alternates) by
 * walking the live tree from `root`. A registered fiber may be a stale
 * generation (React reuses children on bailouts), so it is matched by
 * identity-or-alternate rather than trusted for position.
 */
function indexTargets(
  root: FiberRootLike,
  targets: Set<Fiber>,
  indices: Map<Fiber, number>,
) {
  const start = root.current;
  if (!start) return;
  let found = 0;
  let index = 0;
  // Explicit-stack preorder DFS: sibling chains can be long enough to
  // overflow recursion, and return pointers of bailed-out fibers can
  // dangle into stale generations, so only child/sibling are followed.
  const stack: Fiber[] = [start];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const isTarget =
      targets.has(node) ||
      (node.alternate != null && targets.has(node.alternate));
    if (isTarget) {
      indices.set(node, index);
      if (node.alternate) indices.set(node.alternate, index);
      if (++found >= targets.size) return;
    }
    index++;
    if (node.sibling) stack.push(node.sibling);
    // Skip matched subtrees so nested Ins don't affect this walk.
    if (!isTarget && node.child) stack.push(node.child);
  }
}

/**
 * Sorts items by fiber position in the React tree. Items are grouped
 * by React root (roots keep first-listed order); items without a
 * resolvable fiber keep input order, after their group's sorted items.
 */
export function sortByFiberOrder<T extends { fiber?: Fiber | null }>(
  items: readonly T[],
): T[] {
  if (items.length <= 1) return [...items];

  const entries = items.map((item, order) => ({
    item,
    order,
    root: item.fiber ? getFiberRoot(item.fiber) : null,
  }));

  const rootRank = new Map<FiberRootLike, number>();
  const targetsByRoot = new Map<FiberRootLike, Set<Fiber>>();
  for (const entry of entries) {
    if (!entry.root || !entry.item.fiber) continue;
    if (!rootRank.has(entry.root)) {
      rootRank.set(entry.root, rootRank.size);
      targetsByRoot.set(entry.root, new Set());
    }
    targetsByRoot.get(entry.root)!.add(entry.item.fiber);
  }

  const indices = new Map<Fiber, number>();
  for (const [root, targets] of targetsByRoot) {
    indexTargets(root, targets, indices);
  }

  return entries
    .sort((a, b) => {
      const rankA = a.root ? rootRank.get(a.root)! : Infinity;
      const rankB = b.root ? rootRank.get(b.root)! : Infinity;
      if (rankA !== rankB) return rankA - rankB;
      const indexA = a.item.fiber
        ? (indices.get(a.item.fiber) ?? Infinity)
        : Infinity;
      const indexB = b.item.fiber
        ? (indices.get(b.item.fiber) ?? Infinity)
        : Infinity;
      if (indexA !== indexB) return indexA - indexB;
      return a.order - b.order;
    })
    .map((entry) => entry.item);
}
