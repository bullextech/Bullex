export type ClientSortFields = {
  companyName?: string | null;
  contactName?: string | null;
  contactPerson?: string | null;
  id?: string | number | null;
};

const clientCollator = new Intl.Collator(undefined, {
  sensitivity: "base",
  numeric: true,
});

function compareText(a: string | null | undefined, b: string | null | undefined): number {
  const left = (a || "").trim();
  const right = (b || "").trim();
  if (!left && right) return 1;
  if (left && !right) return -1;
  return clientCollator.compare(left, right);
}

function firstNonBlank(...values: Array<string | null | undefined>): string {
  return values.find((value) => !!value?.trim()) || "";
}

export function compareClientDetails(a: ClientSortFields, b: ClientSortFields): number {
  return (
    compareText(a.companyName, b.companyName) ||
    compareText(
      firstNonBlank(a.contactName, a.contactPerson),
      firstNonBlank(b.contactName, b.contactPerson),
    ) ||
    compareText(String(a.id ?? ""), String(b.id ?? ""))
  );
}

export function sortClientDetails<T extends ClientSortFields>(clients: readonly T[]): T[] {
  return [...clients].sort(compareClientDetails);
}