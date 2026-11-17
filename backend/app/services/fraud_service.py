import random
from datetime import datetime, timezone
from typing import List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.credential import CredentialRecord, CredentialSchemaModel
from app.models.fraud import FraudReview
from app.schemas.fraud import FraudCheckResponse, FraudReviewRequest

# Deterministic rule checks ---------------------------------------------------

def _impossible_dates(payload: dict) -> List[str]:
    warnings = []
    # Example: check for dates that are in the future or before 1900
    for key, value in payload.items():
        if isinstance(value, str) and key.lower().endswith('_date'):
            try:
                dt = datetime.fromisoformat(value)
                now = datetime.now(timezone.utc)
                if dt > now:
                    warnings.append(f"{key} is in the future ({value})")
                elif dt.year < 1900:
                    warnings.append(f"{key} is implausibly old ({value})")
            except Exception:
                warnings.append(f"{key} has non‑ISO date format ({value})")
    return warnings

async def _duplicate_credential(db: AsyncSession, cred: CredentialRecord) -> bool:
    stmt = select(func.count()).select_from(CredentialRecord).where(
        CredentialRecord.recipient_identifier == cred.recipient_identifier,
        CredentialRecord.schema_id == cred.schema_id,
        CredentialRecord.id != cred.id,
        CredentialRecord.status != "REVOKED",
    )
    result = await db.execute(stmt)
    count = result.scalar_one()
    return count > 0

def _suspicious_issuer(cred: CredentialRecord) -> bool:
    # Placeholder heuristic: flag if issuer is not an admin
    return cred.issued_by != "admin"

async def _inconsistent_with_schema(db: AsyncSession, cred: CredentialRecord) -> List[str]:
    warnings = []
    stmt = select(CredentialSchemaModel).where(CredentialSchemaModel.id == cred.schema_id)
    result = await db.execute(stmt)
    schema_obj = result.scalar_one_or_none()
    if schema_obj and isinstance(schema_obj.json_schema, dict):
        required = schema_obj.json_schema.get("required", [])
        payload_keys = set(cred.credential_payload.keys())
        missing = [f for f in required if f not in payload_keys]
        if missing:
            warnings.append(f"Missing required fields per schema: {', '.join(missing)}")
    return warnings

# ---------------------------------------------------------------------------
async def assess_fraud(db: AsyncSession, credential_id: str) -> FraudCheckResponse:
    cred = await db.get(CredentialRecord, credential_id)
    if not cred:
        raise ValueError(f"Credential {credential_id} not found")

    warning_signals: List[str] = []
    warning_signals.extend(_impossible_dates(cred.credential_payload))
    if await _duplicate_credential(db, cred):
        warning_signals.append("Duplicate credential exists for this recipient and schema")
    if _suspicious_issuer(cred):
        warning_signals.append("Issuer is not marked as privileged/admin")
    warning_signals.extend(await _inconsistent_with_schema(db, cred))

    deterministic_risk = min(len(warning_signals) * 0.15, 0.9)
    ml_score = random.random() * 0.3
    risk_score = round(min(deterministic_risk + ml_score, 1.0), 3)

    explanation = (
        f"Detected {len(warning_signals)} warning signal(s). "
        "Risk score combines deterministic checks (up to 0.9) and a placeholder ML component."
    )
    recommended_action = "manual_review" if risk_score > 0.5 else "approve"

    return FraudCheckResponse(
        credential_id=credential_id,
        risk_score=risk_score,
        warning_signals=warning_signals,
        explanation=explanation,
        recommended_action=recommended_action,
        model_confidence=ml_score,
    )

async def record_fraud_review(db: AsyncSession, request: FraudReviewRequest) -> FraudReview:
    review = FraudReview(
        credential_id=request.credential_id,
        reviewer_id=request.reviewer_id,
        decision=request.decision,
        notes=request.notes,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return review

