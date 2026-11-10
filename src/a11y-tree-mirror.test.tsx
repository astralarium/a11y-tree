import "@testing-library/jest-dom/vitest";

import { act, fireEvent, screen, within } from "@testing-library/react";
import {
  ContextBridge,
  type ContextBridgeValue,
  FiberAnchor,
} from "fiber-tunnel";
import {
  Activity,
  cloneElement,
  createContext,
  type ReactElement,
  type ReactNode,
  StrictMode,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, type Mock, test, vi } from "vitest";

import { A11yTreeContainer, A11yTreeElement } from "./a11y-tree-element";
import {
  A11yTreeMirror,
  A11yTreeMirrorIn,
  type A11yTreeMirrorList,
  type A11yTreeMirrorListElement,
  type A11yTreeMirrorRenderNode,
} from "./a11y-tree-mirror";
import { A11yTreeOutlet } from "./a11y-tree-outlet";
import { type A11yTreeOutletHandle, createOutlet } from "./mirror-store";
import { TestProvider } from "./test/provider";
import { flush, renderTree } from "./test/utils";

interface NodeProps {
  label: string;
}

type Placement = Record<string, string[]>;

type Outlets = Record<string, A11yTreeOutletHandle>;

function outletsFor(ids: string[]): Outlets {
  return Object.fromEntries(ids.map((id) => [id, createOutlet()]));
}

type RenderList = (List: A11yTreeMirrorListElement) => ReactNode;

/** Stable list renders by id. */
const listboxes = new Map<string, RenderList>();
function listbox(id: string) {
  let render = listboxes.get(id);
  if (!render) {
    render = (List) => <List role="listbox" aria-label={id} />;
    listboxes.set(id, render);
  }
  return render;
}

function listsOf(
  outlets: Outlets,
  placement: Placement,
  render: (id: string) => RenderList = listbox,
): A11yTreeMirrorList<NodeProps>[] {
  return Object.entries(placement).map(([id, keys]) => ({
    id,
    outlet: outlets[id],
    nodes: keys.map((key) => ({ key, props: { label: key } })),
    render: render(id),
  }));
}

const option: A11yTreeMirrorRenderNode<NodeProps> = (content, { label }) => (
  <div role="option" aria-label={label}>
    {content}
  </div>
);

function Counter({ name }: { name: string }) {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((c) => c + 1)}>
      {name} {count}
    </button>
  );
}

function Owners({ ids, outlets }: { ids: string[]; outlets: Outlets }) {
  return ids.map((id) => <A11yTreeOutlet key={id} outlet={outlets[id]} />);
}

/** Scene content: a counter per key, routed to its node. */
function Items({ keys }: { keys: string[] }) {
  return keys.map((key) => (
    <A11yTreeMirrorIn key={key} nodeKey={key}>
      <A11yTreeElement>
        <Counter name={key} />
      </A11yTreeElement>
    </A11yTreeMirrorIn>
  ));
}

afterEach(() => {
  vi.restoreAllMocks();
});

function keysOf(placement: Placement) {
  return [...new Set(Object.values(placement).flat())];
}

/** A mirror with an owner per list, in `owners` order. */
function Scene({
  outlets,
  placement,
  owners = Object.keys(placement),
  renderNode = option,
}: {
  outlets: Outlets;
  placement: Placement;
  owners?: string[];
  renderNode?: A11yTreeMirrorRenderNode<NodeProps>;
}) {
  return (
    <TestProvider>
      <A11yTreeMirror
        lists={listsOf(outlets, placement)}
        renderNode={renderNode}
      >
        <Owners ids={owners} outlets={outlets} />
        <Items keys={keysOf(placement)} />
      </A11yTreeMirror>
    </TestProvider>
  );
}

function labelsIn(list: string) {
  return within(screen.getByRole("listbox", { name: list }))
    .queryAllByRole("option")
    .map((node) => node.getAttribute("aria-label"));
}

function listOrder() {
  return screen
    .getAllByRole("listbox")
    .map((list) => list.getAttribute("aria-label"));
}

describe("A11yTreeMirror", () => {
  test("the mirror renders each list's wrapper at its outlet", async () => {
    const outlets = outletsFor(["a", "b"]);
    await renderTree(
      <Scene outlets={outlets} placement={{ a: ["X"], b: ["Y"] }} />,
    );
    expect(labelsIn("a")).toEqual(["X"]);
    expect(labelsIn("b")).toEqual(["Y"]);
  });

  test("the mirror renders an empty list's wrapper", async () => {
    const outlets = outletsFor(["a"]);
    await renderTree(<Scene outlets={outlets} placement={{ a: [] }} />);
    expect(screen.getByRole("listbox", { name: "a" })).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  test("the mirror renders a list's nodes in order", async () => {
    const outlets = outletsFor(["a"]);
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={{ a: ["X", "Y", "Z"] }} />,
    );
    expect(labelsIn("a")).toEqual(["X", "Y", "Z"]);

    await rerender(
      <Scene outlets={outlets} placement={{ a: ["Z", "X", "Y"] }} />,
    );
    expect(labelsIn("a")).toEqual(["Z", "X", "Y"]);
  });

  test("a list's nodes render as children of its element, in their node elements", async () => {
    const outlets = outletsFor(["a", "b"]);
    const renderList =
      (id: string): RenderList =>
      (List) => (
        <section aria-label={`zone ${id}`}>
          <h3>{id}</h3>
          <List as="ul" role="listbox" aria-label={id} />
        </section>
      );
    const lists = new Map(["a", "b"].map((id) => [id, renderList(id)]));
    const app = (placement: Placement) => (
      <TestProvider>
        <A11yTreeMirror
          lists={listsOf(outlets, placement, (id) => lists.get(id)!)}
          renderNode={option}
          nodeElement="li"
          nodeAttributes={{ role: "none" }}
        >
          <Owners ids={["a", "b"]} outlets={outlets} />
          <Items keys={keysOf(placement)} />
        </A11yTreeMirror>
      </TestProvider>
    );
    const shape = (id: string) =>
      [...screen.getByRole("listbox", { name: id }).children].map(
        (child) =>
          `${child.tagName}[${child.getAttribute("role")}]>${child.firstElementChild?.getAttribute("aria-label")}`,
      );
    const { rerender } = await renderTree(app({ a: ["X", "Y"], b: ["Z"] }));
    expect(screen.getByRole("listbox", { name: "a" }).tagName).toBe("UL");
    expect(shape("a")).toEqual(["LI[none]>X", "LI[none]>Y"]);

    await rerender(app({ a: ["Y"], b: ["X", "Z"] }));
    expect(shape("a")).toEqual(["LI[none]>Y"]);
    expect(shape("b")).toEqual(["LI[none]>X", "LI[none]>Z"]);
  });

  test("a list element composes with a render prop's ref and children, and receives node events natively", async () => {
    const outlets = outletsFor(["a"]);
    const keys: string[] = [];
    const elements: (HTMLElement | null)[] = [];
    /** Clones its `render` element with a ref and children, like base-ui's
     * `useRender`. */
    function KeyList({ render }: { render: ReactElement }) {
      const ref = (element: HTMLElement | null) => {
        elements.push(element);
        if (!element) return;
        const onKeyDown = (event: KeyboardEvent) => keys.push(event.key);
        element.addEventListener("keydown", onKeyDown);
        return () => {
          elements.push(null);
          element.removeEventListener("keydown", onKeyDown);
        };
      };
      return cloneElement(
        render as ReactElement<{ ref: unknown }>,
        {
          ref,
          children: "stale",
        } as { ref: unknown },
      );
    }
    const renderList: RenderList = (List) => (
      <KeyList render={<List as="ul" role="listbox" aria-label="a" />} />
    );
    const app = (placement: Placement) => (
      <TestProvider>
        <A11yTreeMirror
          lists={listsOf(outlets, placement, () => renderList)}
          renderNode={option}
        >
          <Owners ids={["a"]} outlets={outlets} />
          <Items keys={keysOf(placement)} />
        </A11yTreeMirror>
      </TestProvider>
    );
    const { rerender, unmount } = await renderTree(app({ a: ["X", "Y"] }));
    const list = screen.getByRole("listbox", { name: "a" });
    expect(elements).toEqual([list]);
    expect(list).not.toHaveTextContent("stale");
    expect(labelsIn("a")).toEqual(["X", "Y"]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Y 0" }), {
      key: "ArrowUp",
    });
    expect(keys).toEqual(["ArrowUp"]);

    await rerender(app({ a: ["Y", "X"] }));
    expect(labelsIn("a")).toEqual(["Y", "X"]);
    unmount();
    expect(elements.at(-1)).toBeNull();
  });

  test("by default, lists and nodes render in display: contents divs", async () => {
    const outlets = outletsFor(["a"]);
    await renderTree(
      <TestProvider>
        <A11yTreeMirror
          lists={[
            { id: "a", outlet: outlets.a, nodes: [{ key: "X", props: {} }] },
          ]}
        >
          <Owners ids={["a"]} outlets={outlets} />
          <Items keys={["X"]} />
        </A11yTreeMirror>
      </TestProvider>,
    );
    const node = screen.getByRole("button", { name: "X 0" }).parentElement!;
    for (const element of [node, node.parentElement!]) {
      expect(element.tagName).toBe("DIV");
      expect(element).toHaveStyle({ display: "contents" });
    }
  });

  test("A11yTreeMirrorIn content renders inside its node", async () => {
    const outlets = outletsFor(["a"]);
    await renderTree(<Scene outlets={outlets} placement={{ a: ["X"] }} />);
    expect(screen.getByRole("option", { name: "X" })).toContainElement(
      screen.getByRole("button", { name: "X 0" }),
    );
  });

  test("a node keeps its state and DOM node when it moves to another list", async () => {
    const outlets = outletsFor(["a", "b"]);
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={{ a: ["X", "Y"], b: [] }} />,
    );
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(
      <Scene outlets={outlets} placement={{ a: ["Y"], b: ["X"] }} />,
    );
    expect(labelsIn("a")).toEqual(["Y"]);
    expect(labelsIn("b")).toEqual(["X"]);
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
  });

  test("a node keeps its state, DOM node and focus when it reorders in its list", async () => {
    const outlets = outletsFor(["a"]);
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={{ a: ["X", "Y", "Z"] }} />,
    );
    const button = screen.getByRole("button", { name: "Y 0" });
    fireEvent.click(button);
    act(() => button.focus());
    const onFocus = vi.fn();
    button.addEventListener("focus", onFocus);

    await rerender(
      <Scene outlets={outlets} placement={{ a: ["Z", "Y", "X"] }} />,
    );
    expect(labelsIn("a")).toEqual(["Z", "Y", "X"]);
    expect(screen.getByRole("button", { name: "Y 1" })).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(onFocus).not.toHaveBeenCalled();
  });

  test("without moveBefore, a node regains focus in the same task after a cross-list move", async () => {
    const outlets = outletsFor(["a", "b"]);
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={{ a: ["X"], b: [] }} />,
    );
    const button = screen.getByRole("button", { name: "X 0" });
    act(() => button.focus());
    const focusedAt: string[] = [];
    button.addEventListener("focus", () =>
      focusedAt.push(button.closest("[role=listbox]")!.ariaLabel!),
    );

    await rerender(<Scene outlets={outlets} placement={{ a: [], b: ["X"] }} />);
    expect(labelsIn("b")).toEqual(["X"]);
    expect(document.activeElement).toBe(button);
    expect(focusedAt).toEqual(["b"]);
  });

  test("with moveBefore, a cross-list move keeps focus with no refocus", async () => {
    const moveBefore = vi.fn(function (
      this: Element,
      node: Node,
      child: Node | null,
    ) {
      const active = document.activeElement;
      this.insertBefore(node, child);
      // Emulates the browser: focus stays, no events.
      if (active instanceof HTMLElement && document.activeElement !== active) {
        Object.defineProperty(document, "activeElement", {
          configurable: true,
          get: () => active,
        });
      }
    });
    Object.assign(Element.prototype, { moveBefore });
    try {
      const outlets = outletsFor(["a", "b"]);
      const { rerender } = await renderTree(
        <Scene outlets={outlets} placement={{ a: ["X"], b: [] }} />,
      );
      const button = screen.getByRole("button", { name: "X 0" });
      act(() => button.focus());
      const onFocus = vi.fn();
      button.addEventListener("focus", onFocus);

      await rerender(
        <Scene outlets={outlets} placement={{ a: [], b: ["X"] }} />,
      );
      expect(labelsIn("b")).toEqual(["X"]);
      expect(moveBefore).toHaveBeenCalled();
      expect(document.activeElement).toBe(button);
      expect(onFocus).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as { moveBefore?: unknown }).moveBefore;
      delete (document as { activeElement?: unknown }).activeElement;
    }
  });

  test("a node leaves the DOM when its key leaves every list", async () => {
    const outlets = outletsFor(["a"]);
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={{ a: ["X", "Y"] }} />,
    );
    const node = screen.getByRole("option", { name: "X" });

    await rerender(<Scene outlets={outlets} placement={{ a: ["Y"] }} />);
    expect(labelsIn("a")).toEqual(["Y"]);
    expect(node).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "a" }).childNodes).toHaveLength(
      1,
    );
  });

  test("a node waits for its list's outlet, then renders there; mounted nodes stay mounted", async () => {
    const outlets = outletsFor(["a", "b"]);
    const placement = { a: ["X"], b: ["Y"] };
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={placement} owners={["a"]} />,
    );
    expect(screen.queryByRole("option", { name: "Y" })).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(
      <Scene outlets={outlets} placement={placement} owners={["a", "b"]} />,
    );
    expect(labelsIn("b")).toEqual(["Y"]);
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
  });

  test("a key in two lists warns once in dev", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outlets = outletsFor(["a", "b"]);
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={{ a: ["X"], b: ["X"] }} />,
    );
    await rerender(
      <Scene outlets={outlets} placement={{ a: ["X", "Y"], b: ["X"] }} />,
    );
    expect(labelsIn("a")).toEqual(["X", "Y"]);
    expect(labelsIn("b")).toEqual([]);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0][0]).toContain('node "X"');
    consoleWarn.mockRestore();
  });

  test("a key repeated in one list warns once in dev and renders once", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outlets = outletsFor(["a"]);
    await renderTree(<Scene outlets={outlets} placement={{ a: ["X", "X"] }} />);
    expect(labelsIn("a")).toEqual(["X"]);
    expect(consoleWarn).toHaveBeenCalledTimes(1);
    expect(consoleWarn.mock.calls[0][0]).toContain('repeats in list "a"');
  });

  test("of lists sharing an id, the last renders, and dev warns once", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outlets = outletsFor(["a", "b"]);
    const node = (key: string) => ({ key, props: { label: key } });
    const app = () => (
      <TestProvider>
        <A11yTreeMirror
          lists={[
            {
              id: "a",
              outlet: outlets.a,
              nodes: [node("X")],
              render: listbox("a"),
            },
            {
              id: "a",
              outlet: outlets.b,
              nodes: [node("Y")],
              render: listbox("b"),
            },
          ]}
          renderNode={option}
        >
          <Owners ids={["a", "b"]} outlets={outlets} />
          <Items keys={["X", "Y"]} />
        </A11yTreeMirror>
      </TestProvider>
    );
    const { rerender } = await renderTree(app());
    await rerender(app());
    expect(listOrder()).toEqual(["b"]);
    expect(labelsIn("b")).toEqual(["Y"]);
    expect(consoleWarn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('share id "a"'),
    ]);
  });

  test("of lists sharing an outlet, the last renders, and dev warns once", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outlets = outletsFor(["a"]);
    const app = () => (
      <TestProvider>
        <A11yTreeMirror
          lists={[
            { id: "a", outlet: outlets.a, nodes: [], render: listbox("a") },
            { id: "c", outlet: outlets.a, nodes: [], render: listbox("c") },
          ]}
        >
          <Owners ids={["a"]} outlets={outlets} />
        </A11yTreeMirror>
      </TestProvider>
    );
    const { rerender } = await renderTree(app());
    await rerender(app());
    expect(listOrder()).toEqual(["c"]);
    expect(consoleWarn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining('"a" and "c" share an outlet'),
    ]);
  });

  test("a list leaves its outlet when it leaves lists", async () => {
    const outlets = outletsFor(["a", "b"]);
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={{ a: ["X"], b: ["Y"] }} />,
    );
    await rerender(
      <Scene outlets={outlets} placement={{ a: ["X"] }} owners={["a", "b"]} />,
    );
    expect(listOrder()).toEqual(["a"]);
    expect(screen.queryByRole("option", { name: "Y" })).not.toBeInTheDocument();
  });

  test("a node moved to a list with no mounted outlet stays in its last list until the outlet mounts", async () => {
    const outlets = outletsFor(["a", "b"]);
    const { rerender } = await renderTree(
      <Scene
        outlets={outlets}
        placement={{ a: ["X"], b: [] }}
        owners={["a"]}
      />,
    );
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(
      <Scene
        outlets={outlets}
        placement={{ a: [], b: ["X"] }}
        owners={["a"]}
      />,
    );
    expect(labelsIn("a")).toEqual(["X"]);

    await rerender(
      <Scene
        outlets={outlets}
        placement={{ a: [], b: ["X"] }}
        owners={["a", "b"]}
      />,
    );
    expect(labelsIn("a")).toEqual([]);
    expect(labelsIn("b")).toEqual(["X"]);
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
  });

  test("a node waiting for its list follows its last list's new element", async () => {
    const outlets = outletsFor(["a", "b"]);
    const asList: RenderList = (List) => (
      <List as="ul" role="listbox" aria-label="a" />
    );
    const app = (placement: Placement, renderA: RenderList) => (
      <TestProvider>
        <A11yTreeMirror
          lists={listsOf(outlets, placement, (id) =>
            id === "a" ? renderA : listbox(id),
          )}
          renderNode={option}
        >
          <Owners ids={["a"]} outlets={outlets} />
          <Items keys={["X"]} />
        </A11yTreeMirror>
      </TestProvider>
    );
    const { rerender } = await renderTree(
      app({ a: ["X"], b: [] }, listbox("a")),
    );
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();
    await rerender(app({ a: [], b: ["X"] }, listbox("a")));

    await rerender(app({ a: [], b: ["X"] }, asList));
    expect(screen.getByRole("listbox", { name: "a" }).tagName).toBe("UL");
    expect(labelsIn("a")).toEqual(["X"]);
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
  });

  test("a list element's ref follows its element across an `as` change", async () => {
    const outlets = outletsFor(["a"]);
    const refs: (HTMLElement | null)[] = [];
    const ref = (element: HTMLElement | null) => void refs.push(element);
    const renders = {
      ul: ((List) => (
        <List as="ul" ref={ref} role="listbox" aria-label="a" />
      )) as RenderList,
      ol: ((List) => (
        <List as="ol" ref={ref} role="listbox" aria-label="a" />
      )) as RenderList,
    };
    const app = (tag: "ul" | "ol") => (
      <TestProvider>
        <A11yTreeMirror lists={listsOf(outlets, { a: [] }, () => renders[tag])}>
          <Owners ids={["a"]} outlets={outlets} />
        </A11yTreeMirror>
      </TestProvider>
    );
    const { rerender } = await renderTree(app("ul"));
    await rerender(app("ol"));
    const list = screen.getByRole("listbox", { name: "a" });
    expect(list.tagName).toBe("OL");
    expect(refs.at(-1)).toBe(list);
  });

  test("a list leaves its outlet when its mirror unmounts", async () => {
    const outlets = outletsFor(["a"]);
    const app = (mirror: boolean) => (
      <TestProvider>
        <A11yTreeOutlet outlet={outlets.a} />
        {mirror && (
          <A11yTreeMirror
            lists={listsOf(outlets, { a: ["X"] })}
            renderNode={option}
          >
            <Items keys={["X"]} />
          </A11yTreeMirror>
        )}
      </TestProvider>
    );
    const { rerender } = await renderTree(app(true));
    expect(labelsIn("a")).toEqual(["X"]);

    await rerender(app(false));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  test("a key leaving and rejoining its list renders its A11yTreeMirrorIn content again", async () => {
    const outlets = outletsFor(["a"]);
    const app = (keys: string[]) => (
      <TestProvider>
        <A11yTreeMirror
          lists={listsOf(outlets, { a: keys })}
          renderNode={option}
        >
          <Owners ids={["a"]} outlets={outlets} />
          <Items keys={["X"]} />
        </A11yTreeMirror>
      </TestProvider>
    );
    const { rerender } = await renderTree(app(["X"]));
    await rerender(app([]));
    expect(labelsIn("a")).toEqual([]);

    await rerender(app(["X"]));
    expect(
      within(screen.getByRole("option", { name: "X" })).getByRole("button"),
    ).toBeInTheDocument();
  });

  test("a suspending node leaves the other nodes rendered", async () => {
    const outlets = outletsFor(["a"]);
    let resolve!: () => void;
    const pending = new Promise<void>((done) => (resolve = done));
    function Wait({ children }: { children: ReactNode }) {
      use(pending);
      return children;
    }
    const renderNode: A11yTreeMirrorRenderNode<NodeProps> = (content, props) =>
      props.label === "Y" ? (
        <Wait>{option(content, props)}</Wait>
      ) : (
        option(content, props)
      );
    await renderTree(
      <Scene
        outlets={outlets}
        placement={{ a: ["X", "Y", "Z"] }}
        renderNode={renderNode}
      />,
    );
    expect(labelsIn("a")).toEqual(["X", "Z"]);

    await act(async () => resolve());
    expect(labelsIn("a")).toEqual(["X", "Y", "Z"]);
  });
});

describe("A11yTreeMirror order", () => {
  test("lists follow their owners' tree order, whatever their lists order", async () => {
    const outlets = outletsFor(["a", "b"]);
    await renderTree(
      <Scene
        outlets={outlets}
        placement={{ b: ["Y"], a: ["X"] }}
        owners={["a", "b"]}
      />,
    );
    expect(listOrder()).toEqual(["a", "b"]);
  });

  test("lists reorder when mounted owners reorder", async () => {
    const outlets = outletsFor(["a", "b", "c"]);
    const placement = { a: ["X"], b: ["Y"], c: ["Z"] };
    const { rerender } = await renderTree(
      <Scene outlets={outlets} placement={placement} />,
    );
    const node = screen.getByRole("option", { name: "Y" });

    await rerender(
      <Scene
        outlets={outlets}
        placement={placement}
        owners={["c", "b", "a"]}
      />,
    );
    expect(listOrder()).toEqual(["c", "b", "a"]);
    expect(screen.getByRole("option", { name: "Y" })).toBe(node);
  });

  test("a list leaves and hides with its owner", async () => {
    const outlets = outletsFor(["a", "b"]);
    const placement = { a: ["X"], b: ["Y"] };
    function App({ mode, b }: { mode: "visible" | "hidden"; b: boolean }) {
      return (
        <TestProvider>
          <A11yTreeMirror lists={listsOf(outlets, placement)}>
            <Activity mode={mode}>
              <A11yTreeOutlet outlet={outlets.a} />
            </Activity>
            {b && <A11yTreeOutlet outlet={outlets.b} />}
            <Items keys={["X", "Y"]} />
          </A11yTreeMirror>
        </TestProvider>
      );
    }
    const { rerender } = await renderTree(<App mode="visible" b={true} />);
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(<App mode="hidden" b={false} />);
    expect(
      screen.queryByRole("listbox", { name: "b" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Y 0" }),
    ).not.toBeInTheDocument();
    expect(button).not.toBeVisible();

    await rerender(<App mode="visible" b={false} />);
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
    expect(button).toBeVisible();
  });

  test("a node moved to a hidden list hides with it", async () => {
    const outlets = outletsFor(["a", "b"]);
    function App({
      placement,
      mode,
    }: {
      placement: Placement;
      mode: "visible" | "hidden";
    }) {
      return (
        <TestProvider>
          <A11yTreeMirror
            lists={listsOf(outlets, placement)}
            renderNode={option}
          >
            <A11yTreeOutlet outlet={outlets.a} />
            <Activity mode={mode}>
              <A11yTreeOutlet outlet={outlets.b} />
            </Activity>
            <Items keys={["X", "Y"]} />
          </A11yTreeMirror>
        </TestProvider>
      );
    }
    const { rerender } = await renderTree(
      <App placement={{ a: ["X", "Y"], b: [] }} mode="visible" />,
    );
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(<App placement={{ a: ["X", "Y"], b: [] }} mode="hidden" />);
    await rerender(<App placement={{ a: ["Y"], b: ["X"] }} mode="hidden" />);
    expect(labelsIn("a")).toEqual(["Y"]);
    expect(button).not.toBeVisible();

    await rerender(<App placement={{ a: ["Y"], b: ["X"] }} mode="visible" />);
    expect(labelsIn("b")).toEqual(["X"]);
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
    expect(button).toBeVisible();
  });

  test("lists below a container render in its wrapper; containers follow owner order", async () => {
    const outlets = outletsFor(["a", "b", "c"]);
    const placement = { a: ["X"], b: ["Y"], c: ["Z"] };
    function Group({ name, ids }: { name: string; ids: string[] }) {
      return (
        <A11yTreeContainer
          render={(content) => (
            <div role="group" aria-label={name}>
              {content}
            </div>
          )}
        >
          <Owners ids={ids} outlets={outlets} />
        </A11yTreeContainer>
      );
    }
    function App({ swap }: { swap: boolean }) {
      const groups = [
        <Group key="one" name="one" ids={["a", "b"]} />,
        <Group key="two" name="two" ids={["c"]} />,
      ];
      return (
        <TestProvider>
          <A11yTreeMirror lists={listsOf(outlets, placement)}>
            {swap ? groups.reverse() : groups}
            <Items keys={["X", "Y", "Z"]} />
          </A11yTreeMirror>
        </TestProvider>
      );
    }
    const { rerender } = await renderTree(<App swap={false} />);
    const one = screen.getByRole("group", { name: "one" });
    expect(
      within(one)
        .getAllByRole("listbox")
        .map((list) => list.getAttribute("aria-label")),
    ).toEqual(["a", "b"]);
    expect(screen.getByRole("group", { name: "two" })).toContainElement(
      screen.getByRole("listbox", { name: "c" }),
    );

    await rerender(<App swap={true} />);
    expect(
      screen
        .getAllByRole("group")
        .map((group) => group.getAttribute("aria-label")),
    ).toEqual(["two", "one"]);
  });
});

describe("A11yTreeMirror context", () => {
  const ListName = createContext("none");
  const Extra = createContext("none");
  const SceneName = createContext("none");

  function Reader({ label }: { label: string }) {
    return (
      <div role="option" aria-label={label}>
        {label} {use(ListName)} {use(SceneName)}
      </div>
    );
  }
  const reader: A11yTreeMirrorRenderNode<NodeProps> = (content, { label }) => (
    <>
      <Reader label={label} />
      {content}
    </>
  );

  /** Wrappers providing the list's name; `extra` lists add a context. */
  function namedLists(extra: string[]) {
    const renders = new Map<string, RenderList>();
    return (id: string) => {
      let render = renders.get(id);
      if (!render) {
        render = (List) => {
          const list = (
            <ListName value={id}>
              <List role="listbox" aria-label={id} />
            </ListName>
          );
          return extra.includes(id) ? <Extra value={id}>{list}</Extra> : list;
        };
        renders.set(id, render);
      }
      return render;
    };
  }

  function App({
    outlets,
    placement,
    render,
    grouped = [],
  }: {
    outlets: Outlets;
    placement: Placement;
    render: (id: string) => RenderList;
    grouped?: string[];
  }) {
    const ids = Object.keys(placement);
    return (
      <TestProvider>
        <SceneName value="scene">
          <A11yTreeMirror
            lists={listsOf(outlets, placement, render)}
            renderNode={reader}
          >
            <A11yTreeContainer
              render={(content) => <div role="group">{content}</div>}
            >
              <Owners
                ids={ids.filter((id) => grouped.includes(id))}
                outlets={outlets}
              />
            </A11yTreeContainer>
            <Owners
              ids={ids.filter((id) => !grouped.includes(id))}
              outlets={outlets}
            />
            <Items keys={keysOf(placement)} />
          </A11yTreeMirror>
        </SceneName>
      </TestProvider>
    );
  }

  test("a node reads the contexts above its current list", async () => {
    const outlets = outletsFor(["a", "b"]);
    const render = namedLists([]);
    const { rerender } = await renderTree(
      <App outlets={outlets} placement={{ a: ["X"], b: [] }} render={render} />,
    );
    expect(screen.getByRole("option", { name: "X" })).toHaveTextContent(
      "X a scene",
    );

    await rerender(
      <App outlets={outlets} placement={{ a: [], b: ["X"] }} render={render} />,
    );
    expect(screen.getByRole("option", { name: "X" })).toHaveTextContent(
      "X b scene",
    );
  });

  test("a move between same-shaped lists keeps the node mounted", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outlets = outletsFor(["a", "b"]);
    const render = namedLists([]);
    const { rerender } = await renderTree(
      <App
        outlets={outlets}
        placement={{ a: ["X"], b: [] }}
        render={render}
        grouped={["a"]}
      />,
    );
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(
      <App
        outlets={outlets}
        placement={{ a: [], b: ["X"] }}
        render={render}
        grouped={["a"]}
      />,
    );
    expect(screen.getByRole("option", { name: "X" })).toHaveTextContent(
      "X b scene",
    );
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  test("a move between lists with different contexts keeps the node mounted", async () => {
    const consoleWarn = vi.spyOn(console, "warn");
    const outlets = outletsFor(["a", "b"]);
    const render = namedLists(["b"]);
    const { rerender } = await renderTree(
      <App outlets={outlets} placement={{ a: ["X"], b: [] }} render={render} />,
    );
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(
      <App outlets={outlets} placement={{ a: [], b: ["X"] }} render={render} />,
    );
    expect(screen.getByRole("option", { name: "X" })).toHaveTextContent(
      "X b scene",
    );
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);

    await rerender(
      <App outlets={outlets} placement={{ a: ["X"], b: [] }} render={render} />,
    );
    expect(screen.getByRole("option", { name: "X" })).toHaveTextContent(
      "X a scene",
    );
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  test("a list mounting with a context new to the mirror remounts mounted nodes once, and dev warns", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const outlets = outletsFor(["a", "b"]);
    const render = namedLists(["b"]);
    const app = (owners: string[]) => (
      <TestProvider>
        <A11yTreeMirror
          lists={listsOf(outlets, { a: ["X"], b: [] }, render)}
          renderNode={reader}
        >
          <Owners ids={owners} outlets={outlets} />
          <Items keys={["X"]} />
        </A11yTreeMirror>
      </TestProvider>
    );
    const { rerender } = await renderTree(app(["a"]));
    fireEvent.click(screen.getByRole("button", { name: "X 0" }));
    await flush();

    await rerender(app(["a", "b"]));
    expect(screen.getByRole("button", { name: "X 0" })).toBeInTheDocument();
    expect(consoleWarn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining("providers changed"),
    ]);
  });

  test("a move between a StrictMode list and a loose list keeps the node mounted", async () => {
    const consoleWarn = vi.spyOn(console, "warn");
    const outlets = outletsFor(["a", "b"]);
    const renders: Record<string, RenderList> = {
      a: (List) => (
        <ListName value="a">
          <List role="listbox" aria-label="a" />
        </ListName>
      ),
      b: (List) => (
        <StrictMode>
          <ListName value="b">
            <List role="listbox" aria-label="b" />
          </ListName>
        </StrictMode>
      ),
    };
    const { rerender } = await renderTree(
      <App
        outlets={outlets}
        placement={{ a: ["X"], b: [] }}
        render={(id) => renders[id]}
      />,
    );
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(
      <App
        outlets={outlets}
        placement={{ a: [], b: ["X"] }}
        render={(id) => renders[id]}
      />,
    );
    expect(screen.getByRole("option", { name: "X" })).toHaveTextContent(
      "X b scene",
    );
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
    expect(consoleWarn).not.toHaveBeenCalled();
  });

  test("a node reads the providers at its list's outlet", async () => {
    const outlets = outletsFor(["a", "b"]);
    const render = namedLists([]);
    const app = (placement: Placement) => (
      <TestProvider>
        <SceneName value="scene">
          <A11yTreeMirror
            lists={listsOf(outlets, placement, render)}
            renderNode={reader}
          >
            <A11yTreeOutlet outlet={outlets.a} />
            <SceneName value="owner b">
              <A11yTreeOutlet outlet={outlets.b} />
            </SceneName>
            <Items keys={keysOf(placement)} />
          </A11yTreeMirror>
        </SceneName>
      </TestProvider>
    );
    const { rerender } = await renderTree(app({ a: ["X"], b: [] }));
    expect(screen.getByRole("option", { name: "X" })).toHaveTextContent(
      "X a scene",
    );

    await rerender(app({ a: [], b: ["X"] }));
    expect(screen.getByRole("option", { name: "X" })).toHaveTextContent(
      "X b owner b",
    );
  });
});

describe.each([
  { mode: "", wrap: (node: ReactNode) => node, rendersPerUpdate: 1 },
  {
    mode: " under StrictMode",
    wrap: (node: ReactNode) => <StrictMode>{node}</StrictMode>,
    rendersPerUpdate: 2,
  },
])("A11yTreeMirror render isolation$mode", ({ wrap, rendersPerUpdate }) => {
  type OnRender = (name: string) => void;

  function Probe({ name, onRender }: { name: string; onRender: OnRender }) {
    "use no memo";
    onRender(name);
    return null;
  }

  function rendersOf(onRender: Mock<OnRender>, name: string) {
    return onRender.mock.calls.filter(([id]) => id === name).length;
  }

  async function setup(initial: Placement) {
    const onRender = vi.fn<OnRender>();
    const outlets = outletsFor(Object.keys(initial));
    const renderNode: A11yTreeMirrorRenderNode<NodeProps> = (
      content,
      { label },
    ) => (
      <div role="option" aria-label={label}>
        <Probe name={label} onRender={onRender} />
        {content}
      </div>
    );
    const scene = (placement: Placement) =>
      wrap(
        <Scene
          outlets={outlets}
          placement={placement}
          owners={Object.keys(initial)}
          renderNode={renderNode}
        />,
      );
    const { rerender } = await renderTree(scene(initial));
    return {
      onRender,
      update: (placement: Placement) => rerender(scene(placement)),
    };
  }

  test("an unmoved node renders once across another node's move", async () => {
    const { onRender, update } = await setup({ a: ["X", "Y"], b: [] });
    const before = rendersOf(onRender, "Y");

    await update({ a: ["Y"], b: ["X"] });
    expect(labelsIn("b")).toEqual(["X"]);
    expect(rendersOf(onRender, "Y")).toBe(before);
  });

  test("a cross-list move renders no node content", async () => {
    const { onRender, update } = await setup({ a: ["X"], b: [] });
    const before = rendersOf(onRender, "X");

    await update({ a: [], b: ["X"] });
    expect(labelsIn("b")).toEqual(["X"]);
    expect(rendersOf(onRender, "X")).toBe(before);
  });

  test("a reorder renders no node", async () => {
    const { onRender, update } = await setup({ a: ["X", "Y"] });
    const before = onRender.mock.calls.length;

    await update({ a: ["Y", "X"] });
    expect(labelsIn("a")).toEqual(["Y", "X"]);
    expect(onRender.mock.calls.length).toBe(before);
  });

  test("a props change renders only that node", async () => {
    const onRender = vi.fn<OnRender>();
    const outlets = outletsFor(["a"]);
    type ToneProps = NodeProps & { tone: string };
    const renderNode: A11yTreeMirrorRenderNode<ToneProps> = (
      content,
      { label, tone },
    ) => (
      <div role="option" aria-label={label} data-tone={tone}>
        <Probe name={label} onRender={onRender} />
        {content}
      </div>
    );
    const app = (tone: string) =>
      wrap(
        <TestProvider>
          <A11yTreeMirror
            lists={[
              {
                id: "a",
                outlet: outlets.a,
                nodes: ["X", "Y"].map((key) => ({
                  key,
                  props: { label: key, tone: key === "X" ? tone : "plain" },
                })),
                render: listbox("a"),
              },
            ]}
            renderNode={renderNode}
          >
            <Owners ids={["a"]} outlets={outlets} />
            <Items keys={["X", "Y"]} />
          </A11yTreeMirror>
        </TestProvider>,
      );
    const { rerender } = await renderTree(app("plain"));
    onRender.mockClear();

    await rerender(app("bold"));
    expect(screen.getByRole("option", { name: "X" })).toHaveAttribute(
      "data-tone",
      "bold",
    );
    expect(rendersOf(onRender, "X")).toBe(rendersPerUpdate);
    expect(rendersOf(onRender, "Y")).toBe(0);
  });

  test("a list's render change renders its wrapper and no node", async () => {
    const onRender = vi.fn<OnRender>();
    const outlets = outletsFor(["a"]);
    const renderNode: A11yTreeMirrorRenderNode<NodeProps> = (
      content,
      { label },
    ) => (
      <div role="option" aria-label={label}>
        <Probe name={label} onRender={onRender} />
        {content}
      </div>
    );
    const titled: RenderList = (List) => (
      <List role="listbox" aria-label="a" title="titled" />
    );
    const app = (render: RenderList) =>
      wrap(
        <TestProvider>
          <A11yTreeMirror
            lists={[
              {
                id: "a",
                outlet: outlets.a,
                nodes: [{ key: "X", props: { label: "X" } }],
                render,
              },
            ]}
            renderNode={renderNode}
          >
            <Owners ids={["a"]} outlets={outlets} />
            <Items keys={["X"]} />
          </A11yTreeMirror>
        </TestProvider>,
      );
    const { rerender } = await renderTree(app(listbox("a")));
    const node = screen.getByRole("option", { name: "X" });
    const list = screen.getByRole("listbox", { name: "a" });
    onRender.mockClear();

    await rerender(app(titled));
    expect(screen.getByRole("listbox", { name: "a" })).toBe(list);
    expect(list).toHaveAttribute("title", "titled");
    expect(screen.getByRole("option", { name: "X" })).toBe(node);
    expect(onRender).not.toHaveBeenCalled();
  });

  test("a node move renders no list", async () => {
    const outlets = outletsFor(["a", "b"]);
    const renders = {
      a: vi.fn<RenderList>((List) => <List role="listbox" aria-label="a" />),
      b: vi.fn<RenderList>((List) => <List role="listbox" aria-label="b" />),
    };
    const app = (placement: Placement) =>
      wrap(
        <TestProvider>
          <A11yTreeMirror
            lists={listsOf(
              outlets,
              placement,
              (id) => renders[id as "a" | "b"],
            )}
            renderNode={option}
          >
            <Owners ids={["a", "b"]} outlets={outlets} />
            <Items keys={["X", "Y"]} />
          </A11yTreeMirror>
        </TestProvider>,
      );
    const { rerender } = await renderTree(app({ a: ["X", "Y"], b: [] }));
    renders.a.mockClear();
    renders.b.mockClear();

    await rerender(app({ a: ["Y"], b: ["X"] }));
    await rerender(app({ a: [], b: ["Y", "X"] }));
    expect(labelsIn("b")).toEqual(["Y", "X"]);
    expect(renders.a).not.toHaveBeenCalled();
    expect(renders.b).not.toHaveBeenCalled();
  });

  test("a list hidden and shown renders no node", async () => {
    const onRender = vi.fn<OnRender>();
    const outlets = outletsFor(["a"]);
    const renderNode: A11yTreeMirrorRenderNode<NodeProps> = (
      content,
      { label },
    ) => (
      <div role="option" aria-label={label}>
        <Probe name={label} onRender={onRender} />
        {content}
      </div>
    );
    const app = (mode: "visible" | "hidden") =>
      wrap(
        <TestProvider>
          <A11yTreeMirror
            lists={listsOf(outlets, { a: ["X"] })}
            renderNode={renderNode}
          >
            <Activity mode={mode}>
              <A11yTreeOutlet outlet={outlets.a} />
            </Activity>
            <Items keys={["X"]} />
          </A11yTreeMirror>
        </TestProvider>,
      );
    const { rerender } = await renderTree(app("visible"));
    onRender.mockClear();

    await rerender(app("hidden"));
    await rerender(app("visible"));
    expect(labelsIn("a")).toEqual(["X"]);
    expect(onRender).not.toHaveBeenCalled();
  });

  test("a cross-list move at 96 nodes and 8 lists renders no node content", async () => {
    const lists = Array.from({ length: 8 }, (_, list) => `L${list}`);
    const placement = Object.fromEntries(
      lists.map((id, list) => [
        id,
        Array.from({ length: 12 }, (_, node) => `n${list * 12 + node}`),
      ]),
    );
    const { onRender, update } = await setup(placement);
    onRender.mockClear();

    await update({
      ...placement,
      L0: placement.L0.slice(1),
      L1: [...placement.L1, "n0"],
    });
    expect(labelsIn("L1").at(-1)).toBe("n0");
    expect(onRender).not.toHaveBeenCalled();
  });
});

describe("A11yTreeMirror lifecycle", () => {
  const roots = new Set<Root>();
  afterEach(() => {
    act(() => {
      for (const root of roots) root.unmount();
    });
    roots.clear();
  });

  /** A nested react-dom root, like an r3f canvas. */
  function NestedRoot({ children }: { children: ReactNode }) {
    return (
      <FiberAnchor>
        {(bridge) => <RootHost bridge={bridge}>{children}</RootHost>}
      </FiberAnchor>
    );
  }

  function RootHost({
    bridge,
    children,
  }: {
    bridge: ContextBridgeValue;
    children: ReactNode;
  }) {
    const ref = useRef<HTMLDivElement>(null);
    const [root, setRoot] = useState<Root | null>(null);
    useLayoutEffect(() => {
      const created = createRoot(ref.current!);
      roots.add(created);
      setRoot(created);
    }, []);
    useLayoutEffect(() => {
      root?.render(<ContextBridge bridge={bridge}>{children}</ContextBridge>);
    });
    return <div ref={ref} />;
  }

  test("lists and nodes from owners in a nested React root follow its anchor", async () => {
    const outlets = outletsFor(["a", "b", "c"]);
    function App({ placement }: { placement: Placement }) {
      return (
        <TestProvider>
          <A11yTreeOutlet outlet={outlets.a} />
          <NestedRoot>
            <A11yTreeMirror
              lists={listsOf(outlets, placement)}
              renderNode={option}
            >
              <A11yTreeOutlet outlet={outlets.b} />
              <Items keys={keysOf(placement)} />
            </A11yTreeMirror>
          </NestedRoot>
          <A11yTreeOutlet outlet={outlets.c} />
        </TestProvider>
      );
    }
    const { rerender } = await renderTree(
      <App placement={{ c: ["Z"], b: ["X", "Y"], a: [] }} />,
    );
    await flush();
    expect(listOrder()).toEqual(["a", "b", "c"]);
    expect(labelsIn("b")).toEqual(["X", "Y"]);
    const button = screen.getByRole("button", { name: "X 0" });

    await rerender(<App placement={{ c: ["Z", "X"], b: ["Y"], a: [] }} />);
    await flush();
    expect(labelsIn("c")).toEqual(["Z", "X"]);
    expect(screen.getByRole("button", { name: "X 0" })).toBe(button);
  });

  test("a hidden mirror hides its lists and keeps their nodes", async () => {
    const outlets = outletsFor(["a"]);
    function App({ mode }: { mode: "visible" | "hidden" }) {
      return (
        <TestProvider>
          <Activity mode={mode}>
            <A11yTreeMirror
              lists={listsOf(outlets, { a: ["X"] })}
              renderNode={option}
            >
              <Owners ids={["a"]} outlets={outlets} />
              <Items keys={["X"]} />
            </A11yTreeMirror>
          </Activity>
        </TestProvider>
      );
    }
    const { rerender } = await renderTree(<App mode="visible" />);
    const button = screen.getByRole("button", { name: "X 0" });
    fireEvent.click(button);
    await flush();

    await rerender(<App mode="hidden" />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await rerender(<App mode="visible" />);
    expect(labelsIn("a")).toEqual(["X"]);
    expect(screen.getByRole("button", { name: "X 1" })).toBe(button);
    expect(button).toBeVisible();
  });

  test("A11yTreeMirrorIn content hidden while its key enters a list renders in the node once shown", async () => {
    const outlets = outletsFor(["a"]);
    function App({
      placement,
      mode,
    }: {
      placement: Placement;
      mode: "visible" | "hidden";
    }) {
      return (
        <TestProvider>
          <A11yTreeMirror
            lists={listsOf(outlets, placement)}
            renderNode={option}
          >
            <Owners ids={["a"]} outlets={outlets} />
            <Activity mode={mode}>
              <Items keys={["X"]} />
            </Activity>
          </A11yTreeMirror>
        </TestProvider>
      );
    }
    const { rerender } = await renderTree(
      <App placement={{ a: [] }} mode="visible" />,
    );
    await rerender(<App placement={{ a: [] }} mode="hidden" />);
    await rerender(<App placement={{ a: ["X"] }} mode="hidden" />);
    expect(labelsIn("a")).toEqual(["X"]);

    await rerender(<App placement={{ a: ["X"] }} mode="visible" />);
    expect(screen.getByRole("option", { name: "X" })).toContainElement(
      screen.getByRole("button", { name: "X 0" }),
    );
  });

  test("moves, reorders and removals keep identity under StrictMode", async () => {
    const outlets = outletsFor(["a", "b"]);
    const scene = (placement: Placement) => (
      <StrictMode>
        <Scene outlets={outlets} placement={placement} />
      </StrictMode>
    );
    const { rerender } = await renderTree(scene({ a: ["X", "Y", "Z"], b: [] }));
    const button = screen.getByRole("button", { name: "Y 0" });
    fireEvent.click(button);
    await flush();

    await rerender(scene({ a: ["Z", "X"], b: ["Y"] }));
    expect(labelsIn("a")).toEqual(["Z", "X"]);
    expect(labelsIn("b")).toEqual(["Y"]);
    expect(screen.getByRole("button", { name: "Y 1" })).toBe(button);

    await rerender(scene({ a: ["X"], b: ["Y"] }));
    expect(labelsIn("a")).toEqual(["X"]);
    expect(screen.queryByRole("option", { name: "Z" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Y 1" })).toBe(button);
  });

  test("nodes return to their lists after the renderer's error boundary resets", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const outlets = outletsFor(["a"]);
    let shouldThrow = true;
    function Thrower() {
      if (shouldThrow) throw new Error("boom");
      return null;
    }
    function App({ broken }: { broken: boolean }) {
      return (
        <TestProvider>
          <A11yTreeMirror
            lists={listsOf(outlets, { a: ["X", "Y"] })}
            renderNode={option}
          >
            <A11yTreeOutlet outlet={outlets.a} />
            <Items keys={["X", "Y"]} />
            {broken && (
              <A11yTreeElement>
                <Thrower />
              </A11yTreeElement>
            )}
          </A11yTreeMirror>
        </TestProvider>
      );
    }
    const { rerender } = await renderTree(<App broken={false} />);
    await rerender(<App broken={true} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await flush();
    expect(labelsIn("a")).toEqual(["X", "Y"]);
    consoleError.mockRestore();
  });

  test("moves, outlet changes and owner unmounts log no warnings or errors", async () => {
    const consoleWarn = vi.spyOn(console, "warn");
    const consoleError = vi.spyOn(console, "error");
    const outlets = outletsFor(["a", "b", "c"]);
    function App({
      placement,
      aOutlet,
      owners,
    }: {
      placement: Placement;
      aOutlet: string;
      owners: string[];
    }) {
      const lists = listsOf(outlets, placement).map((list) =>
        list.id === "a" ? { ...list, outlet: outlets[aOutlet] } : list,
      );
      return (
        <StrictMode>
          <TestProvider>
            <A11yTreeMirror lists={lists} renderNode={option}>
              <Owners ids={owners} outlets={outlets} />
              <Items keys={keysOf(placement)} />
            </A11yTreeMirror>
          </TestProvider>
        </StrictMode>
      );
    }
    const { rerender } = await renderTree(
      <App
        placement={{ a: ["X", "Y"], b: ["Z"] }}
        aOutlet="a"
        owners={["a", "b", "c"]}
      />,
    );
    await rerender(
      <App
        placement={{ a: ["Y"], b: ["Z", "X"] }}
        aOutlet="a"
        owners={["a", "b", "c"]}
      />,
    );
    await rerender(
      <App
        placement={{ a: ["Y"], b: ["Z", "X"] }}
        aOutlet="c"
        owners={["a", "b", "c"]}
      />,
    );
    expect(labelsIn("a")).toEqual(["Y"]);
    await rerender(
      <App
        placement={{ a: ["Y"], b: ["Z", "X"] }}
        aOutlet="c"
        owners={["a", "c"]}
      />,
    );
    expect(
      screen.queryByRole("listbox", { name: "b" }),
    ).not.toBeInTheDocument();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
    consoleError.mockRestore();
  });
});
