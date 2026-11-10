import { useState } from "react";

import { type A11yTreeOutletHandle, createOutlet } from "./mirror-store";

export type { A11yTreeOutletHandle };

/** Returns a stable outlet handle for an `A11yTreeMirror` list. */
export function useA11yTreeOutlet(): A11yTreeOutletHandle {
  const [outlet] = useState(createOutlet);
  return outlet;
}
