"use client";

import { useMemo, useState } from "react";

import { removeServiceRequest, updateServiceRequest } from "../lib/carecall-api";
import type { PrintOrderDto, PrintOrdersPayload } from "../lib/types";

export type ServiceRequestEditorState = {
  category: string;
  itemsText: string;
  notes: string;
  priority: string;
  reason: string;
  status: "ready_to_print" | "review";
};

type UsePrintableOrdersOptions = {
  operatorName?: string;
  orders: PrintOrdersPayload;
};

export function usePrintableOrders({ operatorName, orders }: UsePrintableOrdersOptions) {
  const [currentOrders, setCurrentOrders] = useState(orders.service_requests);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [recipientFilter, setRecipientFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [printScope, setPrintScope] = useState<"filtered" | string>("filtered");
  const [statusMessage, setStatusMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [editingRequestId, setEditingRequestId] = useState("");
  const [editor, setEditor] = useState<ServiceRequestEditorState>(() => emptyEditorState());

  const printable = currentOrders.filter((request) => request.status === "ready_to_print");
  const nonPrintable = currentOrders.filter((request) => request.status !== "ready_to_print");
  const urgentPrintable = printable.filter((request) => request.priority === "urgent");
  const recipients = useMemo(
    () => Array.from(new Set(currentOrders.map((request) => request.recipient_name).filter(isString))).sort(),
    [currentOrders],
  );
  const areas = useMemo(
    () => Array.from(new Set(currentOrders.map((request) => request.recipient_delivery_area).filter(isString))).sort(),
    [currentOrders],
  );
  const orderDates = useMemo(
    () => Array.from(new Set(currentOrders.map((request) => orderDateKey(request.created_at)).filter(Boolean))).sort(),
    [currentOrders],
  );
  const filtered = currentOrders.filter((request) => {
    const category = printCategory(request.category);
    return (
      (categoryFilter === "all" || category === categoryFilter) &&
      (recipientFilter === "all" || request.recipient_name === recipientFilter) &&
      (areaFilter === "all" || request.recipient_delivery_area === areaFilter) &&
      (dateFilter === "all" || orderDateKey(request.created_at) === dateFilter)
    );
  });
  const filteredPrintable = filtered.filter((request) => request.status === "ready_to_print");
  const categories = useMemo(
    () => Array.from(new Set(currentOrders.map((request) => printCategory(request.category)))).sort(),
    [currentOrders],
  );

  function printCurrentSelection(label = "filtered orders", scope: "filtered" | string = "filtered") {
    setPrintScope(scope);
    setStatusMessage(`Preparing print view for ${label}.`);
    window.setTimeout(() => {
      window.print();
    }, 0);
  }

  function beginEdit(request: PrintOrderDto) {
    setActionError("");
    setEditingRequestId(request.id);
    setEditor(editorStateFromRequest(request));
  }

  function cancelEdit() {
    setEditingRequestId("");
  }

  function markPrintReady(request: PrintOrderDto) {
    if (request.items.length > 0) {
      void saveEdit(request, {
        ...editorForRequest(request, editingRequestId, editor),
        notes: request.status === "ready_to_print" ? request.notes : "",
        status: "ready_to_print",
        reason: "Coordinator released the call result for fulfilment.",
      });
      return;
    }

    const suggestedItems = (request.suggested_items ?? []).join("\n");
    if (suggestedItems) {
      void saveEdit(request, {
        ...editorStateFromRequest(request),
        category: normalizeEditorCategory(request.suggested_category || request.category),
        itemsText: suggestedItems,
        notes: "",
        reason: "Coordinator released the call result for fulfilment using the recognized safe request.",
        status: "ready_to_print",
      });
      return;
    }

    setActionError("");
    setEditingRequestId(request.id);
    setEditor({
      ...editorStateFromRequest(request),
      category: normalizeEditorCategory(request.category),
      itemsText: "",
      reason: "Coordinator reviewed the callback result before fulfilment.",
      status: "ready_to_print",
    });
    setStatusMessage("Add or confirm at least one requested item before marking this result print-ready.");
  }

  async function saveEdit(request: PrintOrderDto, overrides: Partial<ServiceRequestEditorState> = {}) {
    const nextEditor = { ...editorForRequest(request, editingRequestId, editor), ...overrides };
    setActionError("");
    setStatusMessage("");
    try {
      const response = await updateServiceRequest(request.id, {
        category: nextEditor.category,
        items: itemsFromText(nextEditor.itemsText),
        notes: nextEditor.notes,
        operator: operatorName ?? "carecall-coordinator",
        priority: nextEditor.priority,
        reason: nextEditor.reason,
        status: nextEditor.status,
      });
      mergeReturnedServiceRequests(response.service_requests);
      setEditingRequestId("");
      setStatusMessage(`Updated ${request.recipient_name}'s order result.`);
    } catch {
      setActionError("The service could not update this order result. Please contact support if the problem continues.");
    }
  }

  async function removeOrder(request: PrintOrderDto) {
    setActionError("");
    setStatusMessage("");
    try {
      await removeServiceRequest(request.id, {
        operator: operatorName ?? "carecall-coordinator",
        reason: "Operator removed the result from fulfilment orders.",
      });
      setCurrentOrders((existing) => existing.filter((item) => item.id !== request.id));
      setStatusMessage(`Removed ${request.recipient_name}'s order result from this fulfilment view.`);
    } catch {
      setActionError("The service could not remove this order result. Please contact support if the problem continues.");
    }
  }

  function mergeReturnedServiceRequests(updated: PrintOrdersPayload["service_requests"]) {
    const byId = new Map(updated.map((request) => [request.id, request]));
    setCurrentOrders((existing) =>
      existing
        .map((request) => {
          const replacement = byId.get(request.id);
          return replacement ? { ...request, ...replacement } : request;
        })
        .filter((request) => request.status !== "void"),
    );
  }

  return {
    actionError,
    areaFilter,
    areas,
    beginEdit,
    cancelEdit,
    categories,
    categoryFilter,
    currentOrders,
    dateFilter,
    editingRequestId,
    editor,
    filtered,
    filteredPrintable,
    markPrintReady,
    nonPrintable,
    orderDates,
    printCurrentSelection,
    printable,
    printScope,
    recipientFilter,
    recipients,
    removeOrder,
    saveEdit,
    setAreaFilter,
    setCategoryFilter,
    setDateFilter,
    setEditor,
    setRecipientFilter,
    statusMessage,
    urgentPrintable,
  };
}

function emptyEditorState(): ServiceRequestEditorState {
  return {
    category: "groceries",
    itemsText: "",
    notes: "",
    priority: "normal",
    reason: "",
    status: "review",
  };
}

function editorForRequest(
  request: PrintOrderDto,
  editingRequestId: string,
  editor: ServiceRequestEditorState,
): ServiceRequestEditorState {
  if (editingRequestId === request.id) {
    return editor;
  }
  return editorStateFromRequest(request);
}

function editorStateFromRequest(request: PrintOrderDto): ServiceRequestEditorState {
  return {
    category: normalizeEditorCategory(request.category),
    itemsText: request.items.join("\n"),
    notes: request.notes,
    priority: normalizeEditorPriority(request.priority),
    reason: "",
    status: request.status === "ready_to_print" ? "ready_to_print" : "review",
  };
}

function itemsFromText(text: string) {
  return text
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEditorCategory(category: string) {
  const normalized = category.toLowerCase();
  if (["food", "products", "grocery"].includes(normalized)) {
    return "groceries";
  }
  if (["medicine", "pharmacy", "prescription"].includes(normalized)) {
    return "medication";
  }
  if (["groceries", "medication", "cleaning", "transport", "companionship", "repair", "documents", "other"].includes(normalized)) {
    return normalized;
  }
  return "other";
}

function normalizeEditorPriority(priority: string) {
  return ["urgent", "normal", "review"].includes(priority) ? priority : "normal";
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function printCategory(category: string) {
  const normalized = category.toLowerCase();
  if (["medicine", "medication", "pharmacy", "prescription"].includes(normalized)) {
    return "medicine";
  }
  if (["food", "groceries", "grocery", "meal", "meals", "products"].includes(normalized)) {
    return "food";
  }
  return "services";
}

function orderDateKey(value?: string) {
  if (!value) {
    return "";
  }
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) {
    return match[0];
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}
