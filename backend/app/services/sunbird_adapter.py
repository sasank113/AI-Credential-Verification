import httpx
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, List, Optional
import jsonschema
from jsonschema import Draft7Validator, SchemaError
from app.core.config import settings

class SunbirdRCAdapter:
    """
    Decoupled integration layer for Sunbird RC APIs & W3C Verifiable Credentials.
    
    Supports:
    1. Registry setup & credential schema configuration.
    2. Credential issuance compliant with W3C VC standards.
    3. Storage and retrieval of credential references & metadata.
    4. Cryptographic verification & status checking against registry.
    5. Credential revocation with revocation registry tracking.
    """

    def __init__(self):
        self.base_url = settings.SUNBIRD_RC_BASE_URL.rstrip('/')
        self.api_key = settings.SUNBIRD_RC_API_KEY
        self.use_mock = settings.USE_MOCK_SUNBIRD
        
        # State registries for local mock/dev mode
        self._revoked_registry: Dict[str, Dict[str, Any]] = {}
        self._schema_registry: Dict[str, Dict[str, Any]] = {}

    def validate_json_schema(self, schema: Dict[str, Any]) -> Tuple[bool, List[str]]:
        """
        Validates that a schema is a syntactically valid JSON Schema Draft-7 definition.
        """
        errors = []
        try:
            Draft7Validator.check_schema(schema)
        except SchemaError as e:
            errors.append(f"Invalid JSON Schema Draft-7: {e.message}")
        except Exception as e:
            errors.append(f"Schema validation error: {str(e)}")
        return len(errors) == 0, errors

    def validate_vc_payload_schema(
        self, payload: Dict[str, Any], json_schema: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, List[str], Dict[str, Any]]:
        """
        Validates W3C Verifiable Credential standard structure & custom JSON schema.
        Returns (is_valid, error_list, metadata).
        """
        errors = []

        # 1. W3C Core Standard Field Check
        required_w3c_fields = ["@context", "id", "type", "issuer", "issuanceDate", "credentialSubject"]
        for field in required_w3c_fields:
            if field not in payload:
                errors.append(f"Missing required W3C VC field: '{field}'")

        if "@context" in payload and not isinstance(payload["@context"], list):
            errors.append("W3C field '@context' must be a list containing context URIs")

        if "type" in payload and not isinstance(payload["type"], list):
            errors.append("W3C field 'type' must be a list (e.g., ['VerifiableCredential', '<SchemaName>'])")

        # 2. JSON Schema Validation for credentialSubject / payload
        schema_validation_passed = True
        if json_schema and isinstance(json_schema, dict):
            try:
                validator = Draft7Validator(json_schema)
                subject_data = payload.get("credentialSubject", payload)
                schema_errors = list(validator.iter_errors(subject_data))
                for err in schema_errors:
                    path_str = " -> ".join([str(p) for p in err.path]) if err.path else "root"
                    errors.append(f"Schema violation at [{path_str}]: {err.message}")
                if schema_errors:
                    schema_validation_passed = False
            except Exception as ex:
                errors.append(f"Schema validator execution error: {str(ex)}")
                schema_validation_passed = False

        is_valid = len(errors) == 0
        metadata = {
            "w3c_compliant": len([e for e in errors if "W3C" in e]) == 0,
            "json_schema_valid": schema_validation_passed,
            "total_errors": len(errors),
            "validated_at": datetime.utcnow().isoformat() + "Z"
        }
        return is_valid, errors, metadata

    async def create_schema(self, schema_name: str, json_schema: Dict[str, Any], description: Optional[str] = None) -> Dict[str, Any]:
        """
        Official Sunbird RC Schema Configuration API: POST /api/v1/schemas
        Registers a new verifiable credential schema definition in the Sunbird RC registry.
        """
        is_valid, errors = self.validate_json_schema(json_schema)
        if not is_valid:
            raise ValueError(f"Invalid JSON Schema: {'; '.join(errors)}")

        schema_payload = {
            "name": schema_name,
            "description": description or f"Schema for {schema_name}",
            "schema": json_schema,
            "status": "PUBLISHED",
            "_osConfig": {
                "credentialTemplate": {
                    "@context": ["https://www.w3.org/2018/credentials/v1"],
                    "type": ["VerifiableCredential", schema_name]
                }
            }
        }

        if self.use_mock:
            schema_id = f"schema-sb-{uuid.uuid4().hex[:8]}"
            res = {
                "osid": schema_id,
                "name": schema_name,
                "status": "PUBLISHED",
                "schema": json_schema,
                "createdAt": datetime.now(timezone.utc).isoformat()
            }
            self._schema_registry[schema_name] = res
            self._schema_registry[schema_id] = res
            return res

        async with httpx.AsyncClient() as client:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            response = await client.post(
                f"{self.base_url}/api/v1/schemas",
                json=schema_payload,
                headers=headers,
                timeout=15.0
            )
            response.raise_for_status()
            return response.json()

    async def get_schema(self, schema_name_or_id: str) -> Optional[Dict[str, Any]]:
        """
        Official Sunbird RC Schema Query API: GET /api/v1/schemas/{id}
        """
        if self.use_mock:
            return self._schema_registry.get(schema_name_or_id)

        async with httpx.AsyncClient() as client:
            headers = {"Accept": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            response = await client.get(
                f"{self.base_url}/api/v1/schemas/{schema_name_or_id}",
                headers=headers,
                timeout=10.0
            )
            if response.status_code == 200:
                return response.json()
            return None

    async def issue_vc(self, entity_name: str, payload: Dict[str, Any], json_schema: Optional[Dict[str, Any]] = None) -> Tuple[str, Dict[str, Any]]:
        """
        Official Sunbird RC Credential Issuance API: POST /api/v1/{entity_name}
        Issues a W3C-compliant Verifiable Credential signed with issuer cryptographic proof.
        """
        # Validate data against entity schema if provided
        if json_schema:
            try:
                validator = Draft7Validator(json_schema)
                schema_errors = list(validator.iter_errors(payload))
                if schema_errors:
                    err_msgs = [f"[{' -> '.join(str(p) for p in err.path) if err.path else 'root'}]: {err.message}" for err in schema_errors]
                    raise ValueError(f"Credential payload fails schema validation: {'; '.join(err_msgs)}")
            except SchemaError as ex:
                raise ValueError(f"Invalid schema: {ex.message}")

        if self.use_mock:
            mock_osid = f"osid-sb-{uuid.uuid4().hex[:12]}"
            w3c_vc = {
                "@context": [
                    "https://www.w3.org/2018/credentials/v1",
                    "https://sunbirdrc.github.io/context/v1/context.json"
                ],
                "id": f"urn:uuid:{uuid.uuid4()}",
                "type": ["VerifiableCredential", entity_name],
                "issuer": "did:sunbirdrc:enterprise-issuer-001",
                "issuanceDate": datetime.now(timezone.utc).isoformat(),
                "credentialSubject": {
                    "sunbird_osid": mock_osid,
                    "recipient_identifier": payload.get('recipient_identifier', 'user'),
                    **payload
                },
                "proof": {
                    "type": "Ed25519Signature2020",
                    "created": datetime.now(timezone.utc).isoformat(),
                    "verificationMethod": "did:sunbirdrc:enterprise-issuer-001#key-1",
                    "proofPurpose": "assertionMethod",
                    "jws": f"eyJhbGciOiJFZERTQSI...mock_signature_{uuid.uuid4().hex[:8]}"
                }
            }
            return mock_osid, w3c_vc

        # Real Sunbird RC API Call
        async with httpx.AsyncClient() as client:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            response = await client.post(
                f"{self.base_url}/api/v1/{entity_name}",
                json=payload,
                headers=headers,
                timeout=15.0
            )
            response.raise_for_status()
            res_json = response.json()
            osid = res_json.get("osid", res_json.get("result", {}).get("osid", f"osid-{uuid.uuid4().hex[:8]}"))
            return osid, res_json

    async def verify_vc(self, entity_name: str, vc_payload: Dict[str, Any], json_schema: Optional[Dict[str, Any]] = None) -> Tuple[bool, str, Dict[str, Any]]:
        """
        Official Sunbird RC Credential Verification API: POST /api/v1/{entity_name}/verify
        Verifies:
        1. W3C structural compliance.
        2. Cryptographic proof / signature integrity.
        3. Registry revocation status.
        """
        # First perform standard local schema & structural validation
        is_schema_valid, schema_errors, schema_meta = self.validate_vc_payload_schema(vc_payload, json_schema=json_schema)

        # Extract OSID from payload
        osid = (
            vc_payload.get("credentialSubject", {}).get("sunbird_osid")
            or vc_payload.get("sunbird_osid")
            or (vc_payload.get("id", "").replace("urn:uuid:", "") if vc_payload.get("id") else None)
        )

        # Check Revocation Registry
        is_revoked = False
        revocation_info = None
        if osid and osid in self._revoked_registry:
            is_revoked = True
            revocation_info = self._revoked_registry[osid]
        elif vc_payload.get("revoked", False) or vc_payload.get("status") == "REVOKED":
            is_revoked = True
            revocation_info = {"reason": vc_payload.get("revocation_reason", "Marked revoked in credential payload")}

        if is_revoked:
            reason = revocation_info.get("reason", "Administrative policy revocation") if revocation_info else "Revoked"
            details = {
                "verifiedAt": datetime.utcnow().isoformat() + "Z",
                "status": "REVOKED",
                "is_valid": False,
                "osid": osid,
                "revoked": True,
                "revocation_reason": reason,
                "schemaCompliant": is_schema_valid,
                "engine": "Sunbird RC Registry Verifier"
            }
            return False, f"STATUS: REVOKED. This credential (OSID: {osid}) was revoked from Sunbird RC Status Registry. Reason: '{reason}'.", details

        if self.use_mock:
            has_proof = (
                isinstance(vc_payload.get("proof"), dict)
                and ("jws" in vc_payload["proof"] or "signatureValue" in vc_payload["proof"])
            )
            is_valid = is_schema_valid and has_proof

            msg_parts = []
            if is_valid:
                msg_parts.append("Sunbird RC Cryptographic Proof & W3C Schema Verified (Registry Status: ACTIVE)")
            else:
                if not is_schema_valid:
                    msg_parts.append(f"Schema errors: {'; '.join(schema_errors)}")
                if not has_proof:
                    msg_parts.append("Missing cryptographic proof block or invalid JWS signature token")

            message = " | ".join(msg_parts) if msg_parts else "Credential Verification Failed"
            details = {
                "verifiedAt": datetime.utcnow().isoformat() + "Z",
                "status": "ISSUED" if is_valid else "INVALID",
                "is_valid": is_valid,
                "osid": osid,
                "proofValid": has_proof,
                "schemaCompliant": is_schema_valid,
                "schemaErrors": schema_errors,
                "schemaMetadata": schema_meta,
                "engine": "Sunbird RC (Mock Engine / Dev Mode)"
            }
            return is_valid, message, details

        # Real Sunbird RC API Call
        async with httpx.AsyncClient() as client:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            response = await client.post(
                f"{self.base_url}/api/v1/{entity_name}/verify",
                json=vc_payload,
                headers=headers,
                timeout=15.0
            )
            if response.status_code == 200:
                res_data = response.json()
                is_valid = res_data.get("isValid", True) and is_schema_valid
                res_data["schemaErrors"] = schema_errors
                res_data["schemaMetadata"] = schema_meta
                res_data["status"] = "ISSUED" if is_valid else "INVALID"
                return is_valid, "Sunbird RC Registry Verification Success", res_data
            return False, f"Verification failed with HTTP status {response.status_code}", {"schemaErrors": schema_errors, "status": "INVALID"}

    async def get_vc_by_osid(self, entity_name: str, osid: str) -> Optional[Dict[str, Any]]:
        """
        Official Sunbird RC Registry Query API: GET /api/v1/{entity_name}/{osid}
        """
        if self.use_mock:
            is_revoked = osid in self._revoked_registry
            return {
                "osid": osid,
                "entity": entity_name,
                "status": "REVOKED" if is_revoked else "ACTIVE",
                "revocation_reason": self._revoked_registry[osid]["reason"] if is_revoked else None,
                "revoked_at": self._revoked_registry[osid]["revoked_at"] if is_revoked else None,
                "synced_at": datetime.utcnow().isoformat() + "Z"
            }

        async with httpx.AsyncClient() as client:
            headers = {"Accept": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"

            response = await client.get(
                f"{self.base_url}/api/v1/{entity_name}/{osid}",
                headers=headers,
                timeout=10.0
            )
            if response.status_code == 200:
                return response.json()
            return None

    async def revoke_vc(self, entity_name: str, osid: str, reason: str) -> bool:
        """
        Official Sunbird RC Revocation API: PUT /api/v1/{entity_name}/{osid}
        Updates the entity record status to REVOKED in the Sunbird RC status registry.
        """
        if self.use_mock:
            self._revoked_registry[osid] = {
                "reason": reason,
                "revoked_at": datetime.utcnow().isoformat() + "Z",
                "entity": entity_name
            }
            return True

        async with httpx.AsyncClient() as client:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            
            response = await client.put(
                f"{self.base_url}/api/v1/{entity_name}/{osid}",
                json={"status": "REVOKED", "revocationReason": reason, "updatedAt": datetime.utcnow().isoformat() + "Z"},
                headers=headers,
                timeout=15.0
            )
            return response.status_code == 200

    async def get_sunbird_health(self) -> Dict[str, Any]:
        """
        Checks connectivity to Sunbird RC registry service.
        """
        if self.use_mock:
            return {
                "status": "HEALTHY",
                "mode": "MOCK / DEV",
                "base_url": self.base_url,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "latency_ms": 1.2
            }

        start_time = datetime.now(timezone.utc)
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{self.base_url}/health", timeout=5.0)
                latency = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
                return {
                    "status": "HEALTHY" if response.status_code == 200 else "DEGRADED",
                    "mode": "LIVE SUNBIRD RC",
                    "status_code": response.status_code,
                    "base_url": self.base_url,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "latency_ms": round(latency, 2)
                }
        except Exception as ex:
            return {
                "status": "UNREACHABLE",
                "mode": "LIVE SUNBIRD RC",
                "error": str(ex),
                "base_url": self.base_url,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }

sunbird_adapter = SunbirdRCAdapter()
