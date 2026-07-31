import pytest
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
