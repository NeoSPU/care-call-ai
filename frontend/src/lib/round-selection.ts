const ROUND_SELECTION_STORAGE_KEY = "carecall:selected-recipient-ids";

export function readStoredRoundSelection(eligibleIds: string[]): string[] | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(ROUND_SELECTION_STORAGE_KEY) ?? "null");
    if (!Array.isArray(parsed)) {
      return null;
    }
    const eligible = new Set(eligibleIds);
    return parsed.filter((id): id is string => typeof id === "string" && eligible.has(id));
  } catch {
    return null;
  }
}

export function storeRoundSelection(recipientIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ROUND_SELECTION_STORAGE_KEY, JSON.stringify(recipientIds));
}
