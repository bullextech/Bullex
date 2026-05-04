import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { queryClient } from "@/lib/queryClient";

interface AuthState {
  authenticated: boolean;
  username: string | null;
  role: string | null;
  allowedModules: string[] | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  authenticated: false,
  username: null,
  role: null,
  allowedModules: null,
  loading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [allowedModules, setAllowedModules] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated && (data.role === "admin" || data.role === "team")) {
          setAuthenticated(true);
          setUsername(data.username || null);
          setRole(data.role || null);
          setAllowedModules(data.role === "team" ? (data.allowedModules ?? []) : null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (user: string, pass: string) => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated && (data.role === "admin" || data.role === "team")) {
        setAuthenticated(true);
        setUsername(data.username);
        setRole(data.role);
        setAllowedModules(data.role === "team" ? (data.allowedModules ?? []) : null);
        queryClient.clear();
        return { success: true };
      }
      return { success: false, error: data.message || "Login failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthenticated(false);
    setUsername(null);
    setRole(null);
    setAllowedModules(null);
    queryClient.clear();
  }, []);

  return (
    <AuthContext.Provider value={{ authenticated, username, role, allowedModules, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
