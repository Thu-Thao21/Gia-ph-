"""Service for Ego-centric / Focus View (3 generations: -1, 0, +1).

Uses generation- and direction-constrained traversal:
- Đời trên (-1): Cha và mẹ của người được chọn (Ego)
- Đời trung tâm (0): Người được chọn (Ego) + Vợ/chồng (Spouse)
- Đời dưới (+1): Các con của Ego

Strictly prohibits expanding to grandparents (-2), grandchildren (+2),
spouse's parents, or external relatives.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Set, Tuple


class FocusViewService:
    @staticmethod
    def _extract_rel(rel: Any) -> Tuple[str, str, str, str]:
        """Extracts (from_id, to_id, rel_type, edge_id) from ORM or dict."""
        p1 = str(
            getattr(rel, "from_member_id", None)
            or (rel.get("from_member_id") if isinstance(rel, dict) else None)
            or (rel.get("person_1") if isinstance(rel, dict) else None)
            or ""
        )
        p2 = str(
            getattr(rel, "to_member_id", None)
            or (rel.get("to_member_id") if isinstance(rel, dict) else None)
            or (rel.get("person_2") if isinstance(rel, dict) else None)
            or ""
        )
        rtype = str(
            getattr(rel, "relationship_type", None)
            or (rel.get("relationship_type") if isinstance(rel, dict) else "")
        ).upper()
        edge_id = str(
            getattr(rel, "id", None)
            or (rel.get("id") if isinstance(rel, dict) else None)
            or f"{p1}_{p2}_{rtype}"
        )
        return p1, p2, rtype, edge_id

    @classmethod
    def extract_focus_subgraph(
        cls,
        ego_id: str,
        relationships: List[Any],
        max_depth: int = 1,
    ) -> Dict[str, Any]:
        """Extracts the 3-generation Ego-centric subgraph:

        Level -1: Parents (Father & Mother)
        Level  0: Ego & Spouse(s)
        Level +1: Children of Ego
        """
        ego_id = str(ego_id)

        # 1. Index relationships by direction and type
        parents_of_ego: Set[str] = set()
        spouses_of_ego: Set[str] = set()
        children_of_ego: Set[str] = set()

        for rel in relationships:
            p1, p2, rtype, _ = cls._extract_rel(rel)
            if not p1 or not p2:
                continue

            # Check Parents of Ego: (Parent -> Ego)
            if rtype == "PARENT_CHILD" and p2 == ego_id:
                parents_of_ego.add(p1)

            # Check Spouses of Ego: (Ego <-> Spouse)
            elif rtype == "SPOUSE":
                if p1 == ego_id and p2 != ego_id:
                    spouses_of_ego.add(p2)
                elif p2 == ego_id and p1 != ego_id:
                    spouses_of_ego.add(p1)

            # Check Children of Ego: (Ego -> Child)
            elif rtype == "PARENT_CHILD" and p1 == ego_id:
                children_of_ego.add(p2)

        # Also capture children registered under spouse if any
        if spouses_of_ego:
            for rel in relationships:
                p1, p2, rtype, _ = cls._extract_rel(rel)
                if rtype == "PARENT_CHILD" and p1 in spouses_of_ego and p2 in children_of_ego:
                    # Confirmed shared child
                    pass

        # 2. Build 3-generation node mappings with roles and depths
        # Level  0: Ego (depth: 0, role: 'ego')
        # Level  0: Spouse (depth: 0, role: 'spouse')
        # Level -1: Parents (depth: -1, role: 'parent')
        # Level +1: Children (depth: 1, role: 'child')
        node_depths: Dict[str, int] = {ego_id: 0}
        node_roles: Dict[str, str] = {ego_id: "ego"}

        for s_id in spouses_of_ego:
            node_depths[s_id] = 0
            node_roles[s_id] = "spouse"

        for p_id in parents_of_ego:
            node_depths[p_id] = -1
            node_roles[p_id] = "parent"

        for c_id in children_of_ego:
            node_depths[c_id] = 1
            node_roles[c_id] = "child"

        # 3. Collect only intra-subgraph edges
        subgraph_nodes = set(node_depths.keys())
        included_edges: List[Any] = []
        seen_edge_ids: Set[str] = set()

        for rel in relationships:
            p1, p2, rtype, edge_id = cls._extract_rel(rel)
            if not p1 or not p2:
                continue

            if p1 in subgraph_nodes and p2 in subgraph_nodes:
                # Disallow edges that bridge outside the 3-generation direct rules
                # e.g., if a relation connects parent to someone else, not allowed
                if edge_id not in seen_edge_ids:
                    seen_edge_ids.add(edge_id)
                    included_edges.append(rel)

        return {
            "node_depths": node_depths,
            "node_roles": node_roles,
            "edges": included_edges,
        }
