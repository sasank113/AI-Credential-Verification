from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime

from app.core.database import get_db
from app.core.security import PermissionChecker, get_current_user
from app.models.user import User
from app.models.credential import CredentialRecord, CredentialSchemaModel
from app.models.fraud import FraudReview
from app.models.eligibility_result import EligibilityResult
from app.models.ai_log import AIEvaluationLog
from app.schemas.compliance import DashboardAnalyticsResponse

router = APIRouter()


@router.get(
    "/dashboard",
    response_model=DashboardAnalyticsResponse,
    tags=["analytics"],
)
async def get_dashboard_analytics(
    start_date: datetime | None = Query(
        None, description="Start of date range filter (ISO timestamp)"
    ),
    end_date: datetime | None = Query(
        None, description="End of date range filter (ISO timestamp)"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(
        PermissionChecker(["ADMIN", "ANALYST", "AUDITOR"])),
):
    """Return enterprise‑wide analytics. All counts are derived from the live DB.
    Optional ``start_date``/``end_date`` restricts the metrics to a date window.
    """

    # Helper to apply optional date filter to a selectable query
    def apply_date_filter(stmt):
        if start_date:
            stmt = stmt.where(CredentialRecord.created_at >= start_date)
        if end_date:
            stmt = stmt.where(CredentialRecord.created_at <= end_date)
        return stmt

    # ------------------- Core counts -------------------
    total_issued_q = apply_date_filter(
        select(func.count(CredentialRecord.id)).where(
            CredentialRecord.status == "ISSUED"
        )
    )
    total_verified_q = apply_date_filter(
        select(func.count(CredentialRecord.id)).where(
            CredentialRecord.status == "VERIFIED"
        )
    )
    total_revoked_q = apply_date_filter(
        select(func.count(CredentialRecord.id)).where(
            CredentialRecord.status == "REVOKED"
        )
    )
    total_pending_q = apply_date_filter(
        select(func.count(CredentialRecord.id)).where(
            CredentialRecord.status == "PENDING"
        )
    )

    total_credentials_issued = (await db.execute(total_issued_q)).scalar() or 0
    total_verified_credentials = (await db.execute(total_verified_q)).scalar() or 0
    total_revocations = (await db.execute(total_revoked_q)).scalar() or 0
    total_pending_requests = (await db.execute(total_pending_q)).scalar() or 0

    # Verifications (issued + verified) – used for UI metric
    total_verifications_q = select(func.count(CredentialRecord.id)).where(
        CredentialRecord.status.in_(["VERIFIED", "ISSUED"]))
    total_verifications_conducted = (await db.execute(total_verifications_q)).scalar() or 0

    # Active schemas count
    active_schemas = await db.execute(select(func.count(CredentialSchemaModel.id)))
    active_schemas_count = active_schemas.scalar() or 0

    # Flagged AI anomalies
    flagged_ai_q = select(func.count(AIEvaluationLog.id)).where(
        AIEvaluationLog.flagged.is_(True))
    total_flagged_ai_anomalies = (await db.execute(flagged_ai_q)).scalar() or 0

    # Eligibility outcomes breakdown
    eligibility_counts_q = (
       select(
        EligibilityResult.is_eligible,
        func.count(EligibilityResult.id)
       )
       .group_by(EligibilityResult.is_eligible)
    )

    eligibility_rows = (await db.execute(eligibility_counts_q)).all()

    eligibility_outcomes = {
      "eligible" if row[0] else "not_eligible": row[1]
      for row in eligibility_rows
    }

    # Credential lifecycle stats
    lifecycle_q = select(
        CredentialRecord.status, func.count(CredentialRecord.id)
    ).group_by(CredentialRecord.status)
    lifecycle_rows = (await db.execute(lifecycle_q)).all()
    credential_lifecycle_stats = {row[0]: row[1] for row in lifecycle_rows}

    # Recent activity (latest 10 events)
    recent_q = (
        select(
            CredentialRecord.id.label("credential_id"),
            CredentialRecord.status,
            CredentialRecord.issued_by,
            CredentialRecord.created_at,
        )
        .order_by(CredentialRecord.created_at.desc())
        .limit(10)
    )
    recent_rows = (await db.execute(recent_q)).all()
    recent_activity = [
        {
            "timestamp": r.created_at.isoformat(),
            "user": r.issued_by,
            "action": f"{r.status} credential #{r.credential_id}",
            "type": r.status,
        }
        for r in recent_rows
    ]

    # Issuance trends (last 7 days)
    trends_q = (
      select(
        func.date(CredentialRecord.created_at).label("date"),
        func.sum(
            func.iif(CredentialRecord.status == "ISSUED", 1, 0)
        ).label("issued"),
        func.sum(
            func.iif(CredentialRecord.status == "VERIFIED", 1, 0)
        ).label("verified"),
        func.sum(
            func.iif(CredentialRecord.status == "REVOKED", 1, 0)
        ).label("revoked"),
      )
      .group_by(func.date(CredentialRecord.created_at))
      .order_by(func.date(CredentialRecord.created_at).desc())
      .limit(7)
    )

    trend_rows = (await db.execute(trends_q)).all()

    issuance_trends = [
      {
        "date": str(r.date),
        "issued": r.issued or 0,
        "verified": r.verified or 0,
        "revoked": r.revoked or 0,
      }
      for r in trend_rows
    ]

    # AI risk distribution (by risk_level)
    risk_q = (
        select(AIEvaluationLog.risk_level, func.count(AIEvaluationLog.id))
        .where(AIEvaluationLog.flagged.is_(True))
        .group_by(AIEvaluationLog.risk_level)
    )
    risk_rows = (await db.execute(risk_q)).all()
    risk_distribution = {row[0]: row[1] for row in risk_rows}

    return DashboardAnalyticsResponse(
        total_credentials_issued=total_credentials_issued,
        total_verified_credentials=total_verified_credentials,
        total_verifications_conducted=total_verifications_conducted,
        total_revocations=total_revocations,
        total_pending_requests=total_pending_requests,
        total_flagged_ai_anomalies=total_flagged_ai_anomalies,
        active_schemas_count=active_schemas_count,
        eligibility_outcomes=eligibility_outcomes,
        credential_lifecycle_stats=credential_lifecycle_stats,
        recent_activity=recent_activity,
        issuance_trends=issuance_trends,
        risk_distribution=risk_distribution,
    )
