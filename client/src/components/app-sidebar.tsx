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
import {
  Home,
  LayoutDashboard,
  UserCheck,
  FileText,
  Link2,
  FolderOpen,
  Shield,
  Layers,
  Package,
  Coins,
  Mail,
} from "lucide-react";
import { useLocation, Link } from "wouter";

const navItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Products", url: "/products", icon: Package },
  { title: "Tokenization", url: "/tokenization", icon: Coins },
  { title: "KYC Registration", url: "/kyc", icon: UserCheck },
  { title: "Document Generator", url: "/documents", icon: FileText },
  { title: "Blockchain Trading", url: "/trading", icon: Link2 },
  { title: "Document Vault", url: "/vault", icon: FolderOpen },
  { title: "Blockchain Ledger", url: "/blockchain", icon: Layers },
  { title: "Contact", url: "/contact", icon: Mail },
];

export function AppSidebar() {
  const [location] = useLocation();

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
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">Trade Management</p>
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
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-status-online animate-pulse" />
          <span>Blockchain Active</span>
        </div>
        <div className="text-[10px] text-muted-foreground opacity-60">
          Bullfrog Group Proprietary
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
