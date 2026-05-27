import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ShieldCheck,
  SearchCheck,
  FileText,
  Link2,
  FolderOpen,
  Layers,
  Users,
  Cloud,
  ClipboardList,
  Briefcase,
  BarChart3,
  Bell,
  FileCog,
  Ship,
  FlaskConical,
  Banknote,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

export const PLATFORM_MODULES = [
  { id: "dashboard",      title: "Dashboard",        url: "/dashboard",       icon: LayoutDashboard, description: "Platform overview, metrics & summary" },
  { id: "analytics",      title: "Analytics",        url: "/analytics",       icon: BarChart3,       description: "Trading & operational analytics" },
  { id: "notifications",  title: "Notifications",    url: "/notifications",   icon: Bell,            description: "System notifications & alerts" },
  { id: "kyc-admin",      title: "KYC & Compliance", url: "/kyc-admin",       icon: ShieldCheck,     description: "Client KYC reviews & approvals" },
  { id: "enquiries",      title: "Enquiries",        url: "/trade-enquiries", icon: SearchCheck,     description: "Trade enquiry management" },
  { id: "trading",        title: "Deal Desk",        url: "/trading",         icon: Link2,           description: "Trade execution & deal management" },
  { id: "documents",      title: "Documents",        url: "/documents",       icon: FileText,        description: "Document generation & management" },
  { id: "doc-templates",  title: "Doc. Templates",   url: "/doc-templates",   icon: FileCog,         description: "Document template library" },
  { id: "vault",          title: "Vault",            url: "/vault",           icon: FolderOpen,      description: "Document vault & file storage" },
  { id: "shipments",      title: "Shipments",        url: "/shipments",       icon: Ship,            description: "Shipment tracking & logistics" },
  { id: "qa-reports",     title: "QA Reports",       url: "/qa-reports",      icon: FlaskConical,    description: "Quality assurance & inspection reports" },
  { id: "banking",        title: "Banking & LC",     url: "/banking",         icon: Banknote,        description: "Banking & letters of credit" },
  { id: "live-prices",    title: "Live Prices",      url: "/live-prices",     icon: TrendingUp,      description: "Live commodity price feeds" },
  { id: "blockchain",     title: "Blockchain",       url: "/blockchain",      icon: Layers,          description: "Blockchain ledger & verification" },
  { id: "registrations",  title: "Registrations",    url: "/registrations",   icon: Users,           description: "Client registration applications" },
  { id: "tasks",          title: "Task Board",       url: "/tasks",           icon: ClipboardList,   description: "Team task tracking & progress" },
];

const SECTIONS: Array<{ label: string; ids: string[] }> = [
  { label: "Overview",   ids: ["dashboard", "analytics", "notifications"] },
  { label: "Trading",    ids: ["kyc-admin", "enquiries", "trading"] },
  { label: "Documents",  ids: ["documents", "doc-templates", "vault"] },
  { label: "Operations", ids: ["shipments", "qa-reports"] },
  { label: "Finance",    ids: ["banking", "live-prices"] },
];

const adminOnlyItems = [
  { id: "team-members", title: "Team", url: "/team", icon: Users },
  { id: "db-backup", title: "DB Backup", url: "/db-backup", icon: Cloud },
];

export function AdminSidebar() {
  const [location] = useLocation();
  const { role, allowedModules, authenticated } = useAuth();
  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: authenticated,
    refetchInterval: 30000,
  });
  const unreadCount = unread?.count || 0;

  const moduleById = Object.fromEntries(PLATFORM_MODULES.map(m => [m.id, m]));
  const isVisible = (id: string) =>
    role === "admin" || (allowedModules ?? []).includes(id);

  const sections = SECTIONS
    .map(s => ({ label: s.label, items: s.ids.map(id => moduleById[id]).filter(m => m && isVisible(m.id)) }))
    .filter(s => s.items.length > 0);

  const groupedIds = new Set(SECTIONS.flatMap(s => s.ids));
  const otherItems = PLATFORM_MODULES.filter(m => !groupedIds.has(m.id) && isVisible(m.id));
  if (otherItems.length > 0) sections.push({ label: "Other", items: otherItems });

  const renderLink = (item: { url: string; title: string; icon: any; id?: string }) => {
    const active = location === item.url;
    const showBadge = item.url === "/notifications" && unreadCount > 0;
    return (
      <Link
        key={item.url}
        href={item.url}
        data-testid={`link-sidebar-${item.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
        className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors w-full ${
          active
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        <item.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{item.title}</span>
        {showBadge && (
          <span
            className={`min-w-[18px] h-[18px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${
              active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground"
            }`}
            data-testid="badge-notifications-unread"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <aside className="w-52 flex-shrink-0 border-r border-border bg-background flex flex-col h-full overflow-y-auto">
      <div className="px-3 pt-5 pb-4">
        {role === "team" && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-2 mb-2">My Portal</p>
            <nav className="space-y-0.5">
              {renderLink({ url: "/team-portal", title: "My Portal", icon: Briefcase })}
            </nav>
          </div>
        )}

        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-2 mb-2">
              {section.label}
            </p>
            <nav className="space-y-0.5">
              {section.items.map(renderLink)}
            </nav>
          </div>
        ))}

        {role === "admin" && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-2 mb-2">Admin</p>
            <nav className="space-y-0.5">
              {adminOnlyItems.map(renderLink)}
            </nav>
          </div>
        )}
      </div>
    </aside>
  );
}
