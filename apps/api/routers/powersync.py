from __future__ import annotations

from fastapi import APIRouter, Query

from services.powersync import generate_powersync_token

router = APIRouter()


@router.get("/token")
async def get_powersync_token(user_id: str = Query(default="anonymous")) -> dict[str, str]:
    """Generate a short-lived JWT for PowerSync client authentication."""
    return generate_powersync_token(user_id=user_id)
