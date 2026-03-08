import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";

interface ClientAuthState {
  authenticated: boolean;
  username: string | null;
  companyName: string | null;
  kycId: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const ClientAuthContext = createContext<ClientAuthState>({
  authenticated: false,
  username: null,
  companyName: null,
  kycId: null,
  loading: true,
  login: async () => ({ success: false }),
  logout: async () => {},
});

export function ClientAuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [kycId, setKycId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/client/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.authenticated) {
          setAuthenticated(true);
          setUsername(data.username || null);
          setCompanyName(data.companyName || null);
          setKycId(data.kycId || null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (user: string, pass: string) => {
    try {
      const res = await fetch("/api/client/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: user, password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated) {
        setAuthenticated(true);
        setUsername(data.username);
        setCompanyName(data.companyName);
        setKycId(data.kycId);
        return { success: true };
      }
      return { success: false, error: data.message || "Login failed" };
    } catch {
      return { success: false, error: "Network error" };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/client/logout", { method: "POST" });
    setAuthenticated(false);
    setUsername(null);
    setCompanyName(null);
    setKycId(null);
  }, []);

  return (
    <ClientAuthContext.Provider value={{ authenticated, username, companyName, kycId, loading, login, logout }}>
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  return useContext(ClientAuthContext);
}
