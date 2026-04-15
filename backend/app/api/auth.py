import uuid
from typing import Optional
from fastapi_users import FastAPIUsers
from fastapi_users.authentication import AuthenticationBackend, JWTStrategy, BearerTransport
from app.models.user import User
from app.schemas.user import UserRead, UserCreate, UserUpdate
from app.core.config import settings
from fastapi_users import BaseUserManager, UUIDIDMixin
from fastapi import Depends, Request
from app.models.user import get_user_db
import logging

bearer_transport = BearerTransport(tokenUrl="auth/jwt/login")

def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(
        secret=settings.JWT_PRIVATE_KEY,
        lifetime_seconds=604800,  # 7 days
        algorithm="RS256",
        public_key=settings.JWT_PUBLIC_KEY
    )

auth_backend = AuthenticationBackend(
    name="jwt",
    transport=bearer_transport,
    get_strategy=get_jwt_strategy,
)

class UserManager(UUIDIDMixin, BaseUserManager[User, uuid.UUID]):
    reset_password_token_secret = settings.JWT_PRIVATE_KEY
    verification_token_secret = settings.JWT_PRIVATE_KEY

    async def on_after_register(self, user: User, request: Optional[Request] = None):
        logging.info(f"User {user.id} has registered.")
        # Track signup event
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type="signup_complete",
                event_category="auth",
                user_id=user.id,
                user_role=user.role,
                payload={"name": user.name, "role": user.role},
                user_agent=request.headers.get("user-agent") if request else None,
                ip_address=request.client.host if request and request.client else None,
            )
        except Exception:
            pass  # Never break registration on analytics failure

    async def on_after_login(self, user: User, request: Optional[Request] = None, response=None):
        # Update last_login
        from datetime import datetime, timezone
        user.last_login = datetime.now(timezone.utc)
        await user.save()
        # Track login event
        try:
            from app.services.analytics import analytics_service
            await analytics_service.track_event(
                event_type="login_success",
                event_category="auth",
                user_id=user.id,
                user_role=user.role,
                payload={"method": "jwt"},
                user_agent=request.headers.get("user-agent") if request else None,
                ip_address=request.client.host if request and request.client else None,
            )
        except Exception:
            pass

async def get_user_manager(user_db=Depends(get_user_db)):
    yield UserManager(user_db)

fastapi_users = FastAPIUsers[User, uuid.UUID](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)

# Register Router
register_router = fastapi_users.get_register_router(UserRead, UserCreate)

# User Router
users_router = fastapi_users.get_users_router(UserRead, UserUpdate)

# Auth Router (Login)
auth_router = fastapi_users.get_auth_router(auth_backend)
