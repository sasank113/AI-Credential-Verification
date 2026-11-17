from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import re
from app.core.database import get_db
from app.core.security import get_current_user, PermissionChecker
from app.models.user import User
from app.models.credential import CredentialRecord, CredentialSchemaModel, BulkJob, BulkJobRecord
from app.schemas.credentials import (
    CredentialIssueRequest,
    CredentialRevokeRequest,
    CredentialVerifyRequest,
    CredentialVerifyResponse,
    CredentialResponse,
    SchemaCreate,
    SchemaResponse,
    BulkJobResponse,
    BulkJobDetailResponse,
    BulkJobRecordResponse,
)
# fraud schemas
from app.schemas.fraud import (
    FraudCheckResponse,
    FraudReviewRequest,
    FraudReviewResponse,
)

# nl‑query schemas
from app.schemas.nl_query import NaturalLanguageQueryRequest, NaturalLanguageQueryResponse
# eligibility schemas
from app.schemas.eligibility import (
    EligibilityCheckRequest,
    EligibilityCheckResponse,
)
# fraud model for review response
from app.models.fraud import FraudReview
# eligibility models
from app.models.eligibility import EligibilityCriteriaModel
from app.models.eligibility_result import EligibilityResult
from app.services.sunbird_adapter import sunbird_adapter
from app.services.bulk_service import process_bulk_csv_issuance, MAX_RECORDS_PER_JOB, MAX_FILE_SIZE_BYTES
from app.services.audit_service import log_audit_event
from jsonschema import Draft7Validator, SchemaError

router = APIRouter()

# --- 1. Registry Setup and Credential Schema Configuration ---
@router.post("/schemas", response_model=SchemaResponse)
async def create_schema(
    schema_in: SchemaCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ADMIN"]))
):
    """
    Operation 1: Registry setup and credential schema configuration.
    Validates JSON Schema Draft-7 compliance and registers the schema definition in Sunbird RC.
    """
    # 1. Validate JSON schema syntax
    is_valid_schema, schema_syntax_errors = sunbird_adapter.validate_json_schema(schema_in.json_schema)
    if not is_valid_schema:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON Schema Draft-7 definition: {'; '.join(schema_syntax_errors)}"
        )

    # 2. Check if Sunbird schema ID is unique
    existing_schema = await db.execute(
        select(CredentialSchemaModel).where(CredentialSchemaModel.sunbird_schema_id == schema_in.sunbird_schema_id)
    )
    if existing_schema.scalars().first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Schema with Sunbird schema ID '{schema_in.sunbird_schema_id}' is already registered."
        )

    # 3. Register in Sunbird RC Schema Registry
    try:
        await sunbird_adapter.create_schema(
            schema_name=schema_in.schema_name,
            json_schema=schema_in.json_schema,
            description=schema_in.description
        )
    except Exception as ex:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sunbird RC schema registration failed: {str(ex)}"
        )

    # 4. Store schema reference and metadata in PostgreSQL
    schema_obj = CredentialSchemaModel(
        schema_name=schema_in.schema_name,
        sunbird_schema_id=schema_in.sunbird_schema_id,
        json_schema=schema_in.json_schema,
        version=schema_in.version
    )
    db.add(schema_obj)
    await db.commit()
    await db.refresh(schema_obj)
    
    await log_audit_event(
        db, action="CREATE_SCHEMA", resource_type="SCHEMA", 
        user_id=current_user.id, user_email=current_user.email, resource_id=schema_obj.id,
        details={"schema_name": schema_obj.schema_name, "sunbird_schema_id": schema_obj.sunbird_schema_id}
    )
    return schema_obj

@router.get("/schemas", response_model=List[SchemaResponse])
async def list_schemas(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lists all active registered credential schemas.
    """
    result = await db.execute(select(CredentialSchemaModel).order_by(CredentialSchemaModel.created_at.desc()))
    return result.scalars().all()

@router.get("/schemas/{schema_id}", response_model=SchemaResponse)
async def get_schema_by_id(
    schema_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves a specific credential schema definition by ID.
    """
    schema_obj = await db.get(CredentialSchemaModel, schema_id)
    if not schema_obj:
        raise HTTPException(status_code=404, detail=f"Credential Schema with ID '{schema_id}' not found.")
    return schema_obj

# --- 2. Credential Issuance & 3. Storage of References and Metadata ---
@router.post("/issue", response_model=CredentialResponse)
async def issue_credential(
    req: CredentialIssueRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ISSUER", "ADMIN"]))
):
    """
    Operation 2: Credential issuance & Operation 3: Storage of credential references and relevant metadata.
    Validates recipient data against registered schema, calls Sunbird RC issuance engine,
    and stores cryptographic credential references and audit trails in PostgreSQL.
    """
    schema_obj = await db.get(CredentialSchemaModel, req.schema_id)
    if not schema_obj:
        raise HTTPException(status_code=404, detail=f"Credential Schema with ID '{req.schema_id}' not found.")

    # 1. Pre-Issuance Schema Validation against registered JSON Schema
    if schema_obj.json_schema:
        try:
            validator = Draft7Validator(schema_obj.json_schema)
            schema_errors = list(validator.iter_errors(req.credential_data))
            if schema_errors:
                err_msgs = [f"[{' -> '.join(str(p) for p in err.path) if err.path else 'root'}]: {err.message}" for err in schema_errors]
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Credential data fails schema validation: {'; '.join(err_msgs)}"
                )
        except SchemaError as ex:
            raise HTTPException(status_code=400, detail=f"Invalid schema definition: {ex.message}")
        # 2. Prevent duplicate credential issuance
        register_number = req.credential_data.get("register_number")

        if register_number:
          existing_result = await db.execute(
            select(CredentialRecord).where(
                CredentialRecord.schema_id == req.schema_id,
                CredentialRecord.status != "REVOKED"
            )
        )

        existing_credentials = existing_result.scalars().all()

        for existing_credential in existing_credentials:
            existing_subject = (
                existing_credential.credential_payload or {}
            ).get("credentialSubject", {})

            existing_register = existing_subject.get("register_number")

            if existing_register and existing_register.strip() == register_number.strip():
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"A credential already exists for register number "
                        f"'{register_number}' under this schema."
                    )
                )
    # 2. Call Sunbird RC Integration Service
    try:
        osid, vc_payload = await sunbird_adapter.issue_vc(
            entity_name=schema_obj.schema_name,
            payload={
                "recipient_identifier": req.recipient_identifier,
                "recipient_name": req.recipient_name,
                **req.credential_data
            },
            json_schema=schema_obj.json_schema
        )
    except Exception as ex:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Sunbird RC credential issuance failed: {str(ex)}"
        )

    # 3. Store Credential Reference and Metadata in PostgreSQL
    cred = CredentialRecord(
        sunbird_osid=osid,
        schema_id=req.schema_id,
        recipient_identifier=req.recipient_identifier,
        recipient_name=req.recipient_name,
        status="ISSUED",
        issued_by=current_user.id,
        credential_payload=vc_payload
    )
    db.add(cred)
    await db.commit()
    await db.refresh(cred)

    await log_audit_event(
        db, action="ISSUE_CREDENTIAL", resource_type="CREDENTIAL",
        user_id=current_user.id, user_email=current_user.email, resource_id=cred.id,
        details={"osid": osid, "recipient": req.recipient_identifier, "schema": schema_obj.schema_name}
    )
    return cred

# --- 4. Credential Verification ---
@router.post("/verify", response_model=CredentialVerifyResponse)
async def verify_credential(
    req: CredentialVerifyRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["VERIFIER", "ISSUER", "ADMIN", "AUDITOR"]))
):
    """
    Operation 4: Credential verification.
    Verifies W3C standard compliance, cryptographic signature proof, and registry revocation status.
    Accepts full W3C credential JSON payload OR a Sunbird OSID reference.
    """
    payload = req.credential_payload
    osid = req.sunbird_osid

    # If OSID is provided without payload, retrieve credential from registry / database
    if not payload and osid:
        cred_res = await db.execute(select(CredentialRecord).where(CredentialRecord.sunbird_osid == osid))
        db_cred = cred_res.scalars().first()
        if db_cred:
            payload = db_cred.credential_payload
        else:
            registry_res = await sunbird_adapter.get_vc_by_osid("Certificate", osid)
            if not registry_res:
                raise HTTPException(status_code=404, detail=f"Credential reference with OSID '{osid}' not found in registry.")
            payload = registry_res

    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either 'credential_payload' or 'sunbird_osid' must be provided for verification."
        )

    # Determine entity name from payload
    types = payload.get("type", ["VerifiableCredential", "Certificate"])
    entity_name = types[-1] if isinstance(types, list) and len(types) > 1 else "Certificate"

    # Verify via Sunbird RC integration adapter
    is_valid, msg, details = await sunbird_adapter.verify_vc(entity_name, payload)

    await log_audit_event(
        db, action="VERIFY_CREDENTIAL", resource_type="CREDENTIAL",
        user_id=current_user.id, user_email=current_user.email,
        details={"is_valid": is_valid, "status": details.get("status", "ISSUED" if is_valid else "INVALID"), "message": msg}
    )

    return CredentialVerifyResponse(
        is_valid=is_valid,
        status=details.get("status", "ISSUED" if is_valid else "INVALID"),
        message=msg,
        verification_details=details
    )

# --- 5. Credential Revocation ---
@router.post("/revoke")
async def revoke_credential(
    req: CredentialRevokeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ISSUER", "ADMIN"]))
):
    """
    Operation 5: Credential revocation.
    Updates the registry status to REVOKED in Sunbird RC and stores revocation reasons and timestamps in PostgreSQL.
    """
    result = await db.execute(select(CredentialRecord).where(CredentialRecord.sunbird_osid == req.sunbird_osid))
    cred = result.scalars().first()
    if not cred:
        raise HTTPException(status_code=404, detail=f"Credential with OSID '{req.sunbird_osid}' not found in system.")

    if cred.status == "REVOKED":
        return {
            "message": f"Credential {req.sunbird_osid} is already marked as REVOKED.",
            "osid": req.sunbird_osid,
            "status": "REVOKED",
            "revocation_reason": cred.revocation_reason
        }

    schema_obj = await db.get(CredentialSchemaModel, cred.schema_id)
    entity_name = schema_obj.schema_name if schema_obj else "Credential"

    # Revoke in Sunbird RC Registry
    revoked = await sunbird_adapter.revoke_vc(entity_name, req.sunbird_osid, req.reason)
    if not revoked:
        raise HTTPException(status_code=500, detail="Failed to revoke credential in Sunbird RC registry service.")

    # Update state in local PostgreSQL database
    cred.status = "REVOKED"
    cred.revocation_reason = req.reason
    await db.commit()

    await log_audit_event(
        db, action="REVOKE_CREDENTIAL", resource_type="CREDENTIAL",
        user_id=current_user.id, user_email=current_user.email, resource_id=cred.id,
        details={"osid": req.sunbird_osid, "reason": req.reason}
    )

    return {
        "message": "Credential revoked successfully in Sunbird RC registry",
        "osid": req.sunbird_osid,
        "status": "REVOKED",
        "revunciation_reason": req.reason
    }

# --- Fraud Detection Endpoints ---
@router.get("/fraud/{credential_id}", response_model=FraudCheckResponse)
async def fraud_check(
    credential_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ISSUER", "ADMIN", "AUDITOR"]))
):
    """Run deterministic + ML‑based fraud assessment for a stored credential."""
    from app.services.fraud_service import assess_fraud
    return await assess_fraud(db, credential_id)

@router.post("/fraud/review", response_model=FraudReviewResponse)
async def fraud_review(
    review: FraudReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ADMIN", "AUDITOR"]))
):
    """Record a human reviewer decision for a fraud assessment."""
    from app.services.fraud_service import record_fraud_review
    return await record_fraud_review(db, review)
# --- OCR-Based Certificate Fraud Comparison ---

@router.post("/fraud/{credential_id}/compare-certificate")
async def compare_certificate(
    credential_id: str,
    file: UploadFile = File(...),
    edited_student_name: Optional[str] = Form(None),
    edited_register_number: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ADMIN", "AUDITOR", "ISSUER"]))
):
    """Extract certificate fields and compare them with the stored credential."""

    import tempfile
    from pathlib import Path
    from app.services.ocr_service import extract_certificate_fields

    # 1. Find the original credential
    cred = await db.get(CredentialRecord, credential_id)

    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found.")

    # 2. Validate uploaded image
    allowed_types = {"image/jpeg", "image/png", "image/jpg"}

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG and PNG certificate images are supported."
        )

    content = await file.read()

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image exceeds 10 MB.")

    suffix = Path(file.filename or "certificate.jpeg").suffix.lower()

    if suffix not in {".jpeg", ".jpg", ".png"}:
        raise HTTPException(status_code=400, detail="Invalid image extension.")

    # 3. Run OCR and Visual Security Checks (Logo, Watermark, Stamp, Tampering)
    temp_path = None
    extracted = {}
    visual_verification = None

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
            temp.write(content)
            temp_path = temp.name

        extracted = extract_certificate_fields(temp_path)

        try:
            from app.services.visual_verification_service import verify_certificate_visual_features
            visual_verification = verify_certificate_visual_features(
               temp_path,
               ocr_texts=extracted.get("ocr_text", [])
            )
        except Exception as v_err:
            visual_verification = {
                "visual_authenticity_score": 0.0,
                "visual_verdict": "ERROR",
                "error": str(v_err),
                "warning_flags": [f"Visual verification error: {str(v_err)}"]
            }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Certificate OCR failed: {str(exc)}"
        )

    finally:
        if temp_path and Path(temp_path).exists():
            Path(temp_path).unlink()

    # 4. Read original credential data
    payload = cred.credential_payload or {}
    subject = payload.get("credentialSubject") or {}

    if not isinstance(subject, dict):
        subject = {}

    # 4. Read original credential data with broad field alias resolution
    payload = cred.credential_payload or {}
    subject = payload.get("credentialSubject") or {}
    if not isinstance(subject, dict):
        subject = {}

    def _resolve_subject_field(field_names: list, default: Any = None):
        for name in field_names:
            if name in subject and subject[name] not in (None, ""):
                return subject[name]
        return default

    original_values = {
        "student_name": _resolve_subject_field(
            ["student_name", "recipient_name", "candidate_name", "full_name", "name"],
            cred.recipient_name
        ),
        "register_number": _resolve_subject_field(
            ["register_number", "recipient_identifier", "registration_number", "roll_number", "reg_no", "reg_number", "student_id"],
            cred.recipient_identifier
        ),
        "college_name": _resolve_subject_field([
            "college_name", "college", "institution_name", "institution", "university", "institute", "college_or_institution"
        ]),
        "degree": _resolve_subject_field([
            "degree", "degree_title", "degree_name", "program", "course", "qualification"
        ]),
        "branch": _resolve_subject_field([
            "branch", "major", "department", "stream", "specialization", "branch_name"
        ]),
        "month": _resolve_subject_field([
            "month", "examination_month", "exam_month", "passing_month", "month_of_passing"
        ]),
        "year": _resolve_subject_field([
            "year", "graduation_year", "passing_year", "exam_year", "pass_year", "year_of_passing"
        ]),
        "result": _resolve_subject_field([
            "result", "class_/_result", "grade", "gpa", "division", "classification", "status", "class"
        ])
    }

    # Recover month from examination date / year if not stored separately
    if not original_values["month"] and original_values["year"]:
        month_match = re.search(
            r"\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\b",
            str(original_values["year"]),
            re.IGNORECASE
        )
        if month_match:
            original_values["month"] = month_match.group(1).upper()

    # 5. Preserve original OCR values
    ocr_values = {
        "student_name": extracted.get("student_name"),
        "register_number": extracted.get("register_number"),
        "college_name": extracted.get("college_name"),
        "degree": extracted.get("degree"),
        "branch": extracted.get("branch"),
        "month": extracted.get("month"),
        "year": extracted.get("year"),
        "result": extracted.get("result")
    }

    # Use manually corrected name/register number when provided
    comparison_values = ocr_values.copy()
    if edited_student_name and edited_student_name.strip():
        comparison_values["student_name"] = edited_student_name.strip()
    if edited_register_number and edited_register_number.strip():
        comparison_values["register_number"] = edited_register_number.strip()

    # 6. Advanced Normalization and Comparison Helpers
    field_labels = {
        "student_name": "Student Name",
        "register_number": "Register Number",
        "college_name": "College Name",
        "degree": "Degree",
        "branch": "Branch",
        "month": "Examination Month",
        "year": "Passing Year",
        "result": "Result / Division"
    }

    def _clean_str(val: Any) -> str:
        if val is None:
            return ""
        s = re.sub(r"[^\w\s]", " ", str(val).lower())
        return " ".join(s.split())

    def _match_student_name(val_a: Any, val_b: Any) -> bool:
        if not val_a or not val_b:
            return False
        # Remove common honorifics/salutations
        raw_a = re.sub(r"\b(mr|ms|mrs|miss|dr|shri|smt)\b\.?", "", str(val_a), flags=re.IGNORECASE)
        raw_b = re.sub(r"\b(mr|ms|mrs|miss|dr|shri|smt)\b\.?", "", str(val_b), flags=re.IGNORECASE)
        ca = _clean_str(raw_a)
        cb = _clean_str(raw_b)
        if ca == cb:
            return True
        tokens_a = set(ca.split())
        tokens_b = set(cb.split())
        return bool(tokens_a and tokens_b and (tokens_a == tokens_b or tokens_a.issubset(tokens_b) or tokens_b.issubset(tokens_a)))

    def _match_register_number(val_a: Any, val_b: Any) -> bool:
        if not val_a or not val_b:
            return False
        clean_a = re.sub(r"[^a-zA-Z0-9]", "", str(val_a)).upper()
        clean_b = re.sub(r"[^a-zA-Z0-9]", "", str(val_b)).upper()
        return clean_a == clean_b

    def _match_year(val_a: Any, val_b: Any) -> bool:
        if not val_a or not val_b:
            return False
        ya = re.search(r"\b(19|20)\d{2}\b", str(val_a))
        yb = re.search(r"\b(19|20)\d{2}\b", str(val_b))
        if ya and yb:
            return ya.group(0) == yb.group(0)
        return _clean_str(val_a) == _clean_str(val_b)

    def _match_degree(val_a: Any, val_b: Any) -> bool:
        if not val_a or not val_b:
            return False
        ca = re.sub(r"[^\w]", "", str(val_a).lower())
        cb = re.sub(r"[^\w]", "", str(val_b).lower())
        if ca == cb or ca in cb or cb in ca:
            return True
        degree_aliases = {
            "btech": ["bacheloroftechnology", "btech", "btechnol"],
            "be": ["bachelorofengineering", "be"],
            "bsc": ["bachelorofscience", "bsc"],
            "mtech": ["masteroftechnology", "mtech"],
            "mba": ["masterofbusinessadministration", "mba"],
            "mca": ["masterofcomputerapplications", "mca"]
        }
        for k, aliases in degree_aliases.items():
            if any(ca == a for a in aliases) and any(cb == a for a in aliases):
                return True
        return False

    def _match_branch_or_college(val_a: Any, val_b: Any) -> bool:
        if not val_a or not val_b:
            return False
        ca = _clean_str(str(val_a).replace("&", " and "))
        cb = _clean_str(str(val_b).replace("&", " and "))
        if ca == cb or ca in cb or cb in ca:
            return True
        toks_a = set(ca.split())
        toks_b = set(cb.split())
        overlap = toks_a.intersection(toks_b)
        if len(overlap) >= min(len(toks_a), len(toks_b)) * 0.7:
            return True
        return False

    def _match_result(val_a: Any, val_b: Any) -> bool:
        if not val_a or not val_b:
            return False
        ca = _clean_str(val_a)
        cb = _clean_str(val_b)
        if ca == cb:
            return True
        if ("distinction" in ca and "distinction" in cb) or ("first" in ca and "first" in cb):
            return True
        return False

    def _evaluate_field(field_key: str, ocr_v: Any, orig_v: Any) -> bool:
        if field_key == "student_name":
            return _match_student_name(ocr_v, orig_v)
        if field_key == "register_number":
            return _match_register_number(ocr_v, orig_v)
        if field_key == "year":
            return _match_year(ocr_v, orig_v)
        if field_key == "degree":
            return _match_degree(ocr_v, orig_v)
        if field_key in ("branch", "college_name"):
            return _match_branch_or_college(ocr_v, orig_v)
        if field_key == "result":
            return _match_result(ocr_v, orig_v)
        return _clean_str(ocr_v) == _clean_str(orig_v)

    field_comparisons = []
    discrepancies = []
    uncompared_fields = []
    matched_count = 0
    compared_count = 0

    for field, label in field_labels.items():
        ocr_value = comparison_values.get(field)
        original_value = original_values.get(field)

        has_ocr = bool(_clean_str(ocr_value))
        has_orig = bool(_clean_str(original_value))

        if not has_ocr or not has_orig:
            status = "NOT_AVAILABLE"
            match = None
            uncompared_fields.append(
                f"{label}: Not compared (Missing in {'certificate OCR' if not has_ocr else 'issued record'})."
            )
        else:
            compared_count += 1
            match = _evaluate_field(field, ocr_value, original_value)

            if match:
                status = "MATCH"
                matched_count += 1
            else:
                status = "MISMATCH"
                discrepancies.append(
                    f"{label}: Conflict detected! Extracted '{ocr_value}' does not match official record '{original_value}'."
                )

        field_comparisons.append({
            "field": field,
            "label": label,
            "ocr_value": ocr_value,
            "original_value": original_value,
            "match": match,
            "status": status
        })

    # 7. Comparison Metrics
    match_percentage = (
        round((matched_count / compared_count) * 100, 2)
        if compared_count else 0.0
    )

    name_comp = next((item for item in field_comparisons if item["field"] == "student_name"), {})
    reg_comp = next((item for item in field_comparisons if item["field"] == "register_number"), {})

    name_match = name_comp.get("match")
    register_match = reg_comp.get("match")

    # Overall match requires:
    # 1. Student name and register number must match.
    # 2. No compared fields may have mismatches.
    # 3. Every required field must be successfully compared.
    overall_match = bool(
      name_match is True
      and register_match is True
      and len(discrepancies) == 0
      and compared_count == len(field_labels)
    )

    # 8. Holistic Fraud Assessment & Decision Verdict
    visual_score = (
        visual_verification.get("visual_authenticity_score", 1.0)
        if visual_verification else 1.0
    )
    tamper_detected = (
        visual_verification.get("tampering_ela", {}).get("tamper_detected", False)
        if visual_verification else False
    )
    logo_detected = (
        visual_verification.get("logo", {}).get("detected", True)
        if visual_verification else True
    )
    watermark_detected = (
        visual_verification.get("watermark", {}).get("detected", True)
        if visual_verification else True
    )
    suspicious_watermark_detected = (
        visual_verification.get(
            "suspicious_watermark_text", {}
        ).get("detected", False)
        if visual_verification else False
    )

    if name_match is False or register_match is False:
        fraud_risk = "HIGH"
        fraud_verdict = "CONFIRMED_FRAUD_PRIMARY_IDENTIFIER_MISMATCH"
        action = "REJECT"
        risk_explanation = "Primary candidate identifiers (Student Name or Register Number) do not match the official record."
    elif len(discrepancies) > 0:
        fraud_risk = "HIGH"
        fraud_verdict = "POTENTIAL_FRAUD_FIELD_CONFLICT"
        action = "MANUAL_REVIEW"
        risk_explanation = f"Detected {len(discrepancies)} conflicting credential field(s) with the issued record."
    elif tamper_detected:
        fraud_risk = "HIGH"
        fraud_verdict = "POTENTIAL_FRAUD_DIGITAL_TAMPERING"
        action = "MANUAL_REVIEW"
        risk_explanation = "Error Level Analysis (ELA) detected evidence of digital image splicing or pixel modification."
    elif suspicious_watermark_detected:
        fraud_risk = "HIGH"
        fraud_verdict = "SUSPICIOUS_WATERMARK_TEXT"
        action = "REJECT"
        risk_explanation = (
            "Suspicious certificate marking detected: "
            + ", ".join(
                visual_verification.get(
                    "suspicious_watermark_text", {}
            ).get("matched_terms", [])
        )
    )
    elif visual_score < 0.60 or not logo_detected or not watermark_detected:
        fraud_risk = "MEDIUM"
        fraud_verdict = "SUSPICIOUS_VISUAL_SECURITY_FAILURE"
        action = "MANUAL_REVIEW"
        risk_explanation = "Text fields match the record, but the certificate failed visual anti-fraud checks (missing university crest or security watermark)."
    elif not overall_match:
        fraud_risk = "MEDIUM"
        fraud_verdict = "INCONCLUSIVE_DATA"
        action = "MANUAL_REVIEW"
        risk_explanation = "Inconclusive comparison; insufficient data available to verify core fields."
    else:
        fraud_risk = "LOW"
        fraud_verdict = "GENUINE_VERIFIED"
        action = "APPROVE"
        risk_explanation = "All compared credential fields match the official record and visual security features passed."

    return {
        "credential_id": cred.id,
        "ocr_extracted": {
            **ocr_values,
            "name_status": extracted.get("name_status"),
            "register_status": extracted.get("register_status"),
            "ocr_text": extracted.get("ocr_text", []),
    
        },
        "edited_values": {
            "student_name": comparison_values["student_name"],
            "register_number": comparison_values["register_number"]
        },
        "original_credential": original_values,
        "comparison": {
            "name_match": name_match,
            "register_match": register_match,
            "overall_match": overall_match,
            "match_percentage": match_percentage,
            "matched_fields": matched_count,
            "compared_fields": compared_count,
            "total_fields": len(field_comparisons),
            "conflicting_fields": len(discrepancies),
            "uncompared_fields_count": len(uncompared_fields)
        },
        "field_comparisons": field_comparisons,
        "mismatches": discrepancies,
        "discrepancies": discrepancies,
        "uncompared_fields": uncompared_fields,
        "fraud_assessment": {
            "fraud_risk": fraud_risk,
            "verdict": fraud_verdict,
            "recommended_action": action,
            "explanation": risk_explanation,
            "visual_authenticity_score": visual_score,
            "suspicious_watermark_detected": suspicious_watermark_detected,
        },
        "visual_verification": visual_verification,
        "warning": (
            "Field comparison verified."
            if overall_match else
            "Field discrepancy detected. Review discrepancies and visual verification."
        )
    }

# --- Credential Query Endpoints ---
@router.get("/", response_model=List[CredentialResponse])
async def list_credentials(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lists credentials. Scoped strictly to own credentials if role is EMPLOYEE.
    """
    try:
        if current_user.role == "EMPLOYEE":
            result = await db.execute(
                select(CredentialRecord)
                .where(CredentialRecord.recipient_identifier == current_user.email)
                .order_by(CredentialRecord.created_at.desc())
            )
        else:
            result = await db.execute(select(CredentialRecord).order_by(CredentialRecord.created_at.desc()).limit(100))
        return result.scalars().all()
    except Exception as exc:
        # Log the error for debugging and return a generic 500 error.
        import traceback, sys
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(status_code=500, detail="Failed to retrieve credentials")

@router.get("/osid/{sunbird_osid}", response_model=CredentialResponse)
async def get_credential_by_osid(
    sunbird_osid: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetches stored credential reference and metadata by Sunbird OSID.
    """
    result = await db.execute(select(CredentialRecord).where(CredentialRecord.sunbird_osid == sunbird_osid))
    cred = result.scalars().first()
    if not cred:
        raise HTTPException(status_code=404, detail=f"Credential with OSID '{sunbird_osid}' not found.")
    
    if current_user.role == "EMPLOYEE" and cred.recipient_identifier != current_user.email:
        raise HTTPException(status_code=403, detail="Access denied: You can only inspect credentials issued to you.")

    return cred

# --- Sunbird RC Direct Registry Inspection & Health ---
@router.get("/sunbird-status")
async def get_sunbird_status(
    current_user: User = Depends(get_current_user)
):
    """
    Reports connectivity, operational mode (MOCK / LIVE), and latency of Sunbird RC service.
    """
    health = await sunbird_adapter.get_sunbird_health()
    return health

@router.get("/registry/{osid}")
async def query_registry_by_osid(
    osid: str,
    entity_name: str = "Certificate",
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Queries Sunbird RC Registry directly for entity record sync status.
    """
    res = await sunbird_adapter.get_vc_by_osid(entity_name, osid)
    if not res:
        raise HTTPException(status_code=404, detail=f"OSID '{osid}' not found in Sunbird RC Registry.")
    return res

@router.post("/validate-schema")
async def validate_credential_schema(
    payload: Dict[str, Any],
    schema_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Validates a Verifiable Credential payload against W3C standards and optional JSON schema.
    """
    json_schema = None
    if schema_id:
        schema_obj = await db.get(CredentialSchemaModel, schema_id)
        if schema_obj:
            json_schema = schema_obj.json_schema

    is_valid, errors, metadata = sunbird_adapter.validate_vc_payload_schema(payload, json_schema=json_schema)
    return {
        "is_valid": is_valid,
        "errors": errors,
        "metadata": metadata
    }

# ─────────────────────────────────────────────────────────────────────────────
# Phase 5: Bulk Credential Issuance via CSV Upload
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/bulk", response_model=BulkJobResponse)
async def bulk_issue_credentials(
    background_tasks: BackgroundTasks,
    schema_id: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ISSUER", "ADMIN"]))
):
    """
    Phase 5: Bulk Credential Issuance via CSV Upload.

    Workflow:
      1. Validate schema exists.
      2. Validate file type and size limits.
      3. Create BulkJob record (QUEUED).
      4. Synchronously process the CSV (validate format, per-record validation,
         duplicate detection, Sunbird RC issuance, DB persistence).
      5. Return completed BulkJob response with counters and error summary.

    A credential record is ONLY created and marked ISSUED if Sunbird RC returns success.
    """
    # ── 1. Validate schema ───────────────────────────────────────────────────
    schema_obj = await db.get(CredentialSchemaModel, schema_id)
    if not schema_obj:
        raise HTTPException(status_code=404, detail=f"Credential schema '{schema_id}' not found.")

    # ── 2. Validate file type ────────────────────────────────────────────────
    filename = file.filename or "upload.csv"
    if not filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files (.csv) are accepted for bulk issuance uploads."
        )

    # ── 3. Read and size-check file content ──────────────────────────────────
    content = await file.read()
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"CSV file exceeds maximum allowed size of {MAX_FILE_SIZE_BYTES // (1024*1024)} MB."
        )

    try:
        csv_str = content.decode("utf-8")
    except UnicodeDecodeError:
        try:
            csv_str = content.decode("latin-1")
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not decode CSV file. Please ensure it is UTF-8 or Latin-1 encoded."
            )

    # ── 4. Create BulkJob record ─────────────────────────────────────────────
    job = BulkJob(
        schema_id=schema_id,
        created_by=current_user.id,
        filename=filename,
        status="QUEUED"
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # ── 5. Process synchronously (returns updated job) ───────────────────────
    updated_job = await process_bulk_csv_issuance(
        db=db,
        bulk_job_id=job.id,
        schema_id=schema_id,
        entity_name=schema_obj.schema_name,
        user_id=current_user.id,
        csv_content=csv_str,
        json_schema=schema_obj.json_schema if schema_obj.json_schema else None,
    )

    # ── 6. Audit log ─────────────────────────────────────────────────────────
    await log_audit_event(
        db, action="BULK_ISSUANCE_JOB", resource_type="BULK_JOB",
        user_id=current_user.id, user_email=current_user.email, resource_id=job.id,
        details={
            "filename": filename,
            "total": updated_job.total_records,
            "successful": updated_job.successful_records,
            "failed": updated_job.failed_records,
            "duplicates": updated_job.duplicate_records,
            "status": updated_job.status,
        }
    )

    return updated_job


@router.get("/bulk", response_model=List[BulkJobResponse])
async def list_bulk_jobs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ISSUER", "ADMIN"]))
):
    """
    Lists all bulk issuance jobs for the current user (ADMIN sees all).
    Returns most recent jobs first.
    """
    query = select(BulkJob).order_by(BulkJob.created_at.desc()).limit(limit)
    if current_user.role != "ADMIN":
        query = query.where(BulkJob.created_by == current_user.id)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/bulk/{job_id}", response_model=BulkJobDetailResponse)
async def get_bulk_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ISSUER", "ADMIN"]))
):
    """
    Returns full detail of a specific bulk job including per-row processing records.
    Useful for polling job status and rendering the results table.
    """
    job = await db.get(BulkJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Bulk job '{job_id}' not found.")

    # RBAC: non-admins can only see their own jobs
    if current_user.role != "ADMIN" and job.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied: you can only view your own bulk jobs.")

    # Fetch per-row records
    records_result = await db.execute(
        select(BulkJobRecord)
        .where(BulkJobRecord.bulk_job_id == job_id)
        .order_by(BulkJobRecord.row_number)
    )
    records = records_result.scalars().all()

    return BulkJobDetailResponse(
        id=job.id,
        schema_id=job.schema_id,
        created_by=job.created_by,
        filename=job.filename,
        total_records=job.total_records,
        processed_records=job.processed_records,
        successful_records=job.successful_records,
        failed_records=job.failed_records,
        duplicate_records=job.duplicate_records,
        status=job.status,
        validation_errors=job.validation_errors,
        error_summary=job.error_summary,
        created_at=job.created_at,
        completed_at=job.completed_at,
        records=[BulkJobRecordResponse.model_validate(r) for r in records],
    )


@router.get("/bulk/{job_id}/records", response_model=List[BulkJobRecordResponse])
async def get_bulk_job_records(
    job_id: str,
    status_filter: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ISSUER", "ADMIN"]))
):
    """
    Returns per-row records for a specific bulk job.
    Optional: filter by status (ISSUED, FAILED, DUPLICATE, INVALID).
    """
    job = await db.get(BulkJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Bulk job '{job_id}' not found.")

    if current_user.role != "ADMIN" and job.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")

    query = select(BulkJobRecord).where(BulkJobRecord.bulk_job_id == job_id)
    if status_filter:
        query = query.where(BulkJobRecord.status == status_filter.upper())
    query = query.order_by(BulkJobRecord.row_number)

    result = await db.execute(query)
    return result.scalars().all()


# Keep the generic credential ID lookup at the bottom to avoid path conflicts
@router.get("/{credential_id}", response_model=CredentialResponse)
async def get_credential_by_id(
    credential_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetches stored credential reference and metadata by internal database ID.
    """
    cred = await db.get(CredentialRecord, credential_id)
    if not cred:
        raise HTTPException(status_code=404, detail=f"Credential with ID '{credential_id}' not found.")
    
    if current_user.role == "EMPLOYEE" and cred.recipient_identifier != current_user.email:
        raise HTTPException(status_code=403, detail="Access denied: You can only inspect credentials issued to you.")

    return cred
# --- 8. Natural‑Language Credential Query ---

@router.post(
    "/nl-query",
    response_model=NaturalLanguageQueryResponse,
    tags=["nl-query"],
)
async def nl_query(
    request: NaturalLanguageQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ADMIN", "ISSUER", "AUDITOR"])),
):
    """
    Accept a natural‑language query, translate it to safe DB filters via the
    NL‑query service, fetch matching credentials, and return a concise answer.
    """
    from app.services.nl_query_service import process_nl_query

    return await process_nl_query(db, request, current_user)