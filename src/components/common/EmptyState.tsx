import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="text-nexus-muted/40">{icon}</div>
      <h2 className="font-display text-lg font-light tracking-tight text-nexus-fg/50">
        {title}
      </h2>
      {description && (
        <p className="max-w-xs text-xs text-nexus-muted/60">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
