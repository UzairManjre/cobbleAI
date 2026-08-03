import pytest
import uuid
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi import HTTPException
from app.api.auth import require_role, get_user_from_token, get_jwt_strategy
from app.models.user import User
import jwt
from app.core.config import settings
from datetime import datetime, timedelta, timezone

@pytest.mark.asyncio
async def test_require_role_success():
    checker = require_role("professor")
    user = MagicMock()
    user.role = "professor"
    result = await checker(user=user)
    assert result == user

@pytest.mark.asyncio
async def test_require_role_bypass_attempt():
    checker = require_role("professor")
    user = MagicMock()
    user.role = "student"
    with pytest.raises(HTTPException) as exc:
        await checker(user=user)
    assert exc.value.status_code == 403
    assert "Only professors are allowed" in exc.value.detail

@pytest.mark.asyncio
async def test_get_user_from_token_missing():
    with pytest.raises(HTTPException) as exc:
        await get_user_from_token(token=None, user_manager=MagicMock())
    assert exc.value.status_code == 401
    assert "Missing token" in exc.value.detail

@pytest.mark.asyncio
async def test_get_user_from_token_invalid():
    # If strategy returns None (e.g. invalid signature or expired)
    with patch('app.api.auth.get_jwt_strategy') as mock_strategy_fn:
        mock_strategy = MagicMock()
        mock_strategy.read_token = AsyncMock(return_value=None)
        mock_strategy_fn.return_value = mock_strategy
        
        with pytest.raises(HTTPException) as exc:
            await get_user_from_token(token="invalid.token.here", user_manager=MagicMock())
        
        assert exc.value.status_code == 401
        assert "Invalid or inactive token" in exc.value.detail

@pytest.mark.asyncio
@patch('fastapi_users.authentication.strategy.jwt.jwt.decode')
async def test_jwt_strategy_invalid_signature(mock_decode):
    strategy = get_jwt_strategy()
    
    mock_decode.side_effect = jwt.InvalidSignatureError("Invalid signature")
    
    mock_user_manager = MagicMock()
    user = await strategy.read_token("wrong_token", mock_user_manager)
    assert user is None  # Should return None for invalid token

@pytest.mark.asyncio
@patch('fastapi_users.authentication.strategy.jwt.jwt.decode')
async def test_jwt_strategy_expired_token(mock_decode):
    strategy = get_jwt_strategy()
    
    mock_decode.side_effect = jwt.ExpiredSignatureError("Signature has expired")
    
    mock_user_manager = MagicMock()
    user = await strategy.read_token("expired_token", mock_user_manager)
    assert user is None

def test_jwt_strategy_settings():
    strategy = get_jwt_strategy()
    assert strategy.lifetime_seconds == 604800
    assert strategy.algorithm == "RS256"

@pytest.mark.asyncio
@patch('app.services.analytics.AnalyticsService.track_event')
async def test_on_after_register_atomicity_failure(mock_track_event):
    from app.api.auth import UserManager
    
    mock_user_db = MagicMock()
    mock_user_db.delete = AsyncMock()
    
    manager = UserManager(mock_user_db)
    user = MagicMock()
    user.id = uuid.uuid4()
    user.name = "Test"
    user.role = "student"
    
    mock_track_event.side_effect = Exception("Simulated analytics failure")
    
    with pytest.raises(HTTPException) as exc:
        await manager.on_after_register(user=user)
        
    assert exc.value.status_code == 400
    assert "Registration failed during post-processing" in exc.value.detail
    
    # Assert the user document is deleted, ensuring no orphaned user!
    mock_user_db.delete.assert_called_once_with(user)

@pytest.mark.asyncio
@patch('app.services.analytics.AnalyticsService.track_event')
async def test_on_after_login_analytics_failure_non_blocking(mock_track_event):
    from app.api.auth import UserManager
    
    mock_user_db = MagicMock()
    manager = UserManager(mock_user_db)
    
    user = MagicMock()
    user.id = uuid.uuid4()
    user.role = "student"
    user.save = AsyncMock()
    
    mock_track_event.side_effect = Exception("Simulated analytics failure")
    
    # Should complete without raising any exception (no HTTP 500)
    await manager.on_after_login(user=user)
    
    # Assert DB update was still saved
    user.save.assert_called_once()
