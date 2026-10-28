"""Table email_otp_challenges (migration 0007, Mốc M5-1). Hashes only: see app.core.utils.otp_service."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_access.entities import EmailOtpChallenge


class EmailOtpRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def recent(self, purpose: str, email_hash: str, since: datetime) -> list[EmailOtpChallenge]:
        """The challenges created since `since`, newest first (a handful: sends are capped)."""
        stmt = (
            select(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.purpose == purpose,
                EmailOtpChallenge.email_hash == email_hash,
                EmailOtpChallenge.created_at >= since,
            )
            .order_by(EmailOtpChallenge.created_at.desc())
        )
        return list((await self._session.execute(stmt)).scalars().all())

    async def invalidate_open(self, purpose: str, email_hash: str, now: datetime) -> None:
        """End every code still open for this e-mail (a new one replaces them)."""
        await self._session.execute(
            update(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.purpose == purpose,
                EmailOtpChallenge.email_hash == email_hash,
                EmailOtpChallenge.verified_at.is_(None),
                EmailOtpChallenge.invalidated_at.is_(None),
            )
            .values(invalidated_at=now)
        )

    async def add(self, **values) -> EmailOtpChallenge:
        row = EmailOtpChallenge(**values)
        self._session.add(row)
        await self._session.flush()
        return row

    async def lock_open(self, purpose: str, email_hash: str, now: datetime) -> EmailOtpChallenge | None:
        """The open code of this e-mail, locked FOR UPDATE: two concurrent guesses are counted one
        after the other, and a right code is used up exactly once."""
        stmt = (
            select(EmailOtpChallenge)
            .where(
                EmailOtpChallenge.purpose == purpose,
                EmailOtpChallenge.email_hash == email_hash,
                EmailOtpChallenge.verified_at.is_(None),
                EmailOtpChallenge.invalidated_at.is_(None),
                EmailOtpChallenge.expires_at > now,
            )
            .order_by(EmailOtpChallenge.created_at.desc())
            .limit(1)
            .with_for_update()
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def invalidate(self, challenge_id: uuid.UUID, now: datetime) -> None:
        await self._session.execute(
            update(EmailOtpChallenge)
            .where(EmailOtpChallenge.challenge_id == challenge_id)
            .values(invalidated_at=now)
        )

    async def by_token_hash(self, token_hash: str) -> EmailOtpChallenge | None:
        """The challenge holding this token (unique), whatever its state: the caller compares the
        e-mail and purpose and decides (Mốc M3b: expired vs used vs not this address)."""
        stmt = select(EmailOtpChallenge).where(EmailOtpChallenge.token_hash == token_hash)
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def token_usable(self, purpose: str, email_hash: str, token_hash: str, now: datetime) -> bool:
        """A read (no claim): the token exists, for THIS e-mail and purpose, unused and unexpired."""
        stmt = select(EmailOtpChallenge.challenge_id).where(*self._token_filter(purpose, email_hash, token_hash, now))
        return (await self._session.execute(stmt)).first() is not None

    async def claim_token(self, purpose: str, email_hash: str, token_hash: str, now: datetime) -> bool:
        """Use the token up, atomically (UPDATE ... WHERE token_used_at IS NULL RETURNING): of two
        concurrent claims only one gets True. Part of the caller's transaction, not committed here."""
        stmt = (
            update(EmailOtpChallenge)
            .where(*self._token_filter(purpose, email_hash, token_hash, now))
            .values(token_used_at=now)
            .returning(EmailOtpChallenge.challenge_id)
        )
        return (await self._session.execute(stmt)).first() is not None

    @staticmethod
    def _token_filter(purpose: str, email_hash: str, token_hash: str, now: datetime):
        return (
            EmailOtpChallenge.token_hash == token_hash,
            EmailOtpChallenge.purpose == purpose,
            EmailOtpChallenge.email_hash == email_hash,
            EmailOtpChallenge.token_used_at.is_(None),
            EmailOtpChallenge.token_expires_at > now,
        )
