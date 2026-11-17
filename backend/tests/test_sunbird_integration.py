import asyncio
import unittest
import uuid
import httpx
from httpx import ASGITransport

from app.main import app

class TestSunbirdRCIntegration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.transport = ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://testserver")

        # Obtain tokens for testing RBAC across roles
        self.admin_token = await self._get_token("admin@example.com", "admin123")
        self.issuer_token = await self._get_token("issuer@example.com", "issuer123")
        self.verifier_token = await self._get_token("verifier@example.com", "verifier123")
        self.employee_token = await self._get_token("employee@example.com", "employee123")

    async def asyncTearDown(self):
        await self.client.aclose()

    async def _get_token(self, email: str, pwd: str) -> str:
        res = await self.client.post("/api/v1/auth/login", data={"username": email, "password": pwd})
        if res.status_code != 200:
            raise RuntimeError(f"Login failed for {email}: {res.text}")
        return res.json()["access_token"]

    def _auth_header(self, token: str):
        return {"Authorization": f"Bearer {token}"}

    # --- 1. Registry Setup & Schema Configuration Tests ---
    async def test_sunbird_status_health(self):
        res = await self.client.get(
            "/api/v1/credentials/sunbird-status",
            headers=self._auth_header(self.verifier_token)
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("status", data)
        self.assertIn("mode", data)
        self.assertIn("base_url", data)

    async def test_schema_configuration_lifecycle(self):
        schema_id = f"CourseCompletionSchema_{uuid.uuid4().hex[:6]}"
        schema_payload = {
            "schema_name": "Course Completion Certificate",
            "sunbird_schema_id": schema_id,
            "version": "1.0.0",
            "description": "Schema for corporate course completion",
            "json_schema": {
                "type": "object",
                "properties": {
                    "course_title": {"type": "string"},
                    "score": {"type": "number"},
                    "completed_date": {"type": "string"}
                },
                "required": ["course_title", "score"]
            }
        }

        # 1. Admin successfully registers schema in Sunbird RC & PostgreSQL
        create_res = await self.client.post(
            "/api/v1/credentials/schemas",
            headers=self._auth_header(self.admin_token),
            json=schema_payload
        )
        self.assertEqual(create_res.status_code, 200, create_res.text)
        created_schema = create_res.json()
        self.assertEqual(created_schema["sunbird_schema_id"], schema_id)
        self.assertIn("id", created_schema)

        # 2. Duplicate registration rejected
        dup_res = await self.client.post(
            "/api/v1/credentials/schemas",
            headers=self._auth_header(self.admin_token),
            json=schema_payload
        )
        self.assertEqual(dup_res.status_code, 400)
        self.assertIn("already registered", dup_res.text)

        # 3. List schemas includes newly created schema
        list_res = await self.client.get(
            "/api/v1/credentials/schemas",
            headers=self._auth_header(self.issuer_token)
        )
        self.assertEqual(list_res.status_code, 200)
        schemas = list_res.json()
        self.assertTrue(any(s["sunbird_schema_id"] == schema_id for s in schemas))

        # 4. Non-admin forbidden from creating schemas
        forbidden_res = await self.client.post(
            "/api/v1/credentials/schemas",
            headers=self._auth_header(self.issuer_token),
            json=schema_payload
        )
        self.assertEqual(forbidden_res.status_code, 403)

    async def test_schema_invalid_syntax_rejected(self):
        invalid_schema = {
            "schema_name": "Invalid Schema",
            "sunbird_schema_id": f"InvalidSchema_{uuid.uuid4().hex[:6]}",
            "json_schema": {
                "type": "unknown_type_that_fails_draft7",
                "properties": "should_be_dict_not_str"
            }
        }
        res = await self.client.post(
            "/api/v1/credentials/schemas",
            headers=self._auth_header(self.admin_token),
            json=invalid_schema
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Invalid JSON Schema", res.text)

    # --- 2. Credential Issuance & 3. Storage of References/Metadata ---
    async def test_credential_issuance_and_metadata_storage(self):
        # 1. Fetch available schema
        schemas_res = await self.client.get(
            "/api/v1/credentials/schemas",
            headers=self._auth_header(self.issuer_token)
        )
        self.assertEqual(schemas_res.status_code, 200)
        schemas = schemas_res.json()
        self.assertGreater(len(schemas), 0)
        target_schema = next((s for s in schemas if "Degree" in s["schema_name"]), schemas[0])

        # 2. Issue credential with valid payload matching schema
        recipient_email = f"student_{uuid.uuid4().hex[:6]}@techuniv.edu"
        props = target_schema.get("json_schema", {}).get("properties", {})
        if "course_title" in props:
            cred_data = {"course_title": "AI Engineering", "score": 95.5, "completed_date": "2025-06-15"}
        else:
            cred_data = {
                "degree_title": "Master of Science in Artificial Intelligence",
                "major": "Deep Neural Networks",
                "graduation_year": 2025,
                "gpa": 3.92
            }

        issue_res = await self.client.post(
            "/api/v1/credentials/issue",
            headers=self._auth_header(self.issuer_token),
            json={
                "schema_id": target_schema["id"],
                "recipient_identifier": recipient_email,
                "recipient_name": "Jordan Lee",
                "credential_data": cred_data
            }
        )
        self.assertEqual(issue_res.status_code, 200, issue_res.text)
        issued_cred = issue_res.json()

        # Verify reference and metadata fields stored
        self.assertIn("id", issued_cred)
        self.assertIn("sunbird_osid", issued_cred)
        self.assertTrue(issued_cred["sunbird_osid"].startswith("osid-"))
        self.assertEqual(issued_cred["status"], "ISSUED")
        self.assertEqual(issued_cred["recipient_identifier"], recipient_email)
        self.assertEqual(issued_cred["recipient_name"], "Jordan Lee")

        # Verify W3C standard compliance in vc_payload
        vc = issued_cred["credential_payload"]
        self.assertIn("@context", vc)
        self.assertIn("https://www.w3.org/2018/credentials/v1", vc["@context"])
        self.assertIn("id", vc)
        self.assertIn("type", vc)
        self.assertIn("VerifiableCredential", vc["type"])
        self.assertIn("issuer", vc)
        self.assertTrue(vc["issuer"].startswith("did:sunbirdrc:"))
        self.assertIn("issuanceDate", vc)
        self.assertIn("credentialSubject", vc)
        self.assertEqual(vc["credentialSubject"]["recipient_name"], "Jordan Lee")
        self.assertEqual(vc["credentialSubject"]["sunbird_osid"], issued_cred["sunbird_osid"])
        self.assertIn("proof", vc)
        self.assertEqual(vc["proof"]["type"], "Ed25519Signature2020")
        self.assertIn("jws", vc["proof"])

        # 3. Retrieve stored credential by internal ID
        get_id_res = await self.client.get(
            f"/api/v1/credentials/{issued_cred['id']}",
            headers=self._auth_header(self.admin_token)
        )
        self.assertEqual(get_id_res.status_code, 200)
        self.assertEqual(get_id_res.json()["sunbird_osid"], issued_cred["sunbird_osid"])

        # 4. Retrieve stored credential by Sunbird OSID
        get_osid_res = await self.client.get(
            f"/api/v1/credentials/osid/{issued_cred['sunbird_osid']}",
            headers=self._auth_header(self.admin_token)
        )
        self.assertEqual(get_osid_res.status_code, 200)
        self.assertEqual(get_osid_res.json()["id"], issued_cred["id"])

        return issued_cred

    async def test_credential_issuance_schema_validation_failure(self):
        schemas_res = await self.client.get(
            "/api/v1/credentials/schemas",
            headers=self._auth_header(self.issuer_token)
        )
        schemas = schemas_res.json()
        target_schema = next((s for s in schemas if "Degree" in s["schema_name"]), schemas[0])

        # Pass invalid types (graduation_year as string when integer required)
        issue_res = await self.client.post(
            "/api/v1/credentials/issue",
            headers=self._auth_header(self.issuer_token),
            json={
                "schema_id": target_schema["id"],
                "recipient_identifier": "invalid_types@test.com",
                "recipient_name": "Test User",
                "credential_data": {
                    "degree_title": 12345,  # Should be string
                    "graduation_year": "nineteen-ninety-nine",  # Should be integer
                    "gpa": "high"  # Should be number
                }
            }
        )
        self.assertEqual(issue_res.status_code, 422)
        self.assertIn("fails schema validation", issue_res.text)

    # --- 4. Credential Verification Tests ---
    async def test_credential_verification_by_payload_and_osid(self):
        # First issue a fresh credential
        cred = await self.test_credential_issuance_and_metadata_storage()
        osid = cred["sunbird_osid"]
        vc_payload = cred["credential_payload"]

        # Verification Option A: Verify by posting complete W3C VC payload
        verify_payload_res = await self.client.post(
            "/api/v1/credentials/verify",
            headers=self._auth_header(self.verifier_token),
            json={"credential_payload": vc_payload}
        )
        self.assertEqual(verify_payload_res.status_code, 200)
        v1_data = verify_payload_res.json()
        self.assertTrue(v1_data["is_valid"])
        self.assertEqual(v1_data["status"], "ISSUED")
        self.assertIn("proofValid", v1_data["verification_details"])
        self.assertTrue(v1_data["verification_details"]["proofValid"])

        # Verification Option B: Verify by OSID reference lookup
        verify_osid_res = await self.client.post(
            "/api/v1/credentials/verify",
            headers=self._auth_header(self.verifier_token),
            json={"sunbird_osid": osid}
        )
        self.assertEqual(verify_osid_res.status_code, 200)
        v2_data = verify_osid_res.json()
        self.assertTrue(v2_data["is_valid"])
        self.assertEqual(v2_data["status"], "ISSUED")

    async def test_credential_verification_tampered_payload_rejected(self):
        # Tampered payload without cryptographic proof block
        tampered_vc = {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            "id": "urn:uuid:fake-credential-001",
            "type": ["VerifiableCredential", "University Degree Certificate"],
            "issuer": "did:sunbirdrc:fake-issuer",
            "issuanceDate": "2026-01-01T00:00:00Z",
            "credentialSubject": {
                "recipient_name": "Hacker Impersonator",
                "degree_title": "Fake Ph.D."
            }
            # Missing "proof" block
        }

        verify_res = await self.client.post(
            "/api/v1/credentials/verify",
            headers=self._auth_header(self.verifier_token),
            json={"credential_payload": tampered_vc}
        )
        self.assertEqual(verify_res.status_code, 200)
        data = verify_res.json()
        self.assertFalse(data["is_valid"])
        self.assertEqual(data["status"], "INVALID")
        self.assertIn("Missing cryptographic proof", data["message"])

    # --- 5. Credential Revocation Tests ---
    async def test_credential_revocation_lifecycle(self):
        # 1. Issue a credential
        cred = await self.test_credential_issuance_and_metadata_storage()
        osid = cred["sunbird_osid"]
        vc_payload = cred["credential_payload"]

        # 2. Revoke the credential via ISSUER role
        revoke_res = await self.client.post(
            "/api/v1/credentials/revoke",
            headers=self._auth_header(self.issuer_token),
            json={
                "sunbird_osid": osid,
                "reason": "Revoked due to administrative degree correction"
            }
        )
        self.assertEqual(revoke_res.status_code, 200, revoke_res.text)
        revoke_data = revoke_res.json()
        self.assertEqual(revoke_data["status"], "REVOKED")
        self.assertEqual(revoke_data["osid"], osid)

        # 3. Verify that DB record status is updated to REVOKED with reason
        get_res = await self.client.get(
            f"/api/v1/credentials/osid/{osid}",
            headers=self._auth_header(self.admin_token)
        )
        self.assertEqual(get_res.status_code, 200)
        self.assertEqual(get_res.json()["status"], "REVOKED")
        self.assertEqual(get_res.json()["revocation_reason"], "Revoked due to administrative degree correction")

        # 4. Verify that subsequent verification reports REVOKED (by payload)
        verify_revoked_payload = await self.client.post(
            "/api/v1/credentials/verify",
            headers=self._auth_header(self.verifier_token),
            json={"credential_payload": vc_payload}
        )
        self.assertEqual(verify_revoked_payload.status_code, 200)
        v_res = verify_revoked_payload.json()
        self.assertFalse(v_res["is_valid"])
        self.assertEqual(v_res["status"], "REVOKED")
        self.assertIn("REVOKED", v_res["message"])

        # 5. Verify that subsequent verification reports REVOKED (by OSID)
        verify_revoked_osid = await self.client.post(
            "/api/v1/credentials/verify",
            headers=self._auth_header(self.verifier_token),
            json={"sunbird_osid": osid}
        )
        self.assertEqual(verify_revoked_osid.status_code, 200)
        v_osid_res = verify_revoked_osid.json()
        self.assertFalse(v_osid_res["is_valid"])
        self.assertEqual(v_osid_res["status"], "REVOKED")

        # 6. Direct query to Sunbird Registry reflects REVOKED status
        reg_res = await self.client.get(
            f"/api/v1/credentials/registry/{osid}",
            headers=self._auth_header(self.verifier_token)
        )
        self.assertEqual(reg_res.status_code, 200)
        self.assertEqual(reg_res.json()["status"], "REVOKED")

    async def test_employee_scoped_credential_access(self):
        # Employee querying /credentials/ should only receive their own records
        emp_res = await self.client.get(
            "/api/v1/credentials/",
            headers=self._auth_header(self.employee_token)
        )
        self.assertEqual(emp_res.status_code, 200)
        creds = emp_res.json()
        for c in creds:
            self.assertEqual(c["recipient_identifier"], "employee@example.com")

if __name__ == "__main__":
    unittest.main()
