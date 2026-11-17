from sqlalchemy.ext.asyncio import AsyncSession
from app.models.audit import AuditLog
from typing import Optional, Dict, Any

async def log_audit_event(
    db: AsyncSession,
    action: str,
    resource_type: str,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    resource_id: Optional[str] = None,
    ip_address: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None
):
    """
    Helper utility to record compliance audit log entries.
    """
    audit = AuditLog(
        user_id=user_id,
        user_email=user_email,
        action=action,
        resource_type=resource_type,
        resource_id=resource_id,
        ip_address=ip_address,
        details=details
    )
    db.add(audit)
    await db.commit()
    return audit
