import json
from datetime import datetime
from typing import Dict, Any, List

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, String

from app.models.credential import CredentialRecord, CredentialSchemaModel
from app.core.security import PermissionChecker
from fastapi import HTTPException, status

# -------------------------------------------------------------------------
# Deterministic filter schema that the LLM must output (JSON)
# -------------------------------------------------------------------------
# {
#   "schema_name": "AWS",                # optional – name of the credential schema
#   "recipient_role": "EMPLOYEE",        # optional – role filter (EMPLOYEE, ADMIN, …)
#   "date_from": "2024-01-01",           # optional – ISO date (inclusive)
#   "date_to":   "2026-12-31",           # optional – ISO date (inclusive)
#   "keyword": "AWS"                     # optional – free‑text search in payload
# }
# -------------------------------------------------------------------------

def _apply_filters(
    base_query,
    filters: Dict[str, Any],
    current_user,
) -> Any:
    """Apply deterministic filters in a safe, parameterised way.
    Returns a SQLAlchemy selectable with the appropriate WHERE clauses.
    """
    conditions = []

    # 1️⃣ Role‑based access control – non‑admin users can only see their own records
    if current_user.role != "ADMIN":
        conditions.append(CredentialRecord.recipient_identifier == current_user.email)

    # 2️⃣ Schema filter
    if schema_name := filters.get("schema_name"):
        subq = select(CredentialSchemaModel.id).where(
            CredentialSchemaModel.schema_name.ilike(f"%{schema_name}%")
        )
        conditions.append(CredentialRecord.schema_id.in_(subq))

    # 3️⃣ Recipient role filter – only allowed for admins
    if role := filters.get("recipient_role"):
        if current_user.role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only ADMIN users may filter by recipient role.",
            )
        # Assuming role is stored inside the JSON payload under a 'role' key
        conditions.append(
            CredentialRecord.credential_payload["role"].as_string() == role
        )

    # 4️⃣ Date range filter on `issue_date`
    if date_from := filters.get("date_from"):
        try:
            dt_from = datetime.fromisoformat(date_from)
            conditions.append(CredentialRecord.issue_date >= dt_from)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="date_from must be a valid ISO date string.",
            )
    if date_to := filters.get("date_to"):
        try:
            dt_to = datetime.fromisoformat(date_to)
            conditions.append(CredentialRecord.issue_date <= dt_to)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="date_to must be a valid ISO date string.",
            )

    # 5️⃣ Free‑text keyword search inside the stored JSON payload (case‑insensitive)
    if keyword := filters.get("keyword"):
        conditions.append(
            func.lower(
                func.cast(CredentialRecord.credential_payload, String)
            ).ilike(f"%{keyword.lower()}%")
        )

    if conditions:
        base_query = base_query.where(and_(*conditions))
    return base_query


async def fetch_credentials(
    db: AsyncSession,
    filters: Dict[str, Any],
    current_user,
    limit: int = 200,
) -> List[CredentialRecord]:
    """Return a list of `CredentialRecord` that satisfy the deterministic filters.
    The query is fully parameterised – no raw SQL strings are ever concatenated.
    """
    stmt = select(CredentialRecord)
    stmt = _apply_filters(stmt, filters, current_user)
    stmt = stmt.order_by(CredentialRecord.issue_date.desc()).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()

