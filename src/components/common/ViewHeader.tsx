import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Shared header for feature views — gold-foil h1 + muted description */
export function ViewHeader({ title, description, actions }: Props) {
  return (
    <div className="border-b border-nexus-border/40 px-6 py-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl font-semibold text-gold-foil">{title}</h1>
        {description && <p className="text-xs text-nexus-muted">{description}</p>}
        {actions && <div className="ml-auto">{actions}</div>}
      </div>
    </div>
  );
}
