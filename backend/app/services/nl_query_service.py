import json
import logging
import re
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.nl_query import (
    NaturalLanguageQueryRequest,
    NaturalLanguageQueryResponse,
)
from app.services.query_builder import fetch_credentials

logger = logging.getLogger(__name__)


# Words that do not help identify a credential record.
STOP_WORDS = {
    "show", "find", "get", "give", "me", "all", "the", "a", "an",
    "and", "or", "of", "for", "to", "in", "on", "at", "by",
    "please", "list", "search", "display", "what", "which",
    "who", "how", "many", "much", "are", "is", "was", "were",
    "student", "students", "credential", "credentials", "got",
    "certificate", "certificates", "record", "records", "whose", "father", "name", "from", "achieved", "graduated",
}


def extract_search_terms(question: str) -> list[str]:
    """Extract useful search terms from a natural-language question."""

    normalized_question = question.lower()

    # Normalize result classifications to match database values.
    classification_aliases = {
        "first class with distinction": "first class",
        "second class with distinction": "second class",
        "third class with distinction": "third class",
    }

    for phrase, replacement in classification_aliases.items():
        normalized_question = normalized_question.replace(
            phrase, replacement
        )

    words = re.findall(r"[a-zA-Z0-9]+", normalized_question)

    return [
        word
        for word in words
        if word not in STOP_WORDS and len(word) > 1
    ]

def record_matches(record, search_terms: list[str]) -> bool:
    """Match credential records using keywords and numeric GPA conditions."""

    payload = record.credential_payload or {}
    subject = payload.get("credentialSubject", {})

    searchable_text = " ".join([
        str(record.recipient_name or ""),
        str(record.recipient_identifier or ""),
        json.dumps(payload, default=str),
    ]).lower()

    # Check credential status separately.
    status_terms = {"issued", "revoked", "failed", "pending_ai"}

    requested_statuses = [
        term.upper()
        for term in search_terms
        if term in status_terms
    ]

    if requested_statuses:
        if record.status.upper() not in requested_statuses:
            return False

    # Check numeric GPA/CGPA conditions.
    gpa_match = re.search(
        r"\b(?:cgpa|gpa)\s*(greater than|more than|above|higher than|less than|below|lower than|equal to|equals?)\s*(\d+(?:\.\d+)?)",
        " ".join(search_terms),
        re.IGNORECASE
    )

    # Also support phrases such as "CGPA > 3".
    if not gpa_match:
        gpa_match = re.search(
            r"\b(?:cgpa|gpa)\s*(>=|<=|>|<|=)\s*(\d+(?:\.\d+)?)",
            " ".join(search_terms),
            re.IGNORECASE
        )

    if gpa_match:
        operator = gpa_match.group(1).lower()
        target = float(gpa_match.group(2))

        gpa_value = subject.get("cgpa", subject.get("gpa"))

        if gpa_value is None:
            return False

        try:
            actual = float(gpa_value)
        except (ValueError, TypeError):
            return False

        if operator in ("greater than", "more than", "above", "higher than", ">"):
            if actual <= target:
                return False
        elif operator in ("less than", "below", "lower than", "<"):
            if actual >= target:
                return False
        elif operator in ("equal to", "equals", "=", "=="):
            if actual != target:
                return False

    # Remove status words and numeric comparison terms.
    remaining_terms = [
        term for term in search_terms
        if term not in status_terms
        and term not in {
            "cgpa", "gpa", "greater", "more", "above",
            "higher", "than", "less", "below", "lower",
            "equal", "equals", "to"
        }
        and not re.fullmatch(r"\d+(?:\.\d+)?", term)
    ]

    return all(term in searchable_text for term in remaining_terms)     
def extract_date(question: str):
    """Extract a date from a natural-language query."""

    date_patterns = [
        (r"\b[A-Za-z]+ \d{1,2}, \d{4}\b", "%B %d, %Y"),
        (r"\b\d{1,2} [A-Za-z]+ \d{4}\b", "%d %B %Y"),
        (r"\b\d{4}-\d{2}-\d{2}\b", "%Y-%m-%d"),
    ]

    for pattern, date_format in date_patterns:
        match = re.search(pattern, question)

        if match:
            try:
                return datetime.strptime(
                    match.group(),
                    date_format
                ).date()
            except ValueError:
                continue

    return None
async def process_nl_query(
    db: AsyncSession,
    request: NaturalLanguageQueryRequest,
    current_user,
) -> NaturalLanguageQueryResponse:

    question = request.query.strip()

    if not question:
        return NaturalLanguageQueryResponse(
            answer="Please enter a question.",
            data=[],
        )

    # 1. Extract search terms from the user's question.
    search_terms = extract_search_terms(question)

    # 2. Fetch records using the existing database query builder.
    # Existing access restrictions are preserved.
    rows = await fetch_credentials(
        db,
        {},
        current_user,
        limit=200,
    )

    # 3. Match the extracted terms against credential records.
    requested_date = extract_date(question)

    # Remove the date phrase before extracting other search terms.
    date_match = re.search(
        r"\b(?:[A-Za-z]+ \d{1,2}, \d{4}|\d{1,2} [A-Za-z]+ \d{4}|\d{4}-\d{2}-\d{2})\b",
        question
    )

    if date_match:
        question_without_date = (
            question[:date_match.start()]
            + question[date_match.end():]
        )
        search_terms = extract_search_terms(question_without_date)

    matching_rows = [
        row for row in rows
        if (
            requested_date is None
            or (
                row.issue_date is not None
                and row.issue_date.date() == requested_date
            )
        )
        and record_matches(row, search_terms)
    ]

    # 4. Prepare response data.
    serialised = [
        {
            "credential_id": row.id,
            "schema_id": row.schema_id,
            "recipient_name": row.recipient_name,
            "status": row.status,
            "issued_by": row.issued_by,
            "issue_date": (
                row.issue_date.isoformat()
                if row.issue_date
                else None
            ),
            "payload": row.credential_payload,
        }
        for row in matching_rows
    ]
        # Handle count questions.
    if re.search(r"\b(how many|count|number of)\b", question.lower()):
        count = len(serialised)

        status_name = next(
            (
                term.upper()
                for term in search_terms
                if term in {"issued", "revoked", "failed", "pending_ai"}
            ),
            "matching"
        )

        if status_name == "matching":
            answer = f"There are {count} matching credentials."
        else:
            answer = f"There are {count} {status_name.lower()} credentials."

        return NaturalLanguageQueryResponse(
            answer=answer,
            data=serialised,
        )
    # 5. Generate a deterministic answer without an external LLM.
    count = len(serialised)

    if count == 0:
        answer = "No matching credentials were found."
    else:
        answer = (
            f"Found {count} matching credential(s). "
            f"Here are the matching records."
        )

    logger.info(
        "NL query completed. User=%s, matches=%d",
        current_user.id,
        count,
    )

    return NaturalLanguageQueryResponse(
        answer=answer,
        data=serialised,
    )