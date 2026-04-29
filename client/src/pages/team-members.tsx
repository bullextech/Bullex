import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Trash2, Plus, Loader2, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface TeamMember {
  id: string;
  username: string;
  name: string;
  department: string | null;
  email: string | null;
  createdAt: string;
}

export default function TeamMembersPage() {
  const { role } = useAuth();
  const [, setLocation] = useLocation();

  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState("");

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team/members"],
  });

  const createMutation = useMutation({
    mutationFn: (body: object) => apiRequest("POST", "/api/team/members", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
      setShowForm(false);
      setUsername("");
      setPassword("");
      setName("");
      setDepartment("");
      setEmail("");
      setFormError("");
    },
    onError: async (err: any) => {
      const body = await err.response?.json?.();
      setFormError(body?.message || "Failed to create team member");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/team/members/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/members"] });
    },
  });

  if (role !== "admin") {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <p className="text-sm text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    if (!username.trim() || !password.trim() || !name.trim()) {
      setFormError("Username, password, and name are required.");
      return;
    }
    createMutation.mutate({ username: username.trim(), password, name: name.trim(), department: department.trim() || undefined, email: email.trim() || undefined });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="border-b border-border px-8 py-5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-primary" />
            <div>
              <h1 className="text-base font-bold tracking-tight" data-testid="text-team-page-title">Team Members</h1>
              <p className="text-xs text-muted-foreground">Manage internal team access to the platform</p>
            </div>
          </div>
          <Button
            size="sm"
            className="rounded-none text-xs font-bold uppercase tracking-wider h-9"
            onClick={() => { setShowForm(true); setFormError(""); }}
            data-testid="button-add-team-member"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add Member
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {showForm && (
            <div className="border border-border bg-muted/20 p-6 mb-8 max-w-lg">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold uppercase tracking-wider">New Team Member</h2>
                <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground" data-testid="button-close-team-form">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name *</label>
                    <Input
                      placeholder="Full name"
                      className="rounded-none h-9 text-sm"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      data-testid="input-team-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</label>
                    <Input
                      placeholder="e.g. Operations"
                      className="rounded-none h-9 text-sm"
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      data-testid="input-team-department"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</label>
                  <Input
                    type="email"
                    placeholder="team@bullex.tech"
                    className="rounded-none h-9 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    data-testid="input-team-email"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Username *</label>
                    <Input
                      placeholder="login username"
                      className="rounded-none h-9 text-sm"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      data-testid="input-team-username-create"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Password *</label>
                    <Input
                      type="password"
                      placeholder="set password"
                      className="rounded-none h-9 text-sm"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      data-testid="input-team-password-create"
                    />
                  </div>
                </div>
                {formError && (
                  <div className="p-3 bg-destructive/10 border border-destructive/20 text-xs text-destructive" data-testid="text-team-form-error">
                    {formError}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-none text-xs"
                    onClick={() => setShowForm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="rounded-none text-xs font-bold uppercase tracking-wider"
                    disabled={createMutation.isPending}
                    data-testid="button-submit-team-member"
                  >
                    {createMutation.isPending ? (
                      <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating...</>
                    ) : (
                      "Create Member"
                    )}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading team members...
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No team members yet</p>
              <p className="text-xs text-muted-foreground mt-1">Add a team member to grant platform access.</p>
            </div>
          ) : (
            <div className="border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Username</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Department</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Added</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((member, i) => (
                    <tr
                      key={member.id}
                      className={`border-b border-border last:border-0 hover:bg-muted/20 transition-colors`}
                      data-testid={`row-team-member-${member.id}`}
                    >
                      <td className="px-4 py-3 font-medium text-sm" data-testid={`text-member-name-${member.id}`}>{member.name}</td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-muted px-1.5 py-0.5">{member.username}</code>
                      </td>
                      <td className="px-4 py-3">
                        {member.department ? (
                          <Badge variant="secondary" className="text-xs rounded-none">{member.department}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{member.email || "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(member.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteMutation.mutate(member.id)}
                          disabled={deleteMutation.isPending}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          data-testid={`button-delete-member-${member.id}`}
                        >
                          {deleteMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
}
