export type SafetyCategory = "critical" | "special_handling" | "non_critical";
export type ServiceRequestStatus = "pending" | "review" | "ready_to_print";
export type ServiceRequestPriority = "urgent" | "normal" | "review";

export type RecipientCardDto = {
  id: string;
  display_name: string;
  masked_phone: string;
  safety_category: SafetyCategory;
  blocked: boolean;
  blocked_reasons: string[];
  route: "recipient" | "caregiver" | "staff" | "blocked" | string;
  delivery_area: string;
  address: string;
  notes: string;
  condition?: string;
  severity?: string;
  need_categories?: string[];
  special_handling_reviewed: boolean;
  automation_eligible: boolean;
  automation_status: "auto_call" | "operator_review" | "operator_only" | "manual_only" | "blocked" | string;
};

export type PlannedCallDto = {
  recipient_id: string;
  recipient_label: string;
  masked_phone: string;
  ready: boolean;
  route: string;
  idempotency_key: string;
  blocked_reasons: string[];
  authorized_contacts?: AuthorizedContactDto[];
  same_day_call_count?: number;
  operator_repeat_available?: boolean;
  operator_repeat_limit_reached?: boolean;
  same_day_repeat_warning?: string;
};

export type PreflightPlanDto = {
  id: string;
  batch_id: string;
  call_date?: string;
  ready_keys?: string[];
  created_at?: string;
};

export type ApprovalDto = {
  id: string;
  plan_id?: string;
  batch_id?: string;
  recipient_ids?: string[];
  approved_keys?: string[];
  operator?: string;
  approved_at?: string;
  note?: string;
  confirmations?: Record<string, boolean>;
  authorization_phrase?: string;
  stale: boolean;
};

export type IntakeResultDto = {
  id: string;
  recipient_id?: string;
  status?: string;
  summary: string;
  human_review?: boolean;
  needs?: NeedDto[];
};

export type NeedDto = {
  category?: string;
  urgency?: string;
  items?: string[];
  notes?: string;
  confidence?: string;
  [key: string]: unknown;
};

export type ServiceRequestDto = {
  id: string;
  recipient_id: string;
  recipient_name?: string;
  category: string;
  queue: string;
  sla_hours: number;
  priority: ServiceRequestPriority | string;
  status: ServiceRequestStatus | string;
  items: string[];
  notes: string;
  human_review_reason: string;
  created_at?: string;
  updated_at?: string;
  update_count?: number;
  update_history?: Array<Record<string, unknown>>;
};

export type CallbackRequestDto = {
  id: string;
  recipient_id: string;
  recipient_name: string;
  source: string;
  request_text: string;
  status: string;
  priority: string;
  operator: string;
  created_at: string;
  updated_at: string;
  resolution_note: string;
  safety_category: SafetyCategory | string;
  condition: string;
  masked_phone: string;
  delivery_area: string;
  blocked: boolean;
};

export type DashboardPayload = {
  service: string;
  summary: {
    recipients: number;
    ready: number;
    blocked: number;
    service_requests: number;
    stale_approvals: number;
  };
  recipients: RecipientCardDto[];
  planned_calls: PlannedCallDto[];
  call_status: {
    preflight_plans: PreflightPlanDto[];
    approvals: ApprovalDto[];
    intake_results: IntakeResultDto[];
  };
  service_requests: ServiceRequestDto[];
  callback_requests?: CallbackRequestDto[];
};

export type OperationsDashboardPayload = {
  service: string;
  slogan: {
    care_seen: string;
    needs_heard: string;
    help_delivered: string;
  };
  summary: {
    registered_recipients: number;
    ready_for_auto_call: number;
    eligible_not_selected: number;
    operator_control_required: number;
    not_allowed_for_auto_call: number;
    service_requests: number;
    orders_ready: number;
    urgent_callbacks: number;
  };
  by_safety_category: Record<string, number>;
  by_condition: Record<string, number>;
  by_need_category: Record<string, number>;
  session: {
    calls_planned: number;
    calls_completed: number;
    needs_captured: number;
    orders_generated: number;
    human_reviews: number;
    stale_approvals: number;
  };
  alerts: {
    urgent_callbacks: number;
    stale_approvals: number;
    eligible_not_selected: number;
  };
};

export type CallbackRequestsPayload = {
  summary: {
    new: number;
    in_review: number;
    callback_approved: number;
    resolved: number;
  };
  callback_requests: CallbackRequestDto[];
};

export type RecipientDetailPayload = {
  recipient: RecipientCardDto;
  care_profile: {
    condition: string;
    severity: string;
    language: string;
    timezone: string;
    communication_rules: string[];
    consent_status: string;
    consent_evidence: string;
    authorized_contacts: AuthorizedContactDto[];
  };
  contact_channels: {
    phone_e164: string;
    caregiver_phone_e164: string;
  };
  call_outcome: IntakeResultDto | null;
  extracted_needs: NeedDto[];
  service_requests: ServiceRequestDto[];
  risk_audit: RiskAuditEntryDto[];
  card_audit: RecipientCardAuditEntryDto[];
  approvals: ApprovalDto[];
  approval_invalidated?: boolean;
};

export type AuthorizedContactDto = {
  name: string;
  relationship: string;
  can_answer_intake: boolean;
  preferred_goodbye: string;
};

export type RiskAuditEntryDto = {
  id: number;
  recipient_id: string;
  old_value: SafetyCategory | string;
  new_value: SafetyCategory | string;
  operator: string;
  changed_at: string;
  note: string;
};

export type RecipientCardAuditEntryDto = {
  id: number;
  recipient_id: string;
  operator: string;
  changed_at: string;
  summary: string;
};

export type RecipientCardUpdatePayload = {
  display_name: string;
  phone_e164: string;
  caregiver_phone_e164: string;
  delivery_area: string;
  address: string;
  notes: string;
  safety_category: SafetyCategory;
  condition: string;
  severity: string;
  language: string;
  timezone: string;
  communication_rules: string[];
  authorized_contacts: AuthorizedContactDto[];
  safety_change_reason?: string;
  operator: string;
};

export type PrintOrderDto = ServiceRequestDto & {
  recipient_name: string;
  recipient_masked_phone?: string;
  recipient_delivery_area?: string;
  recipient_address?: string;
  care_summary?: string;
  care_notes?: string;
};

export type PrintOrdersPayload = {
  service_requests: PrintOrderDto[];
};

export type PreflightPayload = {
  plan_id?: string;
  batch_id?: string;
  call_date?: string;
  ready_keys?: string[];
  ready_previews?: PlannedCallDto[];
  manual_previews?: PlannedCallDto[];
  blocked_previews?: PlannedCallDto[];
};

export type BatchPayload = {
  batch: {
    id: string;
    label: string;
    call_date: string;
    selected_recipient_ids: string[];
  };
};

export type ApprovalRequest = {
  plan_id: string;
  approved_keys: string[];
  operator: string;
  note?: string;
  confirmations: Record<string, boolean>;
  authorization_phrase: string;
};

export type ApprovalResponse = {
  approved: boolean;
  status: string;
  blocked_reasons: string[];
  approval: ApprovalDto | null;
};

export type ExecutionRequest = {
  plan_id: string;
  approval_id: string;
  approved_keys?: string[];
  confirmations?: Record<string, boolean>;
  authorization_phrase?: string;
};

export type ExecutionResponse = {
  accepted: boolean;
  mode: "dry_run" | "live";
  real_calls_placed: number;
  blocked_reasons: string[];
  records: RunRecordDto[];
};

export type RunRecordDto = {
  id: string;
  plan_id: string;
  approval_id: string;
  recipient_id: string;
  idempotency_key: string;
  status: string;
  mode: string;
  provider_plan_id: string;
  provider_run_id: string;
  started_at: string;
  completed_at: string;
  error: string;
  masked_phone: string;
};

export type RunStatusPayload = {
  run: RunRecordDto;
};

export type RunResultsPayload = {
  run: RunRecordDto;
  intake_result: IntakeResultDto;
  service_requests: ServiceRequestDto[];
};

export type ImportedRunResultPayload =
  | (RunResultsPayload & {
      imported: true;
      provider_status: string;
    })
  | {
      imported: false;
      provider_status: string;
      run: RunRecordDto;
    };
