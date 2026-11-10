import type { ReactNode } from "react";

import { A11yTreeProvider, A11yTreeRenderer } from "../a11y-tree-context";

/** The provider and a renderer, for tests. */
export function TestProvider({ children }: { children: ReactNode }) {
  return (
    <A11yTreeProvider>
      {children}
      <A11yTreeRenderer className="a11y-output" />
    </A11yTreeProvider>
  );
}
