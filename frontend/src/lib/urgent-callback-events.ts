import type { CallbackRequestDto } from "./types";

export const URGENT_CALLBACK_COUNT_EVENT = "carecall:urgent-callback-count";

export function urgentCallbackOpenCount(requests: Array<Pick<CallbackRequestDto, "status">>) {
  return requests.filter(
    (request) => !["resolved", "auto_callback_completed", "auto_callback_no_contact"].includes(request.status),
  ).length;
}

export function notifyUrgentCallbackCount(count: number) {
  window.dispatchEvent(new CustomEvent(URGENT_CALLBACK_COUNT_EVENT, { detail: { count } }));
}

export function readUrgentCallbackCountEvent(event: Event) {
  if (!(event instanceof CustomEvent)) {
    return null;
  }
  const count = Number((event.detail as { count?: unknown } | null)?.count);
  return Number.isFinite(count) && count >= 0 ? count : null;
}
