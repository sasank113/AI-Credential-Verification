import asyncio
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, WebSocket, WebSocketDisconnect, Body, Form


from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from jose import jwt, JWTError

from app.core.config import settings
from app.core.database import get_db, AsyncSessionLocal
from app.core.security import (
    verify_password, get_password_hash, create_access_token, create_refresh_token, get_current_user, PermissionChecker
)
from app.models.user import User, UserSession
from app.schemas.auth import Token, UserResponse, UserCreate, RefreshTokenRequest, SessionResponse, RoleInfo
from app.services.audit_service import log_audit_event

router = APIRouter()

@router.post("/register", response_model=UserResponse)
async def register(
    user_in: UserCreate,
    db: AsyncSession = Depends(get_db)
):
    res = await db.execute(select(User).where(User.email == user_in.email))
    if res.scalars().first():
        raise HTTPException(status_code=400, detail="User email already registered")

    user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role.upper()
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    await log_audit_event(
        db, action="USER_REGISTER", resource_type="USER",
        user_id=user.id, user_email=user.email, details={"role": user.role}
    )
    return user

@router.post("/login", response_model=Token)
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == form_data.username))
    user = result.scalars().first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email ID or password. Please check your credentials or register a new account.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account is deactivated. Please contact an administrator."
        )



    session_id = f"sess-{uuid.uuid4().hex[:12]}"
    refresh_token_str = create_refresh_token(subject=user.id, session_id=session_id)
    access_token_str = create_access_token(subject=user.id, role=user.role, session_id=session_id)

    client_host = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent", "Browser Agent")

    session_record = UserSession(
        id=session_id,
        user_id=user.id,
        refresh_token=refresh_token_str,
        ip_address=client_host,
        user_agent=user_agent,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    db.add(session_record)
    await db.commit()

    await log_audit_event(
        db, action="USER_LOGIN", resource_type="USER",
        user_id=user.id, user_email=user.email, details={"role": user.role, "session_id": session_id}
    )

    return Token(
        access_token=access_token_str,
        refresh_token=refresh_token_str,
        session_id=session_id,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/refresh", response_model=Token)
async def refresh_token(
    req: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(req.refresh_token, settings.SECRET_KEY, algorithms=["HS256"])
        if payload.get("type") != "refresh":
            raise credentials_exception
        user_id = payload.get("sub")
        session_id = payload.get("session_id")
    except JWTError:
        raise credentials_exception

    result = await db.execute(
        select(UserSession).where(UserSession.refresh_token == req.refresh_token, UserSession.is_active == True)
    )
    session_obj = result.scalars().first()
    if not session_obj or session_obj.expires_at < datetime.utcnow():
        raise credentials_exception

    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise credentials_exception

    # Rotate Refresh Token in PostgreSQL DB
    new_session_id = f"sess-{uuid.uuid4().hex[:12]}"
    new_refresh_token = create_refresh_token(subject=user.id, session_id=new_session_id)
    new_access_token = create_access_token(subject=user.id, role=user.role, session_id=new_session_id)

    session_obj.is_active = False # Deactivate previous session token
    new_session = UserSession(
        id=new_session_id,
        user_id=user.id,
        refresh_token=new_refresh_token,
        ip_address=session_obj.ip_address,
        user_agent=session_obj.user_agent,
        expires_at=datetime.utcnow() + timedelta(days=7)
    )
    db.add(new_session)
    await db.commit()

    return Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        session_id=new_session_id,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

@router.post("/logout")
async def logout(
    req: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    await db.execute(
        update(UserSession)
        .where(UserSession.refresh_token == req.refresh_token)
        .values(is_active=False)
    )
    await db.commit()
    return {"message": "Session logged out and invalidated successfully"}

@router.get("/sessions", response_model=List[SessionResponse])
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(UserSession)
        .where(UserSession.user_id == current_user.id, UserSession.is_active == True)
        .order_by(UserSession.created_at.desc())
    )
    return result.scalars().all()

@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = await db.execute(
        select(UserSession).where(UserSession.id == session_id)
    )
    sess = result.scalars().first()
    if not sess or (sess.user_id != current_user.id and current_user.role != "ADMIN"):
        raise HTTPException(status_code=404, detail="Session not found or unauthorized")

    sess.is_active = False
    await db.commit()
    return {"message": f"Session {session_id} has been revoked"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(PermissionChecker(["ADMIN"]))
):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()

@router.get("/roles", response_model=List[RoleInfo])
async def list_roles(current_user: User = Depends(get_current_user)):
    return [
        RoleInfo(
            role="ADMIN",
            label="Administrator",
            description="Full access to platform administration, user management, and all system operations",
            permissions=["users:read", "users:write", "schemas:write", "credentials:issue", "credentials:verify", "credentials:revoke", "compliance:read", "compliance:export"]
        ),
        RoleInfo(
            role="ISSUER",
            label="Credential Issuer",
            description="Authorized to generate and issue verifiable credentials and execute batch CSV operations",
            permissions=["credentials:issue", "credentials:revoke", "credentials:verify", "schemas:read"]
        ),
        RoleInfo(
            role="VERIFIER",
            label="Credential Verifier",
            description="Authorized to verify cryptographic proofs, check registry status, and inspect AI fraud flags",
            permissions=["credentials:verify", "schemas:read"]
        ),
        RoleInfo(
            role="EMPLOYEE",
            label="Employee",
            description="Access to personal verifiable credentials, digital identity profile, and session management",
            permissions=["credentials:read_own", "profile:read"]
        ),
        RoleInfo(
            role="AUDITOR",
            label="Compliance Auditor",
            description="Authorized to view immutable audit event trails and export regulatory compliance reports",
            permissions=["compliance:read", "compliance:export", "credentials:verify"]
        )
    ]

# Realtime Authentication Session Monitor WebSocket
@router.websocket("/ws/session")
async def websocket_auth_session(websocket: WebSocket, token: Optional[str] = None):
    await websocket.accept()
    if not token:
        await websocket.send_json({"event": "ERROR", "message": "Missing authentication token"})
        await websocket.close(code=4001)
        return

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        user_id = payload.get("sub")
        session_id = payload.get("session_id")
    except JWTError:
        await websocket.send_json({"event": "ERROR", "message": "Invalid JWT token signature"})
        await websocket.close(code=4002)
        return

    await websocket.send_json({
        "event": "CONNECTED",
        "user_id": user_id,
        "session_id": session_id,
        "message": "Realtime authentication monitor active"
    })

    try:
        while True:
            await asyncio.sleep(5)
            # Check database for session status
            async with AsyncSessionLocal() as db:
                if session_id:
                    res = await db.execute(select(UserSession).where(UserSession.id == session_id))
                    sess = res.scalars().first()
                    if sess and not sess.is_active:
                        await websocket.send_json({
                            "event": "REVOKED",
                            "message": "Your active session was remotely revoked."
                        })
                        await websocket.close(code=4003)
                        break
                    elif sess:
                        sess.last_heartbeat = datetime.utcnow()
                        await db.commit()

            await websocket.send_json({
                "event": "HEARTBEAT",
                "timestamp": datetime.utcnow().isoformat() + "Z",
                "status": "AUTHENTICATED"
            })
    except WebSocketDisconnect:
        pass
    except Exception as ex:
        print(f"WebSocket session error: {ex}")

