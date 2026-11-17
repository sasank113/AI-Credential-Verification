import asyncio
from app.core.database import AsyncSessionLocal, engine, Base
from app.core.security import get_password_hash
from app.models.user import User
from app.models.credential import CredentialSchemaModel, CredentialRecord
from app.models.audit import AuditLog
from app.models.ai_log import AIEvaluationLog
from sqlalchemy import select

async def seed_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        # 1. Create Users
        users_data = [
            ("admin@example.com", "admin123", "System Administrator", "ADMIN"),
            ("issuer@example.com", "issuer123", "Enterprise Issuer Officer", "ISSUER"),
            ("verifier@example.com", "verifier123", "Security Verifier Officer", "VERIFIER"),
            ("employee@example.com", "employee123", "Alice Johnson", "EMPLOYEE"),
            ("auditor@example.com", "auditor123", "Compliance Auditor", "AUDITOR"),
        ]

        created_users = {}
        for email, password, name, role in users_data:
            res = await session.execute(select(User).where(User.email == email))
            existing = res.scalars().first()
            if not existing:
                u = User(
                    email=email,
                    hashed_password=get_password_hash(password),
                    full_name=name,
                    role=role
                )
                session.add(u)
                await session.flush()
                created_users[role] = u
            else:
                created_users[role] = existing

        # 2. Seed Default Schema
        res_schema = await session.execute(select(CredentialSchemaModel).where(CredentialSchemaModel.sunbird_schema_id == "UniversityDegreeSchema_v1"))
        schema_obj = res_schema.scalars().first()
        if not schema_obj:
            schema_obj = CredentialSchemaModel(
                schema_name="University Degree Certificate",
                sunbird_schema_id="UniversityDegreeSchema_v1",
                version="1.0.0",
                json_schema={
                    "type": "object",
                    "properties": {
                        "degree_title": {"type": "string"},
                        "major": {"type": "string"},
                        "graduation_year": {"type": "integer"},
                        "gpa": {"type": "number"}
                    }
                }
            )
            session.add(schema_obj)
            await session.flush()

        # 3. Seed Sample Credentials
        res_cred = await session.execute(select(CredentialRecord))
        if not res_cred.scalars().first():
            c1 = CredentialRecord(
                sunbird_osid="osid-sb-demo-degree-001",
                schema_id=schema_obj.id,
                recipient_identifier="alice.johnson@university.edu",
                recipient_name="Alice Johnson",
                status="ISSUED",
                issued_by=created_users["ISSUER"].id,
                credential_payload={
                    "@context": ["https://www.w3.org/2018/credentials/v1"],
                    "id": "urn:uuid:degree-001",
                    "type": ["VerifiableCredential", "University Degree Certificate"],
                    "issuer": "did:sunbirdrc:university-issuer-01",
                    "credentialSubject": {
                        "recipient_name": "Alice Johnson",
                        "degree_title": "Bachelor of Science",
                        "major": "Computer Science",
                        "graduation_year": 2024,
                        "gpa": 3.85
                    },
                    "proof": {
                        "type": "Ed25519Signature2020",
                        "jws": "eyJhbGciOi...valid_signature_token"
                    }
                }
            )

            c2 = CredentialRecord(
                sunbird_osid="osid-sb-demo-badge-002",
                schema_id=schema_obj.id,
                recipient_identifier="bob.smith@techcorp.com",
                recipient_name="Bob Smith",
                status="ISSUED",
                issued_by=created_users["ISSUER"].id,
                credential_payload={
                    "@context": ["https://www.w3.org/2018/credentials/v1"],
                    "id": "urn:uuid:badge-002",
                    "type": ["VerifiableCredential", "AI & Machine Learning Specialist"],
                    "issuer": "did:sunbirdrc:enterprise-issuer-001",
                    "credentialSubject": {
                        "recipient_name": "Bob Smith",
                        "skill": "LangChain & FastAPI Architecture",
                        "experience_years": 4
                    },
                    "proof": {
                        "type": "Ed25519Signature2020",
                        "jws": "eyJhbGciOi...valid_signature_token_2"
                    }
                }
            )
            c3 = CredentialRecord(
                sunbird_osid="osid-sb-demo-employee-003",
                schema_id=schema_obj.id,
                recipient_identifier="employee@example.com",
                recipient_name="Alice Johnson",
                status="ISSUED",
                issued_by=created_users["ISSUER"].id,
                credential_payload={
                    "@context": ["https://www.w3.org/2018/credentials/v1"],
                    "id": "urn:uuid:employee-badge-003",
                    "type": ["VerifiableCredential", "Corporate Employee Credential"],
                    "issuer": "did:sunbirdrc:enterprise-issuer-001",
                    "credentialSubject": {
                        "recipient_name": "Alice Johnson",
                        "recipient_email": "employee@example.com",
                        "employee_id": "EMP-2026-9481",
                        "department": "Engineering & AI Systems",
                        "role_title": "Senior Solutions Engineer",
                        "employment_status": "Active Full-Time"
                    },
                    "proof": {
                        "type": "Ed25519Signature2020",
                        "jws": "eyJhbGciOi...valid_signature_token_employee"
                    }
                }
            )
            session.add_all([c1, c2, c3])

        # 4. Seed Audit Logs
        res_audit = await session.execute(select(AuditLog))
        if not res_audit.scalars().first():
            a1 = AuditLog(
                user_id=created_users["ADMIN"].id,
                user_email=created_users["ADMIN"].email,
                action="SYSTEM_INITIALIZATION",
                resource_type="SYSTEM",
                details={"message": "System database initialized with RBAC roles and default schemas."}
            )
            a2 = AuditLog(
                user_id=created_users["ISSUER"].id,
                user_email=created_users["ISSUER"].email,
                action="ISSUE_CREDENTIAL",
                resource_type="CREDENTIAL",
                details={"osid": "osid-sb-demo-degree-001", "recipient": "alice.johnson@university.edu"}
            )
            session.add_all([a1, a2])

        await session.commit()
        print("Database seed complete successfully!")

if __name__ == "__main__":
    asyncio.run(seed_database())
