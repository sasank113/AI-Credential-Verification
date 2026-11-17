from datetime import datetime, timedelta
from typing import Optional, Union, Any, List
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db

import bcrypt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

class TokenPayload(BaseModel):
    sub: Optional[str] = None
    role: Optional[str] = None
    type: Optional[str] = "access"
    session_id: Optional[str] = None
    exp: Optional[int] = None

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def create_access_token(subject: Union[str, Any], role: str, session_id: Optional[str] = None, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "role": role,
        "type": "access",
        "session_id": session_id
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")
    return encoded_jwt

def create_refresh_token(subject: Union[str, Any], session_id: str, expires_delta: Optional[timedelta] = None) -> str:
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=7)  # 7 days refresh token lifecycle
    
    to_encode = {
        "exp": expire,
        "sub": str(subject),
        "type": "refresh",
        "session_id": session_id
    }
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm="HS256")
    return encoded_jwt


async def get_current_user(
    db: AsyncSession = Depends(get_db),
    token: str = Depends(oauth2_scheme)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id: str = payload.get("sub")
        role: str = payload.get("role")
        if user_id is None:
            raise credentials_exception
        token_data = TokenPayload(sub=user_id, role=role)
    except JWTError:
        raise credentials_exception

    from app.models.user import User
    result = await db.execute(select(User).where(User.id == token_data.sub))
    user = result.scalars().first()
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user

class PermissionChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, user = Depends(get_current_user)):
        # Normalise role to upper‑case for case‑insensitive comparison
        user_role = (user.role or "").upper()
        # Ensure the allowed_roles list is also compared in upper‑case
        allowed = [r.upper() for r in self.allowed_roles]
        if user_role not in allowed and user_role != "ADMIN":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Operation not permitted. Required role: {self.allowed_roles}"
            )
        return user
