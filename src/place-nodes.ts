/** `Element.moveBefore` (Chromium 133+): moves keep focus and fire no
 * events. */
interface MoveBefore {
  moveBefore?(node: Node, child: Node | null): void;
}

/**
 * Orders `hosts` inside `parent` with the fewest moves: the longest run
 * already in order stays. A host in `parent` holding focus stays.
 * Children of `parent` outside `hosts` keep their place.
 */
export function placeNodes(parent: Element, hosts: readonly Element[]) {
  const index = new Map<Element, number>();
  let at = 0;
  for (const child of parent.children) index.set(child, at++);
  const positions = hosts.map((host) => index.get(host) ?? -1);
  const active = parent.ownerDocument.activeElement;
  const focused = active
    ? hosts.findIndex((host, i) => positions[i] >= 0 && host.contains(active))
    : -1;
  const kept = keptIndices(positions, focused);
  let before: Element | null = null;
  for (let i = hosts.length - 1; i >= 0; i--) {
    if (!kept.has(i)) moveHost(parent, hosts[i], before);
    before = hosts[i];
  }
}

/** Indices of the longest increasing run of `positions`, through
 * `forced` when set. Negative positions are out. */
function keptIndices(positions: readonly number[], forced: number) {
  if (forced < 0) {
    return new Set(
      increasingRun(positions, (i) => positions[i] >= 0, 0, positions.length),
    );
  }
  const pivot = positions[forced];
  return new Set([
    ...increasingRun(
      positions,
      (i) => positions[i] >= 0 && positions[i] < pivot,
      0,
      forced,
    ),
    forced,
    ...increasingRun(
      positions,
      (i) => positions[i] > pivot,
      forced + 1,
      positions.length,
    ),
  ]);
}

/** Longest increasing subsequence of `positions[from, to)` over the
 * included indices. */
function increasingRun(
  positions: readonly number[],
  include: (i: number) => boolean,
  from: number,
  to: number,
): number[] {
  /** Index ending the smallest-valued run of each length. */
  const tails: number[] = [];
  const previous = new Map<number, number>();
  for (let i = from; i < to; i++) {
    if (!include(i)) continue;
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (positions[tails[mid]] < positions[i]) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) previous.set(i, tails[lo - 1]);
    tails[lo] = i;
  }
  const run: number[] = [];
  for (let i = tails.at(-1); i !== undefined; i = previous.get(i)) run.push(i);
  return run.reverse();
}

/** Moves `host` before `before`. Without `moveBefore`, refocuses what
 * the move blurred. */
function moveHost(
  parent: Element & MoveBefore,
  host: Element,
  before: Element | null,
) {
  if (parent.moveBefore) {
    try {
      parent.moveBefore(host, before);
      return;
    } catch {
      // Detached nodes and moves across documents or shadow roots fall
      // back to insertBefore.
    }
  }
  const active = host.ownerDocument.activeElement;
  const refocus =
    active instanceof HTMLElement && host.contains(active) ? active : null;
  parent.insertBefore(host, before);
  if (refocus && host.ownerDocument.activeElement !== refocus) {
    refocus.focus({ preventScroll: true });
  }
}
