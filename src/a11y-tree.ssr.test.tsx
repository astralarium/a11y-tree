// @vitest-environment node

import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import {
  A11yTreeFallbackRenderer,
  A11yTreeProvider,
  A11yTreeRenderer,
} from "./a11y-tree-context";
import { A11yTreeElement } from "./a11y-tree-element";
import { A11yTreeMirror, A11yTreeMirrorIn } from "./a11y-tree-mirror";
import { A11yTreeOutlet } from "./a11y-tree-outlet";
import { createOutlet } from "./mirror-store";

describe("SSR", () => {
  test("renders the tree container without layout effect warnings", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    const html = renderToString(
      <A11yTreeProvider>
        <A11yTreeElement>
          <button>Tunneled</button>
        </A11yTreeElement>
        <A11yTreeRenderer className="sr-only" />
      </A11yTreeProvider>,
    );

    expect(html).toContain('class="sr-only"');
    // Tunnel content registers via effects, which do not run on the
    // server; the container stays empty until hydration.
    expect(html).not.toContain("Tunneled");
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test("A11yTreeFallbackRenderer with portal renders in place during SSR", () => {
    const html = renderToString(
      <A11yTreeFallbackRenderer portal>
        <span>fallback</span>
      </A11yTreeFallbackRenderer>,
    );
    expect(html).toContain("fallback");
  });

  test("the server renders a mirror scene with an empty tree and no errors", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    const outlet = createOutlet();

    const html = renderToString(
      <A11yTreeProvider>
        <A11yTreeMirror
          lists={[{ id: "hand", outlet, nodes: [{ key: "ace", props: {} }] }]}
        >
          <A11yTreeOutlet outlet={outlet} />
          <A11yTreeMirrorIn nodeKey="ace">
            <A11yTreeElement>
              <button>Ace</button>
            </A11yTreeElement>
          </A11yTreeMirrorIn>
        </A11yTreeMirror>
        <A11yTreeRenderer className="sr-only" />
      </A11yTreeProvider>,
    );

    expect(html).toBe('<div class="sr-only"></div>');
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
