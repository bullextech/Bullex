import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  ShieldCheck,
  SearchCheck,
  FileText,
  Link2,
  FolderOpen,
  Layers,
  Home,
  Package,
  Users,
  Mail,
} from "lucide-react";

const adminNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "KYC Admin", url: "/kyc-admin", icon: ShieldCheck },
  { title: "Enquiries", url: "/trade-enquiries", icon: SearchCheck },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Trading", url: "/trading", icon: Link2 },
  { title: "Vault", url: "/vault", icon: FolderOpen },
  { title: "Blockchain", url: "/blockchain", icon: Layers },
];

const publicNavItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Products", url: "/products", icon: Package },
  { title: "Investor", url: "/investor", icon: Users },
  { title: "Contact", url: "/contact", icon: Mail },
];

export function AdminSidebar() {
  const [location] = useLocation();

  return (
    <aside className="w-52 flex-shrink-0 border-r border-border bg-background flex flex-col h-full overflow-y-auto">
      {/* Admin section */}
      <div className="px-3 pt-5 pb-2">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-2 mb-2">
          Administration
        </p>
        <nav className="space-y-0.5">
          {adminNavItems.map((item) => {
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

      {/* Divider */}
      <div className="mx-3 my-3 border-t border-border" />

      {/* Public section */}
      <div className="px-3 pb-5">
        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground px-2 mb-2">
          Public Pages
        </p>
        <nav className="space-y-0.5">
          {publicNavItems.map((item) => {
            const active = location === item.url;
            return (
              <Link
                key={item.url}
                href={item.url}
                data-testid={`link-sidebar-pub-${item.title.toLowerCase()}`}
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
