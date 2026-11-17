from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

class EligibilityCheckRequest(BaseModel):
    schema_id: str
    applicant_data: Dict[str, Any]
    eligibility_criteria: Dict[str, Any]

class EligibilityCheckResponse(BaseModel):
    is_eligible: bool
    confidence_score: float
    reasons: List[str]
    suggested_actions: List[str]

class FraudDetectionRequest(BaseModel):
    credential_payload: Dict[str, Any]
    issuer_metadata: Optional[Dict[str, Any]] = None

class FraudDetectionResponse(BaseModel):
    risk_level: str  # LOW, MEDIUM, HIGH, CRITICAL
    risk_score: Optional[int] = 0
    anomaly_detected: bool
    confidence_score: float
    detected_anomalies: List[str]
    recommendation: str

class NaturalLanguageQueryRequest(BaseModel):
    query: str

class NaturalLanguageQueryResponse(BaseModel):
    generated_sql: str
    explanation: str
    results: List[Dict[str, Any]]
    total_count: int
