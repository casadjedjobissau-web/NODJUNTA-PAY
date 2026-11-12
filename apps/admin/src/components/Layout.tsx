import type { ReactNode } from "react";
import type { Tab, TabDef } from "../lib/access";
import { roleLabel } from "../lib/format";
import type { AdminMe } from "../lib/types";

interface Props {
  email: string | null;
  me: AdminMe;
  tabs: TabDef[];
  current: Tab;
  onSelect: (tab: Tab) => void;
  onSignOut: () => void;
  children: ReactNode;
}

export function Layout({ email, me, tabs, current, onSelect, onSignOut, children }: Props) {
  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          NÔDJUNTA PAY <span>Administração</span>
        </div>
        <div className="who">
          <span>
            {email ?? "—"} · {roleLabel(me.role)}
          </span>
          <button type="button" className="btn secondary" onClick={onSignOut}>
            Terminar sessão
          </button>
        </div>
      </header>

      <nav className="tabs" aria-label="Secções">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === current ? "tab active" : "tab"}
            aria-current={tab.id === current ? "page" : undefined}
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content">{children}</main>
    </div>
  );
}
