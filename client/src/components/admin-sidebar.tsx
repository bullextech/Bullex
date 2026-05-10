import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ShieldCheck,
  SearchCheck,
  FileText,
  Link2,
  FolderOpen,
  Layers,
  UserPlus,
  Users,
  Cloud,
  ClipboardList,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export const PLATFORM_MODULES = [
  { id: "dashboard",      title: "Dashboard",      url: "/dashboard",       icon: LayoutDashboard, description: "Platform overview, metrics & summary" },
  { id: "registrations",  title: "Registrations",  url: "/registrations",   icon: UserPlus,        description: "Client registration applications" },
  { id: "kyc-admin",      title: "KYC Admin",      url: "/kyc-admin",       icon: ShieldCheck,     description: "Client KYC reviews & approvals" },
  { id: "enquiries",      title: "Enquiries",      url: "/trade-enquiries", icon: SearchCheck,     description: "Trade enquiry management" },
  { id: "trading",        title: "Trading",        url: "/trading",         icon: Link2,           description: "Trade order management" },
  { id: "documents",      title: "Documents",      url: "/documents",       icon: FileText,        description: "Document generation & management" },
  { id: "vault",          title: "Vault",          url: "/vault",           icon: FolderOpen,      description: "Document vault & file storage" },
  { id: "blockchain",     title: "Blockchain",     url: "/blockchain",      icon: Layers,          description: "Blockchain ledger & verification" },
  { id: "tasks",          title: "Task Board",     url: "/tasks",           icon: ClipboardList,   description: "Team task tracking & progress" },
];

const adminOnlyItems = [
  { id: "team-members", title: "Team Members", url: "/team-members", icon: Users },
  { id: "db-backup", title: "DB Backup", url: "/db-backup", icon: Cloud },
];

export function AdminSidebar() {
  const [location] = useLocation();
  const { role, allowedModules } = useAuth();

  const visibleModules = role === "admin"
    ? PLATFORM_MODULES
    : PLATFORM_MODULES.filter(m => (allowedModules ?? []).includes(m.id));

  const allItems = [
    ...visibleModules,
    ...(role === "admin" ? adminOnlyItems : []),
  ];

  return (
    <aside className="w-52 flex-shrink-0 border-r border-border bg-background flex flex-col h-full overflow-y-auto">
      <div className="px-3 pt-5 pb-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-2 mb-2">
          {role === "team" ? "My Modules" : "Administration"}
        </p>
        <nav className="space-y-0.5">
          {allItems.map((item) => {
            const active = location === item.url;
            return (
              <Link
                key={item.url}
                href={item.url}
                data-testid={`link-sidebar-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors w-full ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
