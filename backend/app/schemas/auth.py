from enum import Enum
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime

class UserRole(str, Enum):
    ADMIN = "ADMIN"
    ISSUER = "ISSUER"
    VERIFIER = "VERIFIER"
    EMPLOYEE = "EMPLOYEE"
    AUDITOR = "AUDITOR"

class UserBase(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    role: str

    @field_validator("full_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        clean = v.strip()
        if len(clean) < 2:
            raise ValueError("Full name must be at least 2 characters long")
        return clean

    @field_validator("role", mode="before")
    @classmethod
    def validate_role(cls, v: Any) -> str:
        if isinstance(v, str):
            v_upper = v.strip().upper()
            valid_roles = [r.value for r in UserRole]
            if v_upper not in valid_roles:
                raise ValueError(f"Invalid role '{v}'. Must be one of: {', '.join(valid_roles)}")
            return v_upper
        return v

class UserCreate(UserBase):
    password: str = Field(..., min_length=8, max_length=128, description="Password must be at least 8 characters long")

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if v.isspace():
            raise ValueError("Password cannot be blank or only whitespace")
        return v

class UserResponse(UserBase):
    id: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    session_id: Optional[str] = None
    user: UserResponse

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class SessionResponse(BaseModel):
    id: str
    user_id: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_heartbeat: datetime
    expires_at: datetime

    class Config:
        from_attributes = True

class RoleInfo(BaseModel):
    role: str
    label: str
    description: str
    permissions: List[str]


