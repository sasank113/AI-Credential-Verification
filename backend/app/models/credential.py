import uuid
from datetime import datetime
from sqlalchemy import Column, String, Integer, DateTime, JSON, ForeignKey, Text, Boolean
from app.core.database import Base

class CredentialSchemaModel(Base):
    __tablename__ = "credential_schemas"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    schema_name = Column(String, nullable=False)
    sunbird_schema_id = Column(String, unique=True, nullable=False)
    json_schema = Column(JSON, nullable=False)
    version = Column(String, default="1.0.0")
    created_at = Column(DateTime, default=datetime.utcnow)

class CredentialRecord(Base):
    __tablename__ = "credential_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    sunbird_osid = Column(String, unique=True, nullable=True)
    schema_id = Column(String, ForeignKey("credential_schemas.id"), nullable=False)
    recipient_identifier = Column(String, nullable=False)
    recipient_name = Column(String, nullable=True)
    status = Column(String, nullable=False, default="ISSUED")  # PENDING_AI, ISSUED, FAILED, REVOKED
    issued_by = Column(String, ForeignKey("users.id"), nullable=False)
    issue_date = Column(DateTime, default=datetime.utcnow)
    revocation_reason = Column(String, nullable=True)
    credential_payload = Column(JSON, nullable=False)
    bulk_job_id = Column(String, ForeignKey("bulk_jobs.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class BulkJob(Base):
    __tablename__ = "bulk_jobs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    schema_id = Column(String, ForeignKey("credential_schemas.id"), nullable=False)
    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    filename = Column(String, nullable=False)
    total_records = Column(Integer, default=0)
    processed_records = Column(Integer, default=0)
    successful_records = Column(Integer, default=0)
    failed_records = Column(Integer, default=0)
    duplicate_records = Column(Integer, default=0)
    status = Column(String, default="QUEUED")  # QUEUED, VALIDATING, PROCESSING, COMPLETED, COMPLETED_WITH_ERRORS, FAILED
    validation_errors = Column(JSON, nullable=True)   # File-level / format errors
    error_summary = Column(JSON, nullable=True)        # Per-record error details
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

class BulkJobRecord(Base):
    """Tracks the per-row issuance result for each bulk job."""
    __tablename__ = "bulk_job_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    bulk_job_id = Column(String, ForeignKey("bulk_jobs.id"), nullable=False)
    row_number = Column(Integer, nullable=False)
    recipient_identifier = Column(String, nullable=True)
    recipient_name = Column(String, nullable=True)
    status = Column(String, nullable=False, default="PENDING")  # PENDING, ISSUED, FAILED, DUPLICATE, INVALID
    error_message = Column(Text, nullable=True)
    sunbird_osid = Column(String, nullable=True)
    credential_record_id = Column(String, ForeignKey("credential_records.id"), nullable=True)
    raw_row_data = Column(JSON, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
