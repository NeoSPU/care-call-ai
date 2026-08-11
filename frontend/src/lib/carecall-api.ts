import type {
  ApprovalRequest,
  ApprovalResponse,
  BatchPayload,
  CallbackRequestsPayload,
  DashboardPayload,
  ExecutionRequest,
  ExecutionResponse,
  ImportedRunResultPayload,
  OperationsDashboardPayload,
  PreflightPayload,
  PrintOrdersPayload,
  RecipientCardUpdatePayload,
  RecipientDetailPayload,
  RunResultsPayload,
  RunStatusPayload,
} from "./types";

export function carecallApiBaseUrl() {
  if (typeof window !== "undefined") {
    return "/api/carecall";
  }
  return process.env.CARECALL_API_BASE_URL ?? "http://127.0.0.1:8001";
}

function backendApiCredential() {
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.CARECALL_BACKEND_API_TOKEN ?? (process.env.NODE_ENV === "production" ? "" : "carecall-local-backend-token");
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
};

async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const credential = backendApiCredential();
  const response = await fetch(`${carecallApiBaseUrl()}${path}`, {
    method: options.method ?? "GET",
    cache: "no-store",
    headers: {
      ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : `CareCall API request failed with ${response.status}`;
    throw new Error(detail);
  }

  return payload as T;
}

export function getDashboardData(): Promise<DashboardPayload> {
  return requestJson<DashboardPayload>("/api/dashboard");
}

export function getOperationsDashboard(): Promise<OperationsDashboardPayload> {
  return requestJson<OperationsDashboardPayload>("/api/operations/dashboard");
}

export function getCallbackRequests(): Promise<CallbackRequestsPayload> {
  return requestJson<CallbackRequestsPayload>("/api/callback-requests");
}

export function createCallbackRequest(payload: {
  recipient_id: string;
  source?: string;
  request_text?: string;
  priority?: "urgent" | "normal";
  operator?: string;
}): Promise<CallbackRequestsPayload> {
  return requestJson<CallbackRequestsPayload>("/api/callback-requests", {
    method: "POST",
    body: payload,
  });
}

export function updateCallbackRequest(
  callbackId: string,
  payload: {
    status: string;
    operator: string;
    resolution_note?: string;
  },
): Promise<CallbackRequestsPayload> {
  return requestJson<CallbackRequestsPayload>(`/api/callback-requests/${encodeURIComponent(callbackId)}`, {
    method: "PATCH",
    body: payload,
  });
}

export function getRecipientDetail(recipientId: string): Promise<RecipientDetailPayload> {
  return requestJson<RecipientDetailPayload>(`/api/recipients/${encodeURIComponent(recipientId)}`);
}

export function updateRecipientSafety(
  recipientId: string,
  payload: { safety_category: string; reason: string; operator: string },
): Promise<RecipientDetailPayload> {
  return requestJson<RecipientDetailPayload>(`/api/recipients/${encodeURIComponent(recipientId)}/safety`, {
    method: "PATCH",
    body: payload,
  });
}

export function updateRecipientCard(
  recipientId: string,
  payload: RecipientCardUpdatePayload,
): Promise<RecipientDetailPayload> {
  return requestJson<RecipientDetailPayload>(`/api/recipients/${encodeURIComponent(recipientId)}/card`, {
    method: "PATCH",
    body: payload,
  });
}

export function approveSpecialHandlingRecipient(
  recipientId: string,
  payload: {
    card_reviewed: boolean;
    approved_for_automated_round: boolean;
    note: string;
    operator: string;
  },
): Promise<{ card_reviewed: boolean; approved_for_automated_round: boolean }> {
  return requestJson<{ card_reviewed: boolean; approved_for_automated_round: boolean }>(
    `/api/recipients/${encodeURIComponent(recipientId)}/special-handling-approval`,
    {
      method: "POST",
      body: payload,
    },
  );
}

export function getPrintOrders(): Promise<PrintOrdersPayload> {
  return requestJson<PrintOrdersPayload>("/api/orders/print");
}

export function getPreflight(batchId: string): Promise<PreflightPayload> {
  return requestJson<PreflightPayload>("/api/preflight", {
    method: "POST",
    body: { batch_id: batchId },
  });
}

export function createBatch(payload: {
  selected_recipient_ids: string[];
  label?: string;
  call_date?: string;
}): Promise<BatchPayload> {
  return requestJson<BatchPayload>("/api/batches", {
    method: "POST",
    body: payload,
  });
}

export function approvePreflight(payload: ApprovalRequest): Promise<ApprovalResponse> {
  return requestJson<ApprovalResponse>("/api/approvals", {
    method: "POST",
    body: payload,
  });
}

export function runDryRunBatch(payload: ExecutionRequest): Promise<ExecutionResponse> {
  return requestJson<ExecutionResponse>("/api/execution/dry-run", {
    method: "POST",
    body: payload,
  });
}

export function requestLiveExecution(payload: ExecutionRequest): Promise<ExecutionResponse> {
  return requestJson<ExecutionResponse>("/api/execution/live", {
    method: "POST",
    body: payload,
  });
}

export function getRunStatus(runId: string): Promise<RunStatusPayload> {
  return requestJson<RunStatusPayload>(`/api/runs/${encodeURIComponent(runId)}`);
}

export function getRunResults(runId: string, payload: unknown = {}): Promise<RunResultsPayload> {
  return requestJson<RunResultsPayload>(`/api/runs/${encodeURIComponent(runId)}/result`, {
    method: "POST",
    body: payload,
  });
}

export function importRunResult(runId: string): Promise<ImportedRunResultPayload> {
  return requestJson<ImportedRunResultPayload>(`/api/runs/${encodeURIComponent(runId)}/import`, {
    method: "POST",
  });
}
