"""Tests for Sprint 3: ERGO-CENTRIC Visualization & Search.

Covers:
- Focus View (Ego-centric BFS subgraph)
- Relationship Path (BFS Shortest Path with Lineage Preference)
- Vietnamese Kinship Naming (Comprehensive Rules)
- Tree Filtering by Branch and Generation
- Privacy Scoping (Public tree view)
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.genealogy.focus_view_service import FocusViewService
from app.services.genealogy.kinship_service import KinshipService
from app.services.genealogy.relationship_path_service import RelationshipPathService


def test_focus_view_bfs_depth_1():
    """Focus view 3-tier ego-centric rules:
    - Level -1: Parents of Ego
    - Level  0: Ego & Spouse
    - Level +1: Children of Ego
    """
    ego_id = "p_ego"
    relationships = [
        {"id": "r1", "from_member_id": "p_parent", "to_member_id": ego_id, "relationship_type": "PARENT_CHILD"},
        {"id": "r2", "from_member_id": ego_id, "to_member_id": "p_child", "relationship_type": "PARENT_CHILD"},
        {"id": "r3", "from_member_id": ego_id, "to_member_id": "p_spouse", "relationship_type": "SPOUSE"},
        # Grandchild (child of child) - should NOT be included
        {"id": "r4", "from_member_id": "p_child", "to_member_id": "p_grandchild", "relationship_type": "PARENT_CHILD"},
    ]

    res = FocusViewService.extract_focus_subgraph(ego_id, relationships, max_depth=1)
    node_depths = res["node_depths"]
    node_roles = res.get("node_roles", {})
    edges = res["edges"]

    assert ego_id in node_depths
    assert node_depths[ego_id] == 0
    assert node_roles[ego_id] == "ego"

    assert node_depths["p_parent"] == -1
    assert node_roles["p_parent"] == "parent"

    assert node_depths["p_spouse"] == 0
    assert node_roles["p_spouse"] == "spouse"

    assert node_depths["p_child"] == 1
    assert node_roles["p_child"] == "child"

    assert "p_grandchild" not in node_depths  # Grandchild must NOT be included

    edge_ids = {e["id"] for e in edges}
    assert edge_ids == {"r1", "r2", "r3"}


def test_focus_view_strict_3_tier_no_spillover():
    """Strictly prevents expanding to grandparents, siblings, or parents of spouse."""
    ego_id = "p_ego"
    relationships = [
        # Parents
        {"id": "r_father", "from_member_id": "p_father", "to_member_id": ego_id, "relationship_type": "PARENT_CHILD"},
        {"id": "r_mother", "from_member_id": "p_mother", "to_member_id": ego_id, "relationship_type": "PARENT_CHILD"},
        {"id": "r_parents_spouse", "from_member_id": "p_father", "to_member_id": "p_mother", "relationship_type": "SPOUSE"},

        # Grandparent (Father's father) - MUST BE EXCLUDED
        {"id": "r_gp", "from_member_id": "p_grandparent", "to_member_id": "p_father", "relationship_type": "PARENT_CHILD"},

        # Sibling (Child of father) - MUST BE EXCLUDED
        {"id": "r_sib", "from_member_id": "p_father", "to_member_id": "p_sibling", "relationship_type": "PARENT_CHILD"},

        # Spouse
        {"id": "r_sp", "from_member_id": ego_id, "to_member_id": "p_spouse", "relationship_type": "SPOUSE"},

        # Spouse's parent - MUST BE EXCLUDED
        {"id": "r_sp_parent", "from_member_id": "p_spouse_father", "to_member_id": "p_spouse", "relationship_type": "PARENT_CHILD"},

        # Children
        {"id": "r_ch", "from_member_id": ego_id, "to_member_id": "p_child", "relationship_type": "PARENT_CHILD"},
        {"id": "r_ch_sp", "from_member_id": "p_spouse", "to_member_id": "p_child", "relationship_type": "PARENT_CHILD"},

        # Grandchild - MUST BE EXCLUDED
        {"id": "r_gc", "from_member_id": "p_child", "to_member_id": "p_grandchild", "relationship_type": "PARENT_CHILD"},
    ]

    res = FocusViewService.extract_focus_subgraph(ego_id, relationships)
    node_depths = res["node_depths"]
    edges = res["edges"]

    # Allowed 3-tier members
    assert node_depths[ego_id] == 0
    assert node_depths["p_father"] == -1
    assert node_depths["p_mother"] == -1
    assert node_depths["p_spouse"] == 0
    assert node_depths["p_child"] == 1

    # FORBIDDEN members: MUST NOT BE IN SUBGRAPH
    assert "p_grandparent" not in node_depths
    assert "p_sibling" not in node_depths
    assert "p_spouse_father" not in node_depths
    assert "p_grandchild" not in node_depths

    edge_ids = {e["id"] for e in edges}
    assert edge_ids == {"r_father", "r_mother", "r_parents_spouse", "r_sp", "r_ch", "r_ch_sp"}


def test_relationship_path_direct_parent_child():
    """Finds path between parent and child."""
    relationships = [
        SimpleNamespace(id="r1", from_member_id="p1", to_member_id="p2", relationship_type="PARENT_CHILD"),
        SimpleNamespace(id="r2", from_member_id="p2", to_member_id="p3", relationship_type="PARENT_CHILD"),
    ]

    path_nodes, path_edges = RelationshipPathService.find_path("p1", "p3", relationships)
    assert path_nodes == ["p1", "p2", "p3"]
    assert len(path_edges) == 2


def test_relationship_path_same_person():
    """Path between the same person returns single node and 0 edges."""
    path_nodes, path_edges = RelationshipPathService.find_path("p1", "p1", [])
    assert path_nodes == ["p1"]
    assert path_edges == []


def test_relationship_path_not_found():
    """Returns None when no path exists in disconnected graph."""
    relationships = [
        SimpleNamespace(id="r1", from_member_id="p1", to_member_id="p2", relationship_type="PARENT_CHILD"),
        SimpleNamespace(id="r2", from_member_id="p3", to_member_id="p4", relationship_type="PARENT_CHILD"),
    ]

    res = RelationshipPathService.find_path("p1", "p4", relationships)
    assert res is None


def test_kinship_naming_spouse():
    """Tests Vietnamese kinship naming for spouses."""
    husband = SimpleNamespace(id="p1", gender="male", generation=2)
    wife = SimpleNamespace(id="p2", gender="female", generation=2)
    edges = [SimpleNamespace(relationship_type="SPOUSE", from_member_id="p1", to_member_id="p2")]

    # Husband views Wife
    res_wife = KinshipService.calculate_kinship(from_person=husband, to_person=wife, path=[husband, wife], edges=edges)
    assert res_wife["kinship_name"] == "Vợ"

    # Wife views Husband
    res_husb = KinshipService.calculate_kinship(from_person=wife, to_person=husband, path=[wife, husband], edges=edges)
    assert res_husb["kinship_name"] == "Chồng"


def test_kinship_naming_parent_child():
    """Tests direct ancestor/descendant naming."""
    father = SimpleNamespace(id="p1", gender="male", generation=1)
    son = SimpleNamespace(id="p2", gender="male", generation=2)
    edges = [SimpleNamespace(relationship_type="PARENT_CHILD", from_member_id="p1", to_member_id="p2")]

    # Son views Father
    res_father = KinshipService.calculate_kinship(from_person=son, to_person=father, path=[son, father], edges=edges)
    assert res_father["kinship_name"] == "Cha"

    # Father views Son
    res_son = KinshipService.calculate_kinship(from_person=father, to_person=son, path=[father, son], edges=edges)
    assert res_son["kinship_name"] == "Con trai"


def test_kinship_naming_grandparent_grandchild():
    """Tests 2-generation direct ancestor/descendant."""
    grandfather = SimpleNamespace(id="p1", gender="male", generation=1)
    father = SimpleNamespace(id="p2", gender="male", generation=2)
    granddaughter = SimpleNamespace(id="p3", gender="female", generation=3)

    edges = [
        SimpleNamespace(relationship_type="PARENT_CHILD", from_member_id="p1", to_member_id="p2"),
        SimpleNamespace(relationship_type="PARENT_CHILD", from_member_id="p2", to_member_id="p3"),
    ]

    # Granddaughter views Grandfather
    res_gf = KinshipService.calculate_kinship(
        from_person=granddaughter, to_person=grandfather, path=[granddaughter, father, grandfather], edges=edges
    )
    assert res_gf["kinship_name"] == "Ông"

    # Grandfather views Granddaughter
    res_gd = KinshipService.calculate_kinship(
        from_person=grandfather, to_person=granddaughter, path=[grandfather, father, granddaughter], edges=edges
    )
    assert res_gd["kinship_name"] == "Cháu gái"


def test_kinship_naming_siblings():
    """Tests sibling naming."""
    older_bro = SimpleNamespace(id="p1", gender="male", generation=2, birth_date="1990-01-01")
    younger_sis = SimpleNamespace(id="p2", gender="female", generation=2, birth_date="1995-05-05")
    parent = SimpleNamespace(id="p0", gender="male", generation=1)

    edges = [
        SimpleNamespace(relationship_type="PARENT_CHILD", from_member_id="p0", to_member_id="p1"),
        SimpleNamespace(relationship_type="PARENT_CHILD", from_member_id="p0", to_member_id="p2"),
    ]

    # Sister views Brother
    res = KinshipService.calculate_kinship(
        from_person=younger_sis, to_person=older_bro, path=[younger_sis, parent, older_bro], edges=edges
    )
    assert res["kinship_name"] == "Anh ruột"

    # Brother views Sister
    res2 = KinshipService.calculate_kinship(
        from_person=older_bro, to_person=younger_sis, path=[older_bro, parent, younger_sis], edges=edges
    )
    assert res2["kinship_name"] == "Em gái ruột"
