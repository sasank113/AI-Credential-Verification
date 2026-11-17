import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship

from app.core.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=True)
    user_email = Column(String, nullable=True)
    action = Column(String, nullable=False)
    resource_type = Column(String, nullable=False)
    resource_id = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)
    details = Column(JSON, nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    # Relationship back to User
    user = relationship("User", back_populates="audit_logs")
