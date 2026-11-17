from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class EligibilityCriteria(BaseModel):
    """Configurable eligibility criteria.
    `required_fields` – list of keys that must be present in the credential payload.
    `field_rules` – optional dict of field name -> expected value or callable name.
    """
    id: str
    name: str
    required_fields: List[str] = Field(default_factory=list)
    field_rules: Dict[str, Any] = Field(default_factory=dict)

class EligibilityCheckRequest(BaseModel):
    credential_id: str
    criteria_id: str

class EligibilityCheckResponse(BaseModel):
    credential_id: str
    criteria_id: str
    is_eligible: bool
    missing_fields: List[str] = Field(default_factory=list)
    mismatched_fields: List[str] = Field(default_factory=list)
    explanation: str
    source: str = Field(..., description="'deterministic' or 'ai'")

