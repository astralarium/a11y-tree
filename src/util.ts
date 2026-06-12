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
 * Whether the fiber is still part of its tree: reachable from its
 * root's current generation, by identity or alternate. Walking up
 * alone is unreliable — a deleted fiber's stale return chain can still
 * reach the root. Hidden (Suspense/Activity) subtrees stay linked, so
 * they count as live. O(tree size); reserve for cold paths.
 */
export function isFiberLive(fiber: Fiber): boolean {
  const root = getFiberRoot(fiber);
  const start = root?.current;
  if (!start) return false;
  const stack: Fiber[] = [start];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node === fiber || node.alternate === fiber) return true;
    if (node.sibling) stack.push(node.sibling);
    if (node.child) stack.push(node.child);
  }
  return false;
}

// Work tags of fibers that hide a preserved subtree. SuspenseComponent
// holds non-null memoizedState while showing its fallback; the others
// carry a `mode: "hidden"` prop while hiding their children.
const SUSPENSE_TAG = 13;
const HIDDEN_MODE_TAGS = new Set([
  22, // OffscreenComponent (Suspense content wrapper)
  23, // LegacyHiddenComponent
  31, // ActivityComponent
]);

function hidesSubtree(fiber: Fiber): boolean {
  // The walk may arrive via a stale generation whose ancestors did not
  // re-render; the committed hide lives on either generation.
  for (const f of [fiber, fiber.alternate]) {
    if (!f) continue;
    if (f.tag === SUSPENSE_TAG && f.memoizedState !== null) return true;
    if (HIDDEN_MODE_TAGS.has(f.tag)) {
      const props = (f.memoizedProps ?? f.pendingProps) as {
        mode?: unknown;
      } | null;
      if (props?.mode === "hidden") return true;
    }
  }
  return false;
}

/**
 * Whether the fiber sits in a subtree React is hiding but preserving
 * (Suspense fallback shown, Activity hidden). Distinguishes an effect
 * teardown caused by hiding from a real unmount.
 *
 * May false-positive via a stale alternate that still records an old
 * hide; callers must tolerate that (e.g. by checking isFiberLive once
 * the commit ends).
 */
export function isFiberHidden(fiber: Fiber): boolean {
  for (let f: Fiber | null = fiber; f; f = f.return) {
    if (hidesSubtree(f)) return true;
  }
  return false;
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
