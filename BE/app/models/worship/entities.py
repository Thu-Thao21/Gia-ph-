"""Worship Space Domain Models (M05).

Defines entities for altars, worship records, memorials, rituals, burial sites, and clan locations.
"""

from __future__ import annotations

from app.models.genealogy.entities import ClanLocation, PersonBurial, LocationProposal

__all__ = [
    "ClanLocation",
    "PersonBurial",
    "LocationProposal",
]

