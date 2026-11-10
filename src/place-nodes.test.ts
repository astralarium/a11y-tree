import "@testing-library/jest-dom/vitest";

import { afterEach, describe, expect, test, vi } from "vitest";

import { placeNodes } from "./place-nodes";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

/** A parent holding hosts named by `names`, in order. */
function setup(names: string[]) {
  const parent = document.createElement("div");
  document.body.append(parent);
  const hosts = new Map<string, HTMLElement>();
  for (const name of names) {
    const host = document.createElement("div");
    host.dataset.name = name;
    host.append(document.createElement("button"));
    parent.append(host);
    hosts.set(name, host);
  }
  const insertBefore = vi.spyOn(parent, "insertBefore");
  return {
    parent,
    hosts,
    insertBefore,
    order: () =>
      [...parent.children].map((child) => (child as HTMLElement).dataset.name),
    place: (names: string[]) =>
      placeNodes(
        parent,
        names.map((name) => hosts.get(name)!),
      ),
  };
}

describe("placeNodes", () => {
  test("placement moves the fewest nodes", () => {
    const { order, place, insertBefore } = setup(["a", "b", "c", "d", "e"]);
    place(["b", "c", "d", "e", "a"]);
    expect(order()).toEqual(["b", "c", "d", "e", "a"]);
    expect(insertBefore).toHaveBeenCalledTimes(1);
  });

  test("placement keeps the focused node still", () => {
    const { order, place, hosts, insertBefore } = setup(["a", "b", "c", "d"]);
    const button = hosts.get("a")!.querySelector("button")!;
    button.focus();
    place(["b", "c", "d", "a"]);
    expect(order()).toEqual(["b", "c", "d", "a"]);
    expect(insertBefore).toHaveBeenCalledTimes(3);
    expect(insertBefore.mock.calls.map(([node]) => node)).not.toContain(
      hosts.get("a"),
    );
    expect(document.activeElement).toBe(button);
  });

  test("placement moves a host in from another parent and refocuses it", () => {
    const { parent, hosts, order } = setup(["a", "b"]);
    const other = document.createElement("div");
    const host = document.createElement("div");
    host.dataset.name = "x";
    const button = document.createElement("button");
    host.append(button);
    other.append(host);
    document.body.append(other);
    button.focus();

    placeNodes(parent, [hosts.get("a")!, host, hosts.get("b")!]);
    expect(order()).toEqual(["a", "x", "b"]);
    expect(other).toBeEmptyDOMElement();
    expect(document.activeElement).toBe(button);
  });

  test("placement moves no child outside the hosts", () => {
    const { order, place, hosts, insertBefore } = setup(["a", "b", "c"]);
    place(["c", "a"]);
    expect(order()).toEqual(["c", "a", "b"]);
    expect(insertBefore.mock.calls.map(([node]) => node)).toEqual([
      hosts.get("c"),
    ]);
  });
});
