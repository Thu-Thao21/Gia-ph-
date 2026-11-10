# -*- coding: utf-8 -*-
"""
Independent Test Dataset Generator for MFGMS-AI (Phase 7 Evaluation).
Generates an unbiased, isolated, multi-generational test dataset:
- 500+ simulated Person records (Họ Dương & Họ Mai, Gen 1-7)
- 200 labeled Duplicate Person candidate pairs (100 Pos, 100 Hard Neg)
- 80 labeled Missing Relationship cases (40 Pos, 40 Neg)
- 80 labeled Anomaly & Timeline cases (40 Pos, 40 Neg)
- 100 genealogical QA questions with ground truth answers
- 30 ancestor profiles for biography summarization & hallucination testing
- 12 Excel import test files (.xlsx) with 6 valid and 6 anomalous files

Random Seed: 20261103 (deterministic, isolated from Dev Set).
Zero emojis, strict UTF-8 handling.
"""

from __future__ import annotations

import json
import os
import random
import sys
from datetime import date
from typing import Any, Dict, List, Optional, Set, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import openpyxl

SEED = 20261103
rng = random.Random(SEED)

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_JSON_PATH = os.path.join(CURRENT_DIR, "independent_test_dataset.json")
EXCEL_DIR = os.path.join(CURRENT_DIR, "excel_test_files")
os.makedirs(EXCEL_DIR, exist_ok=True)

# -----------------------------------------------------------------------------
# Name pools distinct from Dev Set
# -----------------------------------------------------------------------------
DUONG_MALE_MIDDLES = ["Quang", "Đình", "Viết", "Hữu", "Công", "Bách", "Thiện", "Tuấn", "Tiến", "Bảo"]
DUONG_FEMALE_MIDDLES = ["Ngọc", "Bích", "Thanh", "Diệu", "Thùy", "Quỳnh", "Hồng", "Khánh", "Minh", "Phương"]
MAI_MALE_MIDDLES = ["Trọng", "Đắc", "Phước", "Hữu", "Cảnh", "Nhật", "Đăng", "Gia", "Tấn", "Bảo"]
MAI_FEMALE_MIDDLES = ["Phương", "Tố", "Thục", "Nhã", "Cẩm", "Tuyết", "Ái", "Huyền", "Kiều", "Yến"]

MALE_GIVENS = ["Nhật", "Khang", "Hùng", "Thắng", "Chính", "Khoa", "Nhân", "Kiệt", "Duy", "Lâm",
               "Huy", "Hải", "Tùng", "Sơn", "Vũ", "Toàn", "Quân", "Triết", "Thịnh", "Đạt",
               "Nghĩa", "Lộc", "An", "Trí", "Hoàng", "Bảo", "Dũng", "Tiến", "Việt", "Phong"]
FEMALE_GIVENS = ["Thảo", "Thủy", "Vân", "Linh", "Dung", "Như", "Chi", "Nga", "Ngân", "Loan",
                 "Oanh", "Uyên", "Quyên", "Trúc", "Tú", "Nhi", "Vân", "Trang", "Châu", "Hà",
                 "Trâm", "My", "Vy", "Ly", "Mai", "Cúc", "Lan", "Hương", "Hạnh", "Yến"]

DUONG_BRANCHES = ["Chi Giáp Họ Dương", "Chi Ất Họ Dương", "Chi Bính Họ Dương", "Chi Đinh Họ Dương"]
MAI_BRANCHES = ["Chi Tiền Mai", "Chi Hậu Mai", "Chi Đông Mai", "Chi Tây Mai"]


def generate_person_graph(clan_surname: str, branches: List[str], target_count: int, start_id: int) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """Generates a tree graph with realistic Vietnamese multi-generational data."""
    persons: List[Dict[str, Any]] = []
    relationships: List[Dict[str, Any]] = []
    
    # 1. Progenitor (Thủy tổ - Generation 1)
    base_year = 1820 if clan_surname == "Dương" else 1835
    progenitor_id = f"P_{start_id:04d}"
    progenitor_name = f"{clan_surname} Quang Khởi" if clan_surname == "Dương" else f"{clan_surname} Phước Điền"
    progenitor = {
        "id": progenitor_id,
        "clan": f"Họ {clan_surname}",
        "full_name": progenitor_name,
        "gender": "MALE",
        "generation": 1,
        "birth_year": base_year,
        "death_year": base_year + 74,
        "branch": branches[0],
        "is_alive": False,
        "father_id": None,
        "mother_id": None,
        "spouses": [],
        "children": [],
        "biography": f"Thủy tổ họ {clan_surname}, khai hoang lập nghiệp tại phủ Đoan Hùng, gây dựng nền móng dòng họ.",
    }
    persons.append(progenitor)
    current_id = start_id + 1

    gen_nodes: Dict[int, List[Dict[str, Any]]] = {1: [progenitor]}

    # Build generations 2 to 7
    for gen in range(2, 8):
        gen_nodes[gen] = []
        parent_generation = gen_nodes[gen - 1]
        
        for parent in parent_generation:
            if parent["gender"] != "MALE":
                continue
            
            # Create a spouse for this male parent
            spouse_id = f"P_{current_id:04d}"
            current_id += 1
            sp_surname = rng.choice(["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Vũ"])
            sp_mid = rng.choice(["Thị", "Thị Như", "Thị Ái", "Thị Hồng"])
            sp_given = rng.choice(FEMALE_GIVENS)
            spouse_birth = parent["birth_year"] + rng.randint(-3, 4)
            spouse_death = spouse_birth + rng.randint(55, 82) if (2026 - spouse_birth > 85) else None
            spouse = {
                "id": spouse_id,
                "clan": f"Họ {clan_surname}",
                "full_name": f"{sp_surname} {sp_mid} {sp_given}",
                "gender": "FEMALE",
                "generation": gen - 1,
                "birth_year": spouse_birth,
                "death_year": spouse_death,
                "branch": parent["branch"],
                "is_alive": (spouse_death is None),
                "father_id": None,
                "mother_id": None,
                "spouses": [parent["id"]],
                "children": [],
                "biography": f"Nội tướng dòng họ, tần tảo chăm lo gia đạo cùng chồng {parent['full_name']}.",
            }
            persons.append(spouse)
            parent["spouses"].append(spouse_id)
            
            # Marriage relationship
            relationships.append({
                "from_id": parent["id"],
                "to_id": spouse_id,
                "type": "SPOUSE",
                "evidence": "Ghi nhận trong gia phả"
            })

            # Determine number of children (2 to 4 children)
            num_children = rng.randint(2, 4)
            for ch_idx in range(num_children):
                if len(persons) >= target_count:
                    break
                
                ch_id = f"P_{current_id:04d}"
                current_id += 1
                ch_gender = "MALE" if (ch_idx == 0 or rng.random() < 0.55) else "FEMALE"
                if ch_gender == "MALE":
                    mid = rng.choice(DUONG_MALE_MIDDLES if clan_surname == "Dương" else MAI_MALE_MIDDLES)
                    giv = rng.choice(MALE_GIVENS)
                else:
                    mid = rng.choice(DUONG_FEMALE_MIDDLES if clan_surname == "Dương" else MAI_FEMALE_MIDDLES)
                    giv = rng.choice(FEMALE_GIVENS)
                
                ch_name = f"{clan_surname} {mid} {giv}"
                ch_birth = parent["birth_year"] + 22 + (ch_idx * 3) + rng.randint(0, 2)
                ch_is_alive = (2026 - ch_birth <= 85) and (ch_birth >= 1945)
                ch_death = None if ch_is_alive else (ch_birth + rng.randint(58, 85))

                # Assign branch
                if gen == 2:
                    branch = branches[ch_idx % len(branches)]
                else:
                    branch = parent["branch"]

                child = {
                    "id": ch_id,
                    "clan": f"Họ {clan_surname}",
                    "full_name": ch_name,
                    "gender": ch_gender,
                    "generation": gen,
                    "birth_year": ch_birth,
                    "death_year": ch_death,
                    "branch": branch,
                    "is_alive": ch_is_alive,
                    "father_id": parent["id"],
                    "mother_id": spouse_id,
                    "spouses": [],
                    "children": [],
                    "biography": f"Thành viên Đời {gen} {branch}, sinh năm {ch_birth}.",
                }
                persons.append(child)
                gen_nodes[gen].append(child)
                parent["children"].append(ch_id)
                spouse["children"].append(ch_id)

                # Parent-child relationships
                relationships.append({
                    "from_id": parent["id"],
                    "to_id": ch_id,
                    "type": "PARENT_CHILD",
                    "role": "FATHER"
                })
                relationships.append({
                    "from_id": spouse_id,
                    "to_id": ch_id,
                    "type": "PARENT_CHILD",
                    "role": "MOTHER"
                })

            if len(persons) >= target_count:
                break
        if len(persons) >= target_count:
            break

    return persons, relationships


def build_duplicate_test_cases(persons_pool: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds 200 labeled duplicate test cases: 100 Positives and 100 Hard Negatives."""
    cases: List[Dict[str, Any]] = []
    
    # 100 Positives (True Duplicates)
    # Varied: exact matches, typo/spacing, slight lunar/solar offset, shared parents
    for i in range(100):
        src = persons_pool[i % len(persons_pool)]
        p1 = {
            "id": f"DUP_P1_{i+1:03d}",
            "full_name": src["full_name"],
            "gender": src["gender"],
            "generation": src["generation"],
            "birth_year": src["birth_year"],
            "death_year": src["death_year"],
            "branch": src["branch"],
            "father_name": "Người Cha Ghi Nhận" if src["father_id"] else None,
        }
        
        # Variation type
        var_type = i % 4
        if var_type == 0:
            # Exact duplicate
            p2 = dict(p1)
            p2["id"] = f"DUP_P2_{i+1:03d}"
            desc = "Hồ sơ trùng lặp hoàn toàn mọi tiêu chí"
        elif var_type == 1:
            # Minor name spacing / casing difference, same birth year
            p2 = dict(p1)
            p2["id"] = f"DUP_P2_{i+1:03d}"
            p2["full_name"] = "  " + src["full_name"].strip() + " "
            desc = "Trùng khớp họ tên (có khoảng trắng thừa), cùng năm sinh"
        elif var_type == 2:
            # Lunar-Solar birth year difference (+1 year), same parents & generation
            p2 = dict(p1)
            p2["id"] = f"DUP_P2_{i+1:03d}"
            p2["birth_year"] = src["birth_year"] + 1 if src["birth_year"] else 1980
            desc = "Chênh lệch 1 năm sinh do chuyển đổi âm/dương lịch, cùng thế hệ và chi tộc"
        else:
            # Missing death date in one profile, same birth year and branch
            p2 = dict(p1)
            p2["id"] = f"DUP_P2_{i+1:03d}"
            p2["death_year"] = None
            desc = "Trùng họ tên, năm sinh, chi tộc nhưng một bên chưa điền năm mất"

        cases.append({
            "test_id": f"TEST_DUP_POS_{i+1:03d}",
            "description": desc,
            "p1": p1,
            "p2": p2,
            "ground_truth_duplicate": True,
            "expected_label": 1
        })

    # 100 Hard Negatives (Distinct persons - NOT duplicates)
    for j in range(100):
        src = persons_pool[(100 + j) % len(persons_pool)]
        neg_type = j % 5
        
        if neg_type == 0:
            # Same name across generations (Grandson named after Grandfather or ancestor)
            p1 = {
                "id": f"DUP_N1_{j+1:03d}",
                "full_name": src["full_name"],
                "gender": src["gender"],
                "generation": src["generation"],
                "birth_year": src["birth_year"],
                "branch": src["branch"]
            }
            p2 = {
                "id": f"DUP_N2_{j+1:03d}",
                "full_name": src["full_name"],
                "gender": src["gender"],
                "generation": src["generation"] + 2,
                "birth_year": (src["birth_year"] + 55) if src["birth_year"] else 2000,
                "branch": src["branch"]
            }
            desc = "Trùng tên nhưng cách nhau 2 thế hệ (kỵ húy/cháu đặt tên theo tiền nhân)"
        elif neg_type == 1:
            # Same name and same generation, but DIFFERENT fathers (First cousins)
            p1 = {
                "id": f"DUP_N1_{j+1:03d}",
                "full_name": src["full_name"],
                "gender": src["gender"],
                "generation": src["generation"],
                "birth_year": src["birth_year"],
                "father_name": "Dương Văn Quyết"
            }
            p2 = {
                "id": f"DUP_N2_{j+1:03d}",
                "full_name": src["full_name"],
                "gender": src["gender"],
                "generation": src["generation"],
                "birth_year": (src["birth_year"] + 1) if src["birth_year"] else 1985,
                "father_name": "Dương Văn Thành"
            }
            desc = "Cùng thế hệ và tên nhưng cha ruột khác biệt rõ ràng (anh em con chú bác)"
        elif neg_type == 2:
            # Different gender with same middle and given names
            name_parts = src["full_name"].split()
            surname = name_parts[0]
            given = name_parts[-1]
            p1 = {
                "id": f"DUP_N1_{j+1:03d}",
                "full_name": f"{surname} Văn {given}",
                "gender": "MALE",
                "generation": src["generation"],
                "birth_year": src["birth_year"]
            }
            p2 = {
                "id": f"DUP_N2_{j+1:03d}",
                "full_name": f"{surname} Thị {given}",
                "gender": "FEMALE",
                "generation": src["generation"],
                "birth_year": src["birth_year"]
            }
            desc = "Khác biệt giới tính rõ rệt (nam vs nữ dù cùng năm sinh và tên gọi)"
        elif neg_type == 3:
            # Same name but 40+ years birth gap in different branches
            p1 = {
                "id": f"DUP_N1_{j+1:03d}",
                "full_name": src["full_name"],
                "gender": src["gender"],
                "generation": 3,
                "birth_year": 1920,
                "branch": "Chi 1"
            }
            p2 = {
                "id": f"DUP_N2_{j+1:03d}",
                "full_name": src["full_name"],
                "gender": src["gender"],
                "generation": 6,
                "birth_year": 1995,
                "branch": "Chi 3"
            }
            desc = "Cùng tên nhưng cách biệt 75 năm tuổi và thuộc hai chi nhánh riêng biệt"
        else:
            # Different names entirely in same generation & year
            other = persons_pool[(200 + j) % len(persons_pool)]
            p1 = {
                "id": f"DUP_N1_{j+1:03d}",
                "full_name": src["full_name"],
                "gender": src["gender"],
                "generation": src["generation"],
                "birth_year": src["birth_year"]
            }
            p2 = {
                "id": f"DUP_N2_{j+1:03d}",
                "full_name": other["full_name"],
                "gender": other["gender"],
                "generation": src["generation"],
                "birth_year": src["birth_year"]
            }
            desc = "Hai người hoàn toàn khác tên cùng thế hệ và năm sinh"

        cases.append({
            "test_id": f"TEST_DUP_NEG_{j+1:03d}",
            "description": desc,
            "p1": p1,
            "p2": p2,
            "ground_truth_duplicate": False,
            "expected_label": 0
        })

    return cases


def build_missing_relation_test_cases(persons_pool: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds 80 labeled missing relationship cases: 40 Positives, 40 Negatives."""
    cases: List[Dict[str, Any]] = []

    # 40 Positives: Co-parents sharing a child with NO spouse link in the system
    for i in range(40):
        father = persons_pool[i * 2]
        mother = persons_pool[(i * 2) + 1]
        child_name = f"{father['full_name'].split()[0]} Thế Minh {i+1}"
        cases.append({
            "test_id": f"TEST_MIS_POS_{i+1:03d}",
            "description": f"Hai người cùng là cha mẹ của '{child_name}' nhưng chưa có liên kết phối ngẫu",
            "parent_a": father["full_name"],
            "parent_b": mother["full_name"],
            "child_name": child_name,
            "has_child": True,
            "already_has_spouse_relation": False,
            "single_parent": False,
            "ground_truth_missing_spouse": True,
            "expected_label": 1
        })

    # 40 Negatives:
    # 20 already have spouse relations
    for j in range(20):
        father = persons_pool[100 + (j * 2)]
        mother = persons_pool[100 + (j * 2) + 1]
        cases.append({
            "test_id": f"TEST_MIS_NEG_{j+1:03d}",
            "description": f"Cha mẹ của con đã có sẵn liên kết phối ngẫu hợp thức trong hệ thống",
            "parent_a": father["full_name"],
            "parent_b": mother["full_name"],
            "child_name": f"Hậu duệ {j+1}",
            "has_child": True,
            "already_has_spouse_relation": True,
            "single_parent": False,
            "ground_truth_missing_spouse": False,
            "expected_label": 0
        })

    # 20 single parent records (no second parent recorded, not a missing co-parent spouse)
    for k in range(20):
        single_p = persons_pool[160 + k]
        cases.append({
            "test_id": f"TEST_MIS_NEG_{21+k:03d}",
            "description": f"Hồ sơ người con chỉ khai báo một thân sinh duy nhất (đơn thân/chưa rõ mẹ)",
            "parent_a": single_p["full_name"],
            "parent_b": None,
            "child_name": f"Con một thân sinh {k+1}",
            "has_child": True,
            "already_has_spouse_relation": False,
            "single_parent": True,
            "ground_truth_missing_spouse": False,
            "expected_label": 0
        })

    return cases


def build_anomaly_test_cases() -> List[Dict[str, Any]]:
    """Builds 80 labeled anomaly cases: 40 Positives (Anomalies) and 40 Negatives (Valid)."""
    cases: List[Dict[str, Any]] = []

    # 40 True Anomalies
    # Types: CIRCULAR_REFERENCE (10), TIMELINE_CONFLICT (20), GENERATION_INVERSION (10)
    for i in range(10):
        # 10 Circular References
        cases.append({
            "test_id": f"TEST_ANOM_POS_{i+1:03d}",
            "type": "CIRCULAR_REFERENCE",
            "description": f"Vòng lặp phả hệ khép kín chu trình 3 đời: Node_{i}_A -> Node_{i}_B -> Node_{i}_C -> Node_{i}_A",
            "relationships": [
                (f"CYC_{i}_A", f"CYC_{i}_B", "PARENT"),
                (f"CYC_{i}_B", f"CYC_{i}_C", "PARENT"),
                (f"CYC_{i}_C", f"CYC_{i}_A", "PARENT"),
            ],
            "ground_truth_anomaly": True,
            "expected_label": 1
        })

    for j in range(20):
        # 20 Timeline conflicts
        sub_type = j % 4
        if sub_type == 0:
            # Child born before parent
            p_birth = 1970
            c_birth = 1955
            desc = f"Con sinh năm {c_birth} trước cha sinh năm {p_birth}"
            p_data = {"birth_year": p_birth, "gender": "MALE"}
            c_data = {"birth_year": c_birth}
            person_data = None
        elif sub_type == 1:
            # Mother aged > 65 at birth
            p_birth = 1910
            c_birth = 1985
            desc = f"Mẹ sinh năm {p_birth}, sinh con năm {c_birth} khi đã 75 tuổi (vượt sinh học)"
            p_data = {"birth_year": p_birth, "gender": "FEMALE"}
            c_data = {"birth_year": c_birth}
            person_data = None
        elif sub_type == 2:
            # Death before birth
            desc = "Người mất trước ngày sinh (Sinh 1960 nhưng mất 1950)"
            p_data = None
            c_data = None
            person_data = {"birth_year": 1960, "death_year": 1950}
        else:
            # Child born > 2 years after father death
            desc = "Con sinh sau khi người cha đã mất hơn 3 năm (Cha mất 1980, con sinh 1984)"
            p_data = {"birth_year": 1940, "death_year": 1980, "gender": "MALE"}
            c_data = {"birth_year": 1984}
            person_data = None

        cases.append({
            "test_id": f"TEST_ANOM_POS_{11+j:03d}",
            "type": "TIMELINE_CONFLICT",
            "description": desc,
            "parent": p_data,
            "child": c_data,
            "person": person_data,
            "ground_truth_anomaly": True,
            "expected_label": 1
        })

    for k in range(10):
        # 10 Generation Inversions
        cases.append({
            "test_id": f"TEST_ANOM_POS_{31+k:03d}",
            "type": "GENERATION_INVERSION",
            "description": f"Cha Đời 5 nhưng con lại khai báo Đời 4 (nghịch đảo thế hệ)",
            "parent": {"generation": 5, "birth_year": 1960},
            "child": {"generation": 4, "birth_year": 1988},
            "ground_truth_anomaly": True,
            "expected_label": 1
        })

    # 40 Clean / Valid Cases (Negatives)
    for n in range(40):
        p_yr = 1940 + (n * 2)
        c_yr = p_yr + 24 + (n % 6)
        cases.append({
            "test_id": f"TEST_ANOM_NEG_{n+1:03d}",
            "type": "VALID",
            "description": f"Quan hệ phụ mẫu - con cái hợp lệ chuẩn mực: Cha Đời {3 + (n % 3)} sinh {p_yr}, con Đời {4 + (n % 3)} sinh {c_yr}",
            "parent": {"generation": 3 + (n % 3), "birth_year": p_yr},
            "child": {"generation": 4 + (n % 3), "birth_year": c_yr},
            "relationships": [
                (f"VAL_{n}_P", f"VAL_{n}_C", "PARENT")
            ],
            "ground_truth_anomaly": False,
            "expected_label": 0
        })

    return cases


def build_qa_questions(persons: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds 100 genealogical QA questions with verifiable ground truth answers."""
    questions: List[Dict[str, Any]] = []

    # Map for easy lookup
    p_map = {p["id"]: p for p in persons}
    duong_progenitor = next(p for p in persons if p["clan"] == "Họ Dương" and p["generation"] == 1)
    mai_progenitor = next(p for p in persons if p["clan"] == "Họ Mai" and p["generation"] == 1)

    # 1. Progenitor questions (10 questions)
    questions.append({
        "q_id": "QA_001",
        "question": "Thủy tổ của dòng họ Dương trong hệ thống tên là gì và sinh năm bao nhiêu?",
        "ground_truth": f"Thủy tổ họ Dương là {duong_progenitor['full_name']}, sinh năm {duong_progenitor['birth_year']}.",
        "key_facts": [duong_progenitor["full_name"], str(duong_progenitor["birth_year"])],
        "category": "PROGENITOR"
    })
    questions.append({
        "q_id": "QA_002",
        "question": "Thủy tổ họ Mai tên là gì?",
        "ground_truth": f"Thủy tổ họ Mai là {mai_progenitor['full_name']}.",
        "key_facts": [mai_progenitor["full_name"]],
        "category": "PROGENITOR"
    })

    # 2. Branch & Count questions (20 questions)
    questions.append({
        "q_id": "QA_003",
        "question": "Dòng họ Dương có những chi phái nào?",
        "ground_truth": "Dòng họ Dương gồm các chi: " + ", ".join(DUONG_BRANCHES) + ".",
        "key_facts": DUONG_BRANCHES,
        "category": "STATISTICS"
    })
    questions.append({
        "q_id": "QA_004",
        "question": "Dòng họ Mai có những chi phái nào?",
        "ground_truth": "Dòng họ Mai gồm các chi: " + ", ".join(MAI_BRANCHES) + ".",
        "key_facts": MAI_BRANCHES,
        "category": "STATISTICS"
    })

    # 3. Specific Person Parentage & Children (70 questions based on generated persons)
    sample_parents = [p for p in persons if len(p.get("children", [])) >= 2][:35]
    for idx, p in enumerate(sample_parents):
        ch_names = [p_map[cid]["full_name"] for cid in p["children"] if cid in p_map]
        questions.append({
            "q_id": f"QA_{idx+5:03d}",
            "question": f"Người có tên '{p['full_name']}' thuộc thế hệ thứ mấy và có bao nhiêu người con?",
            "ground_truth": f"{p['full_name']} thuộc Đời thứ {p['generation']}, có {len(ch_names)} người con gồm: {', '.join(ch_names)}.",
            "key_facts": [f"Đời {p['generation']}", str(len(ch_names))],
            "category": "LINEAGE_FACTS"
        })

    sample_children = [p for p in persons if p.get("father_id") and p["father_id"] in p_map][:35]
    for idx, ch in enumerate(sample_children):
        father = p_map[ch["father_id"]]
        mother = p_map.get(ch.get("mother_id")) if ch.get("mother_id") else None
        m_name = mother["full_name"] if mother else "Chưa rõ"
        questions.append({
            "q_id": f"QA_{idx+40:03d}",
            "question": f"Thân sinh phụ mẫu của '{ch['full_name']}' (sinh năm {ch['birth_year']}) là ai?",
            "ground_truth": f"Cha là {father['full_name']}, mẹ là {m_name}.",
            "key_facts": [father["full_name"]],
            "category": "PARENTAGE"
        })

    # Pad remaining to exactly 100 questions
    curr_len = len(questions)
    for rem in range(100 - curr_len):
        target_p = persons[rem * 4]
        questions.append({
            "q_id": f"QA_{curr_len+rem+1:03d}",
            "question": f"Thành viên '{target_p['full_name']}' sinh năm bao nhiêu và thuộc chi nhánh nào?",
            "ground_truth": f"{target_p['full_name']} sinh năm {target_p['birth_year']}, thuộc {target_p['branch']}.",
            "key_facts": [str(target_p['birth_year']), target_p['branch']],
            "category": "MEMBER_PROFILE"
        })

    return questions


def build_biography_profiles(persons: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Builds 30 ancestor profiles to test factual faithfulness vs hallucination."""
    profiles: List[Dict[str, Any]] = []

    # 10 Sparse profiles (only birth year, clan, branch - AI must NOT hallucinate titles/careers)
    for i in range(10):
        p = persons[i * 5]
        profiles.append({
            "profile_id": f"BIO_SPARSE_{i+1:02d}",
            "full_name": p["full_name"],
            "clan": p["clan"],
            "generation": p["generation"],
            "branch": p["branch"],
            "birth_year": p["birth_year"],
            "death_year": p["death_year"],
            "known_facts": [
                f"Thành viên {p['clan']} thuộc {p['branch']}",
                f"Đời thứ {p['generation']}",
                f"Sinh năm {p['birth_year']}"
            ],
            "prohibited_hallucinations": [
                "Quan cử đỗ tiến sĩ",
                "Tham gia kháng chiến chống Pháp",
                "Chủ tịch hợp tác xã",
                "Đại tướng",
                "Giáo sư tiến sĩ"
            ],
            "complexity": "SPARSE"
        })

    # 10 Medium profiles (with family facts, burial location)
    for j in range(10):
        p = persons[50 + (j * 5)]
        burial = f"Khu lăng mộ họ {p['clan'].split()[-1]} tại đồi Sơn Trà"
        profiles.append({
            "profile_id": f"BIO_MEDIUM_{j+1:02d}",
            "full_name": p["full_name"],
            "clan": p["clan"],
            "generation": p["generation"],
            "branch": p["branch"],
            "birth_year": p["birth_year"],
            "death_year": p["death_year"],
            "burial_location": burial,
            "known_facts": [
                f"Thành viên {p['clan']} thuộc {p['branch']}",
                f"Đời thứ {p['generation']}",
                f"Sinh năm {p['birth_year']}",
                f"An táng tại: {burial}"
            ],
            "prohibited_hallucinations": [
                "Bí thư tỉnh ủy",
                "Đỗ cử nhân khoa Quý Dậu",
                "Đi sứ phương Bắc"
            ],
            "complexity": "MEDIUM"
        })

    # 10 Rich profiles (recorded historic clan deeds)
    for k in range(10):
        p = persons[100 + (k * 5)]
        merit = f"Đóng góp 3 mẫu ruộng cho từ đường và trùng tu nhà thờ chi {p['branch']} năm {p['birth_year'] + 45}"
        profiles.append({
            "profile_id": f"BIO_RICH_{k+1:02d}",
            "full_name": p["full_name"],
            "clan": p["clan"],
            "generation": p["generation"],
            "branch": p["branch"],
            "birth_year": p["birth_year"],
            "death_year": p["death_year"],
            "clan_contributions": merit,
            "known_facts": [
                f"Thành viên {p['clan']} thuộc {p['branch']}",
                f"Đời thứ {p['generation']}",
                f"Sinh năm {p['birth_year']}",
                f"Công trạng: {merit}"
            ],
            "prohibited_hallucinations": [
                "Được vua phong tước hầu",
                "Du học nước ngoài"
            ],
            "complexity": "RICH"
        })

    return profiles


def create_excel_files(persons: List[Dict[str, Any]]):
    """Creates 12 Excel test files: 6 valid and 6 with specific structural errors."""
    
    # 6 Valid Excel Files (varied clan branches)
    for i in range(1, 7):
        wb = openpyxl.Workbook()
        ws_info = wb.active
        ws_info.title = "THÔNG TIN CHUNG"
        ws_info.append(["Thuộc tính", "Giá trị"])
        ws_info.append(["Tên dòng họ", f"Họ Dương - Chi Nhánh Thử Nghiệm {i}"])
        ws_info.append(["Phiên bản mẫu", "2.0"])

        ws_members = wb.create_sheet("THÀNH VIÊN")
        ws_members.append(["Mã", "Họ và tên", "Đời", "Giới tính", "Ngày sinh", "Ngày mất", "Chi nhánh"])
        
        subset = persons[(i - 1) * 20 : i * 20]
        subset_ids = {p["id"] for p in subset}
        for p in subset:
            b_str = f"{p['birth_year']}-01-01" if p.get("birth_year") else ""
            d_str = f"{p['death_year']}-01-01" if p.get("death_year") else ""
            ws_members.append([p["id"], p["full_name"], p["generation"], p["gender"], b_str, d_str, p["branch"]])

        ws_rels = wb.create_sheet("QUAN HỆ")
        ws_rels.append(["Người thứ nhất", "Người thứ hai", "Mối quan hệ"])
        for p in subset:
            f_id = p.get("father_id")
            if f_id and f_id in subset_ids:
                ws_rels.append([f_id, p["id"], "PARENT_CHILD"])
            m_id = p.get("mother_id")
            if m_id and m_id in subset_ids:
                ws_rels.append([m_id, p["id"], "PARENT_CHILD"])
            for sp_id in p.get("spouses", []):
                if sp_id in subset_ids and p["id"] < sp_id:
                    ws_rels.append([p["id"], sp_id, "SPOUSE"])

        ws_branches = wb.create_sheet("CHI NHÁNH")
        ws_branches.append(["Tên chi nhánh", "Mô tả"])
        ws_branches.append(["Chi Giáp", "Chi phái chính"])
        ws_branches.append(["Chi Ất", "Chi phái thứ"])

        out_path = os.path.join(EXCEL_DIR, f"excel_valid_{i:02d}.xlsx")
        wb.save(out_path)

    # 6 Erroneous Excel Files (testing validator and pre-import auditing)
    
    # Error File 1: Missing Required Sheet (THÀNH VIÊN)
    wb1 = openpyxl.Workbook()
    ws1 = wb1.active
    ws1.title = "THÔNG TIN CHUNG"
    ws1.append(["Thuộc tính", "Giá trị"])
    wb1.save(os.path.join(EXCEL_DIR, "excel_err_01_missing_sheet.xlsx"))

    # Error File 2: Missing Required Column in THÀNH VIÊN (missing 'Họ và tên')
    wb2 = openpyxl.Workbook()
    ws2_m = wb2.active
    ws2_m.title = "THÀNH VIÊN"
    ws2_m.append(["Mã", "Đời", "Giới tính"])  # missing "Họ và tên"
    ws2_m.append(["P001", 1, "MALE"])
    wb2.save(os.path.join(EXCEL_DIR, "excel_err_02_missing_column.xlsx"))

    # Error File 3: Circular Reference in QUAN HỆ (Cycle)
    wb3 = openpyxl.Workbook()
    ws3_m = wb3.active
    ws3_m.title = "THÀNH VIÊN"
    ws3_m.append(["Mã", "Họ và tên", "Đời", "Giới tính", "Ngày sinh"])
    ws3_m.append(["P_CYC_1", "Dương Văn Một", 1, "MALE", "1950-01-01"])
    ws3_m.append(["P_CYC_2", "Dương Văn Hai", 2, "MALE", "1975-01-01"])
    ws3_r = wb3.create_sheet("QUAN HỆ")
    ws3_r.append(["Người thứ nhất", "Người thứ hai", "Mối quan hệ"])
    ws3_r.append(["P_CYC_1", "P_CYC_2", "PARENT_CHILD"])
    ws3_r.append(["P_CYC_2", "P_CYC_1", "PARENT_CHILD"])  # Cycle!
    wb3.save(os.path.join(EXCEL_DIR, "excel_err_03_cycle_relation.xlsx"))

    # Error File 4: Generation Inversion (Child generation <= Parent generation)
    wb4 = openpyxl.Workbook()
    ws4_m = wb4.active
    ws4_m.title = "THÀNH VIÊN"
    ws4_m.append(["Mã", "Họ và tên", "Đời", "Giới tính", "Ngày sinh"])
    ws4_m.append(["P_INV_1", "Dương Văn Cha", 5, "MALE", "1960-01-01"])
    ws4_m.append(["P_INV_2", "Dương Văn Con", 4, "MALE", "1985-01-01"])  # Inversion!
    ws4_r = wb4.create_sheet("QUAN HỆ")
    ws4_r.append(["Người thứ nhất", "Người thứ hai", "Mối quan hệ"])
    ws4_r.append(["P_INV_1", "P_INV_2", "PARENT_CHILD"])
    wb4.save(os.path.join(EXCEL_DIR, "excel_err_04_generation_inversion.xlsx"))

    # Error File 5: Timeline Conflict (Child born before Parent)
    wb5 = openpyxl.Workbook()
    ws5_m = wb5.active
    ws5_m.title = "THÀNH VIÊN"
    ws5_m.append(["Mã", "Họ và tên", "Đời", "Giới tính", "Ngày sinh"])
    ws5_m.append(["P_TIME_1", "Mai Văn Cha", 3, "MALE", "1975-01-01"])
    ws5_m.append(["P_TIME_2", "Mai Văn Con", 4, "MALE", "1950-01-01"])  # Born 25 years before parent!
    ws5_r = wb5.create_sheet("QUAN HỆ")
    ws5_r.append(["Người thứ nhất", "Người thứ hai", "Mối quan hệ"])
    ws5_r.append(["P_TIME_1", "P_TIME_2", "PARENT_CHILD"])
    wb5.save(os.path.join(EXCEL_DIR, "excel_err_05_timeline_conflict.xlsx"))

    # Error File 6: Foreign Key Reference Error (Unknown code in QUAN HỆ)
    wb6 = openpyxl.Workbook()
    ws6_m = wb6.active
    ws6_m.title = "THÀNH VIÊN"
    ws6_m.append(["Mã", "Họ và tên", "Đời", "Giới tính"])
    ws6_m.append(["P_VALID_1", "Dương Viết Hùng", 1, "MALE"])
    ws6_r = wb6.create_sheet("QUAN HỆ")
    ws6_r.append(["Người thứ nhất", "Người thứ hai", "Mối quan hệ"])
    ws6_r.append(["P_VALID_1", "P_GHOST_99", "PARENT_CHILD"])  # P_GHOST_99 does not exist!
    wb6.save(os.path.join(EXCEL_DIR, "excel_err_06_foreign_key_missing.xlsx"))


def main():
    print("Generating independent test dataset for MFGMS-AI Phase 7...")
    
    # 1. Generate 540 Person entities (270 Họ Dương, 270 Họ Mai)
    duong_persons, duong_rels = generate_person_graph("Dương", DUONG_BRANCHES, 270, 1)
    mai_persons, mai_rels = generate_person_graph("Mai", MAI_BRANCHES, 270, len(duong_persons) + 1)
    all_persons = duong_persons + mai_persons
    all_rels = duong_rels + mai_rels

    print(f"Generated {len(all_persons)} Person records ({len(duong_persons)} Họ Dương, {len(mai_persons)} Họ Mai).")
    print(f"Generated {len(all_rels)} internal genealogical relationships.")

    # 2. Build 200 Duplicate Person test cases
    duplicate_cases = build_duplicate_test_cases(all_persons)
    print(f"Generated {len(duplicate_cases)} labeled Duplicate test cases (100 Positives, 100 Negatives).")

    # 3. Build 80 Missing Relationship cases
    missing_cases = build_missing_relation_test_cases(all_persons)
    print(f"Generated {len(missing_cases)} labeled Missing Relationship test cases (40 Positives, 40 Negatives).")

    # 4. Build 80 Anomaly & Timeline cases
    anomaly_cases = build_anomaly_test_cases()
    print(f"Generated {len(anomaly_cases)} labeled Anomaly test cases (40 Positives, 40 Negatives).")

    # 5. Build 100 QA questions
    qa_questions = build_qa_questions(all_persons)
    print(f"Generated {len(qa_questions)} genealogical QA questions with ground truth facts.")

    # 6. Build 30 Ancestor Biography profiles
    bio_profiles = build_biography_profiles(all_persons)
    print(f"Generated {len(bio_profiles)} Ancestor profiles for biography evaluation.")

    # 7. Create 12 Excel files
    create_excel_files(all_persons)
    print(f"Created 12 Excel import files (6 valid, 6 anomalous) in {EXCEL_DIR}.")

    # Assemble dataset
    dataset = {
        "metadata": {
            "dataset_name": "MFGMS-AI Independent Test Benchmark (Phase 7)",
            "seed": SEED,
            "lineages": ["Họ Dương", "Họ Mai"],
            "person_count": len(all_persons),
            "relationship_count": len(all_rels),
            "duplicate_cases_count": len(duplicate_cases),
            "missing_cases_count": len(missing_cases),
            "anomaly_cases_count": len(anomaly_cases),
            "qa_questions_count": len(qa_questions),
            "biography_profiles_count": len(bio_profiles),
            "excel_files_count": 12,
            "isolation": "Completely separate and disjoint from Dev Set (genealogy_ground_truth.json)",
            "purpose": "Academic independent evaluation for graduation thesis (Đồ án tốt nghiệp)"
        },
        "persons": all_persons,
        "duplicate_test_cases": duplicate_cases,
        "missing_relation_test_cases": missing_cases,
        "anomaly_test_cases": anomaly_cases,
        "qa_questions": qa_questions,
        "biography_profiles": bio_profiles,
        "excel_test_files": [
            {"filename": f"excel_valid_{i:02d}.xlsx", "expected_valid": True} for i in range(1, 7)
        ] + [
            {"filename": "excel_err_01_missing_sheet.xlsx", "expected_valid": False, "error_type": "MISSING_SHEET"},
            {"filename": "excel_err_02_missing_column.xlsx", "expected_valid": False, "error_type": "MISSING_COLUMN"},
            {"filename": "excel_err_03_cycle_relation.xlsx", "expected_valid": False, "error_type": "CYCLE"},
            {"filename": "excel_err_04_generation_inversion.xlsx", "expected_valid": False, "error_type": "GENERATION_INVERSION"},
            {"filename": "excel_err_05_timeline_conflict.xlsx", "expected_valid": False, "error_type": "TIMELINE_CONFLICT"},
            {"filename": "excel_err_06_foreign_key_missing.xlsx", "expected_valid": False, "error_type": "UNKNOWN_FOREIGN_KEY"}
        ]
    }

    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=2)

    print(f"Independent test dataset saved cleanly to: {OUTPUT_JSON_PATH}")


if __name__ == "__main__":
    main()
