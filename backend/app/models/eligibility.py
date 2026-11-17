import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, JSON
from app.core.database import Base

class EligibilityCriteriaModel(Base):
    __tablename__ = "eligibility_criteria"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    required_fields = Column(JSON, default=list)  # list of field names
    field_rules = Column(JSON, default=dict)    # field name -> expected value or rule
    created_at = Column(DateTime, default=datetime.utcnow)

