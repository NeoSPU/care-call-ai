const ROUND_SELECTION_STORAGE_KEY = "carecall:selected-recipient-ids";

export function readStoredRoundSelectionIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(ROUND_SELECTION_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

export function readStoredRoundSelection(eligibleIds: string[]): string[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  const parsed = readStoredRoundSelectionIds();
  if (parsed.length === 0 && window.localStorage.getItem(ROUND_SELECTION_STORAGE_KEY) === null) {
    return null;
  }
  const eligible = new Set(eligibleIds);
  return parsed.filter((id) => eligible.has(id));
}

export function storeRoundSelection(recipientIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ROUND_SELECTION_STORAGE_KEY, JSON.stringify(recipientIds));
}
