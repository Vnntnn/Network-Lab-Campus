const INTERFACE_COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

export function normalizeInterfaces(interfaces?: string[] | null): string[] {
  return Array.from(
    new Set(
      (interfaces ?? [])
        .map((interfaceName) => interfaceName.trim())
        .filter((interfaceName) => interfaceName.length > 0)
    )
  ).sort((left, right) => INTERFACE_COLLATOR.compare(left, right));
}

export function interfaceFamily(interfaceName: string): string {
  return interfaceName.match(/^[A-Za-z-]+/)?.[0] ?? "ports";
}

export function groupInterfaces(interfaces?: string[] | null): Array<{ family: string; interfaces: string[] }> {
  const grouped = new Map<string, string[]>();

  for (const interfaceName of normalizeInterfaces(interfaces)) {
    const family = interfaceFamily(interfaceName);
    const familyMembers = grouped.get(family) ?? [];
    familyMembers.push(interfaceName);
    grouped.set(family, familyMembers);
  }

  return Array.from(grouped.entries())
    .map(([family, interfaces]) => ({
      family,
      interfaces: interfaces.sort((left, right) => INTERFACE_COLLATOR.compare(left, right)),
    }))
    .sort((left, right) => INTERFACE_COLLATOR.compare(left.family, right.family));
}

export function summarizeInterfaces(interfaces?: string[] | null, visibleCount = 4) {
  const normalized = normalizeInterfaces(interfaces);

  return {
    total: normalized.length,
    visible: normalized.slice(0, visibleCount),
    overflow: Math.max(0, normalized.length - visibleCount),
  };
}

export function formatInterfaceSummary(interfaces?: string[] | null, fallback = "none") {
  const normalized = normalizeInterfaces(interfaces);

  if (normalized.length === 0) return fallback;
  if (normalized.length === 1) return normalized[0];

  return `${normalized[0]} +${normalized.length - 1}`;
}