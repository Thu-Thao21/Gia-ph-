import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { fetchMembers } from '../../services/member.service';
import {
  fetchRelationshipCalculation,
  fetchPersonAncestors,
  fetchPersonDescendants,
  fetchFamilyTreeData,
} from '../../services/genealogy.service';
import { useClanContext } from '../../context/ClanContext';
import { useAuth } from '../../context/AuthContext';
import type { Member } from '../../types/member';
import './RelationshipFinder.css';

export interface RelationshipFinderProps {
  familyId?: string;
  canManage?: boolean;
  onNavigateTab?: (tabId: string) => void;
}

interface PathNode {
  id: string;
  fullName: string;
  generation?: number;
  gender?: string;
  relationToNext?: string;
}

interface KinshipResult {
  found: boolean;
  relationshipName: string;
  callingTitleAtoB: string;
  selfPronounAtoB: string;
  callingTitleBtoA: string;
  selfPronounBtoA: string;
  sampleGreetingAtoB: string;
  sampleGreetingBtoA: string;
  generationDiff: number;
  pathNodes: PathNode[];
  description: string;
}

export const RelationshipFinder: React.FC<RelationshipFinderProps> = ({
  familyId,
  canManage = false,
  onNavigateTab,
}) => {
  const { account } = useAuth();
  const { activeClanId, activeClanName, activeMembership } = useClanContext();

  const effectiveFamilyId =
    familyId || activeClanId || account?.clan_id || account?.memberships?.[0]?.clan_id;
  const clanDisplayName =
    activeClanName || activeMembership?.clan_name || account?.clan_name || 'Dòng Họ';
  const lineageType = activeMembership?.lineage_type;
  const isMaternal = (lineageType || '').toUpperCase() === 'MATERNAL';

  const [members, setMembers] = useState<Member[]>([]);
  const [personAId, setPersonAId] = useState<string>('');
  const [personBId, setPersonBId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [calculating, setCalculating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'finder' | 'lineage' | 'guide'>('finder');

  // Lọc tìm kiếm trong danh sách
  const [searchFilterA, setSearchFilterA] = useState<string>('');
  const [searchFilterB, setSearchFilterB] = useState<string>('');

  // Kết quả phân tích (mặc định null khi chưa chọn hoặc chưa bấm phân tích)
  const [result, setResult] = useState<KinshipResult | null>(null);

  // Tab dòng dõi
  const [lineagePersonId, setLineagePersonId] = useState<string>('');
  const [ancestors, setAncestors] = useState<Member[]>([]);
  const [descendants, setDescendants] = useState<Member[]>([]);
  const [loadingLineage, setLoadingLineage] = useState<boolean>(false);

  // Tìm hồ sơ Person của tài khoản hiện tại trong dòng họ
  const myPerson = useMemo(() => {
    if (!members.length) return null;
    const myName = (account?.display_name || '').trim().toLowerCase();
    const myId = account?.id;
    const myUserId = (account as any)?.user_id;

    return (
      members.find(
        (m) =>
          (activeMembership?.person_id && m.id === activeMembership.person_id) ||
          ((m as any).userId &&
            ((m as any).userId === myId || (m as any).userId === myUserId)) ||
          m.fullName.trim().toLowerCase() === myName
      ) || null
    );
  }, [members, account, activeMembership]);

  // Tải dữ liệu thành viên từ database
  useEffect(() => {
    if (!effectiveFamilyId) {
      setLoading(false);
      return;
    }

    let isCancelled = false;
    setLoading(true);

    fetchMembers({ familyId: effectiveFamilyId, limit: 1000 })
      .then((memRes) => {
        if (isCancelled) return;
        const items = memRes?.items || [];
        setMembers(items);
        // Không tự động gán person hay tính toán kết quả khi mới mở trang
        setPersonAId('');
        setPersonBId('');
        setResult(null);
        if (items.length > 0) {
          setLineagePersonId(items[0].id);
        }
      })
      .catch((err) => {
        if (!isCancelled) {
          console.error('Lỗi khi tải thành viên dòng họ:', err);
        }
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [effectiveFamilyId]);

  const pA = useMemo(() => members.find((m) => m.id === personAId), [members, personAId]);
  const pB = useMemo(() => members.find((m) => m.id === personBId), [members, personBId]);

  // Reset kết quả khi thay đổi người chọn
  const handleSelectPersonA = (id: string) => {
    setPersonAId(id);
    setResult(null);
  };

  const handleSelectPersonB = (id: string) => {
    setPersonBId(id);
    setResult(null);
  };

  // Hoán đổi vị trí A và B
  const handleSwap = () => {
    const tempA = personAId;
    setPersonAId(personBId);
    setPersonBId(tempA);
    setResult(null);
  };

  // Tính toán quan hệ & xưng hô khi người dùng chủ động bấm nút
  const handleCalculate = async () => {
    if (!personAId || !personBId || !effectiveFamilyId) return;

    const personA = members.find((m) => m.id === personAId);
    const personB = members.find((m) => m.id === personBId);
    if (!personA || !personB) return;

    if (personAId === personBId) {
      setResult({
        found: true,
        relationshipName: 'Chính bản thân',
        callingTitleAtoB: 'Tôi',
        selfPronounAtoB: 'Tôi',
        callingTitleBtoA: 'Tôi',
        selfPronounBtoA: 'Tôi',
        sampleGreetingAtoB: 'Đây là cùng một người trong cây gia phả.',
        sampleGreetingBtoA: 'Đây là cùng một người trong cây gia phả.',
        generationDiff: 0,
        pathNodes: [
          {
            id: personA.id,
            fullName: personA.fullName,
            generation: personA.generation,
            gender: personA.gender as any,
          },
        ],
        description: 'Hai đối tượng được chọn là cùng một người.',
      });
      return;
    }

    setCalculating(true);

    try {
      // 1. Gọi API backend tính toán đường đi quan hệ
      const beRes = await fetchRelationshipCalculation(effectiveFamilyId, personAId, personBId);

      // Kiểm tra backend có trả về đúng đường đi chứa Person A và Person B không
      const hasValidPath =
        beRes &&
        beRes.found &&
        beRes.path &&
        beRes.path.length > 0 &&
        beRes.path.some((p) => p.id === personAId) &&
        beRes.path.some((p) => p.id === personBId);

      if (hasValidPath) {
        const genA = personA.generation || 1;
        const genB = personB.generation || 1;
        const diff = genB - genA;

        const nodes: PathNode[] = beRes.path.map((item, idx) => ({
          id: item.id,
          fullName: item.fullName,
          generation: item.generation,
          gender: item.gender,
          relationToNext: idx < beRes.path.length - 1 ? 'kết nối' : undefined,
        }));

        const kinName = beRes.kinshipName || 'Họ hàng';
        let titleAtoB = beRes.addressTitle || 'Chào theo vai vế';
        let selfAtoB = 'Cháu';
        let titleBtoA = 'Cháu';
        let selfBtoA = beRes.addressTitle || 'Chào theo vai vế';

        if (diff < 0) {
          // B ở đời trước A
          titleAtoB = kinName;
          selfAtoB = diff === -1 ? 'Con' : diff === -2 ? 'Cháu' : diff === -3 ? 'Chắt' : 'Chút';
          titleBtoA = selfAtoB;
          selfBtoA = titleAtoB;
        } else if (diff > 0) {
          // B ở đời sau A
          titleAtoB = diff === 1 ? 'Con' : diff === 2 ? 'Cháu' : diff === 3 ? 'Chắt' : 'Chút';
          selfAtoB = kinName;
          titleBtoA = selfAtoB;
          selfBtoA = titleAtoB;
        } else {
          // Cùng thế hệ
          const birthA = personA.birthDate || '';
          const birthB = personB.birthDate || '';
          const aOlder = birthA && birthB ? birthA < birthB : true;
          if (kinName === 'Chồng' || kinName === 'Vợ') {
            titleAtoB = kinName;
            selfAtoB = kinName === 'Chồng' ? 'Vợ' : 'Chồng';
            titleBtoA = selfAtoB;
            selfBtoA = titleAtoB;
          } else {
            titleAtoB = aOlder
              ? (personB.gender === 'female' ? 'Em gái' : 'Em trai')
              : (personB.gender === 'female' ? 'Chị họ' : 'Anh họ');
            selfAtoB = aOlder ? (personA.gender === 'female' ? 'Chị' : 'Anh') : 'Em';
            titleBtoA = selfAtoB;
            selfBtoA = titleAtoB;
          }
        }

        setResult({
          found: true,
          relationshipName: kinName,
          callingTitleAtoB: titleAtoB,
          selfPronounAtoB: selfAtoB,
          callingTitleBtoA: titleBtoA,
          selfPronounBtoA: selfBtoA,
          sampleGreetingAtoB: `Kính thưa ${titleAtoB} ${personB.fullName}, ${selfAtoB} là ${personA.fullName} thuộc Đời thứ ${genA} xin kính chào.`,
          sampleGreetingBtoA: `Chào ${titleBtoA} ${personA.fullName}, ${selfBtoA} là ${personB.fullName} thuộc Đời thứ ${genB}.`,
          generationDiff: diff,
          pathNodes: nodes,
          description:
            beRes.description ||
            `Mối quan hệ giữa ${personA.fullName} (Đời ${genA}) và ${personB.fullName} (Đời ${genB}).`,
        });
        setCalculating(false);
        return;
      }
    } catch {
      // Tiếp tục fallback thuật toán BFS
    }

    // 2. Client-side BFS Kinship Engine dựa trên fatherId, motherId, spouseId
    const genA = personA.generation || 1;
    const genB = personB.generation || 1;
    const diff = genB - genA;

    const adj: Record<string, Array<{ to: string; rel: string }>> = {};
    members.forEach((m) => {
      adj[m.id] = adj[m.id] || [];
      if (m.fatherId) {
        adj[m.id].push({ to: m.fatherId, rel: 'Cha' });
        adj[m.fatherId] = adj[m.fatherId] || [];
        adj[m.fatherId].push({ to: m.id, rel: 'Con' });
      }
      if (m.motherId) {
        adj[m.id].push({ to: m.motherId, rel: 'Mẹ' });
        adj[m.motherId] = adj[m.motherId] || [];
        adj[m.motherId].push({ to: m.id, rel: 'Con' });
      }
      if (m.spouseId) {
        adj[m.id].push({ to: m.spouseId, rel: 'Vợ/Chồng' });
        adj[m.spouseId] = adj[m.spouseId] || [];
        adj[m.spouseId].push({ to: m.id, rel: 'Vợ/Chồng' });
      }
    });

    const queue: Array<{ curr: string; path: string[]; rels: string[] }> = [
      { curr: personAId, path: [personAId], rels: [] },
    ];
    const visited = new Set<string>([personAId]);
    let foundPath: string[] = [];
    let foundRels: string[] = [];

    while (queue.length > 0) {
      const item = queue.shift()!;
      if (item.curr === personBId) {
        foundPath = item.path;
        foundRels = item.rels;
        break;
      }
      const neighbors = adj[item.curr] || [];
      for (const n of neighbors) {
        if (!visited.has(n.to)) {
          visited.add(n.to);
          queue.push({
            curr: n.to,
            path: [...item.path, n.to],
            rels: [...item.rels, n.rel],
          });
        }
      }
    }

    const isMaleB =
      (personB.gender || '').toLowerCase() === 'male' ||
      (personB.gender || '').toLowerCase() === 'nam';
    const isMaleA =
      (personA.gender || '').toLowerCase() === 'male' ||
      (personA.gender || '').toLowerCase() === 'nam';

    let kinName = 'Họ hàng gia tộc';
    let titleAtoB = 'Bác/Chú/Cô/Anh/Em';
    let selfAtoB = 'Cháu/Em';
    let titleBtoA = 'Cháu/Em';
    let selfBtoA = 'Bác/Chú/Cô/Anh/Em';

    if (foundPath.length === 2) {
      const rel = foundRels[0];
      if (rel === 'Vợ/Chồng') {
        kinName = isMaleB ? 'Chồng' : 'Vợ';
        titleAtoB = isMaleB ? 'Chồng' : 'Vợ';
        selfAtoB = isMaleA ? 'Chồng' : 'Vợ';
        titleBtoA = selfAtoB;
        selfBtoA = titleAtoB;
      } else if (rel === 'Cha' || rel === 'Mẹ') {
        kinName = isMaleB ? 'Cha ruột' : 'Mẹ ruột';
        titleAtoB = isMaleB ? 'Cha' : 'Mẹ';
        selfAtoB = 'Con';
        titleBtoA = 'Con';
        selfBtoA = titleAtoB;
      } else if (rel === 'Con') {
        kinName = isMaleB ? 'Con trai' : 'Con gái';
        titleAtoB = 'Con';
        selfAtoB = isMaleA ? 'Cha' : 'Mẹ';
        titleBtoA = selfAtoB;
        selfBtoA = titleAtoB;
      }
    } else if (diff === 0) {
      const isDirectSibling =
        (personA.fatherId && personA.fatherId === personB.fatherId) ||
        (personA.motherId && personA.motherId === personB.motherId);

      kinName = isDirectSibling ? 'Anh chị em ruột' : 'Anh chị em họ';
      const aOlder = (personA.birthDate || '') < (personB.birthDate || '');

      if (aOlder) {
        titleAtoB = isMaleB ? 'Em trai' : 'Em gái';
        selfAtoB = isMaleA ? 'Anh' : 'Chị';
        titleBtoA = selfAtoB;
        selfBtoA = titleAtoB;
      } else {
        titleAtoB = isMaleB ? 'Anh họ' : 'Chị họ';
        selfAtoB = 'Em';
        titleBtoA = 'Em';
        selfBtoA = titleAtoB;
      }
    } else if (diff === -1) {
      kinName = isMaleB ? 'Bác / Chú' : 'Cô / Bác gái';
      titleAtoB = isMaleB ? 'Bác/Chú' : 'Cô';
      selfAtoB = 'Cháu';
      titleBtoA = 'Cháu';
      selfBtoA = titleAtoB;
    } else if (diff === 1) {
      kinName = 'Cháu';
      titleAtoB = 'Cháu';
      selfAtoB = isMaleA ? 'Bác/Chú' : 'Cô';
      titleBtoA = selfAtoB;
      selfBtoA = titleAtoB;
    } else if (diff === -2) {
      kinName = isMaleB ? 'Ông nội / Ông' : 'Bà nội / Bà';
      titleAtoB = isMaleB ? 'Ông' : 'Bà';
      selfAtoB = 'Cháu';
      titleBtoA = 'Cháu';
      selfBtoA = titleAtoB;
    } else if (diff === 2) {
      kinName = 'Cháu';
      titleAtoB = 'Cháu';
      selfAtoB = isMaleA ? 'Ông' : 'Bà';
      titleBtoA = selfAtoB;
      selfBtoA = titleAtoB;
    } else if (diff <= -3) {
      kinName = diff === -3 ? (isMaleB ? 'Cụ Ông' : 'Cụ Bà') : (isMaleB ? 'Kỵ Ông' : 'Kỵ Bà');
      titleAtoB = isMaleB ? 'Cụ' : 'Cụ Bà';
      selfAtoB = diff === -3 ? 'Chắt' : 'Chút';
      titleBtoA = selfAtoB;
      selfBtoA = titleAtoB;
    } else if (diff >= 3) {
      kinName = diff === 3 ? 'Chắt' : 'Chút';
      titleAtoB = diff === 3 ? 'Chắt' : 'Chút';
      selfAtoB = isMaleA ? 'Cụ' : 'Cụ Bà';
      titleBtoA = selfAtoB;
      selfBtoA = titleAtoB;
    }

    const pathNodes: PathNode[] = foundPath.map((nodeId, idx) => {
      const m = members.find((x) => x.id === nodeId);
      return {
        id: nodeId,
        fullName: m?.fullName || 'Thành viên',
        generation: m?.generation,
        gender: m?.gender as any,
        relationToNext: idx < foundRels.length ? foundRels[idx] : undefined,
      };
    });

    setResult({
      found: foundPath.length > 0,
      relationshipName: kinName,
      callingTitleAtoB: titleAtoB,
      selfPronounAtoB: selfAtoB,
      callingTitleBtoA: titleBtoA,
      selfPronounBtoA: selfBtoA,
      sampleGreetingAtoB: `Kính thưa ${titleAtoB} ${personB.fullName}, ${selfAtoB} là ${personA.fullName} thuộc Đời thứ ${genA} xin kính chào.`,
      sampleGreetingBtoA: `Chào ${titleBtoA} ${personA.fullName}, ${selfBtoA} là ${personB.fullName} thuộc Đời thứ ${genB}.`,
      generationDiff: diff,
      pathNodes,
      description: foundPath.length
        ? `Đường kết nối phả hệ qua ${foundPath.length - 1} bước quan hệ trực tiếp.`
        : 'Chưa tìm thấy đường liên kết trực tiếp giữa hai thành viên trong dữ liệu hiện có.',
    });

    setCalculating(false);
  };

  // Tra cứu tổ tiên / hậu duệ trong Tab 2
  const handleLineageLookup = async (pId: string) => {
    if (!pId || !effectiveFamilyId) return;
    setLoadingLineage(true);
    const curr = members.find((m) => m.id === pId);
    if (!curr) {
      setLoadingLineage(false);
      return;
    }

    try {
      const [ancRes, descRes] = await Promise.all([
        fetchPersonAncestors(effectiveFamilyId, pId).catch(() => []),
        fetchPersonDescendants(effectiveFamilyId, pId).catch(() => []),
      ]);

      if (ancRes && ancRes.length > 0) {
        setAncestors(
          ancRes.map((item) => ({
            id: item.person.id,
            fullName: item.person.fullName,
            gender: item.person.gender as any,
            generation: item.person.generation,
            isAlive: item.person.isLiving,
            status: item.person.status as any,
          }))
        );
      } else {
        setAncestors(members.filter((m) => (m.generation || 1) < (curr.generation || 1)));
      }

      if (descRes && descRes.length > 0) {
        setDescendants(
          descRes.map((item) => ({
            id: item.person.id,
            fullName: item.person.fullName,
            gender: item.person.gender as any,
            generation: item.person.generation,
            isAlive: item.person.isLiving,
            status: item.person.status as any,
          }))
        );
      } else {
        setDescendants(members.filter((m) => (m.generation || 1) > (curr.generation || 1)));
      }
    } catch {
      setAncestors(members.filter((m) => (m.generation || 1) < (curr.generation || 1)));
      setDescendants(members.filter((m) => (m.generation || 1) > (curr.generation || 1)));
    } finally {
      setLoadingLineage(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'lineage' && lineagePersonId) {
      handleLineageLookup(lineagePersonId);
    }
  }, [activeTab, lineagePersonId]);

  // Bộ lọc danh sách dropdown
  const filteredMembersA = useMemo(() => {
    const q = searchFilterA.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.fullName.toLowerCase().includes(q) || String(m.generation).includes(q)
    );
  }, [members, searchFilterA]);

  const filteredMembersB = useMemo(() => {
    const q = searchFilterB.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) => m.fullName.toLowerCase().includes(q) || String(m.generation).includes(q)
    );
  }, [members, searchFilterB]);

  return (
    <div className="rel-finder-container">
      {/* Banner đầu trang */}
      <div className="rel-finder-banner">
        <div className="rel-banner-content">
          <div className="rel-banner-badges">
            <span className="rel-banner-tag">Hệ thống gia phả liên họ</span>
            <span className={`rel-lineage-pill ${isMaternal ? 'maternal' : 'paternal'}`}>
              {lineageType ? (isMaternal ? 'Bên Ngoại' : 'Bên Nội') : 'Chính Tộc'}
            </span>
          </div>
          <h1 className="rel-banner-title">Tra Cứu Quan Hệ & Cách Xưng Hô</h1>
          <p className="rel-banner-desc">
            Không gian dòng họ: <strong>{clanDisplayName}</strong>. Xác định mối liên kết gia phả giữa 2 thành viên và gợi ý quy chuẩn xưng hô truyền thống thuần phong mỹ tục Việt Nam.
          </p>
        </div>

        {canManage && onNavigateTab && (
          <button
            type="button"
            className="rel-manage-link-btn"
            onClick={() => onNavigateTab('family-relations')}
          >
            Quản lý quan hệ phả hệ →
          </button>
        )}
      </div>

      {/* Thanh Navigation Tabs (đã bỏ icon thừa) */}
      <div className="rel-navigation-tabs">
        <button
          type="button"
          className={`rel-nav-tab ${activeTab === 'finder' ? 'active' : ''}`}
          onClick={() => setActiveTab('finder')}
        >
          Xác định quan hệ A - B
        </button>
        <button
          type="button"
          className={`rel-nav-tab ${activeTab === 'lineage' ? 'active' : ''}`}
          onClick={() => setActiveTab('lineage')}
        >
          Tra cứu Tổ tiên & Hậu duệ
        </button>
        <button
          type="button"
          className={`rel-nav-tab ${activeTab === 'guide' ? 'active' : ''}`}
          onClick={() => setActiveTab('guide')}
        >
          Cẩm nang Xưng hô Cửu tộc
        </button>
      </div>

      {loading ? (
        <div className="rel-loading-card">
          <div className="rel-spinner" />
          <span>Đang tải cơ sở dữ liệu gia tộc...</span>
        </div>
      ) : activeTab === 'finder' ? (
        /* TAB 1: TRA CỨU QUAN HỆ 2 NGƯỜI */
        <div className="rel-tab-content">
          {/* Khối Chọn 2 Người */}
          <div className="rel-selection-grid">
            {/* Person A */}
            <div className="rel-person-picker-card">
              <div className="rel-picker-header">
                <span className="rel-badge-step a">Person thứ nhất</span>
                {myPerson && personAId === myPerson.id && (
                  <span className="rel-me-badge">Chính bạn</span>
                )}
              </div>

              <div className="rel-search-input-wrap">
                <input
                  type="text"
                  placeholder="Tìm nhanh theo tên Person thứ nhất..."
                  value={searchFilterA}
                  onChange={(e) => setSearchFilterA(e.target.value)}
                  className="rel-search-box"
                />
              </div>

              <select
                className="rel-dropdown-select"
                value={personAId}
                onChange={(e) => handleSelectPersonA(e.target.value)}
                aria-label="Chọn Person thứ nhất"
              >
                <option value="">Chọn Person thứ nhất</option>
                {filteredMembersA.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} (Đời {m.generation || 1} • {m.gender === 'female' ? 'Nữ' : 'Nam'})
                  </option>
                ))}
              </select>

              {pA && (
                <div className="rel-person-mini-card">
                  <div className={`rel-avatar-circle ${pA.gender === 'female' ? 'female' : 'male'}`}>
                    {pA.fullName.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="rel-person-meta">
                    <strong className="rel-person-name">{pA.fullName}</strong>
                    <div className="rel-person-chips">
                      <span className="rel-chip">Đời {pA.generation || 1}</span>
                      <span className="rel-chip">{pA.gender === 'female' ? 'Nữ giới' : 'Nam giới'}</span>
                      <span className={`rel-chip ${pA.isAlive === false ? 'deceased' : 'alive'}`}>
                        {pA.isAlive === false ? 'Đã mất' : 'Còn sống'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Nút Hoán Đổi Trung Tâm */}
            <div className="rel-swap-center">
              <button
                type="button"
                className="rel-swap-big-btn"
                onClick={handleSwap}
                title="Đổi vị trí giữa Person thứ nhất và Person thứ hai"
                aria-label="Hoán đổi vị trí"
              >
                ⇄
              </button>
            </div>

            {/* Person B */}
            <div className="rel-person-picker-card">
              <div className="rel-picker-header">
                <span className="rel-badge-step b">Person thứ hai</span>
              </div>

              <div className="rel-search-input-wrap">
                <input
                  type="text"
                  placeholder="Tìm nhanh theo tên Person thứ hai..."
                  value={searchFilterB}
                  onChange={(e) => setSearchFilterB(e.target.value)}
                  className="rel-search-box"
                />
              </div>

              <select
                className="rel-dropdown-select"
                value={personBId}
                onChange={(e) => handleSelectPersonB(e.target.value)}
                aria-label="Chọn Person thứ hai"
              >
                <option value="">Chọn Person thứ hai</option>
                {filteredMembersB.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} (Đời {m.generation || 1} • {m.gender === 'female' ? 'Nữ' : 'Nam'})
                  </option>
                ))}
              </select>

              {pB && (
                <div className="rel-person-mini-card">
                  <div className={`rel-avatar-circle ${pB.gender === 'female' ? 'female' : 'male'}`}>
                    {pB.fullName.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="rel-person-meta">
                    <strong className="rel-person-name">{pB.fullName}</strong>
                    <div className="rel-person-chips">
                      <span className="rel-chip">Đời {pB.generation || 1}</span>
                      <span className="rel-chip">{pB.gender === 'female' ? 'Nữ giới' : 'Nam giới'}</span>
                      <span className={`rel-chip ${pB.isAlive === false ? 'deceased' : 'alive'}`}>
                        {pB.isAlive === false ? 'Đã mất' : 'Còn sống'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Nút Kích Hoạt Tính Toán */}
          <div className="rel-action-row">
            <button
              type="button"
              className="rel-calculate-main-btn"
              onClick={handleCalculate}
              disabled={calculating || !personAId || !personBId}
            >
              {calculating ? 'Đang phân tích quan hệ...' : 'Phân tích quan hệ & Gợi ý xưng hô'}
            </button>
          </div>

          {/* KHỐI KẾT QUẢ PHÂN TÍCH: Chỉ hiển thị khi đã chọn và bấm phân tích */}
          {result && (
            <div className="rel-analysis-result-card">
              <div className="rel-result-top-banner">
                <div className="rel-result-title-group">
                  <span className="rel-kinship-category-badge">Kết quả tra cứu phả hệ</span>
                  <h2 className="rel-kinship-main-title">{result.relationshipName}</h2>
                </div>
                <div className="rel-generation-gap-badge">
                  {result.generationDiff === 0
                    ? 'Cùng thế hệ'
                    : result.generationDiff > 0
                    ? `Cách ${result.generationDiff} đời`
                    : `Cách ${Math.abs(result.generationDiff)} đời`}
                </div>
              </div>

              {/* Hộp Thoại Xưng Hô 2 Chiều */}
              <div className="rel-dialogue-grid">
                <div className="rel-dialogue-card a-to-b">
                  <div className="rel-dialogue-speaker">
                    <span className="rel-speaker-tag">Person thứ nhất gọi Person thứ hai</span>
                    <strong className="rel-speaker-name">
                      {pA?.fullName} ➔ {pB?.fullName}
                    </strong>
                  </div>
                  <div className="rel-calling-statement">
                    Gọi là: <span className="highlight blue">{result.callingTitleAtoB}</span> • Xưng là:{' '}
                    <span className="highlight green">{result.selfPronounAtoB}</span>
                  </div>
                  <p className="rel-sample-sentence">"{result.sampleGreetingAtoB}"</p>
                </div>

                <div className="rel-dialogue-card b-to-a">
                  <div className="rel-dialogue-speaker">
                    <span className="rel-speaker-tag">Person thứ hai gọi Person thứ nhất</span>
                    <strong className="rel-speaker-name">
                      {pB?.fullName} ➔ {pA?.fullName}
                    </strong>
                  </div>
                  <div className="rel-calling-statement">
                    Gọi là: <span className="highlight purple">{result.callingTitleBtoA}</span> • Xưng là:{' '}
                    <span className="highlight green">{result.selfPronounBtoA}</span>
                  </div>
                  <p className="rel-sample-sentence">"{result.sampleGreetingBtoA}"</p>
                </div>
              </div>

              {/* Sơ Đồ Chuỗi Đường Đi Liên Kết */}
              {result.pathNodes && result.pathNodes.length > 0 && (
                <div className="rel-path-section">
                  <h4 className="rel-path-heading">Sơ đồ chuỗi đường đi quan hệ gia phả:</h4>
                  <div className="rel-path-flow">
                    {result.pathNodes.map((node, idx) => (
                      <React.Fragment key={node.id}>
                        <div
                          className={`rel-path-node ${
                            node.id === personAId ? 'start' : node.id === personBId ? 'end' : ''
                          }`}
                        >
                          <div className="rel-node-avatar">
                            {node.fullName.trim().charAt(0).toUpperCase()}
                          </div>
                          <div className="rel-node-info">
                            <span className="rel-node-name">{node.fullName}</span>
                            <span className="rel-node-gen">Đời {node.generation || '?'}</span>
                          </div>
                        </div>

                        {idx < result.pathNodes.length - 1 && (
                          <div className="rel-path-link-step">
                            <span className="rel-link-label">{node.relationToNext || 'kết nối'}</span>
                            <span className="rel-link-arrow">➔</span>
                          </div>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}

              <div className="rel-footer-note">
                <span>{result.description}</span>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'lineage' ? (
        /* TAB 2: TRA CỨU TỔ TIÊN & HẬU DUỆ */
        <div className="rel-tab-content">
          <div className="rel-lineage-picker-row">
            <div className="rel-lineage-input-group">
              <label className="rel-lineage-label">Chọn thành viên cần tra cứu dòng dõi:</label>
              <select
                className="rel-dropdown-select"
                value={lineagePersonId}
                onChange={(e) => setLineagePersonId(e.target.value)}
              >
                <option value="">Chọn thành viên</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.fullName} (Đời {m.generation || 1} • {m.gender === 'female' ? 'Nữ' : 'Nam'})
                  </option>
                ))}
              </select>
            </div>

            {myPerson && (
              <button
                type="button"
                className="rel-lineage-me-btn"
                onClick={() => setLineagePersonId(myPerson.id)}
              >
                Tra cứu dòng dõi của tôi
              </button>
            )}
          </div>

          {loadingLineage ? (
            <div className="rel-loading-card">
              <div className="rel-spinner" />
              <span>Đang tính toán nhánh phả hệ...</span>
            </div>
          ) : (
            <div className="rel-lineage-two-cols">
              {/* Cột Tổ Tiên */}
              <div className="rel-lineage-col ancestors">
                <div className="rel-col-header">
                  <div>
                    <h3 className="rel-col-title">Tổ Tiên / Bậc Tiền Bối</h3>
                    <p className="rel-col-subtitle">
                      Các thế hệ đời trước truyền thừa huyết thống ({ancestors.length})
                    </p>
                  </div>
                </div>

                <div className="rel-members-list-stack">
                  {ancestors.length === 0 ? (
                    <div className="rel-empty-list">Không có thông tin thế hệ tiền bối nào trong dữ liệu.</div>
                  ) : (
                    ancestors.map((item) => (
                      <div key={item.id} className="rel-member-item-row">
                        <div className="rel-item-left">
                          <span className={`rel-mini-avatar ${item.gender === 'female' ? 'female' : 'male'}`}>
                            {item.fullName.trim().charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <strong className="rel-item-name">{item.fullName}</strong>
                            <span className="rel-item-sub">
                              {item.gender === 'female' ? 'Nữ giới' : 'Nam giới'}
                            </span>
                          </div>
                        </div>
                        <span className="rel-item-gen-pill">Đời {item.generation || 1}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Cột Hậu Duệ */}
              <div className="rel-lineage-col descendants">
                <div className="rel-col-header">
                  <div>
                    <h3 className="rel-col-title">Hậu Duệ / Bậc Con Cháu</h3>
                    <p className="rel-col-subtitle">
                      Các thế hệ đời sau nối dõi tông đường ({descendants.length})
                    </p>
                  </div>
                </div>

                <div className="rel-members-list-stack">
                  {descendants.length === 0 ? (
                    <div className="rel-empty-list">Chưa có thông tin thế hệ hậu duệ đời sau trong dữ liệu.</div>
                  ) : (
                    descendants.map((item) => (
                      <div key={item.id} className="rel-member-item-row">
                        <div className="rel-item-left">
                          <span className={`rel-mini-avatar ${item.gender === 'female' ? 'female' : 'male'}`}>
                            {item.fullName.trim().charAt(0).toUpperCase()}
                          </span>
                          <div>
                            <strong className="rel-item-name">{item.fullName}</strong>
                            <span className="rel-item-sub">
                              {item.gender === 'female' ? 'Nữ giới' : 'Nam giới'}
                            </span>
                          </div>
                        </div>
                        <span className="rel-item-gen-pill purple">Đời {item.generation || 1}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* TAB 3: CẨM NANG XƯNG HÔ CỬU TỘC */
        <div className="rel-tab-content">
          <div className="rel-guide-card">
            <h2 className="rel-guide-main-heading">Hệ Thống Cửu Tộc & Danh Xưng Truyền Thống</h2>
            <p className="rel-guide-lead">
              Phong tục Việt Nam coi trọng thứ bậc gia phả: <em>"Bé bằng củ khoai, cứ vai mà gọi"</em>. Danh xưng trong dòng họ được phân định theo đời thứ và nhánh tộc, không phụ thuộc vào tuổi tác ngoài đời sống thường nhật.
            </p>

            {/* Bảng Cửu Tộc 9 Đời */}
            <div className="rel-cuutoc-grid">
              <div className="rel-cuutoc-step">
                <span className="rel-cuutoc-num">Đời -4</span>
                <strong className="rel-cuutoc-name">Cao Tổ (Kỵ)</strong>
                <span className="rel-cuutoc-desc">Kỵ ông, Kỵ bà</span>
              </div>
              <div className="rel-cuutoc-step">
                <span className="rel-cuutoc-num">Đời -3</span>
                <strong className="rel-cuutoc-name">Tằng Tổ (Cụ)</strong>
                <span className="rel-cuutoc-desc">Cụ ông, Cụ bà</span>
              </div>
              <div className="rel-cuutoc-step">
                <span className="rel-cuutoc-num">Đời -2</span>
                <strong className="rel-cuutoc-name">Tổ Phụ (Ông/Bà)</strong>
                <span className="rel-cuutoc-desc">Ông nội, Bà nội, Ông ngoại, Bà ngoại</span>
              </div>
              <div className="rel-cuutoc-step">
                <span className="rel-cuutoc-num">Đời -1</span>
                <strong className="rel-cuutoc-name">Phụ Mẫu (Cha/Mẹ)</strong>
                <span className="rel-cuutoc-desc">Cha, Mẹ, Bác, Chú, Cô, Cậu, Dì</span>
              </div>
              <div className="rel-cuutoc-step highlight">
                <span className="rel-cuutoc-num">Đời 0</span>
                <strong className="rel-cuutoc-name">Bản Thân (Tôi)</strong>
                <span className="rel-cuutoc-desc">Anh, Chị, Em ruột, Anh em họ</span>
              </div>
              <div className="rel-cuutoc-step">
                <span className="rel-cuutoc-num">Đời +1</span>
                <strong className="rel-cuutoc-name">Tử (Con)</strong>
                <span className="rel-cuutoc-desc">Con trai, Con gái, Con dâu, Con rể</span>
              </div>
              <div className="rel-cuutoc-step">
                <span className="rel-cuutoc-num">Đời +2</span>
                <strong className="rel-cuutoc-name">Tôn (Cháu)</strong>
                <span className="rel-cuutoc-desc">Cháu nội, Cháu ngoại, Cháu họ</span>
              </div>
              <div className="rel-cuutoc-step">
                <span className="rel-cuutoc-num">Đời +3</span>
                <strong className="rel-cuutoc-name">Tằng Tôn (Chắt)</strong>
                <span className="rel-cuutoc-desc">Chắt nội, Chắt ngoại</span>
              </div>
              <div className="rel-cuutoc-step">
                <span className="rel-cuutoc-num">Đời +4</span>
                <strong className="rel-cuutoc-name">Huyền Tôn (Chút)</strong>
                <span className="rel-cuutoc-desc">Chút chít nối tiếp dòng tộc</span>
              </div>
            </div>

            {/* Bảng phân biệt Bên Nội vs Bên Ngoại */}
            <div className="rel-rules-grid">
              <div className="rel-rule-card">
                <h3 className="rel-rule-title blue">Quy chuẩn xưng hô Bên Nội (Phụ hệ)</h3>
                <ul className="rel-rule-list">
                  <li><strong>Anh của Cha:</strong> Bác (Vợ gọi là Bác gái).</li>
                  <li><strong>Em trai của Cha:</strong> Chú (Vợ gọi là Thím).</li>
                  <li><strong>Chị / Em gái của Cha:</strong> Cô (Chồng gọi là Dượng / Chú dượng).</li>
                  <li><strong>Con của Bác / Chú / Cô:</strong> Anh em con chú con bác (Nội tộc trực hệ).</li>
                </ul>
              </div>

              <div className="rel-rule-card">
                <h3 className="rel-rule-title purple">Quy chuẩn xưng hô Bên Ngoại (Mẫu hệ)</h3>
                <ul className="rel-rule-list">
                  <li><strong>Anh / Em trai của Mẹ:</strong> Cậu (Vợ gọi là Mợ).</li>
                  <li><strong>Chị / Em gái của Mẹ:</strong> Dì (Chồng gọi là Dượng).</li>
                  <li><strong>Con của Cậu / Dì:</strong> Anh em con cô con cậu, con bạn dì (Ngoại tộc).</li>
                  <li><strong>Dâu & Rể:</strong> "Dâu theo họ chồng, Rể xưng theo họ vợ" trong các dịp nghi lễ gia tộc.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RelationshipFinder;
