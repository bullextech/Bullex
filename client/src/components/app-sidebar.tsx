import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Home,
  LayoutDashboard,
  UserCheck,
  ShieldCheck,
  FileText,
  Link2,
  FolderOpen,
  Shield,
  Layers,
  Package,
  Coins,
  Mail,
  Users,
  Wrench,
  LogOut,
} from "lucide-react";
import { useLocation, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

const navItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Admin", url: "/kyc-admin", icon: ShieldCheck },
  { title: "Products", url: "/products", icon: Package },
  { title: "Platform", url: "/platform", icon: Wrench },
  { title: "Investor", url: "/investor", icon: Users },
  { title: "Contact", url: "/contact", icon: Mail },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { authenticated, username, logout } = useAuth();

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Link href="/" data-testid="link-home">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-primary flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">BULLEX</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Tokenisation • Commodities • Custody</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    data-active={location === item.url}
                  >
                    <Link href={item.url} data-testid={`link-nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-4 space-y-2">
        {authenticated && (
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{username}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="w-3 h-3 mr-1" />
              Logout
            </Button>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-status-online animate-pulse" />
          <span>Blockchain Active</span>
        </div>
        <div className="text-[10px] text-muted-foreground opacity-60">
          Bullex — Tokenisation of Real-World Commodities
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
