from pydantic import BaseModel, Field
from typing import Optional

class NaturalLanguageQueryRequest(BaseModel):
    """User‑sent natural‑language question about credentials."""
    query: str = Field(..., description="The natural language question, e.g. 'Show all employees certified in AWS within the last two years.'")

class NaturalLanguageQueryResponse(BaseModel):
    """Answer returned by the NL query agent.
    `answer` is a human‑readable sentence; `data` (optional) contains the raw rows
    that were used to generate the answer (list of dicts)."""
    answer: str
    data: Optional[list[dict]] = None

