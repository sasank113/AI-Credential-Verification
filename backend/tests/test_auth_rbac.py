import asyncio
import unittest
import uuid
import httpx
from httpx import ASGITransport

from app.main import app
from app.core.security import verify_password, get_password_hash

class TestAuthenticationAndRBAC(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Create an in-memory ASGI transport for direct FastAPI integration testing
        self.transport = ASGITransport(app=app)
        self.client = httpx.AsyncClient(transport=self.transport, base_url="http://testserver")

    async def asyncTearDown(self):
        await self.client.aclose()

    # --- 1. Password Hashing Tests ---
    async def test_password_hashing(self):
        raw_password = "mySecurePassword123!"
        hashed = get_password_hash(raw_password)
        self.assertNotEqual(raw_password, hashed)
        self.assertTrue(hashed.startswith("$2b$") or hashed.startswith("$2a$"))
        self.assertTrue(verify_password(raw_password, hashed))
        self.assertFalse(verify_password("wrongPassword123!", hashed))

    # --- 2. User Registration & Input Validation Tests ---
    async def test_user_registration_success(self):
        unique_email = f"emp_{uuid.uuid4().hex[:8]}@example.com"
        res = await self.client.post("/api/v1/auth/register", json={
            "email": unique_email,
            "full_name": "New Employee",
            "password": "strongPassword123",
            "role": "EMPLOYEE"
        })
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertEqual(data["email"], unique_email)
        self.assertEqual(data["role"], "EMPLOYEE")
        self.assertTrue(data["is_active"])

    async def test_user_registration_short_password_rejected(self):
        res = await self.client.post("/api/v1/auth/register", json={
            "email": f"short_{uuid.uuid4().hex[:8]}@example.com",
            "full_name": "Short Password User",
            "password": "123",  # Less than 8 chars
            "role": "EMPLOYEE"
        })
        self.assertEqual(res.status_code, 422)

    async def test_user_registration_invalid_role_rejected(self):
        res = await self.client.post("/api/v1/auth/register", json={
            "email": f"badrole_{uuid.uuid4().hex[:8]}@example.com",
            "full_name": "Bad Role User",
            "password": "validPassword123",
            "role": "SUPER_ADMIN_CUSTOM"  # Not in [ADMIN, ISSUER, VERIFIER, EMPLOYEE, AUDITOR]
        })
        self.assertEqual(res.status_code, 422)

    async def test_user_registration_invalid_email_rejected(self):
        res = await self.client.post("/api/v1/auth/register", json={
            "email": "not-an-email-address",
            "full_name": "Invalid Email User",
            "password": "validPassword123",
            "role": "EMPLOYEE"
        })
        self.assertEqual(res.status_code, 422)

    async def test_user_registration_duplicate_email_rejected(self):
        email = f"dup_{uuid.uuid4().hex[:8]}@example.com"
        # First registration
        r1 = await self.client.post("/api/v1/auth/register", json={
            "email": email,
            "full_name": "User One",
            "password": "validPassword123",
            "role": "EMPLOYEE"
        })
        self.assertEqual(r1.status_code, 200)

        # Duplicate registration
        r2 = await self.client.post("/api/v1/auth/register", json={
            "email": email,
            "full_name": "User Duplicate",
            "password": "validPassword123",
            "role": "EMPLOYEE"
        })
        self.assertEqual(r2.status_code, 400)
        self.assertIn("already registered", r2.text)

    # --- 3. Login & JWT Authentication Tests ---
    async def test_login_success(self):
        res = await self.client.post("/api/v1/auth/login", data={
            "username": "admin@example.com",
            "password": "admin123"
        })
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()
        self.assertIn("access_token", data)
        self.assertIn("refresh_token", data)
        self.assertIn("session_id", data)
        self.assertEqual(data["token_type"], "bearer")
        self.assertEqual(data["user"]["role"], "ADMIN")

    async def test_login_invalid_credentials(self):
        res = await self.client.post("/api/v1/auth/login", data={
            "username": "admin@example.com",
            "password": "wrongpassword!"
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("Incorrect email ID or password", res.text)

    async def test_login_nonexistent_user(self):
        res = await self.client.post("/api/v1/auth/login", data={
            "username": "nobody_exists_here_999@example.com",
            "password": "anyPassword123"
        })
        self.assertEqual(res.status_code, 401)

    # --- 4. Unauthorized Access Tests ---
    async def test_unauthorized_access_missing_token(self):
        res = await self.client.get("/api/v1/auth/me")
        self.assertEqual(res.status_code, 401)

    async def test_unauthorized_access_invalid_token(self):
        res = await self.client.get("/api/v1/auth/me", headers={"Authorization": "Bearer bogus_invalid_token_123"})
        self.assertEqual(res.status_code, 401)

    # --- 5. Role-Based Access Control (RBAC) Tests ---
    async def get_token_for(self, email, password):
        res = await self.client.post("/api/v1/auth/login", data={"username": email, "password": password})
        self.assertEqual(res.status_code, 200, f"Failed to login {email}: {res.text}")
        return res.json()["access_token"]

    async def test_rbac_employee_restrictions(self):
        emp_token = await self.get_token_for("employee@example.com", "employee123")
        headers = {"Authorization": f"Bearer {emp_token}"}

        # 1. Employee CAN access /auth/me
        me_res = await self.client.get("/api/v1/auth/me", headers=headers)
        self.assertEqual(me_res.status_code, 200)
        self.assertEqual(me_res.json()["role"], "EMPLOYEE")

        # 2. Employee CAN access /credentials/ (view own credentials)
        creds_res = await self.client.get("/api/v1/credentials/", headers=headers)
        self.assertEqual(creds_res.status_code, 200)

        # 3. Employee is FORBIDDEN from issuing credentials (requires ISSUER or ADMIN)
        issue_res = await self.client.post("/api/v1/credentials/issue", headers=headers, json={
            "schema_id": "dummy",
            "recipient_name": "Test",
            "recipient_identifier": "test@test.com",
            "credential_data": {}
        })
        self.assertEqual(issue_res.status_code, 403)
        self.assertIn("Operation not permitted", issue_res.text)

        # 4. Employee is FORBIDDEN from viewing compliance audit logs (requires AUDITOR or ADMIN)
        audit_res = await self.client.get("/api/v1/compliance/audit-logs", headers=headers)
        self.assertEqual(audit_res.status_code, 403)

        # 5. Employee is FORBIDDEN from listing users (requires ADMIN)
        users_res = await self.client.get("/api/v1/auth/users", headers=headers)
        self.assertEqual(users_res.status_code, 403)

    async def test_rbac_issuer_permissions_and_restrictions(self):
        issuer_token = await self.get_token_for("issuer@example.com", "issuer123")
        headers = {"Authorization": f"Bearer {issuer_token}"}

        # Issuer is FORBIDDEN from audit logs (requires AUDITOR or ADMIN)
        audit_res = await self.client.get("/api/v1/compliance/audit-logs", headers=headers)
        self.assertEqual(audit_res.status_code, 403)

        # Issuer is FORBIDDEN from listing users (requires ADMIN)
        users_res = await self.client.get("/api/v1/auth/users", headers=headers)
        self.assertEqual(users_res.status_code, 403)

    async def test_rbac_auditor_permissions_and_restrictions(self):
        auditor_token = await self.get_token_for("auditor@example.com", "auditor123")
        headers = {"Authorization": f"Bearer {auditor_token}"}

        # Auditor CAN access compliance audit logs
        audit_res = await self.client.get("/api/v1/compliance/audit-logs", headers=headers)
        self.assertEqual(audit_res.status_code, 200)

        # Auditor is FORBIDDEN from issuing credentials
        issue_res = await self.client.post("/api/v1/credentials/issue", headers=headers, json={
            "schema_id": "dummy",
            "recipient_name": "Test",
            "recipient_identifier": "test@test.com",
            "credential_data": {}
        })
        self.assertEqual(issue_res.status_code, 403)

    async def test_rbac_admin_full_access(self):
        admin_token = await self.get_token_for("admin@example.com", "admin123")
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Admin CAN list users
        users_res = await self.client.get("/api/v1/auth/users", headers=headers)
        self.assertEqual(users_res.status_code, 200)
        users_list = users_res.json()
        self.assertGreaterEqual(len(users_list), 4)

        # Admin CAN access audit logs
        audit_res = await self.client.get("/api/v1/compliance/audit-logs", headers=headers)
        self.assertEqual(audit_res.status_code, 200)

        # Admin CAN access roles list
        roles_res = await self.client.get("/api/v1/auth/roles", headers=headers)
        self.assertEqual(roles_res.status_code, 200)
        roles = [r["role"] for r in roles_res.json()]
        self.assertIn("ADMIN", roles)
        self.assertIn("ISSUER", roles)
        self.assertIn("VERIFIER", roles)
        self.assertIn("EMPLOYEE", roles)
        self.assertIn("AUDITOR", roles)

if __name__ == "__main__":
    unittest.main()
