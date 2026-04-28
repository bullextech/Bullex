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
  Building2,
  SearchCheck,
} from "lucide-react";
import { useLocation, Link } from "wouter";
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
  { title: "Document Generator", url: "/documents", icon: FileText },
  { title: "Trading", url: "/trading", icon: Link2 },
  { title: "Vault", url: "/vault", icon: FolderOpen },
  { title: "Blockchain", url: "/blockchain", icon: Layers },
  { title: "Tokenization", url: "/tokenization", icon: Coins },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { authenticated, username, logout } = useAuth();

  const navItems = authenticated ? adminNavItems : publicNavItems;
  const groupLabel = authenticated ? "Admin" : "Platform";

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
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Commodity Trading Platform</p>
            </div>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{groupLabel}</SidebarGroupLabel>
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

        {authenticated && (
          <SidebarGroup>
            <SidebarGroupLabel>Public</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {[
                  { title: "Home", url: "/", icon: Home },
                  { title: "Products", url: "/products", icon: Package },
                  { title: "Investor", url: "/investor", icon: Users },
                  { title: "Contact", url: "/contact", icon: Mail },
                ].map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild data-active={location === item.url}>
                      <Link href={item.url} data-testid={`link-nav-public-${item.title.toLowerCase()}`}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
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
          Bullex Commodity Trading Platform
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
