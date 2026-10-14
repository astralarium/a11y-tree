import "@testing-library/jest-dom/vitest";

import {
  act,
  fireEvent,
  render,
  type RenderResult,
  screen,
  within,
} from "@testing-library/react";
import {
  createContext,
  memo,
  type ReactNode,
  StrictMode,
  Suspense,
  use,
  useState,
} from "react";
import { describe, expect, type Mock, test, vi } from "vitest";

import {
  A11yTreeFallbackRenderer,
  A11yTreeProvider,
  A11yTreeRenderer,
} from "./a11y-tree-context";
import { A11yTreeContainer, A11yTreeElement } from "./a11y-tree-element";
import {
  A11yTreeMultiplexer,
  A11yTreeSlot,
  A11yTreeSlotGroup,
  A11yTreeSlotIn,
} from "./a11y-tree-multiplexer";
import { useA11yTunnel } from "./use-a11y-tunnel";

const flush = () => act(async () => {});

/** Renders `ui` and settles tunnel content; `rerender` settles too. */
async function renderTree(ui: ReactNode) {
  let result!: RenderResult;
  await act(async () => {
    result = render(ui);
  });
  return {
    ...result,
    rerender: (next: ReactNode) => act(async () => result.rerender(next)),
  };
}

function TestProvider({ children }: { children: ReactNode }) {
  return (
    <A11yTreeProvider>
      {children}
      <A11yTreeRenderer className="a11y-output" />
    </A11yTreeProvider>
  );
}

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

  test("keeps slot content state when a holder moves between slots", async () => {
    function Counter({ name }: { name: string }) {
      const [count, setCount] = useState(0);
      return (
        <button onClick={() => setCount((c) => c + 1)}>
          {name} {count}
        </button>
      );
    }
    const renders = {
      X: (
        <A11yTreeElement>
          <div role="option">X</div>
        </A11yTreeElement>
      ),
      Y: (
        <A11yTreeElement>
          <Counter name="Y" />
        </A11yTreeElement>
      ),
    };
    function TestComponent({ xSlot }: { xSlot: string }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={[
              { key: "X", slotId: xSlot, render: renders.X },
              { key: "Y", slotId: "a", render: renders.Y },
            ]}
          >
            {["a", "b"].map((id) => (
              <A11yTreeSlot
                key={id}
                id={id}
                render={(content) => (
                  <div role="listbox" aria-label={id}>
                    <Counter name={id} />
                    {content}
                  </div>
                )}
              />
            ))}
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(<TestComponent xSlot="a" />);
    fireEvent.click(screen.getByRole("button", { name: "a 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Y 0" }));
    await flush();

    await rerender(<TestComponent xSlot="b" />);
    expect(screen.getByRole("listbox", { name: "b" })).toHaveTextContent("X");
    const slotA = screen.getByRole("listbox", { name: "a" });
    expect(within(slotA).getByRole("button", { name: "a 1" })).toBeVisible();
    expect(within(slotA).getByRole("button", { name: "Y 1" })).toBeVisible();
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

describe("A11yTreeMultiplexer", () => {
  test("renders slot content via items and A11yTreeSlot", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeMultiplexer
          items={[
            {
              slotId: "slot-1",
              render: (
                <A11yTreeElement>
                  <div role="option">Item 1</div>
                </A11yTreeElement>
              ),
            },
          ]}
        >
          <A11yTreeSlot
            id="slot-1"
            render={(content) => (
              <div role="listbox" aria-label="slot-1">
                {content}
              </div>
            )}
          />
        </A11yTreeMultiplexer>
      </TestProvider>,
    );
    expect(screen.getByRole("listbox", { name: "slot-1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item 1" })).toBeInTheDocument();
  });

  test("renders multiple items in same slot", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeMultiplexer
          items={[
            {
              key: "a",
              slotId: "slot-1",
              render: (
                <A11yTreeElement>
                  <div role="option">Item A</div>
                </A11yTreeElement>
              ),
            },
            {
              key: "b",
              slotId: "slot-1",
              render: (
                <A11yTreeElement>
                  <div role="option">Item B</div>
                </A11yTreeElement>
              ),
            },
          ]}
        >
          <A11yTreeSlot
            id="slot-1"
            render={(content) => (
              <div role="listbox" aria-label="slot-1">
                {content}
              </div>
            )}
          />
        </A11yTreeMultiplexer>
      </TestProvider>,
    );
    expect(screen.getByRole("option", { name: "Item A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item B" })).toBeInTheDocument();
  });

  test("renders multiple slots independently", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeMultiplexer
          items={[
            {
              key: "1",
              slotId: "slot-1",
              render: (
                <A11yTreeElement>
                  <div role="option">In Slot 1</div>
                </A11yTreeElement>
              ),
            },
            {
              key: "2",
              slotId: "slot-2",
              render: (
                <A11yTreeElement>
                  <div role="option">In Slot 2</div>
                </A11yTreeElement>
              ),
            },
          ]}
        >
          <A11yTreeSlot
            id="slot-1"
            render={(content) => (
              <div role="listbox" aria-label="slot-1">
                {content}
              </div>
            )}
          />
          <A11yTreeSlot
            id="slot-2"
            render={(content) => (
              <div role="listbox" aria-label="slot-2">
                {content}
              </div>
            )}
          />
        </A11yTreeMultiplexer>
      </TestProvider>,
    );
    const slot1 = screen.getByRole("listbox", { name: "slot-1" });
    const slot2 = screen.getByRole("listbox", { name: "slot-2" });
    expect(slot1).toContainElement(
      screen.getByRole("option", { name: "In Slot 1" }),
    );
    expect(slot2).toContainElement(
      screen.getByRole("option", { name: "In Slot 2" }),
    );
  });

  test("A11yTreeSlot does not render until item creates the slot", async () => {
    function TestComponent({ showInput }: { showInput: boolean }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={
              showInput
                ? [
                    {
                      slotId: "lazy-slot",
                      render: (
                        <A11yTreeElement>
                          <div role="option">Lazy Item</div>
                        </A11yTreeElement>
                      ),
                    },
                  ]
                : []
            }
          >
            <A11yTreeSlot
              id="lazy-slot"
              render={(content) => (
                <div role="listbox" aria-label="lazy-slot">
                  {content}
                </div>
              )}
            />
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(<TestComponent showInput={false} />);
    expect(
      screen.queryByRole("listbox", { name: "lazy-slot" }),
    ).not.toBeInTheDocument();

    await rerender(<TestComponent showInput={true} />);
    expect(
      screen.getByRole("listbox", { name: "lazy-slot" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Lazy Item" }),
    ).toBeInTheDocument();
  });
});

describe("A11yTreeMultiplexer slot mutations", () => {
  test("handles slot removal when all inputs unmount", async () => {
    function TestComponent({ items }: { items: string[] }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={items.map((item) => ({
              key: item,
              slotId: "dynamic-slot",
              render: (
                <A11yTreeElement>
                  <div role="option">{item}</div>
                </A11yTreeElement>
              ),
            }))}
          >
            <A11yTreeSlot
              id="dynamic-slot"
              render={(content) => (
                <div role="listbox" aria-label="dynamic-slot">
                  {content}
                </div>
              )}
            />
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(
      <TestComponent items={["A", "B", "C"]} />,
    );
    expect(screen.getByRole("option", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "C" })).toBeInTheDocument();

    await rerender(<TestComponent items={[]} />);
    expect(
      screen.queryByRole("listbox", { name: "dynamic-slot" }),
    ).not.toBeInTheDocument();
  });

  test("handles rapid slot additions and removals", async () => {
    function TestComponent({ items }: { items: string[] }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={items.map((item) => ({
              key: item,
              slotId: "rapid-slot",
              render: (
                <A11yTreeElement>
                  <div role="option">{item}</div>
                </A11yTreeElement>
              ),
            }))}
          >
            <A11yTreeSlot
              id="rapid-slot"
              render={(content) => (
                <div role="listbox" aria-label="rapid-slot">
                  {content}
                </div>
              )}
            />
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(<TestComponent items={["1"]} />);
    expect(screen.getByRole("option", { name: "1" })).toBeInTheDocument();

    await rerender(<TestComponent items={["1", "2", "3"]} />);
    expect(screen.getByRole("option", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3" })).toBeInTheDocument();

    await rerender(<TestComponent items={["2"]} />);
    expect(screen.queryByRole("option", { name: "1" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "3" })).not.toBeInTheDocument();
  });

  test("handles item reordering within a slot", async () => {
    function TestComponent({ items }: { items: string[] }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={items.map((item) => ({
              key: item,
              slotId: "reorder-slot",
              render: (
                <A11yTreeElement>
                  <div role="option">{item}</div>
                </A11yTreeElement>
              ),
            }))}
          >
            <A11yTreeSlot
              id="reorder-slot"
              render={(content) => (
                <div role="listbox" aria-label="reorder-slot">
                  {content}
                </div>
              )}
            />
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(
      <TestComponent items={["A", "B", "C"]} />,
    );
    let options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("A");
    expect(options[1]).toHaveTextContent("B");
    expect(options[2]).toHaveTextContent("C");

    await rerender(<TestComponent items={["C", "A", "B"]} />);
    options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("C");
    expect(options[1]).toHaveTextContent("A");
    expect(options[2]).toHaveTextContent("B");
  });

  test("handles item movement between slots", async () => {
    function TestComponent({
      slot1Items,
      slot2Items,
    }: {
      slot1Items: string[];
      slot2Items: string[];
    }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={[
              ...slot1Items.map((item) => ({
                key: `s1-${item}`,
                slotId: "slot-1",
                render: (
                  <A11yTreeElement>
                    <div role="option">{item}</div>
                  </A11yTreeElement>
                ),
              })),
              ...slot2Items.map((item) => ({
                key: `s2-${item}`,
                slotId: "slot-2",
                render: (
                  <A11yTreeElement>
                    <div role="option">{item}</div>
                  </A11yTreeElement>
                ),
              })),
            ]}
          >
            <A11yTreeSlot
              id="slot-1"
              render={(content) => (
                <div role="listbox" aria-label="slot-1">
                  {content}
                </div>
              )}
            />
            <A11yTreeSlot
              id="slot-2"
              render={(content) => (
                <div role="listbox" aria-label="slot-2">
                  {content}
                </div>
              )}
            />
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(
      <TestComponent slot1Items={["A", "B"]} slot2Items={["C"]} />,
    );
    let slot1 = screen.getByRole("listbox", { name: "slot-1" });
    let slot2 = screen.getByRole("listbox", { name: "slot-2" });
    expect(slot1).toContainElement(screen.getByRole("option", { name: "A" }));
    expect(slot1).toContainElement(screen.getByRole("option", { name: "B" }));
    expect(slot2).toContainElement(screen.getByRole("option", { name: "C" }));

    await rerender(
      <TestComponent slot1Items={["A"]} slot2Items={["B", "C"]} />,
    );
    slot1 = screen.getByRole("listbox", { name: "slot-1" });
    slot2 = screen.getByRole("listbox", { name: "slot-2" });
    expect(slot1.querySelectorAll("[role='option']")).toHaveLength(1);
    expect(slot2.querySelectorAll("[role='option']")).toHaveLength(2);
  });

  test("handles simultaneous add and remove in different slots", async () => {
    function TestComponent({ slots }: { slots: Record<string, string[]> }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={Object.entries(slots).flatMap(([slotId, items]) =>
              items.map((item) => ({
                key: `${slotId}-${item}`,
                slotId,
                render: (
                  <A11yTreeElement>
                    <div role="option">{item}</div>
                  </A11yTreeElement>
                ),
              })),
            )}
          >
            {Object.keys(slots).map((slotId) => (
              <A11yTreeSlot
                key={`out-${slotId}`}
                id={slotId}
                render={(content) => (
                  <div role="listbox" aria-label={slotId}>
                    {content}
                  </div>
                )}
              />
            ))}
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(
      <TestComponent
        slots={{
          "slot-a": ["1", "2"],
          "slot-b": ["3", "4"],
          "slot-c": ["5"],
        }}
      />,
    );

    expect(screen.getByRole("listbox", { name: "slot-a" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "slot-b" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "slot-c" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(5);

    await rerender(
      <TestComponent
        slots={{
          "slot-a": ["1", "2", "6"],
          "slot-b": [],
          "slot-c": ["5", "7"],
        }}
      />,
    );

    expect(screen.getByRole("listbox", { name: "slot-a" })).toBeInTheDocument();
    expect(
      screen.queryByRole("listbox", { name: "slot-b" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "slot-c" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(5);
    expect(screen.getByRole("option", { name: "6" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "7" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "3" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "4" })).not.toBeInTheDocument();
  });

  test("handles slot id changes", async () => {
    function TestComponent({ slotId }: { slotId: string }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={[
              {
                slotId,
                render: (
                  <A11yTreeElement>
                    <div role="option">Moving Item</div>
                  </A11yTreeElement>
                ),
              },
            ]}
          >
            <A11yTreeSlot
              id="slot-alpha"
              render={(content) => (
                <div role="listbox" aria-label="slot-alpha">
                  {content}
                </div>
              )}
            />
            <A11yTreeSlot
              id="slot-beta"
              render={(content) => (
                <div role="listbox" aria-label="slot-beta">
                  {content}
                </div>
              )}
            />
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(
      <TestComponent slotId="slot-alpha" />,
    );
    expect(
      screen.getByRole("listbox", { name: "slot-alpha" }),
    ).toContainElement(screen.getByRole("option", { name: "Moving Item" }));
    expect(
      screen.queryByRole("listbox", { name: "slot-beta" }),
    ).not.toBeInTheDocument();

    await rerender(<TestComponent slotId="slot-beta" />);

    expect(
      screen.queryByRole("listbox", { name: "slot-alpha" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "slot-beta" })).toContainElement(
      screen.getByRole("option", { name: "Moving Item" }),
    );
  });
});

describe("A11yTreeSlotGroup", () => {
  test("groups multiple slots under a wrapper", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeMultiplexer
          items={[
            {
              key: "card1",
              slotId: "hand",
              render: (
                <A11yTreeElement>
                  <div role="option">Card 1</div>
                </A11yTreeElement>
              ),
            },
            {
              key: "card2",
              slotId: "deck",
              render: (
                <A11yTreeElement>
                  <div role="option">Card 2</div>
                </A11yTreeElement>
              ),
            },
          ]}
        >
          <A11yTreeSlotGroup
            render={(content) => (
              <div role="group" aria-label="card-group">
                {content}
              </div>
            )}
          >
            <A11yTreeSlot
              id="hand"
              render={(content) => (
                <div role="listbox" aria-label="hand">
                  {content}
                </div>
              )}
            />
            <A11yTreeSlot
              id="deck"
              render={(content) => (
                <div role="listbox" aria-label="deck">
                  {content}
                </div>
              )}
            />
          </A11yTreeSlotGroup>
        </A11yTreeMultiplexer>
      </TestProvider>,
    );

    const group = screen.getByRole("group", { name: "card-group" });
    expect(group).toBeInTheDocument();
    expect(group).toContainElement(
      screen.getByRole("listbox", { name: "hand" }),
    );
    expect(group).toContainElement(
      screen.getByRole("listbox", { name: "deck" }),
    );
  });

  test("orders slots by tree position, not registration order", async () => {
    const handItem = {
      key: "h",
      slotId: "hand",
      render: (
        <A11yTreeElement>
          <div role="option">Hand Card</div>
        </A11yTreeElement>
      ),
    };
    const deckItem = {
      key: "d",
      slotId: "deck",
      render: (
        <A11yTreeElement>
          <div role="option">Deck Card</div>
        </A11yTreeElement>
      ),
    };

    function TestComponent({
      items,
    }: {
      items: (typeof handItem | typeof deckItem)[];
    }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer items={items}>
            <A11yTreeSlotGroup
              render={(content) => (
                <div role="group" aria-label="card-group">
                  {content}
                </div>
              )}
            >
              <A11yTreeSlot
                id="hand"
                render={(content) => (
                  <div role="listbox" aria-label="hand">
                    {content}
                  </div>
                )}
              />
              <A11yTreeSlot
                id="deck"
                render={(content) => (
                  <div role="listbox" aria-label="deck">
                    {content}
                  </div>
                )}
              />
            </A11yTreeSlotGroup>
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    // Deck's slot mounts and registers first; hand's slot appears only
    // when its item arrives. Tree order must still win.
    const { rerender } = await renderTree(<TestComponent items={[deckItem]} />);
    expect(screen.getByRole("listbox", { name: "deck" })).toBeInTheDocument();
    expect(
      screen.queryByRole("listbox", { name: "hand" }),
    ).not.toBeInTheDocument();

    await rerender(<TestComponent items={[deckItem, handItem]} />);

    const listboxes = screen.getAllByRole("listbox");
    expect(
      listboxes.map((listbox) => listbox.getAttribute("aria-label")),
    ).toEqual(["hand", "deck"]);
  });

  test("handles dynamic slots within a group", async () => {
    function TestComponent({ showDeck }: { showDeck: boolean }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={[
              {
                key: "hand-card",
                slotId: "hand",
                render: (
                  <A11yTreeElement>
                    <div role="option">Hand Card</div>
                  </A11yTreeElement>
                ),
              },
              ...(showDeck
                ? [
                    {
                      key: "deck-card",
                      slotId: "deck",
                      render: (
                        <A11yTreeElement>
                          <div role="option">Deck Card</div>
                        </A11yTreeElement>
                      ),
                    },
                  ]
                : []),
            ]}
          >
            <A11yTreeSlotGroup
              render={(content) => (
                <div role="group" aria-label="card-group">
                  {content}
                </div>
              )}
            >
              <A11yTreeSlot
                id="hand"
                render={(content) => (
                  <div role="listbox" aria-label="hand">
                    {content}
                  </div>
                )}
              />
              {showDeck && (
                <A11yTreeSlot
                  id="deck"
                  render={(content) => (
                    <div role="listbox" aria-label="deck">
                      {content}
                    </div>
                  )}
                />
              )}
            </A11yTreeSlotGroup>
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(<TestComponent showDeck={true} />);
    expect(screen.getByRole("listbox", { name: "hand" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "deck" })).toBeInTheDocument();

    await rerender(<TestComponent showDeck={false} />);
    expect(screen.getByRole("listbox", { name: "hand" })).toBeInTheDocument();
    expect(
      screen.queryByRole("listbox", { name: "deck" }),
    ).not.toBeInTheDocument();
  });
});

describe("A11yTreeMultiplexer stress tests", () => {
  test("handles many simultaneous slot mutations", async () => {
    function TestComponent({ config }: { config: Record<string, string[]> }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={Object.entries(config).flatMap(([slotId, items]) =>
              items.map((item) => ({
                key: `${slotId}-${item}`,
                slotId,
                render: (
                  <A11yTreeElement>
                    <div role="option" data-item={item}>
                      {item}
                    </div>
                  </A11yTreeElement>
                ),
              })),
            )}
          >
            {Object.keys(config).map((slotId) => (
              <A11yTreeSlot
                key={`out-${slotId}`}
                id={slotId}
                render={(content) => (
                  <div role="listbox" aria-label={slotId}>
                    {content}
                  </div>
                )}
              />
            ))}
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const initialConfig = {
      a: ["1", "2", "3"],
      b: ["4", "5"],
      c: ["6"],
      d: ["7", "8", "9", "10"],
    };

    const { rerender } = await renderTree(
      <TestComponent config={initialConfig} />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(10);

    const mutatedConfig = {
      a: ["2", "11"],
      b: ["4", "5", "6", "12"],
      c: [],
      d: ["7"],
      e: ["13", "14"],
    };

    await rerender(<TestComponent config={mutatedConfig} />);

    expect(screen.getByRole("listbox", { name: "a" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "b" })).toBeInTheDocument();
    expect(
      screen.queryByRole("listbox", { name: "c" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "d" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "e" })).toBeInTheDocument();

    expect(screen.getAllByRole("option")).toHaveLength(9);
    expect(screen.queryByRole("option", { name: "1" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "11" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "12" })).toBeInTheDocument();
  });

  test("handles batch slot operations correctly", async () => {
    function TestComponent({
      items,
    }: {
      items: { slotId: string; value: string }[];
    }) {
      const slots = [...new Set(items.map((i) => i.slotId))];

      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={items.map((item, idx) => ({
              key: `${item.slotId}-${item.value}-${idx}`,
              slotId: item.slotId,
              render: (
                <A11yTreeElement>
                  <div role="option">{item.value}</div>
                </A11yTreeElement>
              ),
            }))}
          >
            {slots.map((slotId) => (
              <A11yTreeSlot
                key={`out-${slotId}`}
                id={slotId}
                render={(content) => (
                  <div role="listbox" aria-label={slotId}>
                    {content}
                  </div>
                )}
              />
            ))}
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const initialItems = [
      { slotId: "s1", value: "a" },
      { slotId: "s1", value: "b" },
      { slotId: "s2", value: "c" },
    ];

    const { rerender } = await renderTree(
      <TestComponent items={initialItems} />,
    );
    expect(screen.getAllByRole("option")).toHaveLength(3);

    const newItems = [
      { slotId: "s2", value: "a" },
      { slotId: "s2", value: "b" },
      { slotId: "s2", value: "c" },
      { slotId: "s2", value: "d" },
    ];

    await rerender(<TestComponent items={newItems} />);

    expect(
      screen.queryByRole("listbox", { name: "s1" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "s2" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });
});

describe("A11yTreeSlotGroup nesting", () => {
  test("slots nested under another tunnel inside a group render into the group", async () => {
    await renderTree(
      <TestProvider>
        <A11yTreeMultiplexer
          items={[
            {
              slotId: "s1",
              render: (
                <A11yTreeElement>
                  <div role="option">Item One</div>
                </A11yTreeElement>
              ),
            },
          ]}
        >
          <A11yTreeSlotGroup
            render={(content) => (
              <div role="listbox" aria-label="group">
                {content}
              </div>
            )}
          >
            <A11yTreeContainer
              render={(content) => (
                <div role="group" aria-label="container">
                  {content}
                </div>
              )}
            >
              <A11yTreeSlot
                id="s1"
                render={(content) => (
                  <div role="list" aria-label="slot">
                    {content}
                  </div>
                )}
              />
            </A11yTreeContainer>
          </A11yTreeSlotGroup>
        </A11yTreeMultiplexer>
      </TestProvider>,
    );

    const group = screen.getByRole("listbox", { name: "group" });
    const container = screen.getByRole("group", { name: "container" });
    const slot = screen.getByRole("list", { name: "slot" });
    expect(group).toContainElement(slot);
    expect(container).not.toContainElement(slot);
    expect(slot).toContainElement(
      screen.getByRole("option", { name: "Item One" }),
    );
  });
});

describe("A11yTreeSlot tunnel context warning", () => {
  test("warns in dev when a slot is acquired under a different tunnel context", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await renderTree(
      <TestProvider>
        <A11yTreeMultiplexer
          items={[
            {
              slotId: "shared",
              render: (
                <A11yTreeElement>
                  <div role="option">From items</div>
                </A11yTreeElement>
              ),
            },
          ]}
        >
          {/* Same slot id acquired from inside a container, whose
              tunnel context differs from the items'. */}
          <A11yTreeContainer
            render={(content) => <div role="group">{content}</div>}
          >
            <A11yTreeSlotIn slotId="shared">
              <A11yTreeElement>
                <div role="option">Manual</div>
              </A11yTreeElement>
            </A11yTreeSlotIn>
          </A11yTreeContainer>
          <A11yTreeSlot
            id="shared"
            render={(content) => <div role="listbox">{content}</div>}
          />
        </A11yTreeMultiplexer>
      </TestProvider>,
    );

    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining('A11yTreeSlot "shared"'),
    );
    consoleWarn.mockRestore();
  });

  test("a slot remounted under a new container renders into it without a warning", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Remounts the container; the multiplexer stays put.
    function Toggle() {
      const [open, setOpen] = useState(true);
      return (
        <>
          <button onClick={() => setOpen((o) => !o)}>toggle</button>
          {open && (
            <A11yTreeContainer
              render={(content) => (
                <div role="group" aria-label="container">
                  {content}
                </div>
              )}
            >
              <A11yTreeSlotIn slotId="s">
                <A11yTreeElement>
                  <div role="option">Manual</div>
                </A11yTreeElement>
              </A11yTreeSlotIn>
            </A11yTreeContainer>
          )}
        </>
      );
    }

    await renderTree(
      <TestProvider>
        <A11yTreeMultiplexer items={[]}>
          <Toggle />
          <A11yTreeSlot
            id="s"
            render={(content) => (
              <div role="listbox" aria-label="s">
                {content}
              </div>
            )}
          />
        </A11yTreeMultiplexer>
      </TestProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    await flush();
    expect(
      screen.queryByRole("listbox", { name: "s" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "toggle" }));
    await flush();
    expect(
      within(screen.getByRole("group", { name: "container" })).getByRole(
        "listbox",
        { name: "s" },
      ),
    ).toHaveTextContent("Manual");
    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  test("does not warn when all items share the slot's tunnel context", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await renderTree(
      <TestProvider>
        <A11yTreeMultiplexer
          items={[
            {
              key: "a",
              slotId: "shared",
              render: (
                <A11yTreeElement>
                  <div role="option">A</div>
                </A11yTreeElement>
              ),
            },
            {
              key: "b",
              slotId: "shared",
              render: (
                <A11yTreeElement>
                  <div role="option">B</div>
                </A11yTreeElement>
              ),
            },
          ]}
        >
          <A11yTreeSlot
            id="shared"
            render={(content) => <div role="listbox">{content}</div>}
          />
        </A11yTreeMultiplexer>
      </TestProvider>,
    );

    expect(consoleWarn).not.toHaveBeenCalled();
    consoleWarn.mockRestore();
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

  test("multiplexer routes, moves, and removes items under StrictMode", async () => {
    function TestComponent({
      slot1Items,
      slot2Items,
    }: {
      slot1Items: string[];
      slot2Items: string[];
    }) {
      return (
        <StrictMode>
          <TestProvider>
            <A11yTreeMultiplexer
              items={[
                ...slot1Items.map((item) => ({
                  key: item,
                  slotId: "slot-1",
                  render: (
                    <A11yTreeElement>
                      <div role="option">{item}</div>
                    </A11yTreeElement>
                  ),
                })),
                ...slot2Items.map((item) => ({
                  key: item,
                  slotId: "slot-2",
                  render: (
                    <A11yTreeElement>
                      <div role="option">{item}</div>
                    </A11yTreeElement>
                  ),
                })),
              ]}
            >
              <A11yTreeSlot
                id="slot-1"
                render={(content) => (
                  <div role="listbox" aria-label="slot-1">
                    {content}
                  </div>
                )}
              />
              <A11yTreeSlot
                id="slot-2"
                render={(content) => (
                  <div role="listbox" aria-label="slot-2">
                    {content}
                  </div>
                )}
              />
            </A11yTreeMultiplexer>
          </TestProvider>
        </StrictMode>
      );
    }

    const { rerender } = await renderTree(
      <TestComponent slot1Items={["A", "B"]} slot2Items={["C"]} />,
    );
    expect(screen.getByRole("listbox", { name: "slot-1" })).toContainElement(
      screen.getByRole("option", { name: "A" }),
    );
    expect(screen.getByRole("listbox", { name: "slot-2" })).toContainElement(
      screen.getByRole("option", { name: "C" }),
    );

    await rerender(
      <TestComponent slot1Items={["A"]} slot2Items={["B", "C"]} />,
    );
    expect(
      screen
        .getByRole("listbox", { name: "slot-1" })
        .querySelectorAll("[role='option']"),
    ).toHaveLength(1);
    expect(
      screen
        .getByRole("listbox", { name: "slot-2" })
        .querySelectorAll("[role='option']"),
    ).toHaveLength(2);

    await rerender(<TestComponent slot1Items={[]} slot2Items={[]} />);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  test("grouped slots render under the group wrapper under StrictMode", async () => {
    await renderTree(
      <StrictMode>
        <TestProvider>
          <A11yTreeMultiplexer
            items={[
              {
                key: "card",
                slotId: "hand",
                render: (
                  <A11yTreeElement>
                    <div role="option">Card</div>
                  </A11yTreeElement>
                ),
              },
            ]}
          >
            <A11yTreeSlotGroup
              render={(content) => (
                <div role="group" aria-label="card-group">
                  {content}
                </div>
              )}
            >
              <A11yTreeSlot
                id="hand"
                render={(content) => (
                  <div role="listbox" aria-label="hand">
                    {content}
                  </div>
                )}
              />
            </A11yTreeSlotGroup>
          </A11yTreeMultiplexer>
        </TestProvider>
      </StrictMode>,
    );

    const group = screen.getByRole("group", { name: "card-group" });
    expect(group).toContainElement(
      screen.getByRole("listbox", { name: "hand" }),
    );
    expect(screen.getByRole("option", { name: "Card" })).toBeInTheDocument();
  });
});

describe("A11yTreeMultiplexer memoized reorder", () => {
  // Stable element identities: moved content never re-renders, so a
  // reorder is only visible via the items prop.
  const RENDERS: Record<string, ReactNode> = {
    A: (
      <A11yTreeElement>
        <div role="option">A</div>
      </A11yTreeElement>
    ),
    B: (
      <A11yTreeElement>
        <div role="option">B</div>
      </A11yTreeElement>
    ),
    C: (
      <A11yTreeElement>
        <div role="option">C</div>
      </A11yTreeElement>
    ),
  };

  test("reordering items with memoized render elements reorders the slot", async () => {
    function TestComponent({ order }: { order: string[] }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={order.map((key) => ({
              key,
              slotId: "s",
              render: RENDERS[key],
            }))}
          >
            <A11yTreeSlot
              id="s"
              render={(content) => <div role="listbox">{content}</div>}
            />
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(
      <TestComponent order={["A", "B", "C"]} />,
    );
    await rerender(<TestComponent order={["C", "A", "B"]} />);

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  test("swapping a keyed item's memoized render node updates the slot", async () => {
    // Same key, same position: only the render element changes.
    function TestComponent({ label }: { label: string }) {
      return (
        <TestProvider>
          <A11yTreeMultiplexer
            items={[{ key: "x", slotId: "s", render: RENDERS[label] }]}
          >
            <A11yTreeSlot
              id="s"
              render={(content) => <div role="listbox">{content}</div>}
            />
          </A11yTreeMultiplexer>
        </TestProvider>
      );
    }

    const { rerender } = await renderTree(<TestComponent label="A" />);
    expect(screen.getByRole("option")).toHaveTextContent("A");

    await rerender(<TestComponent label="B" />);
    expect(screen.getByRole("option")).toHaveTextContent("B");
  });
});

describe.each([
  { mode: "", wrap: (node: ReactNode) => node, rendersPerUpdate: 1 },
  {
    mode: " under StrictMode",
    wrap: (node: ReactNode) => <StrictMode>{node}</StrictMode>,
    rendersPerUpdate: 2,
  },
])(
  "A11yTreeMultiplexer render isolation$mode",
  ({ wrap, rendersPerUpdate }) => {
    type OnRender = (name: string) => void;

    // Reads the nearest a11y tunnel and reports each render.
    function TunnelProbe({
      name,
      onRender,
      children,
    }: {
      name: string;
      onRender: OnRender;
      children?: ReactNode;
    }) {
      "use no memo";
      useA11yTunnel();
      onRender(name);
      return children;
    }

    function rendersOf(onRender: Mock<OnRender>, name: string) {
      return onRender.mock.calls.filter(([id]) => id === name).length;
    }

    // Stable elements: only context changes reach the probes.
    async function setup(initial: [key: string, slotId: string][]) {
      const onRender = vi.fn<OnRender>();
      const renders: Record<string, ReactNode> = Object.fromEntries(
        ["X", "Y"].map((name) => [
          name,
          <TunnelProbe name={name} onRender={onRender}>
            <A11yTreeElement>
              <div role="option">{name}</div>
            </A11yTreeElement>
          </TunnelProbe>,
        ]),
      );
      const children = (
        <>
          <TunnelProbe name="outside" onRender={onRender} />
          {["a", "b"].map((id) => (
            <A11yTreeSlot
              key={id}
              id={id}
              render={(content) => (
                <div role="listbox" aria-label={id}>
                  <TunnelProbe name={`slot-${id}`} onRender={onRender} />
                  {content}
                </div>
              )}
            />
          ))}
        </>
      );
      function TestComponent({
        placement,
      }: {
        placement: [key: string, slotId: string][];
      }) {
        return wrap(
          <TestProvider>
            <A11yTreeMultiplexer
              items={placement.map(([key, slotId]) => ({
                key,
                slotId,
                render: renders[key],
              }))}
            >
              {children}
            </A11yTreeMultiplexer>
          </TestProvider>,
        );
      }
      const { rerender } = await renderTree(
        <TestComponent placement={initial} />,
      );
      return {
        onRender,
        update: (placement: [key: string, slotId: string][]) =>
          rerender(<TestComponent placement={placement} />),
      };
    }

    test("an unmoved item renders once across another item's move between slots", async () => {
      const { onRender, update } = await setup([
        ["X", "a"],
        ["Y", "a"],
      ]);
      const before = rendersOf(onRender, "Y");

      await update([
        ["X", "b"],
        ["Y", "a"],
      ]);
      expect(screen.getByRole("listbox", { name: "b" })).toHaveTextContent("X");
      expect(rendersOf(onRender, "Y")).toBe(before);
    });

    test("a moved item renders once per move", async () => {
      const { onRender, update } = await setup([["X", "a"]]);
      const before = rendersOf(onRender, "X");

      await update([["X", "b"]]);
      expect(screen.getByRole("listbox", { name: "b" })).toHaveTextContent("X");
      expect(rendersOf(onRender, "X")).toBe(before + rendersPerUpdate);
    });

    test("a reorder within a slot renders no item", async () => {
      const { onRender, update } = await setup([
        ["X", "a"],
        ["Y", "a"],
      ]);
      const before = onRender.mock.calls.length;

      await update([
        ["Y", "a"],
        ["X", "a"],
      ]);
      expect(
        screen.getAllByRole("option").map((option) => option.textContent),
      ).toEqual(["Y", "X"]);
      expect(onRender.mock.calls.length).toBe(before);
    });

    test("multiplexer children outside slots render once across slot acquire and release", async () => {
      const { onRender, update } = await setup([["X", "a"]]);
      const before = rendersOf(onRender, "outside");

      await update([
        ["X", "a"],
        ["Y", "b"],
      ]);
      await update([["X", "a"]]);
      expect(
        screen.queryByRole("listbox", { name: "b" }),
      ).not.toBeInTheDocument();
      expect(rendersOf(onRender, "outside")).toBe(before);
    });

    test("a slot's content renders once while another slot gains its first item", async () => {
      const { onRender, update } = await setup([["X", "a"]]);
      const before = rendersOf(onRender, "slot-a");

      await update([
        ["X", "a"],
        ["Y", "b"],
      ]);
      expect(screen.getByRole("listbox", { name: "b" })).toHaveTextContent("Y");
      expect(rendersOf(onRender, "slot-a")).toBe(before);
      expect(rendersOf(onRender, "slot-b")).toBe(rendersPerUpdate);
    });
  },
);

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
