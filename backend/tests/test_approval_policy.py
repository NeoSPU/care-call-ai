import unittest
from types import SimpleNamespace

from app.approval_policy import (
    REPEAT_CALL_CONFIRMATION,
    all_confirmations,
    repeat_call_blockers,
)


class ApprovalPolicyTest(unittest.TestCase):
    def test_all_confirmations_requires_every_live_gate(self):
        self.assertTrue(
            all_confirmations(
                {
                    "active_consent": True,
                    "care_route_match": True,
                    "exact_keyset": True,
                    "real_side_effects": True,
                }
            )
        )
        self.assertFalse(all_confirmations({"active_consent": True}))

    def test_repeat_call_requires_acknowledgement_when_available(self):
        blockers = repeat_call_blockers(
            (
                SimpleNamespace(
                    same_day_call_count=1,
                    operator_repeat_limit_reached=False,
                    operator_repeat_available=True,
                    recipient_label="Alex Raixon",
                ),
            ),
            {},
        )

        self.assertEqual(blockers, ("Same-day repeat call acknowledgement is required.",))

    def test_repeat_call_acknowledgement_allows_available_repeat(self):
        blockers = repeat_call_blockers(
            (
                SimpleNamespace(
                    same_day_call_count=1,
                    operator_repeat_limit_reached=False,
                    operator_repeat_available=True,
                    recipient_label="Alex Raixon",
                ),
            ),
            {REPEAT_CALL_CONFIRMATION: True},
        )

        self.assertEqual(blockers, ())


if __name__ == "__main__":
    unittest.main()
