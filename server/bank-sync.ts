// Shared bank-account sync: copies bank details from approved KYC
// applications into the Banking module's company_bank_accounts registry.
// Used by BOTH the per-approval sync in routes.ts (manual + auto approval)
// and the startup backfill in index.ts, so mapping/dedupe logic can never
// diverge between the two paths.
//
// Idempotent: dedupes on a normalized company|bank|accountNumber key against
// the existing registry, so re-running never creates duplicates.

import { storage } from "./storage";

export interface KycBankSource {
  id?: string;
  companyName: string;
  bankName: string | null; bankBranch: string | null; bankAddress: string | null;
  accountName: string | null; accountNumber: string | null; swiftCode: string | null;
  bankAccountCurrency: string | null; bankOfficerName: string | null; bankOfficerEmail: string | null;
  additionalBanks: { bankName?: string; bankBranch?: string; bankAddress?: string; accountName?: string; accountNumber?: string; swiftCode?: string; bankAccountCurrency?: string; bankOfficerName?: string; bankOfficerEmail?: string }[] | null;
}

const keyOf = (company: string, bank: string, acct: string) =>
  `${company.trim().toLowerCase()}|${bank.trim().toLowerCase()}|${acct.trim().toLowerCase()}`;

function bankEntriesOf(kyc: KycBankSource) {
  return [
    {
      bankName: kyc.bankName, bankBranch: kyc.bankBranch, bankAddress: kyc.bankAddress,
      accountName: kyc.accountName, accountNumber: kyc.accountNumber, swiftCode: kyc.swiftCode,
      bankAccountCurrency: kyc.bankAccountCurrency, bankOfficerName: kyc.bankOfficerName,
      bankOfficerEmail: kyc.bankOfficerEmail,
    },
    ...(Array.isArray(kyc.additionalBanks) ? kyc.additionalBanks : []),
  ].filter((b) => (b.bankName || "").trim());
}

function accountValuesOf(kyc: KycBankSource) {
  return bankEntriesOf(kyc).map((b) => {
    const officer = [b.bankOfficerName, b.bankOfficerEmail].filter((v) => v?.trim()).join(" · ");
    const sourceMarker = kyc.id ? ` Source: ${kyc.id}.` : "";
    return {
      companyName: kyc.companyName,
      bankName: (b.bankName || "").trim(),
      branch: b.bankBranch?.trim() || null,
      bankAddress: b.bankAddress?.trim() || null,
      accountName: b.accountName?.trim() || null,
      accountNumber: b.accountNumber?.trim() || null,
      swiftCode: b.swiftCode?.trim() || null,
      currency: b.bankAccountCurrency?.trim() || null,
      notes: officer
        ? `From approved KYC.${sourceMarker} Bank officer: ${officer}`
        : `From approved KYC.${sourceMarker}`,
    };
  });
}
async function syncOne(kyc: KycBankSource, existingKeys: Set<string>): Promise<number> {
  let created = 0;
  for (const b of bankEntriesOf(kyc)) {
    const bankName = (b.bankName || "").trim();
    const key = keyOf(kyc.companyName, bankName, b.accountNumber || "");
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    const officer = [b.bankOfficerName, b.bankOfficerEmail].filter((v) => v?.trim()).join(" · ");
    const sourceMarker = kyc.id ? ` Source: ${kyc.id}.` : "";
    await storage.createCompanyBankAccount({
      companyName: kyc.companyName,
      bankName,
      branch: b.bankBranch?.trim() || null,
      bankAddress: b.bankAddress?.trim() || null,
      accountName: b.accountName?.trim() || null,
      accountNumber: b.accountNumber?.trim() || null,
      swiftCode: b.swiftCode?.trim() || null,
      currency: b.bankAccountCurrency?.trim() || null,
      notes: officer
        ? `From approved KYC.${sourceMarker} Bank officer: ${officer}`
        : `From approved KYC.${sourceMarker}`,
    });
    created++;
  }
  return created;
}

async function loadExistingKeys(): Promise<Set<string>> {
  const existing = await storage.getCompanyBankAccounts();
  return new Set(existing.map((a) => keyOf(a.companyName, a.bankName, a.accountNumber || "")));
}

// Per-approval sync (called on manual and auto KYC approval).
// Never throws — bank sync must never block or fail an approval.
export async function syncBankAccountsFromKyc(kyc: KycBankSource): Promise<void> {
  try {
    if (bankEntriesOf(kyc).length === 0) return;
    await syncOne(kyc, await loadExistingKeys());
  } catch (err: any) {
    console.error("[bank-accounts] sync from approved KYC failed:", err?.message || err);
  }
}

// Amendments must reconcile, not append: remove registry rows previously sourced
// from this KYC/company before copying the current bank list. If an identity
// amendment moved the KYC back to pending, `active` is false and the superseded
// payment instructions are removed until the record is screened and approved.
export async function reconcileBankAccountsFromKyc(
  kyc: KycBankSource,
  previousCompanyName?: string | null,
  active = true,
): Promise<void> {
  if (!kyc.id) {
    throw new Error("KYC source identity is required for bank reconciliation");
  }
  const companyNames = [kyc.companyName, previousCompanyName]
    .filter((name): name is string => !!name?.trim())
    .map((name) => name.trim().toLowerCase());
  await storage.reconcileKycCompanyBankAccounts(
    kyc.id,
    companyNames,
    active ? accountValuesOf(kyc) : [],
  );
}

// Startup backfill across ALL approved KYC applications. Throws to the caller
// (startup maintenance wraps it in its own try/catch).
export async function backfillBankAccountsFromApprovedKyc(): Promise<number> {
  const apps = await storage.getKycApplications();
  const approved = apps.filter((a) => a.status === "approved");
  const existingKeys = await loadExistingKeys();
  let created = 0;
  for (const kyc of approved) {
    created += await syncOne(kyc, existingKeys);
  }
  return created;
}
