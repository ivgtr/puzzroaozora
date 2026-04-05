import type { ReactNode } from "react";

export function PageShell({ children }: { children: ReactNode }) {
  return <div className="aozora-root page-enter">{children}</div>;
}
