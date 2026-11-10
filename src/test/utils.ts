// Test helpers shared by the suites.
import { act, render, type RenderResult } from "@testing-library/react";
import type { ReactNode } from "react";

export const flush = () => act(async () => {});

/** Renders `ui` and settles tunnel content; `rerender` settles too. */
export async function renderTree(ui: ReactNode) {
  let result!: RenderResult;
  await act(async () => {
    result = render(ui);
  });
  return {
    ...result,
    rerender: (next: ReactNode) => act(async () => result.rerender(next)),
  };
}
