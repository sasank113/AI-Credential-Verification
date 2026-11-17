from typing import List
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import get_current_user, PermissionChecker
from app.models.user import User
from app.models.audit import AuditLog
from app.schemas.compliance import AuditLogResponse

router = APIRouter()

@router.get("/audit-logs", response_model=List[AuditLogResponse])
async def get_audit_logs(
    limit: int = Query(50, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["AUDITOR", "ADMIN"]))
):
    result = await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit))
    return result.scalars().all()

@router.get("/export")
async def export_compliance_report(
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["AUDITOR", "ADMIN"]))
):
    result = await db.execute(select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(100))
    logs = result.scalars().all()
    
    return {
        "report_title": "Enterprise Credential Workflow Compliance Audit Report",
        "generated_by": current_user.email,
        "format": format,
        "total_records": len(logs),
        "logs": [AuditLogResponse.model_validate(log) for log in logs]
    }
