"""Danh sach tu thanh/tho tuc tieng Viet dung de loc Loi vieng (khong day du: bo loc AI la lop phu).

Co BA nhom, de tranh chan nham tu binh thuong ("lớn", "buổi", "các", "ngủ yên", "đi" ...):

* ACCENTED_TERMS  : khop theo chu CO DAU (NFC, chu thuong). Chi dung cho tu ma khi bo dau se trung tu thuong
                    ("buồi"/"buổi", "đéo"/"đeo", "lồn"/"lớn", "cặc"/"các", "đồ ngủ"/"đồ ngu"...).
* SAFE_TERMS      : da bo dau, khong trung tu thuong -> khop ca khi nguoi dung go khong dau.
* AMBIGUOUS_TERMS : da bo dau, TRUNG tu thuong ("lon", "cac", "buoi", "deo") -> chi bi chan khi bi viet lech co
                    chu y ("l.o.n", "l0n", "c@c", "b u o i"), khong chan khi la tu binh thuong.

Moi muc co the la mot tu hoac cum tu (cach nhau bang dau cach). Chu lap ("ditttt") duoc gop ve mot ky tu
truoc khi so sanh, ca hai phia, nen khong can liet ke cac bien the keo dai.
"""

from __future__ import annotations

ACCENTED_TERMS: frozenset[str] = frozenset(
    {
        "lồn",
        "cặc",
        "buồi",
        "đụ",
        "địt",
        "đéo",
        "đĩ",
        "đồ chó",
        "thằng chó",
        "đồ ngu",
        "thằng ngu",
        "đồ khốn",
        "khốn nạn",
        "súc vật",
        "mất dạy",
        "đồ điên",
        "thằng điên",
    }
)

SAFE_TERMS: frozenset[str] = frozenset(
    {
        # viet tat / bien the khong dau
        "dm",
        "dmm",
        "dcm",
        "dcmm",
        "dkm",
        "cmm",
        "vcl",
        "vkl",
        "vl",
        "clgt",
        "clm",
        "dit",
        "ditme",
        "ditmay",
        "dume",
        "duma",
        "dumay",
        "dit me",
        "dit may",
        "dit con",
        "thang cho",
        "oc cho",
        "con ngu",
        "khon nan",
        "suc vat",
        # tieng Anh thuong gap
        "fuck",
        "fck",
        "shit",
        "bitch",
        "cunt",
        "asshole",
        "dick",
        "pussy",
        "wtf",
    }
)

AMBIGUOUS_TERMS: frozenset[str] = frozenset(
    {
        "lon",
        "cac",
        "buoi",
        "deo",
    }
)
