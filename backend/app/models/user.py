import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, nullable=False)  # ADMIN, ISSUER, VERIFIER, EMPLOYEE, AUDITOR
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    audit_logs = relationship(
        "AuditLog",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    sessions = relationship(
        "UserSession",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # <<< NEW RELATIONSHIP >>>
    audit_logs = relationship(
        "AuditLog",
        back_populates="user",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token = Column(String, unique=True, index=True, nullable=False)
    ip_address = Column(String, nullable=True, default="127.0.0.1")
    user_agent = Column(String, nullable=True, default="Unknown Agent")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_heartbeat = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    user = relationship("User", back_populates="sessions")

