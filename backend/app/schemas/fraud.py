from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

class FraudCheckResponse(BaseModel):
    credential_id: str
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Risk score between 0 (no risk) and 1 (high risk)")
    warning_signals: List[str] = Field(default_factory=list, description="List of detected deterministic warning signals")
    explanation: str = Field(..., description="Human‑readable explanation of the assessment")
    recommended_action: str = Field(..., description="Suggested next step, e.g., 'manual review', 'approve', 'reject'")
    model_confidence: Optional[float] = Field(None, description="Probability from the ML model component, if available")

class FraudReviewRequest(BaseModel):
    """Incoming payload when a human reviewer records a decision."""
    credential_id: str
    reviewer_id: str
    decision: str = Field(..., description="One of 'APPROVE', 'REJECT', 'ESCALATE'")
    notes: Optional[str] = None

class FraudReviewResponse(BaseModel):
    """Pydantic representation of a persisted fraud review record."""
    id: str
    credential_id: str
    reviewer_id: str
    decision: str
    notes: Optional[str] = None
    reviewed_at: datetime

from typing import List, Optional, Dict, Any

class FraudCheckResponse(BaseModel):
    credential_id: str
    risk_score: float = Field(..., ge=0.0, le=1.0, description="Risk score between 0 (no risk) and 1 (high risk)")
    warning_signals: List[str] = Field(default_factory=list, description="List of detected deterministic warning signals")
    explanation: str = Field(..., description="Human‑readable explanation of the assessment")
    recommended_action: str = Field(..., description="Suggested next step, e.g., 'manual review', 'approve', 'reject'")
    model_confidence: Optional[float] = Field(None, description="Probability from the ML model component, if available")

from datetime import datetime

class FraudReviewResponse(BaseModel):
    id: str
    credential_id: str
    reviewer_id: str
    decision: str
    notes: Optional[str] = None
    reviewed_at: datetime

    credential_id: str
    reviewer_id: str
    decision: str = Field(..., description="One of 'APPROVE', 'REJECT', 'ESCALATE'")
    notes: Optional[str] = None

