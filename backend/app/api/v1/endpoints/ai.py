from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.ai_log import AIEvaluationLog
from app.schemas.ai import (
    EligibilityCheckRequest, EligibilityCheckResponse,
    FraudDetectionRequest, FraudDetectionResponse,
    NaturalLanguageQueryRequest, NaturalLanguageQueryResponse
)
from app.services.ai_service import ai_service
from app.services.audit_service import log_audit_event

router = APIRouter()

@router.post("/evaluate-eligibility", response_model=EligibilityCheckResponse)
async def evaluate_eligibility(
    req: EligibilityCheckRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await ai_service.evaluate_eligibility(req.applicant_data, req.eligibility_criteria)

    # Log AI evaluation
    ai_log = AIEvaluationLog(
        evaluation_type="ELIGIBILITY",
        input_data={"applicant": req.applicant_data, "criteria": req.eligibility_criteria},
        ai_response=res,
        confidence_score=res.get("confidence_score"),
        risk_level="LOW" if res.get("is_eligible") else "MEDIUM",
        flagged=not res.get("is_eligible")
    )
    db.add(ai_log)
    await db.commit()

    return res

@router.post("/detect-fraud", response_model=FraudDetectionResponse)
async def detect_fraud(
    req: FraudDetectionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await ai_service.detect_fraud(req.credential_payload, req.issuer_metadata)

    # Log AI Fraud check
    ai_log = AIEvaluationLog(
        evaluation_type="FRAUD_DETECTION",
        input_data={"payload": req.credential_payload},
        ai_response=res,
        confidence_score=res.get("confidence_score"),
        risk_level=res.get("risk_level"),
        flagged=res.get("anomaly_detected")
    )
    db.add(ai_log)
    await db.commit()

    await log_audit_event(
        db, action="AI_FRAUD_SCAN", resource_type="AI_SERVICE",
        user_id=current_user.id, user_email=current_user.email,
        details={"risk_level": res.get("risk_level"), "anomalies": res.get("detected_anomalies")}
    )

    return res

@router.post("/query", response_model=NaturalLanguageQueryResponse)
async def natural_language_query(
    req: NaturalLanguageQueryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    res = await ai_service.parse_natural_language_query(req.query)

    ai_log = AIEvaluationLog(
        evaluation_type="NL_QUERY",
        input_data={"query": req.query},
        ai_response=res,
        confidence_score=0.95,
        risk_level="LOW",
        flagged=False
    )
    db.add(ai_log)
    await db.commit()

    return res
