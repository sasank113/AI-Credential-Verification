import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple, Optional, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.credential import CredentialRecord, BulkJob, BulkJobRecord
from app.services.sunbird_adapter import sunbird_adapter

# ─────────────────────────────────────────────────────────────────────────────
# Constants
# ─────────────────────────────────────────────────────────────────────────────

REQUIRED_COLUMNS: List[str] = ["recipient_name", "recipient_identifier"]
"""Minimum required CSV columns for bulk issuance."""

VALID_EMAIL_PATTERN = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

MAX_RECORDS_PER_JOB = 1000
"""Hard cap to prevent runaway uploads."""

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_headers(headers: List[str]) -> Dict[str, str]:
    """
    Return a mapping of raw_header -> normalized_header.
    Normalization: lowercase, strip whitespace, replace spaces/dashes with underscores.
    """
    return {h: h.strip().lower().replace(" ", "_").replace("-", "_") for h in headers}


def _validate_file_format(csv_content: str) -> Tuple[bool, List[str], Optional[csv.DictReader]]:
    """
    Phase 1 validation: check file is parseable and has required columns.
    Returns (ok, errors, reader).
    """
    errors: List[str] = []
    if not csv_content or not csv_content.strip():
        return False, ["CSV file is empty or contains only whitespace."], None

    # Try to parse headers
    try:
        reader = csv.DictReader(io.StringIO(csv_content))
        raw_headers = reader.fieldnames
    except Exception as ex:
        return False, [f"Failed to parse CSV file: {str(ex)}"], None

    if not raw_headers:
        return False, ["CSV file has no header row. Expected headers: " + ", ".join(REQUIRED_COLUMNS)], None

    # Normalize headers for case-insensitive matching
    norm_map = _normalize_headers(list(raw_headers))
    norm_headers = set(norm_map.values())

    missing: List[str] = []
    for req in REQUIRED_COLUMNS:
        # Accept common aliases
        aliases = _get_column_aliases(req)
        if not any(a in norm_headers for a in aliases):
            missing.append(req)

    if missing:
        errors.append(
            f"Missing required column(s): {', '.join(missing)}. "
            f"CSV must contain: {', '.join(REQUIRED_COLUMNS)}. "
            f"Detected columns: {', '.join(norm_headers)}"
        )
        return False, errors, None

    return True, [], reader


def _get_column_aliases(col: str) -> List[str]:
    """Returns acceptable alternative column names for a required field."""
    alias_map: Dict[str, List[str]] = {
        "recipient_name": ["recipient_name", "name", "full_name", "candidate_name", "student_name", "employee_name"],
        "recipient_identifier": [
            "recipient_identifier", "register_number", "email", "email_address", "identifier",
            "recipient_email", "student_email", "employee_email"
        ],
    }
    return alias_map.get(col, [col])


def _resolve_field(row: Dict[str, Any], field: str) -> Optional[str]:
    """
    Resolve a field value from a row, checking aliases and normalizing keys.
    Returns the first non-empty match or None.
    """
    aliases = _get_column_aliases(field)
    # Build a normalized-key map of the row
    row_norm = {k.strip().lower().replace(" ", "_").replace("-", "_"): v for k, v in row.items()}
    for alias in aliases:
        val = row_norm.get(alias)
        if val is not None and str(val).strip():
            return str(val).strip()
    return None


def _validate_row(row: Dict[str, Any], row_idx: int) -> List[str]:
    """
    Validates a single row. Returns list of error strings (empty = valid).
    """
    errors: List[str] = []

    recipient_id = _resolve_field(row, "recipient_identifier")
    recipient_name = _resolve_field(row, "recipient_name")

    if not recipient_name:
        errors.append("'recipient_name' is missing or empty")

    if not recipient_id:
      errors.append("'recipient_identifier' (register number or email) is missing or empty")

    return errors


async def _check_duplicate_in_db(db: AsyncSession, recipient_id: str, schema_id: str) -> bool:
    """
    Returns True if a non-revoked credential already exists for this recipient + schema.
    """
    result = await db.execute(
        select(CredentialRecord).where(
            CredentialRecord.recipient_identifier == recipient_id,
            CredentialRecord.schema_id == schema_id,
            CredentialRecord.status != "REVOKED",
            CredentialRecord.status != "FAILED",
        )
    )
    return result.scalars().first() is not None


# ─────────────────────────────────────────────────────────────────────────────
# Main Processing Function
# ─────────────────────────────────────────────────────────────────────────────

async def process_bulk_csv_issuance(
    db: AsyncSession,
    bulk_job_id: str,
    schema_id: str,
    entity_name: str,
    user_id: str,
    csv_content: str,
    json_schema: Optional[Dict[str, Any]] = None,
) -> BulkJob:
    """
    Full pipeline:
      1. Load BulkJob from DB.
      2. Validate file format & required columns.
      3. Validate individual records; classify as VALID / INVALID / DUPLICATE.
      4. Process valid records via Sunbird RC adapter.
      5. Persist per-row BulkJobRecord entries and CredentialRecord on success.
      6. Update BulkJob counters and final status.

    A credential is only marked ISSUED if Sunbird RC issuance succeeds.
    """

    # ── 0. Load job ──────────────────────────────────────────────────────────
    job = await db.get(BulkJob, bulk_job_id)
    if not job:
        raise ValueError(f"BulkJob {bulk_job_id} not found")

    job.status = "VALIDATING"
    await db.commit()

    # ── 1. File-level format validation ─────────────────────────────────────
    format_ok, format_errors, _reader = _validate_file_format(csv_content)
    if not format_ok:
        job.status = "FAILED"
        job.validation_errors = {"file_errors": format_errors}
        job.completed_at = datetime.utcnow()
        await db.commit()
        return job

    # Re-create reader to iterate from the beginning
    reader = csv.DictReader(io.StringIO(csv_content))
    rows = list(reader)

    # Guard against oversized uploads
    if len(rows) > MAX_RECORDS_PER_JOB:
        job.status = "FAILED"
        job.validation_errors = {
            "file_errors": [
                f"CSV contains {len(rows)} records which exceeds the limit of {MAX_RECORDS_PER_JOB} records per upload."
            ]
        }
        job.completed_at = datetime.utcnow()
        await db.commit()
        return job

    if len(rows) == 0:
        job.status = "FAILED"
        job.validation_errors = {"file_errors": ["CSV file has no data rows (only a header was found)."]}
        job.completed_at = datetime.utcnow()
        await db.commit()
        return job

    job.total_records = len(rows)
    job.status = "PROCESSING"
    await db.commit()

    # ── 2. Per-record validation + processing ───────────────────────────────
    success_count = 0
    fail_count = 0
    duplicate_count = 0
    per_row_errors: List[Dict[str, Any]] = []

    # Track in-batch duplicates (within this upload) by recipient email
    seen_in_batch: Set[str] = set()

    for idx, row in enumerate(rows):
        row_num = idx + 1  # 1-indexed for human-readable reporting

        # ── A. Row validation ────────────────────────────────────────────────
        row_errors = _validate_row(row, idx)
        recipient_id = _resolve_field(row, "recipient_identifier") or ""
        recipient_name = _resolve_field(row, "recipient_name") or f"Recipient_{row_num}"

        if row_errors:
            # Record invalid row
            job_record = BulkJobRecord(
                bulk_job_id=bulk_job_id,
                row_number=row_num,
                recipient_identifier=recipient_id or None,
                recipient_name=recipient_name,
                status="INVALID",
                error_message="; ".join(row_errors),
                raw_row_data=dict(row),
                processed_at=datetime.utcnow(),
            )
            db.add(job_record)
            fail_count += 1
            per_row_errors.append({
                "row": row_num,
                "recipient": recipient_id or "(unknown)",
                "status": "INVALID",
                "errors": row_errors,
            })
            job.processed_records = idx + 1
            job.failed_records = fail_count
            job.successful_records = success_count
            job.duplicate_records = duplicate_count
            await db.commit()
            continue

        # ── B. Duplicate detection ────────────────────────────────────────────
        # Within-batch duplicate
        batch_key = f"{recipient_id}|{schema_id}"
        if batch_key in seen_in_batch:
            job_record = BulkJobRecord(
                bulk_job_id=bulk_job_id,
                row_number=row_num,
                recipient_identifier=recipient_id,
                recipient_name=recipient_name,
                status="DUPLICATE",
                error_message=(
                    f"Duplicate within upload: recipient '{recipient_id}' "
                    "appears more than once for this schema in this CSV batch."
                ),
                raw_row_data=dict(row),
                processed_at=datetime.utcnow(),
            )
            db.add(job_record)
            duplicate_count += 1
            per_row_errors.append({
                "row": row_num,
                "recipient": recipient_id,
                "status": "DUPLICATE",
                "errors": ["Duplicate entry within this CSV upload"],
            })
            job.processed_records = idx + 1
            job.failed_records = fail_count
            job.successful_records = success_count
            job.duplicate_records = duplicate_count
            await db.commit()
            continue

        # Database duplicate check
        is_db_dup = await _check_duplicate_in_db(db, recipient_id, schema_id)
        if is_db_dup:
            job_record = BulkJobRecord(
                bulk_job_id=bulk_job_id,
                row_number=row_num,
                recipient_identifier=recipient_id,
                recipient_name=recipient_name,
                status="DUPLICATE",
                error_message=(
                    f"Credential for '{recipient_id}' with this schema already exists in the registry. "
                    "Skipped to prevent duplicate issuance."
                ),
                raw_row_data=dict(row),
                processed_at=datetime.utcnow(),
            )
            db.add(job_record)
            duplicate_count += 1
            per_row_errors.append({
                "row": row_num,
                "recipient": recipient_id,
                "status": "DUPLICATE",
                "errors": ["Credential already exists for this recipient + schema combination"],
            })
            job.processed_records = idx + 1
            job.failed_records = fail_count
            job.successful_records = success_count
            job.duplicate_records = duplicate_count
            await db.commit()
            continue

        seen_in_batch.add(batch_key)

        # ── C. Build credential payload ───────────────────────────────────────
        payload = {
          str(k).strip().lower().replace(" ", "_").replace("-", "_"): str(v).strip()
          for k, v in row.items()
          if v is not None and str(v).strip()
        }

        payload["recipient_identifier"] = recipient_id
        payload["recipient_name"] = recipient_name

        # ── D. Sunbird RC issuance ─────────────────────────────────────────────
        # CRITICAL: Only mark ISSUED if the Sunbird RC call succeeds.
        try:
            osid, vc_data = await sunbird_adapter.issue_vc(
                entity_name=entity_name,
                payload=payload,
                json_schema=json_schema,
            )

            # ── E. Persist CredentialRecord only after confirmed success ────────
            cred_record = CredentialRecord(
                sunbird_osid=osid,
                schema_id=schema_id,
                recipient_identifier=recipient_id,
                recipient_name=recipient_name,
                status="ISSUED",
                issued_by=user_id,
                credential_payload=vc_data,
                bulk_job_id=bulk_job_id,
            )
            db.add(cred_record)
            await db.flush()  # get cred_record.id without full commit

            job_record = BulkJobRecord(
                bulk_job_id=bulk_job_id,
                row_number=row_num,
                recipient_identifier=recipient_id,
                recipient_name=recipient_name,
                status="ISSUED",
                sunbird_osid=osid,
                credential_record_id=cred_record.id,
                raw_row_data=dict(row),
                processed_at=datetime.utcnow(),
            )
            db.add(job_record)
            success_count += 1

        except Exception as ex:
            # Issuance failure: record the error, do NOT create a CredentialRecord
            err_msg = str(ex)
            job_record = BulkJobRecord(
                bulk_job_id=bulk_job_id,
                row_number=row_num,
                recipient_identifier=recipient_id,
                recipient_name=recipient_name,
                status="FAILED",
                error_message=f"Sunbird RC issuance error: {err_msg}",
                raw_row_data=dict(row),
                processed_at=datetime.utcnow(),
            )
            db.add(job_record)
            fail_count += 1
            per_row_errors.append({
                "row": row_num,
                "recipient": recipient_id,
                "status": "FAILED",
                "errors": [f"Issuance error: {err_msg}"],
            })

        # ── F. Update running counters ─────────────────────────────────────────
        job.processed_records = idx + 1
        job.successful_records = success_count
        job.failed_records = fail_count
        job.duplicate_records = duplicate_count
        await db.commit()

    # ── 3. Finalize job status ───────────────────────────────────────────────
    total_non_success = fail_count + duplicate_count
    if success_count == 0 and total_non_success > 0:
        job.status = "FAILED"
    elif total_non_success > 0:
        job.status = "COMPLETED_WITH_ERRORS"
    else:
        job.status = "COMPLETED"

    if per_row_errors:
        job.error_summary = {"errors": per_row_errors, "total_errors": len(per_row_errors)}

    job.completed_at = datetime.utcnow()
    await db.commit()
    return job
