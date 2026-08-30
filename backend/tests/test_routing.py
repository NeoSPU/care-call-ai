import unittest

from app.domain import ServiceRequestStatus
from app.extraction import ExtractedNeed, IntakeResult, IntakeStatus, NeedCategory, ReviewReasonCode, ReviewState, Urgency
from app.routing import route_intake_result, route_need


class RoutingTest(unittest.TestCase):
    def test_routes_groceries_to_delivery_volunteers(self):
        request = route_need(
            "r-1",
            ExtractedNeed(
                category=NeedCategory.GROCERIES,
                items=("milk",),
                urgency=Urgency.THIS_WEEK,
            ),
        )
        self.assertEqual(request.queue, "delivery_volunteers")
        self.assertEqual(request.priority, "normal")
        self.assertEqual(request.status, ServiceRequestStatus.READY_TO_PRINT)

    def test_today_medication_is_urgent(self):
        request = route_need(
            "r-1",
            ExtractedNeed(
                category=NeedCategory.MEDICATION,
                items=("prescription pickup",),
                urgency=Urgency.TODAY,
            ),
        )
        self.assertEqual(request.queue, "pharmacy_delivery")
        self.assertEqual(request.priority, "urgent")

    def test_review_state_routes_to_review_status(self):
        request = route_need(
            "r-1",
            ExtractedNeed(
                category=NeedCategory.OTHER,
                items=("unclear",),
                urgency=Urgency.UNKNOWN,
                review_state=ReviewState.HUMAN_REVIEW,
            ),
        )
        self.assertEqual(request.status, ServiceRequestStatus.REVIEW)
        self.assertEqual(request.queue, "coordinator_review")

    def test_emergency_result_becomes_review_request(self):
        requests = route_intake_result(
            IntakeResult(
                recipient_id="r-1",
                status=IntakeStatus.EMERGENCY,
                human_review=True,
                review_reasons=("Call status requires human review: emergency.",),
            )
        )
        self.assertEqual(len(requests), 1)
        self.assertEqual(requests[0].status, "review")
        self.assertEqual(requests[0].priority, "urgent")

    def test_prohibited_only_result_does_not_create_empty_review_order(self):
        requests = route_intake_result(
            IntakeResult(
                recipient_id="r-1",
                status=IntakeStatus.COMPLETED,
                human_review=True,
                review_reasons=("Changed wording still says restricted request.",),
                review_reason_codes=(ReviewReasonCode.PROHIBITED_REQUEST_EXCLUDED,),
            )
        )

        self.assertEqual(requests, ())


if __name__ == "__main__":
    unittest.main()
