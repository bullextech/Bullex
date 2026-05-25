import { Construction } from "lucide-react";

export function ComingSoon({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-muted/20 overflow-y-auto">
      <div className="max-w-md text-center space-y-4">
        <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
          <Construction className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-coming-soon-title">{title}</h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">Coming Soon</p>
        </div>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
    </div>
  );
}

export default function ComingSoonPage({ title, description }: { title: string; description?: string }) {
  return <ComingSoon title={title} description={description} />;
}
