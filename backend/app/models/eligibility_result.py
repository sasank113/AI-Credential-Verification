import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON, Boolean
from app.core.database import Base

class EligibilityResult(Base):
    __tablename__ = "eligibility_results"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    credential_id = Column(String, nullable=False)
    criteria_id = Column(String, nullable=False)
    is_eligible = Column(Boolean, nullable=False)
    missing_fields = Column(JSON, default=list)
    mismatched_fields = Column(JSON, default=list)
    explanation = Column(String, nullable=False)
    source = Column(String, nullable=False)  # "deterministic" or "ai"
    created_at = Column(DateTime, default=datetime.utcnow)

