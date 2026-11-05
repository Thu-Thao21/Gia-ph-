"""Module Test C03: Genealogy Controller & Model.

Kiểm tra:
- Khởi tạo thực thể Person và Relationship
- Phân loại quan hệ phả hệ (Cha mẹ - con cái, Vợ chồng)
- Phân loại con ruột (BIOLOGICAL), con nuôi (ADOPTIVE)
- Thuật toán làm sạch tên tìm kiếm (clean_name_query)
"""

from __future__ import annotations

import uuid
from datetime import date
import pytest
from app.models.genealogy.entities import Person, Relationship
from app.services.ai.genealogy_tools import clean_name_query


def test_clean_name_query():
    assert clean_name_query("Người có tên Dương Thảo Vy có bao nhiêu người con?") == "Dương Thảo Vy"
    assert clean_name_query("Cụ Dương Văn An là ai?") == "Dương Văn An"
    assert clean_name_query("Bác 'Nguyễn Văn A' thuộc đời thứ mấy?") == "Nguyễn Văn A"


def test_person_entity_instantiation():
    person_id = uuid.uuid4()
    family_id = uuid.uuid4()

    person = Person(
        id=person_id,
        family_id=family_id,
        full_name="Dương Quang Khởi",
        gender="MALE",
        generation=1,
        birth_date=date(1920, 1, 1),
        is_alive=False,
    )

    assert person.id == person_id
    assert person.generation == 1
    assert person.gender == "MALE"
    assert person.is_alive is False


def test_relationship_entity_types():
    parent_id = uuid.uuid4()
    child_id = uuid.uuid4()
    family_id = uuid.uuid4()

    rel = Relationship(
        family_id=family_id,
        from_member_id=parent_id,
        to_member_id=child_id,
        relationship_type="PARENT_CHILD",
        parent_type="BIOLOGICAL",
        status="ACTIVE",
    )

    assert rel.relationship_type == "PARENT_CHILD"
    assert rel.parent_type == "BIOLOGICAL"


def test_infer_gender_for_clan_leader():
    from app.services.genealogy.clan_leader_profile_service import infer_gender

    assert infer_gender("Dương Thị Thu Thảo") == "FEMALE"
    assert infer_gender("Võ Văn Thắng") == "MALE"
    assert infer_gender("Dương Lê Kỳ Duyên") == "FEMALE"
    assert infer_gender("Mai Phúc Hậu", given_gender="MALE") == "MALE"
    assert infer_gender("Người Đại Diện", given_gender="Nu") == "FEMALE"


