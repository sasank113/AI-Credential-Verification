import uuid
from datetime import datetime
from sqlalchemy import Column, String, Float, Boolean, DateTime, JSON
from app.core.database import Base

class AIEvaluationLog(Base):
    __tablename__ = "ai_evaluation_logs"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    evaluation_type = Column(String, nullable=False)  # ELIGIBILITY, FRAUD_DETECTION, NL_QUERY
    input_data = Column(JSON, nullable=False)
    ai_response = Column(JSON, nullable=False)
    confidence_score = Column(Float, nullable=True)
    risk_level = Column(String, nullable=True)  # LOW, MEDIUM, HIGH, CRITICAL
    flagged = Column(Boolean, default=False)
    evaluated_at = Column(DateTime, default=datetime.utcnow)
