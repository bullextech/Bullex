import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border bg-card flex-shrink-0">
      <div className="min-w-0">
        <h1 className="text-xl font-bold tracking-tight text-foreground" data-testid="text-page-title">{title}</h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5" data-testid="text-page-subtitle">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
