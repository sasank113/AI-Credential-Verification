from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_email: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    ip_address: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    timestamp: datetime

    class Config:
        from_attributes = True

class DashboardAnalyticsResponse(BaseModel):
    total_credentials_issued: int
    total_verifications_conducted: int
    total_verified_credentials: int
    total_revocations: int = 0
    # Main pending count – the endpoint supplies this
    total_pending_requests: int
    # Backward‑compatible alias used by older clients
    pending_credential_requests: Optional[int] = None
    eligibility_outcomes: Dict[str, int]
    credential_lifecycle_stats: Dict[str, int]
    total_flagged_ai_anomalies: int
    active_schemas_count: int
    recent_activity: List[Dict[str, Any]]
    issuance_trends: List[Dict[str, Any]]
    risk_distribution: Dict[str, int]
