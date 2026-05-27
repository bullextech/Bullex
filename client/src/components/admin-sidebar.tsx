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
  LogOut,
  Shield,
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
  const { role, allowedModules, authenticated, username, logout } = useAuth();
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
        className={`relative flex items-center gap-2.5 pl-4 pr-3 py-2 text-xs font-medium transition-colors w-full ${
          active
            ? "bg-sidebar-accent text-sidebar-primary-foreground"
            : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
        }`}
      >
        {active && (
          <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-sidebar-primary" aria-hidden />
        )}
        <item.icon className={`w-4 h-4 flex-shrink-0 ${active ? "text-sidebar-primary" : ""}`} />
        <span className="flex-1">{item.title}</span>
        {showBadge && (
          <span
            className="min-w-[18px] h-[18px] px-1.5 rounded-sm text-[10px] font-bold flex items-center justify-center bg-sidebar-primary text-sidebar-primary-foreground"
            data-testid="badge-notifications-unread"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>
    );
  };

  const initial = (username || "?").charAt(0).toUpperCase();

  return (
    <aside
      className="w-56 flex-shrink-0 border-r border-sidebar-border flex flex-col h-full"
      style={{ backgroundColor: "hsl(var(--sidebar))", color: "hsl(var(--sidebar-foreground))" }}
    >
      {/* Brand */}
      <div className="px-4 py-4 flex items-center gap-2.5 border-b border-sidebar-border flex-shrink-0">
        <div className="w-9 h-9 rounded-md bg-sidebar-primary flex items-center justify-center flex-shrink-0">
          <Shield className="w-[18px] h-[18px] text-sidebar-primary-foreground" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-base font-semibold tracking-tight text-sidebar-foreground">Bullex</span>
          <span className="text-[9px] text-sidebar-foreground/55 tracking-wide truncate">Block Trade Platform</span>
        </div>
      </div>

      {/* Scrollable nav */}
      <div className="flex-1 overflow-y-auto py-3">
        {role === "team" && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/50 px-4 mb-2">My Portal</p>
            <nav className="space-y-0.5">
              {renderLink({ url: "/team-portal", title: "My Portal", icon: Briefcase })}
            </nav>
          </div>
        )}

        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/50 px-4 mb-2">
              {section.label}
            </p>
            <nav className="space-y-0.5">
              {section.items.map(renderLink)}
            </nav>
          </div>
        ))}

        {role === "admin" && (
          <div className="mb-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-sidebar-foreground/50 px-4 mb-2">Admin</p>
            <nav className="space-y-0.5">
              {adminOnlyItems.map(renderLink)}
            </nav>
          </div>
        )}
      </div>

      {/* User footer */}
      {authenticated && (
        <div className="border-t border-sidebar-border p-3 flex items-center gap-2.5 flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground text-xs font-bold flex-shrink-0">
            {initial}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-xs font-semibold truncate" data-testid="text-sidebar-username">{username}</p>
            <p className="text-[10px] text-sidebar-foreground/60 truncate uppercase tracking-wider">
              {role === "team" ? "Team Member" : "Admin"}
            </p>
          </div>
          <button
            onClick={logout}
            data-testid="button-sidebar-logout"
            className="p-1.5 rounded text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent flex-shrink-0"
            title="Logout"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </aside>
  );
}
