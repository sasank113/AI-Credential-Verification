from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class SchemaCreate(BaseModel):
    schema_name: str
    sunbird_schema_id: str
    json_schema: Dict[str, Any]
    version: str = "1.0.0"
    description: Optional[str] = None

class SchemaResponse(SchemaCreate):
    id: str
    created_at: datetime

    class Config:
        from_attributes = True

class CredentialIssueRequest(BaseModel):
    schema_id: str
    recipient_identifier: str
    recipient_name: str
    credential_data: Dict[str, Any]

class CredentialRevokeRequest(BaseModel):
    sunbird_osid: str
    reason: str

class CredentialVerifyRequest(BaseModel):
    credential_payload: Optional[Dict[str, Any]] = None
    sunbird_osid: Optional[str] = None

class CredentialVerifyResponse(BaseModel):
    is_valid: bool
    status: str
    message: str
    verification_details: Dict[str, Any]

class CredentialResponse(BaseModel):
    id: str
    sunbird_osid: Optional[str] = None
    schema_id: str
    recipient_identifier: str
    recipient_name: Optional[str] = None
    status: str
    issued_by: str
    issue_date: datetime
    revocation_reason: Optional[str] = None
    credential_payload: Dict[str, Any]
    bulk_job_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

# ── Bulk Job Schemas ──────────────────────────────────────────────────────────

class BulkJobRecordResponse(BaseModel):
    id: str
    bulk_job_id: str
    row_number: int
    recipient_identifier: Optional[str] = None
    recipient_name: Optional[str] = None
    status: str  # ISSUED, FAILED, DUPLICATE, INVALID
    error_message: Optional[str] = None
    sunbird_osid: Optional[str] = None
    credential_record_id: Optional[str] = None
    raw_row_data: Optional[Dict[str, Any]] = None
    processed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

class BulkJobResponse(BaseModel):
    id: str
    schema_id: str
    created_by: str
    filename: str
    total_records: int
    processed_records: int
    successful_records: int
    failed_records: int
    duplicate_records: int
    status: str  # QUEUED, VALIDATING, PROCESSING, COMPLETED, COMPLETED_WITH_ERRORS, FAILED
    validation_errors: Optional[Dict[str, Any]] = None
    error_summary: Optional[Dict[str, Any]] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class BulkJobDetailResponse(BulkJobResponse):
    """Extended job response including per-row records."""
    records: List[BulkJobRecordResponse] = []

    class Config:
        from_attributes = True
