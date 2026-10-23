"""Service for Kinship Naming.
Determines deterministic Vietnamese kinship terms and forms of address
between two persons in the genealogy tree.
"""

from __future__ import annotations

from typing import Any, List, Optional


class KinshipService:
    @staticmethod
    def calculate_kinship(
        from_person: Any,
        to_person: Any,
        path: List[Any],
        edges: List[Any],
    ) -> dict[str, Any]:
        """Calculates kinship name, address title, and description between two persons.

        from_person: The person viewing / calling.
        to_person: The person being referred to.
        path: List of persons from start to target.
        edges: List of relationships linking the path.
        """
        if str(from_person.id) == str(to_person.id):
            return {
                "kinship_name": "Chính mình",
                "address_title": "Tôi",
                "description": "Hai đối tượng được chọn là cùng một người.",
            }

        target_gender = (getattr(to_person, "gender", None) or "unknown").lower()
        is_male = target_gender in ("male", "nam", "m")
        is_female = target_gender in ("female", "nu", "nữ", "f")

        gen_from = getattr(from_person, "generation", 1) or 1
        gen_to = getattr(to_person, "generation", 1) or 1
        delta_gen = gen_to - gen_from  # positive if to_person is lower generation (child/grandchild)

        # 1. Direct spouse check
        if len(path) == 2 and any(getattr(e, "relationship_type", "").upper() == "SPOUSE" for e in edges):
            if is_male:
                return {
                    "kinship_name": "Chồng",
                    "address_title": "Chồng (Mình xưng Vợ)",
                    "description": "Quan hệ vợ chồng hôn phối trực tiếp.",
                }
            return {
                "kinship_name": "Vợ",
                "address_title": "Vợ (Mình xưng Chồng)",
                "description": "Quan hệ vợ chồng hôn phối trực tiếp.",
            }

        # Check if direct ancestor or descendant
        # All edges must be PARENT_CHILD
        all_parent_child = all(
            getattr(e, "relationship_type", "").upper() == "PARENT_CHILD" for e in edges
        )

        if all_parent_child:
            # Check direction: from_person is ancestor of to_person
            is_descendant = True
            for i in range(len(path) - 1):
                p1, p2 = str(path[i].id), str(path[i + 1].id)
                # p1 should be parent of p2
                if not any(
                    str(getattr(e, "from_member_id", "")) == p1
                    and str(getattr(e, "to_member_id", "")) == p2
                    for e in edges
                ):
                    is_descendant = False
                    break

            if is_descendant:
                depth = len(path) - 1
                if depth == 1:
                    title = "Con trai" if is_male else ("Con gái" if is_female else "Con")
                    address = f"{title} (Tôi xưng Cha/Mẹ)"
                elif depth == 2:
                    title = "Cháu trai" if is_male else ("Cháu gái" if is_female else "Cháu")
                    address = f"{title} (Tôi xưng Ông/Bà)"
                elif depth == 3:
                    title = "Chắt trai" if is_male else ("Chắt gái" if is_female else "Chắt")
                    address = f"{title} (Tôi xưng Cụ)"
                elif depth == 4:
                    title = "Chút"
                    address = "Chút (Tôi xưng Kỵ)"
                else:
                    title = f"Hậu duệ đời thứ {depth}"
                    address = f"Hậu duệ (Tôi xưng Tổ tiên)"
                return {
                    "kinship_name": title,
                    "address_title": address,
                    "description": f"Quan hệ trực hệ hậu duệ cách {depth} thế hệ.",
                }

            # Check direction: to_person is ancestor of from_person
            is_ancestor = True
            for i in range(len(path) - 1):
                p1, p2 = str(path[i].id), str(path[i + 1].id)
                # p2 should be parent of p1 (going backwards up)
                if not any(
                    str(getattr(e, "from_member_id", "")) == p2
                    and str(getattr(e, "to_member_id", "")) == p1
                    for e in edges
                ):
                    is_ancestor = False
                    break

            if is_ancestor:
                depth = len(path) - 1
                if depth == 1:
                    title = "Cha" if is_male else ("Mẹ" if is_female else "Cha/Mẹ")
                    address = f"{title} (Tôi xưng Con)"
                elif depth == 2:
                    title = "Ông" if is_male else ("Bà" if is_female else "Ông/Bà")
                    address = f"{title} (Tôi xưng Cháu)"
                elif depth == 3:
                    title = "Cụ Ông" if is_male else ("Cụ Bà" if is_female else "Cụ")
                    address = f"{title} (Tôi xưng Chắt)"
                elif depth == 4:
                    title = "Kỵ Ông" if is_male else ("Kỵ Bà" if is_female else "Kỵ")
                    address = f"{title} (Tôi xưng Chút)"
                else:
                    title = f"Tổ tiên ({depth} đời trước)"
                    address = f"Tổ tiên (Tôi xưng Con cháu)"
                return {
                    "kinship_name": title,
                    "address_title": address,
                    "description": f"Quan hệ trực hệ tổ tiên cách {depth} thế hệ.",
                }

        # Sibling check: Path length 3 (Child -> Parent -> Sibling)
        if len(path) == 3 and delta_gen == 0:
            birth_from = getattr(from_person, "birth_date", None)
            birth_to = getattr(to_person, "birth_date", None)
            is_older = False
            has_birth_comparison = False
            if birth_from and birth_to:
                has_birth_comparison = True
                is_older = birth_to < birth_from

            from_gender = (getattr(from_person, "gender", None) or "").lower()
            from_is_male = from_gender in ("male", "nam", "m")

            if has_birth_comparison:
                if is_older:
                    title = "Anh ruột" if is_male else ("Chị ruột" if is_female else "Anh/Chị ruột")
                    address = f"{title} (Tôi xưng Em)"
                    reciprocal_kinship = "Em trai ruột" if from_is_male else "Em gái ruột"
                    reciprocal_address = f"{reciprocal_kinship} (Tôi xưng { 'Anh' if is_male else 'Chị' })"
                else:
                    title = "Em trai ruột" if is_male else ("Em gái ruột" if is_female else "Em ruột")
                    address = f"{title} (Tôi xưng {'Anh' if from_is_male else 'Chị'})"
                    reciprocal_kinship = "Anh ruột" if from_is_male else "Chị ruột"
                    reciprocal_address = f"{reciprocal_kinship} (Tôi xưng Em)"
            else:
                if is_male:
                    title = "Anh/Em trai ruột"
                    address = "Anh/Em trai ruột (Tôi xưng Em/Anh)"
                elif is_female:
                    title = "Chị/Em gái ruột"
                    address = "Chị/Em gái ruột (Tôi xưng Em/Chị)"
                else:
                    title = "Anh/Chị/Em ruột"
                    address = "Anh/Chị/Em ruột"
                reciprocal_kinship = "Anh/Chị/Em ruột"
                reciprocal_address = "Anh/Chị/Em ruột"

            return {
                "kinship_name": title,
                "address_title": address,
                "reciprocal_kinship": reciprocal_kinship,
                "reciprocal_address": reciprocal_address,
                "description": "Quan hệ anh chị em ruột cùng huyết thống.",
            }

        # Uncle / Aunt check: delta_gen == -1 (to_person is 1 generation older than from_person)
        if delta_gen == -1:
            # Check if through Father or Mother
            parent_in_path = path[1] if len(path) > 1 else None
            parent_gender = (getattr(parent_in_path, "gender", "") or "").lower() if parent_in_path else ""
            is_through_father = parent_gender in ("male", "nam", "m")
            is_through_mother = parent_gender in ("female", "nu", "nữ", "f")

            if is_through_father:
                parent_birth = getattr(parent_in_path, "birth_date", None)
                target_birth = getattr(to_person, "birth_date", None)
                if is_male:
                    if parent_birth and target_birth:
                        title = "Bác trai" if target_birth < parent_birth else "Chú"
                    else:
                        title = "Bác trai / Chú"
                    address = f"{title} (Tôi xưng Cháu)"
                elif is_female:
                    title = "Cô / Bác gái"
                    address = f"{title} (Tôi xưng Cháu)"
                else:
                    title = "Bác / Chú / Cô"
                    address = f"{title} (Tôi xưng Cháu)"
            elif is_through_mother:
                if is_male:
                    title = "Cậu / Bác trai"
                    address = f"{title} (Tôi xưng Cháu)"
                elif is_female:
                    title = "Dì / Bác gái"
                    address = f"{title} (Tôi xưng Cháu)"
                else:
                    title = "Cậu / Dì"
                    address = f"{title} (Tôi xưng Cháu)"
            else:
                if is_male:
                    title = "Bác / Chú / Cậu"
                    address = "Bác / Chú / Cậu (Tôi xưng Cháu)"
                elif is_female:
                    title = "Bác / Cô / Dì"
                    address = "Bác / Cô / Dì (Tôi xưng Cháu)"
                else:
                    title = "Bác / Chú / Cô / Cậu / Dì"
                    address = "Bác / Chú / Cô (Tôi xưng Cháu)"

            from_gender = (getattr(from_person, "gender", None) or "").lower()
            ch_title = "Cháu trai" if from_gender in ("male", "nam", "m") else "Cháu gái"
            return {
                "kinship_name": title,
                "address_title": address,
                "reciprocal_kinship": ch_title,
                "reciprocal_address": f"{ch_title} (Tôi xưng {title.split(' ')[0]})",
                "description": f"Quan hệ chú/bác/cô/dì/cậu bề trên ({len(path) - 1} bước kết nối).",
            }

        # Nephew / Niece check: delta_gen == 1 (to_person is 1 generation younger)
        if delta_gen == 1:
            title = "Cháu trai" if is_male else ("Cháu gái" if is_female else "Cháu")
            from_gender = (getattr(from_person, "gender", None) or "").lower()
            from_title = "Bác/Chú" if from_gender in ("male", "nam", "m") else "Cô/Dì/Bác"
            address = f"{title} (Tôi xưng {from_title})"
            return {
                "kinship_name": title,
                "address_title": address,
                "reciprocal_kinship": from_title,
                "reciprocal_address": f"{from_title} (Tôi xưng {title})",
                "description": f"Quan hệ cháu gọi bằng chú/bác/cô/dì/cậu ({len(path) - 1} bước kết nối).",
            }

        # Cousin check: delta_gen == 0
        if delta_gen == 0:
            birth_from = getattr(from_person, "birth_date", None)
            birth_to = getattr(to_person, "birth_date", None)
            from_gender = (getattr(from_person, "gender", None) or "").lower()
            from_is_male = from_gender in ("male", "nam", "m")

            if birth_from and birth_to:
                if birth_to < birth_from:
                    title = "Anh họ" if is_male else ("Chị họ" if is_female else "Anh/Chị họ")
                    address = f"{title} (Tôi xưng Em)"
                    rec_k = "Em họ"
                    rec_a = f"Em họ (Tôi xưng {'Anh' if is_male else 'Chị'})"
                else:
                    title = "Em trai họ" if is_male else ("Em gái họ" if is_female else "Em họ")
                    address = f"{title} (Tôi xưng {'Anh' if from_is_male else 'Chị'})"
                    rec_k = "Anh họ" if from_is_male else "Chị họ"
                    rec_a = f"{rec_k} (Tôi xưng Em)"
            else:
                title = "Anh/Em họ" if is_male else ("Chị/Em họ" if is_female else "Anh/Chị/Em họ")
                address = f"{title} đồng thế hệ"
                rec_k = "Anh/Chị/Em họ"
                rec_a = "Anh/Chị/Em họ"

            return {
                "kinship_name": title,
                "address_title": address,
                "reciprocal_kinship": rec_k,
                "reciprocal_address": rec_a,
                "description": f"Quan hệ anh em họ cùng thế hệ ({len(path) - 1} bước kết nối).",
            }

        # Grand-uncle or Grand-aunt / Grand-nephew
        if delta_gen == -2:
            title = "Ông Bác / Ông Chú / Bà Cô" if is_male else "Bà Bác / Bà Dì / Bà Cô"
            return {
                "kinship_name": title,
                "address_title": f"{title} (Tôi xưng Cháu)",
                "reciprocal_kinship": "Cháu họ",
                "reciprocal_address": "Cháu họ (Tôi xưng Ông/Bà)",
                "description": f"Bề trên cách 2 thế hệ ({len(path) - 1} bước kết nối).",
            }

        if delta_gen == 2:
            title = "Cháu họ đời thứ hai"
            return {
                "kinship_name": title,
                "address_title": "Cháu họ (Tôi xưng Ông/Bà)",
                "reciprocal_kinship": "Ông/Bà họ",
                "reciprocal_address": "Ông/Bà họ (Tôi xưng Cháu)",
                "description": f"Hậu duệ cách 2 thế hệ ({len(path) - 1} bước kết nối).",
            }

        # General distant relative
        if delta_gen < 0:
            title = f"Bề trên (cách {abs(delta_gen)} thế hệ)"
            address = f"Cụ/Tổ tiên họ hàng (Tôi xưng Hậu duệ)"
            rec_k = f"Hậu duệ (cách {abs(delta_gen)} thế hệ)"
            rec_a = "Hậu duệ (Tôi xưng Bề trên)"
        else:
            title = f"Hậu duệ (cách {delta_gen} thế hệ)"
            address = f"Hậu duệ (Tôi xưng Bề trên)"
            rec_k = f"Bề trên (cách {delta_gen} thế hệ)"
            rec_a = "Cụ/Tổ tiên họ hàng (Tôi xưng Hậu duệ)"

        return {
            "kinship_name": title,
            "address_title": address,
            "reciprocal_kinship": rec_k,
            "reciprocal_address": rec_a,
            "description": f"Quan hệ họ hàng qua {len(path) - 1} bước trung gian.",
        }
