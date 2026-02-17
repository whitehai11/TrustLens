const blockedTerms = ["nigger", "faggot", "kike", "spic", "chink"];

export function containsBlockedContent(value: string): boolean {
  const normalized = value.toLowerCase();
  return blockedTerms.some((term) => normalized.includes(term));
}

export function assertNoBlockedContent(fields: Array<{ name: string; value?: string | null }>) {
  const bad = fields.find((f) => f.value && containsBlockedContent(f.value));
  if (bad) {
    const err = new Error(`Blocked language detected in field: ${bad.name}`);
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }
}

