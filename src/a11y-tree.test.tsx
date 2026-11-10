import "@testing-library/jest-dom/vitest";

import { act, fireEvent, screen } from "@testing-library/react";
import {
  createContext,
  memo,
  type ReactNode,
  StrictMode,
  Suspense,
  use,
  useState,
} from "react";
import { describe, expect, test, vi } from "vitest";

import {
  A11yTreeFallbackRenderer,
  A11yTreeProvider,
  A11yTreeRenderer,
} from "./a11y-tree-context";
import { A11yTreeContainer, A11yTreeElement } from "./a11y-tree-element";
import { TestProvider } from "./test/provider";
import { flush, renderTree } from "./test/utils";

describe("A11yTreeProvider", () => {
  test("renders children", async () => {
    await renderTree(
      <TestProvider>
        <div data-testid="child">content</div>
      </TestProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

describe("context bridging", () => {
  const Theme = createContext("none");

  function ThemeLabel({ name }: { name: string }) {
    return (
      <div role="option">
        {name} {use(Theme)}
      </div>
    );
  }

  test("renders a11y content with context provided above its element", async () => {
    await renderTree(
      <TestProvider>
        <Theme value="dark">
          <A11yTreeContainer
            render={(content) => (
              <div role="listbox" aria-label="Hand">
                <ThemeLabel name="container" />
                {content}
              </div>
            )}
          >
            <A11yTreeElement>
              <ThemeLabel name="element" />
            </A11yTreeElement>
          </A11yTreeContainer>
        </Theme>
      </TestProvider>,
    );
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["container dark", "element dark"]);
  });

  test("re-renders only consumers when a bridged value changes", async () => {
    const consumerRendered = vi.fn();
    const otherRendered = vi.fn();
    function Consumer() {
      consumerRendered();
      return <div role="option">consumer {use(Theme)}</div>;
    }
    function Other() {
      otherRendered();
      return <div role="option">other</div>;
    }
    function ThemeToggle({ children }: { children: ReactNode }) {
      const [theme, setTheme] = useState("dark");
      return (
        <Theme value={theme}>
          <button onClick={() => setTheme("light")}>toggle</button>
          {children}
        </Theme>
      );
    }

    await renderTree(
      <TestProvider>
        <ThemeToggle>
          <A11yTreeContainer
            render={(content) => (
              <div role="listbox" aria-label="Hand">
                <Other />
                {content}
              </div>
            )}
          >
            <A11yTreeElement>
              <Consumer />
            </A11yTreeElement>
          </A11yTreeContainer>
        </ThemeToggle>
      </TestProvider>,
    );
    consumerRendered.mockClear();
    otherRendered.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    await flush();
    expect(
      screen.getByRole("option", { name: "consumer light" }),
    ).toBeVisible();
    expect(consumerRendered).toHaveBeenCalledTimes(1);
    expect(otherRendered).not.toHaveBeenCalled();
  });
});

describe("tunnel ordering", () => {
  test("keeps element order when a tunneled element re-renders", async () => {
    function CounterElement({ label }: { label: string }) {
      const [count, setCount] = useState(0);
      return (
        <A11yTreeElement>
          <button onClick={() => setCount((c) => c + 1)}>
            {label} {count}
          </button>
        </A11yTreeElement>
      );
    }

    await renderTree(
      <TestProvider>
        <CounterElement label="First" />
        <CounterElement label="Second" />
        <CounterElement label="Third" />
      </TestProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "First 0" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Second 0" }));
    await flush();

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("First 1");
    expect(buttons[1]).toHaveTextContent("Second 1");
    expect(buttons[2]).toHaveTextContent("Third 0");
  });

  test("keeps element order when elements mount later", async () => {
    function TestComponent({ showFirst }: { showFirst: boolean }) {
      return (
        <TestProvider>
          {showFirst && (
            <A11yTreeElement>
              <button>First</button>
            </A11yTreeElement>
          )}
          <A11yTreeElement>
            <button>Second</button>
          </A11yTreeElement>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(<TestComponent showFirst={false} />);
    await rerender(<TestComponent showFirst={true} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("First");
    expect(buttons[1]).toHaveTextContent("Second");
  });

  test("picks up a reorder of memoized elements on the next tunnel update", async () => {
    const MemoItem = memo(function MemoItem({ label }: { label: string }) {
      return (
        <A11yTreeElement>
          <button>{label}</button>
        </A11yTreeElement>
      );
    });

    function Flusher() {
      const [count, setCount] = useState(0);
      return (
        <A11yTreeElement>
          <button onClick={() => setCount((c) => c + 1)}>flush {count}</button>
        </A11yTreeElement>
      );
    }

    function TestComponent({ order }: { order: string[] }) {
      return (
        <TestProvider>
          {order.map((label) => (
            <MemoItem key={label} label={label} />
          ))}
          <Flusher />
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(
      <TestComponent order={["A", "B", "C"]} />,
    );
    // Memoized items don't re-render on the move; the tunnel's next
    // update re-derives order from the fiber tree.
    await rerender(<TestComponent order={["C", "A", "B"]} />);
    fireEvent.click(screen.getByRole("button", { name: "flush 0" }));
    await flush();

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "C",
      "A",
      "B",
      "flush 1",
    ]);
  });
});

describe("TunnelErrorBoundary", () => {
  test("shows a dismissable non-modal dialog outside the renderer container", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let shouldThrow = true;
    function Boom() {
      if (shouldThrow) {
        throw new Error("boom");
      }
      return <button>Recovered</button>;
    }

    const { container } = await renderTree(
      <TestProvider>
        <A11yTreeElement>
          <Boom />
        </A11yTreeElement>
      </TestProvider>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).not.toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Accessibility tree error: boom",
    );
    // Portaled to document.body, not rendered inside the (hidden) renderer
    expect(container).not.toContainElement(dialog);

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await flush();

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recovered" }),
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });

  test("renders custom fallback instead of the built-in dialog", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let shouldThrow = true;
    function Boom() {
      if (shouldThrow) {
        throw new Error("boom");
      }
      return <button>Recovered</button>;
    }

    const { container } = await renderTree(
      <A11yTreeProvider>
        <A11yTreeElement>
          <Boom />
        </A11yTreeElement>
        <A11yTreeRenderer
          className="a11y-output"
          fallback={({ error, reset }) => (
            <A11yTreeFallbackRenderer portal>
              <div role="status">
                custom: {error?.message}
                <button onClick={reset}>Reset</button>
              </div>
            </A11yTreeFallbackRenderer>
          )}
        />
      </A11yTreeProvider>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("custom: boom");
    // Portaled to document.body by A11yTreeFallbackRenderer
    expect(container).not.toContainElement(status);

    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    await flush();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recovered" }),
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe("A11yTreeElement", () => {
  test("tunnels content to A11yTreeRenderer", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeElement>
          <button>Click me</button>
        </A11yTreeElement>
      </TestProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Click me" }),
    ).toBeInTheDocument();
  });

  test("tunnels multiple elements", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeElement>
          <button>First</button>
        </A11yTreeElement>
        <A11yTreeElement>
          <button>Second</button>
        </A11yTreeElement>
      </TestProvider>,
    );
    expect(screen.getByRole("button", { name: "First" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second" })).toBeInTheDocument();
  });

  test("keeps scene content visible while a11y content suspends", async () => {
    let resolve!: () => void;
    const ready = new Promise<void>((r) => (resolve = r));
    function Label() {
      use(ready);
      return <div role="option">loaded</div>;
    }

    await renderTree(
      <TestProvider>
        <Suspense fallback={<div>scene fallback</div>}>
          <div data-testid="scene" />
          <A11yTreeElement>
            <Label />
          </A11yTreeElement>
        </Suspense>
      </TestProvider>,
    );
    expect(screen.getByTestId("scene")).toBeVisible();
    expect(screen.queryByText("scene fallback")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();

    await act(async () => resolve());
    expect(screen.getByRole("option", { name: "loaded" })).toBeInTheDocument();
  });
});

describe("A11yTreeContainer", () => {
  test("wraps content with render function", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeContainer
          render={(content) => (
            <div role="group" aria-label="container">
              {content}
            </div>
          )}
        >
          <A11yTreeElement>
            <button>Nested</button>
          </A11yTreeElement>
        </A11yTreeContainer>
      </TestProvider>,
    );
    const group = screen.getByRole("group", { name: "container" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nested" })).toBeInTheDocument();
  });

  test("supports nested containers", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeContainer
          render={(content) => (
            <div role="group" aria-label="outer">
              {content}
            </div>
          )}
        >
          <A11yTreeContainer
            render={(content) => (
              <div role="group" aria-label="inner">
                {content}
              </div>
            )}
          >
            <A11yTreeElement>
              <button>Deep</button>
            </A11yTreeElement>
          </A11yTreeContainer>
        </A11yTreeContainer>
      </TestProvider>,
    );
    expect(screen.getByRole("group", { name: "outer" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "inner" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Deep" })).toBeInTheDocument();
  });
});

describe("A11yTreeRenderer visibility warning", () => {
  // jsdom has no ResizeObserver; capture the observe callback to fire
  // it manually against a mocked layout.
  function stubResizeObserver() {
    let trigger: (() => void) | undefined;
    class MockResizeObserver {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe() {
        trigger = () => this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    return () => trigger?.();
  }

  test("warns in dev when the default-class container is visibly rendered", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const triggerResize = stubResizeObserver();

    const { container } = await renderTree(
      <A11yTreeProvider>
        <A11yTreeElement>
          <button>Visible</button>
        </A11yTreeElement>
        <A11yTreeRenderer />
      </A11yTreeProvider>,
    );
    const tree = container.querySelector(".sr-only")!;
    vi.spyOn(tree, "getBoundingClientRect").mockReturnValue({
      width: 120,
      height: 40,
    } as DOMRect);

    await act(async () => triggerResize());

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("A11yTreeRenderer container is visible"),
    );

    vi.unstubAllGlobals();
    consoleWarn.mockRestore();
  });

  test("does not warn when the tree container is hidden", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const triggerResize = stubResizeObserver();

    await renderTree(
      <A11yTreeProvider>
        <A11yTreeElement>
          <button>Hidden</button>
        </A11yTreeElement>
        <A11yTreeRenderer />
      </A11yTreeProvider>,
    );
    // jsdom rects default to 0x0, matching a visually hidden container.
    await act(async () => triggerResize());

    expect(consoleWarn).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    consoleWarn.mockRestore();
  });

  test("does not warn for a custom className, even when visible", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const triggerResize = stubResizeObserver();

    const { container } = await renderTree(
      <TestProvider>
        <A11yTreeElement>
          <button>Visible</button>
        </A11yTreeElement>
      </TestProvider>,
    );
    const tree = container.querySelector(".a11y-output")!;
    vi.spyOn(tree, "getBoundingClientRect").mockReturnValue({
      width: 120,
      height: 40,
    } as DOMRect);

    // Custom classNames are trusted: no observer is attached.
    await act(async () => triggerResize());

    expect(consoleWarn).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    consoleWarn.mockRestore();
  });
});

describe("StrictMode", () => {
  test("tunnels content in order under StrictMode", async () => {
    await renderTree(
      <StrictMode>
        <TestProvider>
          <A11yTreeElement>
            <button>First</button>
          </A11yTreeElement>
          <A11yTreeElement>
            <button>Second</button>
          </A11yTreeElement>
        </TestProvider>
      </StrictMode>,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "First",
      "Second",
    ]);
  });
});

describe("A11yTreeRenderer multiple renderers", () => {
  test("each renderer renders a copy and a second one logs a dev error", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    function App({ second }: { second: boolean }) {
      return (
        <A11yTreeProvider>
          <A11yTreeElement>
            <button>Tunneled</button>
          </A11yTreeElement>
          <A11yTreeRenderer className="out-a" />
          {second && <A11yTreeRenderer className="out-b" />}
        </A11yTreeProvider>
      );
    }

    const { container, rerender } = await renderTree(<App second={false} />);
    expect(consoleError).not.toHaveBeenCalled();

    await rerender(<App second={true} />);
    expect(container.querySelector(".out-a button")).toBeInTheDocument();
    expect(container.querySelector(".out-b button")).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });
});
