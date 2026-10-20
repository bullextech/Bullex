import { createContext, useContext, type ReactNode } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useDocGenUrl } from "./hooks/use-doc-gen-url";
import { useDocFormState } from "./hooks/use-doc-form-state";
import { useDocGenQueries } from "./hooks/use-doc-gen-queries";
import { useDocPolicies } from "./hooks/use-doc-policies";
import { useDocRepoState } from "./hooks/use-doc-repo-state";
import { useDocMutations } from "./hooks/use-doc-mutations";
import { useDocPrefill } from "./hooks/use-doc-prefill";

export function useDocGenController() {
  const { toast } = useToast();
  const { role } = useAuth();
  const isTeam = role === "team";
  const isAdmin = role === "admin";

  const url = useDocGenUrl();
  const form = useDocFormState({ urlTradeRef: url.urlTradeRef, urlEnquiryRef: url.urlEnquiryRef });
  const queries = useDocGenQueries({ urlTradeRef: url.urlTradeRef, urlEnquiryRef: url.urlEnquiryRef, isTeam, isAdmin });
  const policies = useDocPolicies({
    isTeam,
    isAdmin,
    allEnquiries: queries.allEnquiries,
    myEnquiries: queries.myEnquiries,
    docs: queries.docs,
  });
  const repo = useDocRepoState({ toast });
  const mutations = useDocMutations({ toast, isTeam, form, repo });
  const prefill = useDocPrefill({ toast, url, form, queries, repo });

  const isLoading = queries.docsLoading;

  return {
    ...url,
    ...form,
    ...queries,
    ...policies,
    ...repo,
    ...mutations,
    ...prefill,
    isTeam,
    isAdmin,
    isLoading,
    toast,
    role,
  };
}

export type DocGen = ReturnType<typeof useDocGenController>;

const DocGenContext = createContext<DocGen | null>(null);

export function DocGenProvider({ value, children }: { value: DocGen; children: ReactNode }) {
  return <DocGenContext.Provider value={value}>{children}</DocGenContext.Provider>;
}

export function useDocGen(): DocGen {
  const ctx = useContext(DocGenContext);
  if (!ctx) throw new Error("useDocGen must be used within DocGenProvider");
  return ctx;
}
