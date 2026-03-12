from __future__ import annotations

from datetime import datetime, timedelta, timezone

import jwt

from config import settings


def generate_powersync_token(user_id: str = "anonymous") -> dict[str, str]:
    """Generate a signed JWT for PowerSync client authentication."""
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=1)).timestamp()),
        # PowerSync-specific claims
        "parameters": {"user_id": user_id},
    }

    token = jwt.encode(payload, settings.powersync_secret, algorithm="HS256")
    return {
        "token": token,
        "powersync_url": settings.powersync_url,
    }
