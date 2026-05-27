import { Link, useLocation } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Shield,
  Home,
  Package,
  Wrench,
  Users,
  Mail,
  Briefcase,
  Bell,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";

const publicNavItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Products", url: "/products", icon: Package },
  { title: "Platform", url: "/platform", icon: Wrench },
  { title: "Investor", url: "/investor", icon: Users },
  { title: "HR", url: "/human-resources", icon: Briefcase },
  { title: "Contact", url: "/contact", icon: Mail },
];

export function TopNavbar() {
  const [location] = useLocation();
  const { authenticated } = useAuth();
  const { data: unread } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: authenticated,
    refetchInterval: 30000,
  });
  const unreadCount = unread?.count || 0;

  // When authenticated the sidebar carries the brand + user; navbar shrinks to a thin utility strip.
  if (authenticated) {
    return (
      <header className="border-b border-border bg-background flex-shrink-0">
        <div className="flex items-center h-11 px-4 gap-3 justify-end">
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-muted-foreground mr-auto">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Blockchain Active</span>
          </div>
          <Link
            href="/notifications"
            data-testid="link-navbar-notifications"
            className="relative p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center bg-primary text-primary-foreground">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
          <ThemeToggle />
        </div>
      </header>
    );
  }

  // Public navbar (logged-out marketing chrome)
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

        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {publicNavItems.map((item) => {
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
        </nav>

        <div className="flex items-center gap-2 flex-shrink-0 ml-1">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
