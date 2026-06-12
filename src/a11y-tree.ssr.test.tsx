// @vitest-environment node

import { renderToString } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import {
  A11yTreeFallbackRenderer,
  A11yTreeProvider,
  A11yTreeRenderer,
} from "./a11y-tree-context";
import { A11yTreeElement } from "./a11y-tree-element";

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
    // useIsomorphicLayoutEffect must not trip React's
    // "useLayoutEffect does nothing on the server" warning.
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
});
