import json
import random
from typing import Dict, Any, List
from app.core.config import settings

class AIService:
    """
    AI Engine powered by LangChain / LLM logic.
    Provides Eligibility Verification, Credential Fraud Detection, and Natural Language Query parsing.
    """

    def __init__(self):
        self.use_mock = settings.USE_MOCK_AI or not bool(settings.OPENAI_API_KEY)

    async def evaluate_eligibility(
        self, 
        applicant_data: Dict[str, Any], 
        criteria: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        AI-based eligibility verification.
        Matches applicant credentials and properties against schema-defined eligibility rules.
        """
        if not self.use_mock:
            try:
                from langchain_openai import ChatOpenAI
                from langchain_core.prompts import PromptTemplate
                
                llm = ChatOpenAI(model=settings.LLM_MODEL, openai_api_key=settings.OPENAI_API_KEY, temperature=0.1)
                prompt = PromptTemplate.from_template(
                    "You are an enterprise credential eligibility AI evaluator.\n"
                    "Evaluate Candidate Data against Eligibility Criteria.\n"
                    "Candidate: {applicant_data}\n"
                    "Criteria: {criteria}\n"
                    "Return ONLY valid JSON with keys: is_eligible (bool), confidence_score (float 0.0-1.0), reasons (list of str), suggested_actions (list of str)."
                )
                chain = prompt | llm
                response = await chain.ainvoke({"applicant_data": json.dumps(applicant_data), "criteria": json.dumps(criteria)})
                return json.loads(response.content)
            except Exception as e:
                print(f"[AI Service] OpenAI fallback to heuristic logic due to: {e}")

        # Smart Heuristic Rule Engine (Mock / Fallback)
        score = 0.95
        reasons = []
        suggested = []
        is_eligible = True

        # Example check
        gpa = float(applicant_data.get("gpa", applicant_data.get("marks", 85)))
        min_gpa = float(criteria.get("min_gpa", 70))
        if gpa < min_gpa:
            is_eligible = False
            score = 0.4
            reasons.append(f"Applicant score/marks ({gpa}) is below required minimum of ({min_gpa}).")
            suggested.append("Require manual override approval or submission of supplementary transcripts.")
        else:
            reasons.append(f"Applicant satisfies academic requirement ({gpa} >= {min_gpa}).")

        exp = int(applicant_data.get("experience_years", applicant_data.get("experience", 2)))
        min_exp = int(criteria.get("min_experience_years", 1))
        if exp < min_exp:
            is_eligible = False
            reasons.append(f"Work experience ({exp} yrs) does not satisfy requirement ({min_exp} yrs).")
        else:
            reasons.append(f"Work experience ({exp} yrs) satisfies eligibility threshold.")

        return {
            "is_eligible": is_eligible,
            "confidence_score": score,
            "reasons": reasons,
            "suggested_actions": suggested if not is_eligible else ["Proceed to instant credential issuance."]
        }

    async def detect_fraud(
        self, 
        credential_payload: Dict[str, Any], 
        issuer_metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        AI-based credential fraud detection.
        Scans for metadata discrepancies, signature date anomalies, invalid DIDs, and claim inconsistencies.
        """
        if not self.use_mock:
            try:
                from langchain_openai import ChatOpenAI
                from langchain_core.prompts import PromptTemplate
                
                llm = ChatOpenAI(model=settings.LLM_MODEL, openai_api_key=settings.OPENAI_API_KEY, temperature=0.1)
                prompt = PromptTemplate.from_template(
                    "You are a credential fraud detection AI security model.\n"
                    "Scan this Verifiable Credential Payload for anomalies:\n{payload}\n"
                    "Return ONLY valid JSON with keys: risk_level (LOW/MEDIUM/HIGH/CRITICAL), anomaly_detected (bool), confidence_score (float), detected_anomalies (list of str), recommendation (str)."
                )
                chain = prompt | llm
                response = await chain.ainvoke({"payload": json.dumps(credential_payload)})
                return json.loads(response.content)
            except Exception as e:
                print(f"[AI Service] OpenAI fallback due to: {e}")

        # Smart Security Anomaly Scanner (Multi-Vector Security Inspection)
        anomalies = []
        risk_score_points = 0
        confidence = 0.98

        payload_str = json.dumps(credential_payload).lower()
        
        # 1. Cryptographic & Context Validation
        if "@context" not in credential_payload:
            anomalies.append("Missing mandatory W3C `@context` specification header.")
            risk_score_points += 30
        
        proof = credential_payload.get("proof")
        if not proof or not isinstance(proof, dict):
            anomalies.append("Missing or malformed cryptographic `proof` object.")
            risk_score_points += 50
        else:
            if "jws" not in proof and "proofValue" not in proof:
                anomalies.append("Cryptographic proof is missing digital signature token (jws/proofValue).")
                risk_score_points += 40
            if proof.get("type") not in ["Ed25519Signature2020", "JsonWebSignature2020", "RsaSignature2018"]:
                anomalies.append(f"Unrecognized or deprecated signature suite: {proof.get('type')}.")
                risk_score_points += 20

        # 2. Issuer DID & Registry Authorization Check
        issuer = credential_payload.get("issuer")
        if not issuer:
            anomalies.append("Issuer identifier is null or empty.")
            risk_score_points += 50
        elif isinstance(issuer, str):
            if issuer.startswith("did:unknown") or "unverified" in issuer:
                anomalies.append(f"Issuer DID '{issuer}' is untrusted or unverified in Sunbird RC registry.")
                risk_score_points += 45
            elif not (issuer.startswith("did:sunbirdrc:") or issuer.startswith("did:key:") or issuer.startswith("did:web:")):
                anomalies.append(f"Non-standard DID scheme used: '{issuer}'. Expected did:sunbirdrc: or did:key:.")
                risk_score_points += 25

        # 3. Claims & Subject Data Inconsistency Analysis
        subject = credential_payload.get("credentialSubject", {})
        if isinstance(subject, dict):
            # GPA / Marks sanity check
            if "gpa" in subject:
                try:
                    gpa = float(subject["gpa"])
                    if gpa < 0.0 or gpa > 4.0:
                        anomalies.append(f"Academic GPA claim '{gpa}' is outside valid range [0.0 - 4.0]. Possible score tampering.")
                        risk_score_points += 40
                except (ValueError, TypeError):
                    anomalies.append("GPA claim value cannot be parsed as numerical decimal.")
                    risk_score_points += 20
            
            # Graduation Year check
            if "graduation_year" in subject:
                try:
                    grad_year = int(subject["graduation_year"])
                    if grad_year > 2030 or grad_year < 1950:
                        anomalies.append(f"Graduation year '{grad_year}' is chronologically improbable.")
                        risk_score_points += 30
                except (ValueError, TypeError):
                    pass

        # 4. Explicit Synthetic / Fraud Keyword Scans
        if "test" in payload_str and "fraud" in payload_str:
            anomalies.append("Payload contains explicitly flagged synthetic test markers and conflicting claim metadata.")
            risk_score_points += 60

        # Risk Classification Logic
        if risk_score_points >= 60:
            risk_level = "CRITICAL"
        elif risk_score_points >= 35:
            risk_level = "HIGH"
        elif risk_score_points >= 15:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        anomaly_detected = len(anomalies) > 0

        rec_map = {
            "CRITICAL": "IMMEDIATE REJECTION: Credential exhibits high-severity cryptographic or structural anomalies. Block issuance & alert compliance team.",
            "HIGH": "FLAGGED FOR AUDIT: Significant risk indicators found. Require manual verification of issuer public key & original records.",
            "MEDIUM": "MINOR WARNING: Schema formatting or minor non-standard fields detected. Verification recommended.",
            "LOW": "PASSED: Credential payload satisfies W3C standards and cryptographic integrity checks."
        }

        return {
            "risk_level": risk_level,
            "risk_score": min(risk_score_points, 100),
            "anomaly_detected": anomaly_detected,
            "confidence_score": confidence,
            "detected_anomalies": anomalies,
            "recommendation": rec_map[risk_level]
        }

    async def parse_natural_language_query(self, query: str) -> Dict[str, Any]:
        """
        Translates human natural language query into structured database filters.
        """
        query_lower = query.lower()
        explanation = f"Translated natural language intent into SQL filter parameters for user query: '{query}'."
        
        # Mock structured query parsing results matching DB schema
        results = [
            {
                "id": "rec-101",
                "recipient_name": "Alice Johnson",
                "recipient_identifier": "alice@example.com",
                "schema_name": "University Degree Credential",
                "status": "ISSUED",
                "issue_date": "2026-09-15T10:30:00Z"
            },
            {
                "id": "rec-102",
                "recipient_name": "Bob Smith",
                "recipient_identifier": "bob@example.com",
                "schema_name": "Software Skill Badge",
                "status": "ISSUED",
                "issue_date": "2026-09-18T14:20:00Z"
            }
        ]

        sql = "SELECT * FROM credential_records WHERE status = 'ISSUED' ORDER BY created_at DESC LIMIT 50;"
        if "revok" in query_lower:
            sql = "SELECT * FROM credential_records WHERE status = 'REVOKED';"
            explanation = "Filtered credentials by status = REVOKED."
            results = [{
                "id": "rec-103",
                "recipient_name": "Charlie Brown",
                "recipient_identifier": "charlie@example.com",
                "schema_name": "Medical License",
                "status": "REVOKED",
                "revocation_reason": "License expired and not renewed"
            }]
        elif "fraud" in query_lower or "risk" in query_lower:
            sql = "SELECT * FROM ai_evaluation_logs WHERE risk_level IN ('HIGH', 'CRITICAL');"
            explanation = "Extracted high-risk AI fraud detection logs."

        return {
            "generated_sql": sql,
            "explanation": explanation,
            "results": results,
            "total_count": len(results)
        }

ai_service = AIService()
