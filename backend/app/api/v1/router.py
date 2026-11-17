from fastapi import APIRouter
from app.api.v1.endpoints import auth, credentials, ai, analytics, compliance

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & RBAC"])
api_router.include_router(credentials.router, prefix="/credentials", tags=["Sunbird RC Credentials"])
api_router.include_router(ai.router, prefix="/ai", tags=["AI Engine"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["Analytics & Dashboard"])
api_router.include_router(compliance.router, prefix="/compliance", tags=["Compliance & Audit"])
