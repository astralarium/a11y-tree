import "@testing-library/jest-dom/vitest";

import { act, fireEvent, render, screen } from "@testing-library/react";
import { memo, type ReactNode, useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { A11yTreeProvider, A11yTreeRenderer } from "./a11y-tree-context";
import { A11yTreeContainer, A11yTreeElement } from "./a11y-tree-element";
import {
  A11yTreeMultiplexer,
  A11yTreeSlot,
  A11yTreeSlotGroup,
} from "./a11y-tree-multiplexer";
import { fiberTunnel } from "./fiber-tunnel";

function TestProvider({ children }: { children: ReactNode }) {
  return (
    <A11yTreeProvider>
      {children}
      <A11yTreeRenderer className="a11y-output" />
    </A11yTreeProvider>
  );
}

describe("A11yTreeProvider", () => {
  test("renders children", () => {
    render(
      <TestProvider>
        <div data-testid="child">content</div>
      </TestProvider>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });
});

describe("tunnel ordering", () => {
  test("keeps element order when a tunneled element re-renders", () => {
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

    render(
      <TestProvider>
        <CounterElement label="First" />
        <CounterElement label="Second" />
        <CounterElement label="Third" />
      </TestProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "First 0" }));
    fireEvent.click(screen.getByRole("button", { name: "Second 0" }));

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("First 1");
    expect(buttons[1]).toHaveTextContent("Second 1");
    expect(buttons[2]).toHaveTextContent("Third 0");
  });

  test("keeps element order when elements mount later", () => {
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

    const { rerender } = render(<TestComponent showFirst={false} />);
    act(() => {
      rerender(<TestComponent showFirst={true} />);
    });

    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveTextContent("First");
    expect(buttons[1]).toHaveTextContent("Second");
  });

  test("picks up a reorder of memoized elements on the next tunnel update", () => {
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

    const { rerender } = render(<TestComponent order={["A", "B", "C"]} />);
    // Memoized items don't re-render on the move; the tunnel's next
    // update re-derives order from the fiber tree.
    rerender(<TestComponent order={["C", "A", "B"]} />);
    fireEvent.click(screen.getByRole("button", { name: "flush 0" }));

    const buttons = screen.getAllByRole("button");
    expect(buttons.map((button) => button.textContent)).toEqual([
      "C",
      "A",
      "B",
      "flush 1",
    ]);
  });
});

describe("fiberTunnel", () => {
  test("keeps items from multiple React roots without a FiberProvider", () => {
    const t = fiberTunnel();
    render(
      <t.In>
        <button>RootOne</button>
      </t.In>,
    );
    render(
      <>
        <t.In>
          <button>RootTwo</button>
        </t.In>
        <t.Out />
      </>,
    );

    expect(screen.getByRole("button", { name: "RootOne" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RootTwo" })).toBeInTheDocument();
  });
});

describe("TunnelErrorBoundary", () => {
  test("shows a dismissable non-modal dialog outside the renderer container", () => {
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

    const { container } = render(
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

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Recovered" }),
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe("A11yTreeElement", () => {
  test("tunnels content to A11yTreeRenderer", () => {
    render(
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

  test("tunnels multiple elements", () => {
    render(
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
});

describe("A11yTreeContainer", () => {
  test("wraps content with render function", () => {
    render(
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

  test("supports nested containers", () => {
    render(
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
  test("renders slot content via items and A11yTreeSlot", () => {
    render(
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

  test("renders multiple items in same slot", () => {
    render(
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

  test("renders multiple slots independently", () => {
    render(
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

  test("A11yTreeSlot does not render until item creates the slot", () => {
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

    const { rerender } = render(<TestComponent showInput={false} />);
    expect(
      screen.queryByRole("listbox", { name: "lazy-slot" }),
    ).not.toBeInTheDocument();

    rerender(<TestComponent showInput={true} />);
    expect(
      screen.getByRole("listbox", { name: "lazy-slot" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Lazy Item" }),
    ).toBeInTheDocument();
  });
});

describe("A11yTreeMultiplexer slot mutations", () => {
  test("handles slot removal when all inputs unmount", () => {
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

    const { rerender } = render(<TestComponent items={["A", "B", "C"]} />);
    expect(screen.getByRole("option", { name: "A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "B" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "C" })).toBeInTheDocument();

    act(() => {
      rerender(<TestComponent items={[]} />);
    });
    expect(
      screen.queryByRole("listbox", { name: "dynamic-slot" }),
    ).not.toBeInTheDocument();
  });

  test("handles rapid slot additions and removals", () => {
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

    const { rerender } = render(<TestComponent items={["1"]} />);
    expect(screen.getByRole("option", { name: "1" })).toBeInTheDocument();

    act(() => {
      rerender(<TestComponent items={["1", "2", "3"]} />);
    });
    expect(screen.getByRole("option", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "3" })).toBeInTheDocument();

    act(() => {
      rerender(<TestComponent items={["2"]} />);
    });
    expect(screen.queryByRole("option", { name: "1" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "2" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "3" })).not.toBeInTheDocument();
  });

  test("handles item reordering within a slot", () => {
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

    const { rerender } = render(<TestComponent items={["A", "B", "C"]} />);
    let options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("A");
    expect(options[1]).toHaveTextContent("B");
    expect(options[2]).toHaveTextContent("C");

    act(() => {
      rerender(<TestComponent items={["C", "A", "B"]} />);
    });
    options = screen.getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveTextContent("C");
    expect(options[1]).toHaveTextContent("A");
    expect(options[2]).toHaveTextContent("B");
  });

  test("handles item movement between slots", () => {
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

    const { rerender } = render(
      <TestComponent slot1Items={["A", "B"]} slot2Items={["C"]} />,
    );
    let slot1 = screen.getByRole("listbox", { name: "slot-1" });
    let slot2 = screen.getByRole("listbox", { name: "slot-2" });
    expect(slot1).toContainElement(screen.getByRole("option", { name: "A" }));
    expect(slot1).toContainElement(screen.getByRole("option", { name: "B" }));
    expect(slot2).toContainElement(screen.getByRole("option", { name: "C" }));

    act(() => {
      rerender(<TestComponent slot1Items={["A"]} slot2Items={["B", "C"]} />);
    });
    slot1 = screen.getByRole("listbox", { name: "slot-1" });
    slot2 = screen.getByRole("listbox", { name: "slot-2" });
    expect(slot1.querySelectorAll("[role='option']")).toHaveLength(1);
    expect(slot2.querySelectorAll("[role='option']")).toHaveLength(2);
  });

  test("handles simultaneous add and remove in different slots", () => {
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

    const { rerender } = render(
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

    act(() => {
      rerender(
        <TestComponent
          slots={{
            "slot-a": ["1", "2", "6"],
            "slot-b": [],
            "slot-c": ["5", "7"],
          }}
        />,
      );
    });

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

  test("handles slot id changes", () => {
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

    const { rerender } = render(<TestComponent slotId="slot-alpha" />);
    expect(
      screen.getByRole("listbox", { name: "slot-alpha" }),
    ).toContainElement(screen.getByRole("option", { name: "Moving Item" }));
    expect(
      screen.queryByRole("listbox", { name: "slot-beta" }),
    ).not.toBeInTheDocument();

    act(() => {
      rerender(<TestComponent slotId="slot-beta" />);
    });

    expect(
      screen.queryByRole("listbox", { name: "slot-alpha" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "slot-beta" })).toContainElement(
      screen.getByRole("option", { name: "Moving Item" }),
    );
  });
});

describe("A11yTreeSlotGroup", () => {
  test("groups multiple slots under a wrapper", () => {
    render(
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

  test("handles dynamic slots within a group", () => {
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

    const { rerender } = render(<TestComponent showDeck={true} />);
    expect(screen.getByRole("listbox", { name: "hand" })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "deck" })).toBeInTheDocument();

    act(() => {
      rerender(<TestComponent showDeck={false} />);
    });
    expect(screen.getByRole("listbox", { name: "hand" })).toBeInTheDocument();
    expect(
      screen.queryByRole("listbox", { name: "deck" }),
    ).not.toBeInTheDocument();
  });
});

describe("A11yTreeMultiplexer stress tests", () => {
  test("handles many simultaneous slot mutations", () => {
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

    const { rerender } = render(<TestComponent config={initialConfig} />);
    expect(screen.getAllByRole("option")).toHaveLength(10);

    const mutatedConfig = {
      a: ["2", "11"],
      b: ["4", "5", "6", "12"],
      c: [],
      d: ["7"],
      e: ["13", "14"],
    };

    act(() => {
      rerender(<TestComponent config={mutatedConfig} />);
    });

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

  test("handles batch slot operations correctly", () => {
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

    const { rerender } = render(<TestComponent items={initialItems} />);
    expect(screen.getAllByRole("option")).toHaveLength(3);

    const newItems = [
      { slotId: "s2", value: "a" },
      { slotId: "s2", value: "b" },
      { slotId: "s2", value: "c" },
      { slotId: "s2", value: "d" },
    ];

    act(() => {
      rerender(<TestComponent items={newItems} />);
    });

    expect(
      screen.queryByRole("listbox", { name: "s1" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "s2" })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });
});

describe("A11yTreeSlotGroup nesting", () => {
  test("slots nested under another tunnel inside a group render into the group", () => {
    render(
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

  test("reordering items with memoized render elements reorders the slot", () => {
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

    const { rerender } = render(<TestComponent order={["A", "B", "C"]} />);
    rerender(<TestComponent order={["C", "A", "B"]} />);

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual([
      "C",
      "A",
      "B",
    ]);
  });

  test("swapping a keyed item's memoized render node updates the slot", () => {
    // Key order is unchanged, so the multiplexer does not refresh; the
    // swapped element must propagate through the tunnels on its own.
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

    const { rerender } = render(<TestComponent label="A" />);
    expect(screen.getByRole("option")).toHaveTextContent("A");

    rerender(<TestComponent label="B" />);
    expect(screen.getByRole("option")).toHaveTextContent("B");
  });
});
