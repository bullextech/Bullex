import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Shield,
  LayoutDashboard,
  ShieldCheck,
  SearchCheck,
  FileText,
  Link2,
  FolderOpen,
  Layers,
  Home,
  Package,
  Wrench,
  Users,
  Mail,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const publicNavItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Products", url: "/products", icon: Package },
  { title: "Platform", url: "/platform", icon: Wrench },
  { title: "Investor", url: "/investor", icon: Users },
  { title: "Contact", url: "/contact", icon: Mail },
];

const adminNavItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "KYC Admin", url: "/kyc-admin", icon: ShieldCheck },
  { title: "Enquiries", url: "/trade-enquiries", icon: SearchCheck },
  { title: "Documents", url: "/documents", icon: FileText },
  { title: "Trading", url: "/trading", icon: Link2 },
  { title: "Vault", url: "/vault", icon: FolderOpen },
  { title: "Blockchain", url: "/blockchain", icon: Layers },
];

const adminPublicItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Products", url: "/products", icon: Package },
  { title: "Investor", url: "/investor", icon: Users },
  { title: "Contact", url: "/contact", icon: Mail },
];

export function TopNavbar() {
  const [location] = useLocation();
  const { authenticated, username, logout } = useAuth();

  const navItems = authenticated ? adminNavItems : publicNavItems;

  return (
    <header className="border-b border-border bg-background/95 backdrop-blur-sm sticky top-0 z-50 flex-shrink-0">
      <div className="flex items-center h-14 px-4 gap-2">
        <Link href="/" data-testid="link-home" className="flex items-center gap-2.5 mr-3 flex-shrink-0">
          <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
            <Shield className="w-4 h-4 text-primary-foreground" />
          </div>
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-sm font-bold tracking-tight">BULLEX</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-[0.15em] hidden md:block">Commodity Trading</span>
          </div>
        </Link>

        {authenticated && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border border-border rounded px-1.5 py-0.5 flex-shrink-0 hidden sm:inline">
            Admin
          </span>
        )}

        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {navItems.map((item) => {
            const active = location === item.url;
            return (
              <Link
                key={item.url}
                href={item.url}
                data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                <item.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{item.title}</span>
              </Link>
            );
          })}

          {authenticated && (
            <>
              <div className="w-px h-5 bg-border mx-1 flex-shrink-0" />
              {adminPublicItems.map((item) => {
                const active = location === item.url;
                return (
                  <Link
                    key={`pub-${item.url}`}
                    href={item.url}
                    data-testid={`link-nav-public-${item.title.toLowerCase()}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">{item.title}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0 ml-1">
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground">
            <div className="w-1.5 h-1.5 rounded-full bg-status-online animate-pulse" />
            <span>Blockchain Active</span>
          </div>

          {authenticated && (
            <>
              <span className="hidden md:block text-xs text-muted-foreground border-l border-border pl-2">
                <span className="font-medium text-foreground">{username}</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={logout}
                data-testid="button-logout"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline ml-1">Logout</span>
              </Button>
            </>
          )}

          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
