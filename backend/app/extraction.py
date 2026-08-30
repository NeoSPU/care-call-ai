"""Compatibility facade for CALL-E intake extraction.

Keep imports from `app.extraction` stable while the implementation is split
into focused modules.
"""

from .intake_extraction import extract_intake_result
from .intake_models import (
    ExtractedNeed,
    IntakeResult,
    IntakeStatus,
    NeedCategory,
    ReviewState,
    ReviewReasonCode,
    Urgency,
)

__all__ = (
    "ExtractedNeed",
    "IntakeResult",
    "IntakeStatus",
    "NeedCategory",
    "ReviewState",
    "ReviewReasonCode",
    "Urgency",
    "extract_intake_result",
)
