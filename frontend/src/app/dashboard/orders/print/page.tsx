import { PrintableOrderSheet } from "../../../../components/PrintableOrderSheet";
import { getDashboardData, getPrintOrders } from "../../../../lib/carecall-api";
import { getCurrentOperatorName } from "../../../../lib/current-operator";
import type { PrintOrderDto } from "../../../../lib/types";
import { urgentCallbackOpenCount } from "../../../../lib/urgent-callback-events";

function enrichOrders(
  orders: Awaited<ReturnType<typeof getPrintOrders>>,
  dashboard: Awaited<ReturnType<typeof getDashboardData>>,
) {
  const recipients = new Map(dashboard.recipients.map((recipient) => [recipient.id, recipient]));
  return {
    service_requests: orders.service_requests.map((request) => {
      const recipient = recipients.get(request.recipient_id);
      return {
        ...request,
        recipient_name: request.recipient_name ?? recipient?.display_name ?? request.recipient_id,
        recipient_masked_phone: request.recipient_masked_phone ?? recipient?.masked_phone,
        recipient_delivery_area: request.recipient_delivery_area ?? recipient?.delivery_area,
        recipient_address: request.recipient_address ?? recipient?.address,
        care_summary: request.care_summary ?? recipient?.route ?? "",
        care_notes: request.care_notes ?? recipient?.notes ?? "",
      } satisfies PrintOrderDto;
    }),
  };
}

export default async function PrintOrdersPage() {
  try {
    const [orders, dashboard, operatorName] = await Promise.all([
      getPrintOrders(),
      getDashboardData(),
      getCurrentOperatorName(),
    ]);
    const urgentCallbackCount = urgentCallbackOpenCount(dashboard.callback_requests ?? []);
    return (
      <PrintableOrderSheet
        operatorName={operatorName}
        orders={enrichOrders(orders, dashboard)}
        urgentCallbackCount={urgentCallbackCount}
      />
    );
  } catch {
    return <PrintableOrderSheet orders={{ service_requests: [] }} />;
  }
}
