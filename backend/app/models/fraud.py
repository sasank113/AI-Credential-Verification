import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Enum, Text, ForeignKey
from app.core.database import Base

class FraudReview(Base):
    __tablename__ = "fraud_reviews"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    credential_id = Column(String, ForeignKey("credential_records.id"), nullable=False)
    reviewer_id = Column(String, ForeignKey("users.id"), nullable=False)
    decision = Column(Enum('APPROVE', 'REJECT', 'ESCALATE', name='fraud_decision'), nullable=False)
    notes = Column(Text, nullable=True)
    reviewed_at = Column(DateTime, default=datetime.utcnow)

