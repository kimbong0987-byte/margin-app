import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { supabase } from './supabaseClient'; 

// 💡 텍스트 비교 시 띄어쓰기(공백)만 안전하게 제거하는 함수
const cleanStr = (s) => String(s || "").replace(/\s+/g, '').toUpperCase();

// 💡 브랜드와 품번을 결합하여 고유한 키를 만드는 함수
const makeKey = (brand, code) => `${brand}|||${code}`;

// 💡 바코드 정규화: 색상+사이즈 접미사, 2자리 색상 접미사, 세대구분자(3/7) 제거
// MW3EBWPL84BK064 → MWEBWPL84
// MW7EBWPL841BK064 → MWEBWPL841  (리오더, 숫자 1자리 확장)
// PE3HFURL73MG → PEHFURL73      (색상2자만 있을 때도 제거)
// TS5STS561RE → TS5STS561       (세대구분자 없는 코드는 색상만 제거)
const normalizeBarcode = (code) => {
  let s = cleanStr(code);
  // 1) 끝 색상+사이즈 제거: 영문2자+숫자3자 (예: BK064, NA095)
  s = s.replace(/[A-Z]{2}\d{3}$/, '');
  // 2) 끝 색상2자만 제거 (예: MG, RE, BK) - 위에서 안 걸린 경우
  s = s.replace(/[A-Z]{2}$/, '');
  // 3) 세대구분자 제거: 브랜드 알파벳 뒤의 3 또는 7 (뒤에 알파벳이 올 때만)
  s = s.replace(/^([A-Z]+)[37](?=[A-Z])/, '$1');
  return s;
};

// 💡 몽벨 스타일코드 매칭: 브랜드+세대(MW3/MW7) 제거 후 베이스+색상코드로 비교
// 리오더suffix(베이스 끝 1자리 숫자/문자) 차이 허용, 색상코드(BK/NA/WH)는 구분
// MW3FMMOH821 ↔ MW7FMMOH82BK → FMMOH82 + (no color vs BK) → MATCH (리오더suffix 1자리 차이)
// MW3EBWPL84BK ↔ MW7EBWPL84BK → EBWPL84+BK vs EBWPL84+BK → MATCH
// MW3EBWPL84BK ↔ MW7EBWPL84NA → 색상 BK≠NA → NO MATCH
const mwStyleMatch = (a, b) => {
  if (!a || !b) return false;
  // 브랜드 + 세대구분자(3 또는 7) 제거
  const stripBrandGen = s => cleanStr(s).replace(/^[A-Z]+[37](?=[A-Z])/, '');
  // 끝 2자리 대문자(색상코드) 추출: 앞이 숫자/기호일 때만 (BK, NA, WH 등)
  const extractColorBase = s => {
    const m = s.match(/^(.*[^A-Z])([A-Z]{2})$/);
    return m ? { base: m[1], color: m[2] } : { base: s, color: '' };
  };
  const pa = extractColorBase(stripBrandGen(a));
  const pb = extractColorBase(stripBrandGen(b));
  // 양쪽 모두 색상 있으면 반드시 일치
  if (pa.color && pb.color && pa.color !== pb.color) return false;
  // 베이스코드 비교: 리오더suffix 1자리 차이 허용
  if (pa.base === pb.base) return true;
  const shorter = pa.base.length <= pb.base.length ? pa.base : pb.base;
  const longer  = pa.base.length <= pb.base.length ? pb.base : pa.base;
  if (longer.startsWith(shorter) && longer.length - shorter.length === 1) return true;
  return false;
};

// 💡 두 코드가 동일 상품인지 비교 (리오더 숫자 확장 + 브랜드 접두사 포함 케이스)
const codesMatch = (a, b) => {
  if (!a || !b) return false;
  const na = normalizeBarcode(a);
  const nb = normalizeBarcode(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // 리오더: 숫자 1자리만 확장된 경우 (예: MWEBWPL84 ↔ MWEBWPL841)
  const shorter = na.length <= nb.length ? na : nb;
  const longer  = na.length <= nb.length ? nb : na;
  if (longer.startsWith(shorter) && (longer.length - shorter.length) === 1 && /\d$/.test(longer)) return true;
  // 브랜드 접두사 포함 케이스: style_no가 정규화된 바코드 안에 포함될 때
  // 예) style_no=GAWJW212, normalized_barcode=MWGAWJW212 → 포함 ✓
  if (nb.length >= 5 && na.includes(nb)) return true;
  if (na.length >= 5 && nb.includes(na)) return true;
  return false;
};

// 💡 바코드/스타일코드로 DB 상품 검색 (style_no → barcode목록 → code 순서)
const findProductByBarcode = (barcode, allProducts) => {
  if (!barcode) return null;
  const bc = cleanStr(barcode);
  if (!bc || bc.length < 4) return null;
  let p = allProducts.find(p => p.style_no && codesMatch(p.style_no, bc));
  if (p) return p;
  p = allProducts.find(p =>
    String(p.barcode || '').split(',').map(cleanStr).some(b => b && codesMatch(b, bc))
  );
  if (p) return p;
  p = allProducts.find(p => p.code && codesMatch(p.code, bc));
  return p || null;
};

function App() {
  // ==========================================
  // 1. 상태 관리
  // ==========================================
  const [activeMenu, setActiveMenu] = useState('list'); 
  const [masterProducts, setMasterProducts] = useState([]);
  const [groups, setGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);     
  const [seasons, setSeasons] = useState([]);   
  const [newCatInput, setNewCatInput] = useState('');
  const [newBrandInput, setNewBrandInput] = useState('');
  const [newSeasonInput, setNewSeasonInput] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);

  const [searchInput, setSearchInput] = useState(''); 
  const [searchTerm, setSearchTerm] = useState('');

  const [filterCategory, setFilterCategory] = useState('전체');
  const [filterBrand, setFilterBrand] = useState('전체');
  const [filterSeason, setFilterSeason] = useState('전체');
  const [filterType, setFilterType] = useState('전체');
  const [sortConfig, setSortConfig] = useState({ key: 'code', direction: 'asc' });
  const [selectedCodes, setSelectedCodes] = useState([]); 

  const [batchInput, setBatchInput] = useState({ 
    cost: '', tagPrice: '', priceNaver: '', priceCoupang: '', priceRocket: '', priceGold: '', priceSale: '' 
  });
  

  const [tempChild, setTempChild] = useState({ 
    brand: '', season: '', category: '', 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' 
  });
  const [groupInput, setGroupInput] = useState({ 
    brand: '', season: '', type: '묶음', category: '', groupCode: '', styleNo: '', groupName: '', cost: '', tagPrice: '', children: [] 
  });

  const [priceTemplateBrand, setPriceTemplateBrand] = useState('');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [collapsedGroups, setCollapsedGroups] = useState([]);

  // 인라인 셀 편집
  const [editingCell, setEditingCell] = useState(null); // { key, field }
  const [editingCellValue, setEditingCellValue] = useState('');
  const isSavingCellRef = React.useRef(false);


  // 가격 변경 전 값 기록 (변경 시점마다 갱신)
  const [localPrev, setLocalPrev] = useState({});
  // 라온팩토리 재고양식 업로드 시 SKU→바코드(사이즈제거) 맵 캐시 (발주핸들러 재사용)
  const [raonSkuMap, setRaonSkuMap] = useState({});

  // 엑셀 업로드 신규 항목 확인 팝업
  const [pendingExcelUpload, setPendingExcelUpload] = useState(null); // { rows, newBrands, newCategories, newSeasons }

  // 수수료율 / 고정비 설정 (Supabase 저장)
  const [feeRate, setFeeRate] = useState(18);
  const [feeRateInput, setFeeRateInput] = useState('18');
  const [fixedCost, setFixedCost] = useState(5000);
  const [fixedCostInput, setFixedCostInput] = useState('5000');

  const fetchSettings = async () => {
    const { data } = await supabase.from('settings').select('*');
    if (data) {
      const fr = data.find(d => d.key === 'feeRate');
      const fc = data.find(d => d.key === 'fixedCost');
      if (fr) { setFeeRate(Number(fr.value)); setFeeRateInput(fr.value); }
      if (fc) { setFixedCost(Number(fc.value)); setFixedCostInput(fc.value); }
    }
  };

  const handleFeeRateChange = async (val) => {
    setFeeRateInput(val);
    const n = Number(val);
    if (!isNaN(n) && n >= 0 && n <= 100) {
      setFeeRate(n);
      await supabase.from('settings').update({ value: String(n) }).eq('key', 'feeRate');
    }
  };

  const handleFixedCostChange = async (val) => {
    setFixedCostInput(val);
    const n = Number(val);
    if (!isNaN(n) && n >= 0) {
      setFixedCost(n);
      await supabase.from('settings').update({ value: String(n) }).eq('key', 'fixedCost');
    }
  };

  // ==========================================
  // 2. 초기 데이터 로드
  // ==========================================
  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    fetchData();
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeMenu]);

  const fetchData = async () => {
    try {
      const { data: catData } = await supabase.from('categories').select('*').order('name');
      const { data: brdData } = await supabase.from('brands').select('*').order('name');
      const { data: seaData } = await supabase.from('seasons').select('*').order('name');
      const { data: prodData } = await supabase.from('master_products').select('*');
      const { data: groupData } = await supabase.from('groups').select('*');
      
      if (catData) setCategories(catData.map(c => c.name));
      if (brdData) setBrands(brdData.map(b => b.name));
      if (seaData) setSeasons(seaData.map(s => s.name));
      if (prodData) setMasterProducts(prodData);
      if (groupData) setGroups(groupData);
    } catch (e) { 
      console.error("데이터 로드 실패:", e); 
    }
  };

  // ==========================================
  // 3. 유틸리티 및 데이터 가공
  // ==========================================
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getDiffColor = (original, current) => {
    const orig = Number(original || 0); const curr = Number(current || 0);
    if (!curr || orig === curr) return 'inherit';
    return curr > orig ? '#2980b9' : '#e74c3c'; 
  };

  const toggleGroup = (itemKey) => {
    setCollapsedGroups(prev => prev.includes(itemKey) ? prev.filter(c => c !== itemKey) : [...prev, itemKey]);
  };

  const handleExpandAll = () => setCollapsedGroups([]);
  const handleCollapseAll = () => setCollapsedGroups(groups.map(g => makeKey(g.brand, g.code)));

  const processedData = useMemo(() => {
    const masterMap = new Map();
    masterProducts.forEach(p => masterMap.set(makeKey(p.brand, p.code), p));

    const term = (searchTerm || '').toLowerCase().trim();

    const isMatch = (item) => {
      const matchCat = filterCategory === '전체' || item.category === filterCategory;
      const matchBrand = filterBrand === '전체' || item.brand === filterBrand;
      const matchSeason = filterSeason === '전체' || item.season === filterSeason;
      const typeStr2 = String(item.type || '');
      const matchType = filterType === '전체'
        || (filterType === '묶음' && typeStr2.includes('묶음'))
        || (filterType === '세트' && typeStr2.includes('세트'))
        || (filterType === '단품' && !typeStr2.includes('묶음') && !typeStr2.includes('세트'));
      
      let searchString = String(item.code || "") + String(item.style_no || "") + String(item.name || "");
      if (item.children && Array.isArray(item.children)) {
          item.children.forEach(c => {
              searchString += String(c.code || "") + String(c.name || "");
          });
      }
      const matchSearch = term === '' || searchString.toLowerCase().includes(term);

      return matchCat && matchBrand && matchSeason && matchSearch && matchType;
    };

    const matchedGroups = groups.filter(isMatch).map(g => ({ ...g, type: g.type || '묶음' }));
    const matchedSingles = masterProducts.filter(isMatch).map(p => ({ ...p, type: '단품' }));

    // 묶음 자식 → 단품 행 없음 / 세트 자식(묶음에도 없는 경우) → 단품 행 있음
    const bundleChildCodes = new Set();  // 묶음 자식
    const setChildCodes = new Set();     // 세트 자식
    matchedGroups.forEach(g => {
      const typeStr = String(g.type || '');
      if (!g.children) return;
      g.children.forEach(c => {
        const childKey = makeKey(g.brand, c.code);
        if (!masterMap.has(childKey)) return;
        if (typeStr.includes('묶음')) bundleChildCodes.add(childKey);
        else if (typeStr.includes('세트')) setChildCodes.add(childKey);
      });
    });
    // 묶음 자식 → 단품 행 없음 / 세트 자식(묶음에 없는 경우) → 단품 행 유지
    const standaloneSingles = matchedSingles.filter(s =>
      !bundleChildCodes.has(makeKey(s.brand, s.code))
    );
    let topLevel = [...matchedGroups, ...standaloneSingles];

    topLevel = topLevel.map(item => {
       let calcItem = { ...item };
       
       calcItem.order_w1 = Number(calcItem.order_w1 || 0);
       calcItem.order_w2 = Number(calcItem.order_w2 || 0);
       calcItem.order_w3 = Number(calcItem.order_w3 || 0);
       calcItem.stock = Number(calcItem.stock || 0);
       calcItem.hq_stock = Number(calcItem.hq_stock || 0);

       const typeStr = String(calcItem.type || '');
       if ((typeStr.includes('묶음') || typeStr.includes('세트')) && calcItem.children && calcItem.children.length > 0) {
           let sumW1 = 0, sumW2 = 0, sumW3 = 0, sumStock = 0, sumHqStock = 0;
           calcItem.children.forEach(childSnapshot => {
               const liveChild = masterMap.get(makeKey(calcItem.brand, childSnapshot.code));
               if (!liveChild) return; 

               sumW1 += Number(liveChild.order_w1 || 0);
               sumW2 += Number(liveChild.order_w2 || 0);
               sumW3 += Number(liveChild.order_w3 || 0);
               sumStock += Number(liveChild.stock || 0);
               sumHqStock += Number(liveChild.hq_stock || 0);
           });
           
           calcItem.order_w1 = sumW1;
           calcItem.order_w2 = sumW2;
           calcItem.order_w3 = sumW3;
           calcItem.stock = sumStock;       
           calcItem.hq_stock = sumHqStock; 
       }
       
       const cost = Number(calcItem.cost || 0);
       const sale = Number(calcItem.price_sale || 0);
       calcItem.margin = (sale - Math.floor(sale * (feeRate / 100))) - cost - fixedCost;

       return calcItem;
    });

    topLevel.sort((a, b) => {
      let vA = a[sortConfig.key]; let vB = b[sortConfig.key];
      if (['cost', 'tag_price', 'price_sale', 'margin', 'stock', 'hq_stock', 'order_w1', 'order_w2', 'order_w3'].includes(sortConfig.key)) { 
        vA = Number(vA || 0); vB = Number(vB || 0); 
      } else { 
        vA = String(vA || "").toLowerCase(); vB = String(vB || "").toLowerCase(); 
      }
      if (vA < vB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (vA > vB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    const expandedResult = [];
    const renderedChildKeys = new Set();

    topLevel.forEach(item => {
      expandedResult.push(item);
      
      const typeStr = String(item.type || '');
      if ((typeStr.includes('묶음') || typeStr.includes('세트')) && item.children) {
        item.children.forEach(childSnapshot => {
          const liveChild = masterMap.get(makeKey(item.brand, childSnapshot.code));
          if (!liveChild) return; 

          const childKey = makeKey(liveChild.brand, liveChild.code);
          const isGhost = renderedChildKeys.has(childKey);
          
          const w1 = Number(liveChild.order_w1 || 0);
          const w2 = Number(liveChild.order_w2 || 0);
          const w3 = Number(liveChild.order_w3 || 0);

          const parentIsSet = String(item.type||'').includes('세트');
          expandedResult.push({
            ...liveChild,
            brand: liveChild.brand || item.brand,
            season: liveChild.season || item.season,
            category: liveChild.category || item.category,
            type: `ㄴ${item.code}(구성)`,
            isMappedChild: true,
            parentIsSet,
            parentCode: item.code,
            parentBrand: item.brand,
            isGhost: parentIsSet ? true : isGhost, // 세트 자식은 항상 읽기전용
            order_w1: w1,
            order_w2: w2,
            order_w3: w3,
            stock: Number(liveChild.stock || 0),
            hq_stock: Number(liveChild.hq_stock || 0)
          });

          if (!isGhost) {
            renderedChildKeys.add(childKey);
          }
        });
      }
    });

    const mapped = expandedResult.map(item => {
      const cost = Number(item.cost || 0);
      const tag = Number(item.tag_price || 0);
      const sale = Number(item.price_sale || 0);
      const fee = Math.floor(sale * (feeRate / 100));
      const settle = sale - fee;
      const discSale = tag === 0 ? 0 : Math.round((1 - (sale / tag)) * 100);
      const margin = (sale - fee) - cost - fixedCost;

      // 변경 직전 값 (가격 바꿀 때마다 localPrev에 기록)
      const lp = localPrev[makeKey(item.brand, item.code)] || {};
      const prevSale    = Number(lp.price_sale    ?? item.price_sale    ?? 0);
      const prevNaver   = Number(lp.price_naver   ?? item.price_naver   ?? 0);
      const prevCoupang = Number(lp.price_coupang ?? item.price_coupang ?? 0);
      const prevRocket  = Number(lp.price_rocket  ?? item.price_rocket  ?? 0);
      const prevGold    = Number(lp.price_gold    ?? item.price_gold    ?? 0);
      const prevMargin  = (prevSale - Math.floor(prevSale * (feeRate / 100))) - cost - fixedCost;

      return {
        ...item, fee, settle, prevMargin, margin,
        prevSale, prevNaver, prevCoupang, prevRocket, prevGold,
        ratio: cost > 0 ? (sale / cost).toFixed(1) : "0.0", discSale
      };
    });

    return mapped.filter(item => {
      if (item.isMappedChild) return true; // 자식 행은 필터 통과
      const m = item.margin || 0;
      return true;
    });
  }, [masterProducts, groups, filterCategory, filterBrand, filterSeason, filterType, searchTerm, sortConfig, feeRate, fixedCost, localPrev]);

  const visibleData = useMemo(() => {
    return processedData.filter(item => {
       if (item.isMappedChild) {
           const pKey = makeKey(item.parentBrand, item.parentCode);
           return !collapsedGroups.includes(pKey);
       }
       return true;
    });
  }, [processedData, collapsedGroups]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      if (activeMenu === 'inventory') {
        setSelectedCodes(visibleData.map(item => makeKey(item.brand, item.code)));
      } else {
        setSelectedCodes(visibleData.filter(i => !i.isGhost).map(item => makeKey(item.brand, item.code)));
      }
    } else {
      setSelectedCodes([]);
    }
  };

  // ==========================================
  // 4. 데이터 저장 처리
  // ==========================================
  const addCategory = async () => { if(!newCatInput.trim()) return; await supabase.from('categories').insert([{name: newCatInput}]); setNewCatInput(''); fetchData(); };
  const deleteCategory = async (n) => { if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('categories').delete().eq('name',n); fetchData(); } };
  const addBrand = async () => { if(!newBrandInput.trim()) return; await supabase.from('brands').insert([{name: newBrandInput}]); setNewBrandInput(''); fetchData(); };
  const deleteBrand = async (n) => { if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('brands').delete().eq('name',n); fetchData(); } };
  const addSeason = async () => { if(!newSeasonInput.trim()) return; await supabase.from('seasons').insert([{name: newSeasonInput}]); setNewSeasonInput(''); fetchData(); };
  const deleteSeason = async (n) => { if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('seasons').delete().eq('name',n); fetchData(); } };

  const handleRegisterMaster = async () => {
    if (!tempChild.품번코드) return alert("❌ 품번코드(필수)를 입력해주세요.");
    if (!tempChild.brand) return alert("❌ 브랜드를 선택해주세요. (동일 품번 구분용)");

    const payload = { 
      brand: tempChild.brand, season: tempChild.season, category: tempChild.category, 
      code: tempChild.품번코드, style_no: tempChild.스타일넘버, name: tempChild.상품명, 
      cost: Number(tempChild.원가 || 0), tag_price: Number(tempChild.tag가 || 0) 
    };

    const { data: exist } = await supabase.from('master_products').select('code')
      .eq('code', tempChild.품번코드).eq('brand', tempChild.brand);
    
    let error;
    if (exist && exist.length > 0) {
      const res = await supabase.from('master_products').update(payload)
        .eq('code', tempChild.품번코드).eq('brand', tempChild.brand);
      error = res.error;
    } else {
      const res = await supabase.from('master_products').insert([payload]);
      error = res.error;
    }
    
    if (error) return alert(`❌ 단품 저장 실패!\n상세원인: ${error.message}`);

    alert("✅ 저장 완료"); 
    setTempChild({ brand: '', season: '', category: '', 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' }); 
    fetchData();
  };

  const handleSaveGroup = async () => {
    if (!groupInput.groupCode) return alert("❌ 그룹 관리용 품번을 입력해주세요.");
    if (!groupInput.brand) return alert("❌ 브랜드를 선택해주세요.");

    const safeChildren = Array.isArray(groupInput.children) 
      ? groupInput.children.map(c => ({ code: c.code, name: c.name })) 
      : [];

    const payload = { 
      brand: groupInput.brand, season: groupInput.season, type: groupInput.type, category: groupInput.category, 
      code: groupInput.groupCode, style_no: groupInput.styleNo, name: groupInput.groupName, 
      cost: Number(groupInput.cost || 0), tag_price: Number(groupInput.tagPrice || 0), 
      children: safeChildren 
    };

    const { data: exist } = await supabase.from('groups').select('code')
      .eq('code', groupInput.groupCode).eq('brand', groupInput.brand);
    
    let error;
    if (exist && exist.length > 0) {
      const res = await supabase.from('groups').update(payload)
        .eq('code', groupInput.groupCode).eq('brand', groupInput.brand);
      error = res.error;
    } else {
      const res = await supabase.from('groups').insert([payload]);
      error = res.error;
    }
    
    if (error) return alert(`❌ 그룹 저장 실패!\n원인: ${error.message}`);

    alert("✅ 그룹 저장(덮어쓰기) 완료"); 
    setGroupInput({ brand: '', season: '', type: '묶음', category: '', groupCode: '', styleNo: '', groupName: '', cost: '', tagPrice: '', children: [] }); 
    fetchData();
  };


  const handleBatchUpdate = async () => {
    if (!selectedCodes.length) return alert("선택된 상품이 없습니다.");
    const up = {};
    if (batchInput.cost) up.cost = Number(batchInput.cost);
    if (batchInput.tagPrice) up.tag_price = Number(batchInput.tagPrice);
    if (batchInput.priceNaver) up.price_naver = Number(batchInput.priceNaver);
    if (batchInput.priceCoupang) up.price_coupang = Number(batchInput.priceCoupang);
    if (batchInput.priceRocket) up.price_rocket = Number(batchInput.priceRocket);
    if (batchInput.priceGold) up.price_gold = Number(batchInput.priceGold);
    if (batchInput.priceSale) up.price_sale = Number(batchInput.priceSale);

    const promises = selectedCodes.map(key => {
       const [b, c] = key.split('|||');
       const tbl = groups.some(g => g.code === c && g.brand === b) ? 'groups' : 'master_products';
       return supabase.from(tbl).update(up).eq('code', c).eq('brand', b);
    });

    await Promise.all(promises);
    alert("✅ 일괄 변경 완료"); 
    setSelectedCodes([]); 
    fetchData();
  };

  const handleBatchDelete = async () => {
    if (!selectedCodes.length || !window.confirm("⚠️ 정말 삭제하시겠습니까?")) return;
    
    const promises = selectedCodes.map(key => {
        const [b, c] = key.split('|||');
        const tbl = groups.some(g => g.code === c && g.brand === b) ? 'groups' : 'master_products';
        return supabase.from(tbl).delete().eq('code', c).eq('brand', b);
    });

    await Promise.all(promises);
    alert("✅ 삭제 완료");
    setSelectedCodes([]);
    fetchData();
  };

  // 인라인 셀 저장 (숫자/텍스트 통합)
  const numericFields = ['cost','tag_price','price_naver','price_coupang','price_rocket','price_gold','price_sale','stock','hq_stock','order_w1','order_w2','order_w3'];
  const priceFields = ['price_sale','price_naver','price_coupang','price_rocket','price_gold'];

  const handleCellSave = async (item, field, value) => {
    if (isSavingCellRef.current) return;
    isSavingCellRef.current = true;
    const isNum = numericFields.includes(field);
    const saveVal = isNum ? Number(String(value).replace(/,/g,'') || 0) : String(value || '');
    if (isNum && priceFields.includes(field)) {
      const oldNum = Number(item[field] || 0);
      if (saveVal !== oldNum) {
        const ik = makeKey(item.brand, item.code);
        setLocalPrev(prev => ({ ...prev, [ik]: { ...(prev[ik]||{}), [field]: oldNum } }));
      }
    }
    const tbl = groups.some(g => g.code === item.code && g.brand === item.brand) ? 'groups' : 'master_products';
    await supabase.from(tbl).update({ [field]: saveVal }).eq('code', item.code).eq('brand', item.brand);
    setEditingCell(null);
    setEditingCellValue('');
    isSavingCellRef.current = false;
    fetchData();
  };

  // ==========================================
  // 📊 엑셀 처리 (★ 마스터 엑셀 업로드 버그 완벽 수정!)
  // ==========================================
  const handleExcelUpload = async () => {
    if (!selectedFile) return alert("파일을 선택해주세요.");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = XLSX.read(e.target.result, { type: 'binary' });
        const parsedRows = XLSX.utils.sheet_to_json(data.Sheets[data.SheetNames[0]], { defval: "" });
        
        const updatePromises = [];
        
        for (const i of parsedRows) {
            const payload = { 
              brand: String(i.브랜드 || '').trim(), 
              season: String(i.시즌 || '').trim(), 
              category: String(i.복종 || '미분류').trim(), 
              code: String(i.품번 || '').trim(), 
              style_no: String(i.스타일 || '').trim(), 
              name: String(i.상품명 || '').trim(), 
              cost: Number(String(i.원가 || "0").replace(/,/g, '')), 
              tag_price: Number(String(i.Tag가 || "0").replace(/,/g, '')) 
            };
            if(!payload.code || !payload.brand) continue;

            // 💡 더 이상 upsert를 쓰지 않고, 브랜드와 코드를 철저히 확인한 뒤 분기 처리합니다.
            const { data: exist } = await supabase.from('master_products')
              .select('code').eq('code', payload.code).eq('brand', payload.brand);
              
            if (exist && exist.length > 0) {
              updatePromises.push(supabase.from('master_products').update(payload).eq('code', payload.code).eq('brand', payload.brand));
            } else {
              updatePromises.push(supabase.from('master_products').insert([payload]));
            }
        }
        
        await Promise.all(updatePromises);
        alert("✅ 마스터 엑셀 일괄 업로드 성공!"); 
        setSelectedFile(null);
        fetchData();
      } catch (err) { 
        console.error(err);
        alert("❌ 엑셀 파싱 에러"); 
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const downloadListExcel = () => {
    let src = activeMenu === 'inventory' ? processedData : processedData.filter(i => !i.isGhost);
    if (selectedCodes.length) {
      src = src.filter(i => selectedCodes.includes(makeKey(i.brand, i.code)));
    }
    
    const dataToExport = src.map(item => {
      const curS = Number(item.price_sale || 0);
      const cost = Number(item.cost || 0);
      const margin = (curS - Math.floor(curS * (feeRate / 100))) - cost - fixedCost;
      // 이전가: processedData에서 이미 계산된 prev 값 사용
      return {
        "구분": item.type, "품번": item.code, "브랜드": item.brand || '', "시즌": item.season || '',
        "복종": item.category || '', "스타일코드": item.style_no || '', "상품명": item.name || '',
        "원가": item.cost || 0, "Tag가": item.tag_price || 0,
        "네이버(이전)": item.prevNaver || 0, "네이버(변경)": item.price_naver || 0,
        "쿠팡(이전)": item.prevCoupang || 0, "쿠팡(변경)": item.price_coupang || 0,
        "로켓(이전)": item.prevRocket || 0, "로켓(변경)": item.price_rocket || 0,
        "골드(이전)": item.prevGold || 0, "골드(변경)": item.price_gold || 0,
        "행사가(이전)": item.prevSale || 0, "행사가(변경)": item.price_sale || 0,
        "마진": margin,
        "온라인재고": item.stock || 0, "본사재고": item.hq_stock || 0,
        "1주발주": item.order_w1 || 0, "2주발주": item.order_w2 || 0, "3주발주": item.order_w3 || 0
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "조회데이터");
    XLSX.writeFile(wb, "MD_라인시트_데이터.xlsx");
  };

  // 가격/기본수정 업로드용 양식 다운로드 (선택 브랜드 기준, 부모행만)
  const downloadPriceTemplate = () => {
    if (!priceTemplateBrand) { alert('브랜드를 먼저 선택해주세요.'); return; }
    const allP = [...masterProducts, ...groups];
    const src = allP.filter(p => cleanStr(p.brand) === cleanStr(priceTemplateBrand));
    if (!src.length) { alert('해당 브랜드 상품이 없습니다.'); return; }
    const data = src.map(item => {
      const lp = localPrev[makeKey(item.brand, item.code)] || {};
      const prevNaver   = Number(lp.price_naver   ?? item.price_naver   ?? 0);
      const prevCoupang = Number(lp.price_coupang ?? item.price_coupang ?? 0);
      const prevRocket  = Number(lp.price_rocket  ?? item.price_rocket  ?? 0);
      const prevGold    = Number(lp.price_gold    ?? item.price_gold    ?? 0);
      const prevSale    = Number(lp.price_sale    ?? item.price_sale    ?? 0);
      return {
        "브랜드": item.brand || '',
        "품번": item.code,
        "복종": item.category || '',
        "스타일코드": item.style_no || '',
        "상품명": item.name || '',
        "원가": item.cost || 0,
        "Tag가": item.tag_price || 0,
        "네이버(이전)": prevNaver,   "네이버(변경)": item.price_naver || 0,
        "쿠팡(이전)": prevCoupang,   "쿠팡(변경)": item.price_coupang || 0,
        "로켓(이전)": prevRocket,    "로켓(변경)": item.price_rocket || 0,
        "골드(이전)": prevGold,      "골드(변경)": item.price_gold || 0,
        "행사가(이전)": prevSale,    "행사가(변경)": item.price_sale || 0,
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws['!cols'] = [
      {wch:10},{wch:10},{wch:8},{wch:16},{wch:30},{wch:8},{wch:8},
      {wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10}
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "가격수정양식");
    XLSX.writeFile(wb, `가격수정양식_${priceTemplateBrand}.xlsx`);
  };

  const applyListExcelUpload = async (rows) => {
    const allProducts = [...masterProducts, ...groups];
    const prevUpdates = {};
    const updatePromises = [];

    for(const r of rows) {
      const c = String(r["품번"] || "").trim();
      const b = String(r["브랜드"] || "").trim();
      if (!c || !b) continue;
      const tbl = groups.some(g=>g.code===c && g.brand===b) ? 'groups' : 'master_products';
      const payload = {};
      // 컬럼이 존재하고 셀값이 비어있지 않을 때만 업데이트
      const setStr = (key, field) => { if (key in r && String(r[key]??'').trim() !== '') payload[field] = String(r[key]).trim(); };
      const setNum = (key, field) => { const v = String(r[key]??'').trim(); if (key in r && v !== '') payload[field] = Number(v.replace(/,/g,'')); };
      setStr("브랜드", "brand"); setStr("시즌", "season"); setStr("복종", "category");
      setStr("스타일코드", "style_no"); setStr("상품명", "name");
      setNum("원가", "cost"); setNum("Tag가", "tag_price");
      setNum("네이버(변경)", "price_naver"); setNum("쿠팡(변경)", "price_coupang");
      setNum("로켓(변경)", "price_rocket"); setNum("골드(변경)", "price_gold");
      setNum("행사가(변경)", "price_sale");
      setNum("온라인재고", "stock"); setNum("본사재고", "hq_stock");
      setNum("1주발주", "order_w1"); setNum("2주발주", "order_w2"); setNum("3주발주", "order_w3");

      if (Object.keys(payload).length > 0) {
        // 업로드 전 현재 가격을 localPrev에 저장 (이전가 표시용)
        const cur = allProducts.find(p => String(p.code) === c && String(p.brand) === b);
        if (cur) {
          const key = makeKey(b, c);
          const priceFields = ['price_naver','price_coupang','price_rocket','price_gold','price_sale'];
          const snap = {};
          priceFields.forEach(f => { if (f in payload) snap[f] = Number(cur[f] || 0); });
          if (Object.keys(snap).length > 0) prevUpdates[key] = snap;
        }
        updatePromises.push(supabase.from(tbl).update(payload).eq('code', c).eq('brand', b));
      }
    }
    await Promise.all(updatePromises);
    // 이전가 상태 반영
    if (Object.keys(prevUpdates).length > 0) {
      setLocalPrev(prev => {
        const next = { ...prev };
        Object.entries(prevUpdates).forEach(([key, snap]) => {
          next[key] = { ...(next[key] || {}), ...snap };
        });
        return next;
      });
    }
    alert("✅ 엑셀 일괄 수정 업로드 완료!");
    fetchData();
  };

  const handleListExcelUpload = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    e.target.value = null;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, {type:'binary'});
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });

        const newBrands = [];
        const newCategories = [];
        const newSeasons = [];

        for(const r of rows) {
          const b = String(r["브랜드"] || "").trim();
          const cat = String(r["복종"] || "").trim();
          const sea = String(r["시즌"] || "").trim();
          if (b && !brands.includes(b) && !newBrands.includes(b)) newBrands.push(b);
          if (cat && !categories.includes(cat) && !newCategories.includes(cat)) newCategories.push(cat);
          if (sea && !seasons.includes(sea) && !newSeasons.includes(sea)) newSeasons.push(sea);
        }

        if (newBrands.length > 0 || newCategories.length > 0 || newSeasons.length > 0) {
          setPendingExcelUpload({ rows, newBrands, newCategories, newSeasons });
        } else {
          await applyListExcelUpload(rows);
        }
      } catch (err) {
        console.error(err);
        alert("❌ 엑셀 처리 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // 공통: 재고 업데이트 적용
  const applyStockUpdate = async (stockMap, barcodeMap, label) => {
    const updates = [];
    for (const [key, stockVal] of Object.entries(stockMap)) {
      const [b, c] = key.split('|||');
      const tbl = groups.some(g => g.code === c && g.brand === b) ? 'groups' : 'master_products';
      const barcodeStr = barcodeMap[key] ? Array.from(barcodeMap[key]).join(',') : undefined;
      const payload = { stock: stockVal };
      if (barcodeStr !== undefined) payload.barcode = barcodeStr;
      updates.push(supabase.from(tbl).update(payload).eq('code', c).eq('brand', b));
    }
    await Promise.all(updates);
    return updates.length;
  };

  // 라온팩토리 온라인재고: 시트 '재고코드관리_다운로드', 모델명 + 현재고(가용)
  // 라온팩토리 온라인재고: 1행 헤더, F열(index5)=바코드, J열(index9)=총재고
  // 바코드 뒤 3자리(사이즈코드) 제거 후 findProductByBarcode로 매핑
  const handleRaonInventoryExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (rows.length < 2) return alert("❌ 데이터가 없습니다.");

        // 헤더(row0)에서 컬럼 인덱스 확인, fallback으로 F(5)/J(9) 사용
        const header = rows[0];
        let barcodeIdx = header.findIndex(c => cleanStr(c) === '바코드');
        let stockIdx   = header.findIndex(c => cleanStr(c) === '총재고');
        if (barcodeIdx === -1) barcodeIdx = 5;
        if (stockIdx   === -1) stockIdx   = 9;

        // C열(index2) SKU코드 → F열 바코드(사이즈3자제거) 맵 구축 (발주핸들러 재사용)
        const skuIdx = rows[0].findIndex(c => cleanStr(c) === '상품코드');
        const skuColIdx = skuIdx !== -1 ? skuIdx : 2;
        const newSkuMap = {};
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const sku = cleanStr(row[skuColIdx]);
          const fullBc = cleanStr(row[barcodeIdx]);
          if (sku && fullBc && fullBc.length > 3) newSkuMap[sku] = fullBc.slice(0, -3);
        }
        setRaonSkuMap(newSkuMap);

        const allProducts = [...masterProducts, ...groups];
        const stockMap = {}, barcodeMap = {};
        let matched = 0, unmatched = 0;

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const fullBarcode = cleanStr(row[barcodeIdx]);
          if (!fullBarcode || fullBarcode.length < 4) continue;
          // 뒤 3자리(사이즈코드) 제거
          const bc = fullBarcode.slice(0, -3);
          const rawQty = row[stockIdx];
          const qty = typeof rawQty === 'number' ? rawQty : Number(String(rawQty || '0').replace(/,/g, '')) || 0;

          // mwStyleMatch 1순위(색상 구분), findProductByBarcode fallback
          let product = allProducts.find(p => p.style_no && mwStyleMatch(p.style_no, bc));
          if (!product) product = findProductByBarcode(bc, allProducts);
          if (product) {
            const key = makeKey(product.brand, product.code);
            stockMap[key] = (stockMap[key] || 0) + qty;
            if (!barcodeMap[key]) barcodeMap[key] = new Set();
            barcodeMap[key].add(bc);
            matched++;
          } else { unmatched++; }
        }

        await resetStockByBrandFilter(false); // 라온팩토리(몽벨 제외) 온라인재고 전체 초기화 후 적용
        const cnt = await applyStockUpdate(stockMap, barcodeMap, '라온팩토리 온라인재고');
        alert(`📦 라온팩토리 온라인재고 갱신 완료!\n✅ 매핑된 행: ${matched}건\n✅ 갱신 품번: ${cnt}건\n❌ 미매핑: ${unmatched}건`);
        fetchData();
      } catch (err) { console.error(err); alert("❌ 재고 엑셀 처리 중 오류가 발생했습니다."); }
    };
    reader.readAsBinaryString(file);
  };

  // 몽벨 온라인재고: C열(상품코드) 직접 매핑, X열(합재고) 합산
  // 헤더구조: row0=대분류, row1=소분류, row2~=데이터
  // C(2)=상품코드, L(11)=바코드, M(12)=모델NO, P(15)=옵션별칭1, X(23)=합재고
  const handleMWInventoryExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        // 헤더 탐색: '상품코드' 있는 행 찾기 (보통 row0)
        let codeIdx = 2, bcIdx = 11, modelIdx = 12, stockIdx = 23, dataStart = 2;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const r = rows[i];
          if (!Array.isArray(r)) continue;
          const fCode = r.findIndex(c => cleanStr(c) === '상품코드');
          if (fCode !== -1) {
            codeIdx  = fCode;
            bcIdx    = r.findIndex(c => cleanStr(c) === '바코드');
            modelIdx = r.findIndex(c => cleanStr(c) === '모델NO');
            stockIdx = r.findIndex(c => cleanStr(c) === '합재고');
            if (bcIdx    === -1) bcIdx    = 11;
            if (modelIdx === -1) modelIdx = 12;
            if (stockIdx === -1) stockIdx = 23;
            dataStart = i + 2; // 대분류+소분류 2행 건너뜀
            break;
          }
        }

        const allProducts = [...masterProducts, ...groups];
        const stockMap = {}, barcodeMap = {};
        let matched = 0, unmatched = 0;

        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;

          // X열 합재고 (수식 캐시값 우선, 문자열이면 파싱)
          const rawQty = row[stockIdx];
          const qty = typeof rawQty === 'number' ? rawQty
                    : Number(String(rawQty || '0').replace(/[,=]/g, '')) || 0;

          const numCode = String(row[codeIdx] || '').trim();
          const barcode = cleanStr(row[bcIdx]  || '');
          const modelNo = cleanStr(row[modelIdx] || '');

          if (!numCode && !barcode) continue;

          // 1순위: C열 상품코드 → DB product.code 직접 매핑
          let product = allProducts.find(p => String(p.code) === numCode);

          // 2순위: L열 바코드 뒤 3자리(사이즈) 제거 → 자식 style_no 매칭
          if (!product && barcode.length > 3) {
            const styleNoChild = barcode.slice(0, -3);
            product = allProducts.find(p => p.style_no && mwStyleMatch(p.style_no, styleNoChild));
          }

          // 3순위: M열 모델NO → style_no 매칭
          if (!product && modelNo) {
            product = allProducts.find(p => p.style_no && mwStyleMatch(p.style_no, modelNo));
          }

          if (product) {
            // 자식이 있는 묶음/세트 부모는 직접 매핑 스킵 → processedData에서 자식 합계로 표시
            const isParentGroup = groups.some(g => g.code === product.code && g.brand === product.brand && g.children && g.children.length > 0);
            if (isParentGroup) { matched++; continue; }
            const key = makeKey(product.brand, product.code);
            stockMap[key] = (stockMap[key] || 0) + qty;
            if (!barcodeMap[key]) barcodeMap[key] = new Set();
            if (barcode) barcodeMap[key].add(barcode);
            matched++;
          } else { unmatched++; }
        }

        await resetStockByBrandFilter(true); // 몽벨 온라인재고 전체 초기화 후 적용
        const cnt = await applyStockUpdate(stockMap, barcodeMap, '몽벨 온라인재고');
        alert(`📦 몽벨 온라인재고 갱신 완료!\n✅ 매핑된 행: ${matched}건\n✅ 갱신 품번: ${cnt}건\n❌ 미매핑: ${unmatched}건`);
        fetchData();
      } catch (err) { console.error(err); alert("❌ 재고 엑셀 처리 중 오류가 발생했습니다."); }
    };
    reader.readAsBinaryString(file);
  };

  // 본사재고양식: 2행 헤더, C열(상품바코드) 뒤 3자리 사이즈 제거 → style_no 매칭, N열(실재고) 합산
  const handleHqStockExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const workbook = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        // 2행 헤더 구조: row0=대분류, row1=소분류(품번/상품바코드/실재고 등)
        let bcIdx = 2, qtyIdx = 13, dataStart = 2;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const r = rows[i];
          if (!Array.isArray(r)) continue;
          const fBc  = r.findIndex(c => cleanStr(c).includes('상품바코드'));
          const fQty = r.findIndex(c => cleanStr(c) === '실재고');
          if (fBc !== -1) {
            bcIdx  = fBc;
            qtyIdx = fQty !== -1 ? fQty : 13;
            dataStart = i + 1;
            break;
          }
        }

        const allProducts = [...masterProducts, ...groups];
        const hqMap = {};
        let matched = 0, unmatched = 0;

        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const fullBarcode = cleanStr(row[bcIdx]); // e.g. EB3IFMJP51CH095
          const qty = typeof row[qtyIdx] === 'number' ? row[qtyIdx]
                    : Number(String(row[qtyIdx] || '0').replace(/,/g, '')) || 0;
          if (!fullBarcode || fullBarcode.length < 4) continue;

          // 뒤 3자리 사이즈 제거 → 색상코드까지의 style_no
          const styleNoChild = fullBarcode.length > 3 ? fullBarcode.slice(0, -3) : fullBarcode;

          // 1순위: 바코드 뒤 3자리 제거 → style_no 매칭 (색상 구분 + 리오더suffix 허용)
          let product = allProducts.find(p => p.style_no && mwStyleMatch(p.style_no, styleNoChild));
          // 2순위: 전체 바코드로 fallback
          if (!product) product = findProductByBarcode(fullBarcode, allProducts);

          if (product) {
            const isParentGroup = groups.some(g => g.code === product.code && g.brand === product.brand && g.children && g.children.length > 0);
            if (isParentGroup) { matched++; continue; }
            const key = makeKey(product.brand, product.code);
            hqMap[key] = (hqMap[key] || 0) + qty;
            matched++;
          } else { unmatched++; }
        }

        const updates = [];
        for (const [key, stockVal] of Object.entries(hqMap)) {
          const [b, c] = key.split('|||');
          const tbl = groups.some(g => g.code === c && g.brand === b) ? 'groups' : 'master_products';
          updates.push(supabase.from(tbl).update({ hq_stock: stockVal }).eq('code', c).eq('brand', b));
        }
        await Promise.all(updates);
        alert(`🏢 본사재고 매핑 완료!\n✅ 매핑된 바코드: ${matched}건\n✅ 갱신 품번: ${updates.length}건\n❌ 미매핑: ${unmatched}건`);
        fetchData();
      } catch (err) {
        console.error(err);
        alert("❌ 본사재고 엑셀 처리 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null;
  };

  // 공통: 발주 DB 업데이트
  const applyOrderUpdate = async (orderMap) => {
    const updates = [];
    for (const [key, orders] of Object.entries(orderMap)) {
      const [b, c] = key.split('|||');
      const tbl = groups.some(g => g.code === c && g.brand === b) ? 'groups' : 'master_products';
      updates.push(supabase.from(tbl).update({ order_w1: orders.w1, order_w2: orders.w2, order_w3: orders.w3 }).eq('code', c).eq('brand', b));
    }
    await Promise.all(updates);
    return updates.length;
  };

  // 특정 브랜드 범위의 발주 수량 전체 초기화 (업로드 전 선행)
  const resetOrdersByBrandFilter = async (isMontbell) => {
    const allProducts = [...masterProducts, ...groups];
    const targets = allProducts.filter(p =>
      isMontbell ? cleanStr(p.brand) === '몽벨' : cleanStr(p.brand) !== '몽벨'
    );
    const resets = targets.map(p => {
      const tbl = groups.some(g => g.code === p.code && g.brand === p.brand) ? 'groups' : 'master_products';
      return supabase.from(tbl).update({ order_w1: 0, order_w2: 0, order_w3: 0 }).eq('code', p.code).eq('brand', p.brand);
    });
    await Promise.all(resets);
  };

  // 특정 브랜드 범위의 온라인재고 전체 초기화 (업로드 전 선행)
  const resetStockByBrandFilter = async (isMontbell) => {
    const allProducts = [...masterProducts, ...groups];
    const targets = allProducts.filter(p =>
      isMontbell ? cleanStr(p.brand) === '몽벨' : cleanStr(p.brand) !== '몽벨'
    );
    const resets = targets.map(p => {
      const tbl = groups.some(g => g.code === p.code && g.brand === p.brand) ? 'groups' : 'master_products';
      return supabase.from(tbl).update({ stock: 0 }).eq('code', p.code).eq('brand', p.brand);
    });
    await Promise.all(resets);
  };

  // 몽벨 발주: A열 상품명 마지막() 바코드→뒤3자리(사이즈)제거→자식style_no 매칭
  // K(10)=1주발주합계, L(11)=2주발주합계, M(12)=3주발주합계
  const handleMWOrderExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        // 헤더 탐색: '상품명' 있는 행 (보통 row0)
        let nameIdx = 0, w1Idx = 10, w2Idx = 11, w3Idx = 12, dataStart = 1;
        for (let i = 0; i < Math.min(5, rows.length); i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const fName = row.findIndex(c => cleanStr(c).includes('상품명'));
          if (fName !== -1) {
            nameIdx = fName;
            w1Idx = row.findIndex(c => cleanStr(c).includes('1주발주합계'));
            w2Idx = row.findIndex(c => cleanStr(c).includes('2주발주합계'));
            w3Idx = row.findIndex(c => cleanStr(c).includes('3주발주합계'));
            if (w1Idx === -1) w1Idx = 10;
            if (w2Idx === -1) w2Idx = 11;
            if (w3Idx === -1) w3Idx = 12;
            dataStart = i + 1;
            break;
          }
        }

        const allProducts = [...masterProducts, ...groups];
        const orderMap = {};
        let matched = 0, unmatched = 0;

        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const nameVal = String(row[nameIdx] || '');
          const w1 = typeof row[w1Idx] === 'number' ? row[w1Idx] : Number(String(row[w1Idx]||'0').replace(/,/g,''))||0;
          const w2 = typeof row[w2Idx] === 'number' ? row[w2Idx] : Number(String(row[w2Idx]||'0').replace(/,/g,''))||0;
          const w3 = typeof row[w3Idx] === 'number' ? row[w3Idx] : Number(String(row[w3Idx]||'0').replace(/,/g,''))||0;
          if (w1 === 0 && w2 === 0 && w3 === 0) continue;

          // A열 상품명 마지막 () 안 바코드 추출
          // "0001) 2레이어패딩자켓(배)(MW3FAMIJ80NA095)" → MW3FAMIJ80NA095
          const allM = [...nameVal.matchAll(/\(([^)]+)\)/g)];
          const bc = allM.length > 0 ? cleanStr(allM[allM.length - 1][1]) : '';
          if (!bc || bc.length < 4) { unmatched++; continue; }

          // 뒤 3자리 사이즈 제거 → 자식 style_no (e.g. MW3FAMIJ80NA095 → MW3FAMIJ80NA)
          const styleNoChild = bc.length > 3 ? bc.slice(0, -3) : bc;

          // 1순위: style_no 매칭 (색상 구분 + 리오더suffix 허용)
          let product = allProducts.find(p => p.style_no && mwStyleMatch(p.style_no, styleNoChild));
          // 2순위: 전체 바코드로 fallback
          if (!product) product = findProductByBarcode(bc, allProducts);

          if (product) {
            // 부모 그룹은 항상 스킵 (자식 스타일코드에서 매핑해야 함)
            const isParentGroup = groups.some(g => g.code === product.code && g.brand === product.brand && g.children && g.children.length > 0);
            if (isParentGroup) { matched++; continue; }
            const key = makeKey(product.brand, product.code);
            if (!orderMap[key]) orderMap[key] = { w1: 0, w2: 0, w3: 0 };
            orderMap[key].w1 += w1;
            orderMap[key].w2 += w2;
            orderMap[key].w3 += w3;
            matched++;
          } else { unmatched++; }
        }

        await resetOrdersByBrandFilter(true); // 몽벨 발주 전체 초기화 후 적용
        const cnt = await applyOrderUpdate(orderMap);
        alert(`🛒 몽벨 발주 매핑 완료!\n✅ 매핑된 행: ${matched}건\n✅ 갱신 품번: ${cnt}건\n❌ 미매핑: ${unmatched}건`);
        fetchData();
      } catch (err) { console.error(err); alert("❌ 발주 엑셀 처리 중 오류가 발생했습니다."); }
    };
    reader.readAsBinaryString(file);
  };

  // 라온팩토리 발주: 두 가지 포맷 지원
  // [신규] 발주양식_라온팩토리2: 1행 헤더, O열(14)=상품코드(SKU), P열(15)=출고상품명, Q열(16)=수량
  //   → raonSkuMap(재고양식 업로드 시 캐시)으로 SKU→바코드 변환, fallback으로 P열 스타일코드 추출
  // [구형] 기타 포맷: 상품명 _ 뒤 스타일코드 추출
  const handleRaonOrderExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = null;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        if (rows.length < 2) return alert("❌ 데이터가 없습니다.");

        const header = rows[0];
        // 신규 포맷 감지: 헤더 row0에 "상품코드" + "출고상품명" + "수량" 모두 있는 경우
        const skuColIdx  = header.findIndex(c => cleanStr(c) === '상품코드');
        const nameColIdx = header.findIndex(c => cleanStr(c).includes('출고상품명'));
        const qtyColIdx  = header.findIndex(c => cleanStr(c) === '수량');
        const isNewFormat = skuColIdx !== -1 && qtyColIdx !== -1;

        let nameIdx, qtyIdx, dataStart, orderSkuIdx;
        if (isNewFormat) {
          orderSkuIdx = skuColIdx;
          nameIdx     = nameColIdx !== -1 ? nameColIdx : 15;
          qtyIdx      = qtyColIdx;
          dataStart   = 1;
        } else {
          // 구형 포맷: 헤더행 탐색
          orderSkuIdx = -1;
          nameIdx = -1; qtyIdx = -1; dataStart = 0;
          for (let i = 0; i < Math.min(10, rows.length); i++) {
            const row = rows[i];
            if (!Array.isArray(row)) continue;
            const fName = row.findIndex(c => cleanStr(c).includes('상품명') || cleanStr(c).includes('순종평'));
            const fQty  = row.findIndex(c => cleanStr(c) === '수량');
            if (fName !== -1 && fQty !== -1) {
              nameIdx = fName; qtyIdx = fQty; dataStart = i + 1; break;
            }
          }
          if (nameIdx === -1) { nameIdx = 6; qtyIdx = 7; dataStart = 1; }
        }

        // 달력 주(ISO week) 기준으로 날짜 → w1/w2/w3 매핑
        const getISOWeek = (dateStr) => {
          const d = new Date(String(dateStr));
          if (isNaN(d)) return null;
          const jan4 = new Date(d.getFullYear(), 0, 4);
          const startOfWeek1 = new Date(jan4);
          startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
          return Math.floor((d - startOfWeek1) / 604800000) + 1;
        };

        // 파일 내 날짜들의 최소 ISO주차 파악 → 상대 주차(0/1/2+) → w1/w2/w3
        let minWeekNum = Infinity;
        let minYear = Infinity;
        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const dateVal = String(row[isNewFormat ? 4 : 0] || '').trim();
          if (!dateVal) continue;
          const d = new Date(dateVal);
          if (isNaN(d)) continue;
          const wk = getISOWeek(dateVal);
          if (wk !== null && (d.getFullYear() < minYear || (d.getFullYear() === minYear && wk < minWeekNum))) {
            minYear = d.getFullYear(); minWeekNum = wk;
          }
        }
        const dateColIdx = isNewFormat ? 4 : -1; // E열(4) = 발주일자 (신규 포맷만)

        const allProducts = [...masterProducts, ...groups];
        const orderMap = {};
        let matched = 0, unmatched = 0;

        for (let i = dataStart; i < rows.length; i++) {
          const row = rows[i];
          if (!Array.isArray(row)) continue;
          const qty = Number(String(row[qtyIdx] || '0').replace(/,/g, '')) || 0;
          if (qty === 0) continue;

          // 주차 결정 (신규 포맷만 날짜 기반, 구형은 w1)
          let weekKey = 'w1';
          if (isNewFormat && dateColIdx !== -1) {
            const dateVal = String(row[dateColIdx] || '').trim();
            const d = new Date(dateVal);
            if (!isNaN(d)) {
              const wk = getISOWeek(dateVal);
              const diff = (d.getFullYear() - minYear) * 52 + (wk - minWeekNum);
              weekKey = diff <= 0 ? 'w1' : diff === 1 ? 'w2' : 'w3';
            }
          }

          let bc = '';
          if (isNewFormat) {
            // 1순위: raonSkuMap (재고양식 업로드 시 캐시된 SKU→바코드 맵)
            const sku = cleanStr(row[orderSkuIdx]);
            if (sku && raonSkuMap[sku]) bc = raonSkuMap[sku];
            // 2순위: 출고상품명 _ 뒤 스타일코드 + 색상코드 추출 fallback
            if (!bc || bc.length < 4) {
              const nameVal = String(row[nameIdx] || '');
              const uIdx = nameVal.lastIndexOf('_');
              if (uIdx !== -1) {
                const after = nameVal.slice(uIdx + 1).trim();
                const m = after.match(/^([A-Z0-9]+)/i);
                bc = m ? cleanStr(m[1]) : '';
                // 스타일코드 끝이 숫자면 색상코드 별도 추출: "[KHAKI] KH 095" 패턴
                if (bc && /\d$/.test(bc)) {
                  const colorM = after.match(/\[[^\]]+\]\s+([A-Z]{2})\b/);
                  if (colorM) bc = bc + colorM[1];
                }
              }
            }
          } else {
            // 구형 포맷: 상품명 _ 뒤 스타일코드
            const nameVal = String(row[nameIdx] || '');
            const uIdx = nameVal.lastIndexOf('_');
            if (uIdx !== -1) {
              const after = nameVal.slice(uIdx + 1).trim();
              const m = after.match(/^([A-Z0-9]+)/i);
              bc = m ? cleanStr(m[1]) : '';
            }
            if (!bc || bc.length < 4) {
              const allM = [...nameVal.matchAll(/\(([^)]+)\)/g)];
              bc = allM.length > 0 ? cleanStr(allM[allM.length - 1][1]) : '';
            }
          }
          if (!bc || bc.length < 4) { unmatched++; continue; }

          // mwStyleMatch 1순위(색상 구분), findProductByBarcode fallback
          let product = allProducts.find(p => p.style_no && mwStyleMatch(p.style_no, bc));
          if (!product) product = findProductByBarcode(bc, allProducts);
          if (product) {
            const key = makeKey(product.brand, product.code);
            if (!orderMap[key]) orderMap[key] = { w1: 0, w2: 0, w3: 0 };
            orderMap[key][weekKey] += qty;
            matched++;
          } else { unmatched++; }
        }

        await resetOrdersByBrandFilter(false); // 라온팩토리(몽벨 제외) 발주 전체 초기화
        const cnt = await applyOrderUpdate(orderMap);
        alert(`🛒 라온팩토리 발주 매핑 완료!\n✅ 매핑된 행: ${matched}건\n✅ 갱신 품번: ${cnt}건\n❌ 미매핑: ${unmatched}건`);
        fetchData();
      } catch (err) { console.error(err); alert("❌ 발주 엑셀 처리 중 오류가 발생했습니다."); }
    };
    reader.readAsBinaryString(file);
  };

  const downloadExcelTemplate = () => {
    const templateData = [{ "브랜드": "몽벨", "시즌": "24SS", "복종": "상의", "품번": "TS-100", "스타일": "ST-01", "상품명": "기본 티셔츠", "원가": 5000, "Tag가": 20000 }];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "양식"); 
    XLSX.writeFile(wb, "MD_상품등록양식.xlsx");
  };

  // ==========================================
  // 5. 레이아웃 & 스타일 정의
  // ==========================================
  const PRIMARY_COLOR = '#3498db';
  const GHOST_COLOR = '#bdc3c7'; 

  const thStyle = { boxSizing: 'border-box', padding: '4px', background: '#f8f9fa', borderBottom: '2px solid #ddd', borderRight: '1px solid #eee', fontSize: '11px', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 10, whiteSpace: 'nowrap', textAlign: 'center', cursor:'pointer' };
  const tdStyle = { boxSizing: 'border-box', padding: '3px 4px', borderBottom: '1px solid #eee', borderRight: '1px solid #f9f9f9', fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' };
  
  const cols = {
    chk: { w: 26,  l: 0 },
    brd: { w: 70,  l: 26 },
    sea: { w: 60,  l: 96 },
    typ: { w: 90,  l: 156 },
    cod: { w: 100, l: 246 },
    cat: { w: 60,  l: 346 },
    sty: { w: 120, l: 406 },
    nam: { w: 400, l: 526 },
    cst: { w: 60,  l: 926 },
    tag: { w: 65,  l: 986 },
  };

  const fX = (l, isHeader = false) => {
    if (isMobile) {
      return { position: isHeader ? 'sticky' : 'static', top: isHeader ? 0 : 'auto', left: 'auto', zIndex: isHeader ? 10 : 1, background: isHeader ? '#f8f9fa' : 'inherit' };
    }
    return { position: 'sticky', left: `${l}px`, zIndex: isHeader ? 20 : 10, background: isHeader ? '#f8f9fa' : 'inherit' };
  };
  
  const cellS = (c) => ({ width: `${c.w}px`, minWidth: `${c.w}px`, maxWidth: `${c.w}px` });
  
  const inputRegStyle = { padding: '8px', border: '1px solid #ddd', borderRadius: '6px', width: '100%', boxSizing: 'border-box', marginBottom: '10px' };
  const batchInputStyle = { width: isMobile ? '45px' : '55px', fontSize: '10px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px' };
  const btnStyle = { padding:'2px 4px', background:'#eee', border:'1px solid #ccc', borderRadius:'3px', fontSize:'10px', cursor:'pointer' };
  const compareInputStyle = { width: '50px', fontSize: '10px', padding: '2px', border: '1px solid #3498db', borderRadius: '2px' };
  const inlineCellInputStyle = { width: '55px', fontSize: '10px', padding: '2px 3px', border: '2px solid #3498db', borderRadius: '3px', textAlign: 'right', outline: 'none' };

  // 인라인 셀 편집 렌더 헬퍼 (숫자/텍스트/셀렉트 통합)
  const renderInlineCell = (item, field, currentValue, isGhostItem, opts = {}) => {
    if (isGhostItem) return <span style={{color:GHOST_COLOR}}>-</span>;
    const ik = makeKey(item.brand, item.code);
    const isIC = editingCell?.key === ik && editingCell?.field === field;
    const { width, color, bold, inputType = 'number', options = [] } = opts;
    const isNum = inputType === 'number';
    const baseInputS = { fontSize:'10px', padding:'2px 3px', border:'2px solid #3498db', borderRadius:'3px', outline:'none', ...(color?{color}:{}) };

    if (isIC) {
      if (inputType === 'select') {
        return <select value={editingCellValue} autoFocus
          onChange={e=>setEditingCellValue(e.target.value)}
          onBlur={()=>handleCellSave(item,field,editingCellValue)}
          onKeyDown={e=>{if(e.key==='Escape')setEditingCell(null);}}
          style={{...baseInputS, width: width||'100%'}}>
          {options.map(o=><option key={o} value={o}>{o}</option>)}
        </select>;
      }
      return <input type={isNum?'number':'text'} value={editingCellValue} autoFocus
        onChange={e=>setEditingCellValue(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter')handleCellSave(item,field,editingCellValue);if(e.key==='Escape')setEditingCell(null);}}
        onBlur={()=>handleCellSave(item,field,editingCellValue)}
        style={{...baseInputS, width: width||(isNum?'55px':'95%')}} />;
    }
    const disp = isNum ? (Number(currentValue||0)).toLocaleString() : (currentValue || '-');
    return <span onClick={()=>{setEditingCell({key:ik,field});setEditingCellValue(isNum?(currentValue||0):(currentValue||''));}}
      style={{cursor:'pointer',fontWeight:bold?'bold':'normal',color:color||'inherit',textDecoration:'underline dotted #aaa'}}
      title="클릭하여 수정">{disp}</span>;
  };

  const sidebarStyle = isMobile
    ? { width: '100%', height: '65px', backgroundColor: '#2c3e50', color: '#fff', display: 'flex', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', position:'fixed', bottom: 0, left: 0, zIndex: 999, padding: '0 10px', boxSizing: 'border-box' }
    : { width: '85px', minWidth: '85px', backgroundColor: '#2c3e50', color: '#fff', padding: '20px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', position:'fixed', height:'100vh', zIndex: 200 };

  const mainContentStyle = isMobile
    ? { flex: 1, padding: '15px', boxSizing: 'border-box', width: '100%', overflowY: 'auto', paddingBottom: '80px' }
    : { flex: 1, padding: '20px', boxSizing: 'border-box', marginLeft: '85px', width: 'calc(100% - 85px)', overflowY: 'auto' };

  const miniMenuStyle = (active) => ({ 
    width: isMobile ? '70px' : '75px', height: isMobile ? '45px' : '65px', borderRadius: '10px', display: 'flex', 
    flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', marginBottom: isMobile ? '0' : '15px', 
    cursor: 'pointer', backgroundColor: active ? PRIMARY_COLOR : 'transparent', color: active ? '#fff' : '#b2bec3', border: active ? 'none' : '1px solid #455a64', gap: isMobile ? '5px' : '0'
  });

  return (
    <>
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100vh', width: '100vw', backgroundColor: '#f4f7f6', position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
      
      {/* ⬅️ 네비게이션 */}
      <div style={sidebarStyle}>
        {!isMobile && <h2 style={{ color: PRIMARY_COLOR, fontSize: '0.7rem', marginBottom: '30px', textAlign: 'center' }}>LINE<br/>SHEET</h2>}
        <div onClick={() => setActiveMenu('register')} style={miniMenuStyle(activeMenu === 'register')}><span style={{fontWeight:'bold'}}>1</span><span style={{fontSize:'10px'}}>상품등록</span></div>
        <div onClick={() => setActiveMenu('list')} style={miniMenuStyle(activeMenu === 'list')}><span style={{fontWeight:'bold'}}>2</span><span style={{fontSize:'10px'}}>가격마진</span></div>
        <div onClick={() => setActiveMenu('inventory')} style={miniMenuStyle(activeMenu === 'inventory')}><span style={{fontWeight:'bold'}}>3</span><span style={{fontSize:'10px'}}>재고발주</span></div>
      </div>

      <div style={mainContentStyle}>
        
        {/* ======================= [ 메뉴 1: 상품 등록 ] ======================= */}
        {activeMenu === 'register' && (
          <div style={{ width: '100%' }}>
            <h2 style={{ marginBottom: '20px', fontSize: isMobile ? '1.2rem' : '1.5rem' }}>💎 상품 통합 등록</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: `5px solid #e17055`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                 <strong>🏷️ 브랜드 설정</strong>
                 <input placeholder="새 브랜드 + 엔터" value={newBrandInput} onChange={e => setNewBrandInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBrand()} style={inputRegStyle} />
                 <div style={{ display: 'flex', gap: '4px', flexWrap:'wrap' }}>
                   {brands.map(b => <span key={b} style={{background:'#fcf0ed', padding:'4px 8px', borderRadius:'15px', fontSize:'11px'}}>{b} <b onClick={()=>deleteBrand(b)} style={{color:'red', cursor:'pointer', marginLeft:'4px'}}>×</b></span>)}
                 </div>
              </div>
              <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: `5px solid #0984e3`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                 <strong>❄️ 시즌 설정</strong>
                 <input placeholder="새 시즌 + 엔터" value={newSeasonInput} onChange={e => setNewSeasonInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSeason()} style={inputRegStyle} />
                 <div style={{ display: 'flex', gap: '4px', flexWrap:'wrap' }}>
                   {seasons.map(s => <span key={s} style={{background:'#eef6fc', padding:'4px 8px', borderRadius:'15px', fontSize:'11px'}}>{s} <b onClick={()=>deleteSeason(s)} style={{color:'red', cursor:'pointer', marginLeft:'4px'}}>×</b></span>)}
                 </div>
              </div>
              <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: `5px solid ${PRIMARY_COLOR}`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                 <strong>📁 복종 설정</strong>
                 <input placeholder="새 복종 + 엔터" value={newCatInput} onChange={e => setNewCatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} style={inputRegStyle} />
                 <div style={{ display: 'flex', gap: '4px', flexWrap:'wrap' }}>
                   {categories.map(c => <span key={c} style={{background:'#ebf3f9', padding:'4px 8px', borderRadius:'15px', fontSize:'11px'}}>{c} <b onClick={()=>deleteCategory(c)} style={{color:'red', cursor:'pointer', marginLeft:'4px'}}>×</b></span>)}
                 </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '20px' }}>
              
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', borderLeft: `5px solid #00cec9`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px' }}>
                  <h3 style={{color:'#00cec9', margin:0, fontSize: isMobile?'1rem':'1.17em'}}>📋 1. 단품 마스터 등록</h3>
                  <button onClick={downloadExcelTemplate} style={{fontSize:'10px', padding:'5px 8px', cursor:'pointer', borderRadius:'4px'}}>📄 양식 다운</button>
                </div>
                
                <div style={{ marginBottom:'15px', padding:'10px', background:'#f8f9fa', border:'1px dashed #ccc', borderRadius:'8px', display:'flex', gap:'5px', alignItems: 'center' }}>
                   <input type="file" onChange={(e)=>setSelectedFile(e.target.files[0])} style={{fontSize:'11px', flex:1}}/>
                   <button onClick={handleExcelUpload} style={{fontSize:'11px', background:'#00cec9', color:'#fff', border:'none', borderRadius:'4px', padding:'6px 12px', cursor:'pointer', whiteSpace:'nowrap'}}>업로드</button>
                </div>
                
                <Select 
                  placeholder="기존 상품 검색 및 수정..." 
                  options={(masterProducts || []).map(p => ({ label: `[${p?.brand || ''}] [${p?.code || ''}] ${p?.name || ''}`, data: p }))} 
                  onChange={(opt) => {
                    if(opt && opt.data) {
                      setTempChild({
                        brand: opt.data.brand || '', season: opt.data.season || '', category: opt.data.category || '', 
                        품번코드: opt.data.code || '', 스타일넘버: opt.data.style_no || '', 상품명: opt.data.name || '', 
                        원가: opt.data.cost || '', tag가: opt.data.tag_price || ''
                      });
                    }
                  }} 
                />
                
                <div style={{ marginTop: '15px' }}>
                   <div style={{display:'flex', gap:'5px', marginBottom:'8px'}}>
                     <select value={tempChild.brand} onChange={e=>setTempChild({...tempChild, brand:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">브랜드</option>{brands.map(b=><option key={b} value={b}>{b}</option>)}</select>
                     <select value={tempChild.season} onChange={e=>setTempChild({...tempChild, season:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">시즌</option>{seasons.map(s=><option key={s} value={s}>{s}</option>)}</select>
                   </div>
                   <div style={{display:'flex', gap:'5px', marginBottom:'8px'}}>
                     <select value={tempChild.category} onChange={e=>setTempChild({...tempChild, category:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">복종</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
                     <input placeholder="품번코드 (필수)" value={tempChild.품번코드} onChange={e=>setTempChild({...tempChild, 품번코드:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd', boxSizing:'border-box'}} />
                   </div>
                   <input placeholder="스타일넘버" value={tempChild.스타일넘버} onChange={e=>setTempChild({...tempChild, 스타일넘버:e.target.value})} style={inputRegStyle} />
                   <input placeholder="상품명 (필수)" value={tempChild.상품명} onChange={e=>setTempChild({...tempChild, 상품명:e.target.value})} style={inputRegStyle} />
                   
                   <div style={{display:'flex', gap:'5px'}}>
                     <input type="number" placeholder="원가" value={tempChild.원가} onChange={e=>setTempChild({...tempChild, 원가:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}} />
                     <input type="number" placeholder="Tag가" value={tempChild.tag가} onChange={e=>setTempChild({...tempChild, tag가:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}} />
                   </div>
                   <button onClick={handleRegisterMaster} style={{width:'100%', padding:'12px', background:'#00cec9', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'bold', marginTop:'10px', cursor:'pointer'}}>단품 정보 저장하기</button>
                </div>
              </div>

              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', borderLeft: `5px solid #6c5ce7`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                <h3 style={{ color: '#6c5ce7', marginBottom: '15px', fontSize: isMobile?'1rem':'1.17em' }}>📦 2. 그룹/세트 최종 구성</h3>
                
                <Select 
                  placeholder="기존 그룹 불러오기 및 재매핑..." 
                  options={(groups || []).map(g => ({ label: `[${g.brand || ''}] [${g.type}] [${g.code}] ${g.name}`, data: g }))} 
                  onChange={(opt) => {
                    if(opt && opt.data) {
                      const grp = opt.data;
                      // 삭제된 단품은 제외하고 현재 masterProducts에 존재하는 것만 로드
                      const validChildren = (grp.children || [])
                        .map(c => masterProducts.find(p => p.brand === grp.brand && p.code === c.code))
                        .filter(Boolean);
                      setGroupInput({
                        brand: grp.brand || '', season: grp.season || '', type: grp.type || '묶음', category: grp.category || '',
                        groupCode: grp.code || '', styleNo: grp.style_no || '', groupName: grp.name || '',
                        cost: grp.cost || '', tagPrice: grp.tag_price || '', children: validChildren
                      });
                    }
                  }} 
                  style={{marginBottom: '15px'}}
                />
                <div style={{height:'15px'}}></div>

                <div style={{display:'flex', gap:'5px', marginBottom:'8px'}}>
                  <select value={groupInput.brand} onChange={e=>setGroupInput({...groupInput, brand:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">브랜드</option>{brands.map(b=><option key={b} value={b}>{b}</option>)}</select>
                  <select value={groupInput.season} onChange={e=>setGroupInput({...groupInput, season:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">시즌</option>{seasons.map(s=><option key={s} value={s}>{s}</option>)}</select>
                </div>
                
                <div style={{display:'flex', gap:'5px', marginBottom:'10px'}}>
                  <select value={groupInput.type} onChange={e => setGroupInput({...groupInput, type: e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="묶음">묶음상품</option><option value="세트">세트상품</option></select>
                  <select value={groupInput.category} onChange={e => setGroupInput({...groupInput, category: e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">복종</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
                </div>
                
                <input placeholder="그룹 관리용 품번 (필수)" value={groupInput.groupCode} onChange={e => setGroupInput({...groupInput, groupCode: e.target.value})} style={inputRegStyle} />
                <input placeholder="그룹 스타일넘버" value={groupInput.styleNo} onChange={e => setGroupInput({...groupInput, styleNo: e.target.value})} style={inputRegStyle} />
                <input placeholder="그룹 상품명 (노출명)" value={groupInput.groupName} onChange={e => setGroupInput({...groupInput, groupName: e.target.value})} style={inputRegStyle} />
                
                <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #ddd', marginBottom:'10px' }}>
                   <label style={{fontSize:'12px', fontWeight:'bold', display:'block', marginBottom:'8px'}}>🔗 구성 단품 매핑 추가</label>
                   
                   <Select isMulti closeMenuOnSelect={false} controlShouldRenderValue={false} placeholder="상품 검색하여 매핑 추가..." 
                     options={(masterProducts || []).filter(p => {
                       const gName = String(groupInput?.groupName || '').toLowerCase().trim();
                       const gStyle = String(groupInput?.styleNo || '').toLowerCase().trim();
                       if (!gName && !gStyle) return true;
                       const pName = String(p?.name || '').toLowerCase();
                       const pStyle = String(p?.style_no || '').toLowerCase();
                       return (gName && (pName.includes(gName) || pStyle.includes(gName))) || (gStyle && (pStyle.includes(gStyle) || pName.includes(gStyle)));
                     }).map(p => ({ label: `[${p?.brand || ''}] [${p?.code || ''}] ${p?.style_no || ''} - ${p?.name || ''}`, value: makeKey(p?.brand, p?.code), data: p }))} 
                     value={(groupInput?.children || []).map(c => {
                       // masterProducts에서 전체 객체 찾기 (그래야 options와 key가 일치)
                       const full = masterProducts.find(p => p.code === c.code && p.brand === (c.brand || groupInput.brand));
                       const item = full || c;
                       return { label: `[${item.brand||groupInput.brand}] [${item.code}] ${item.name||''}`, value: makeKey(item.brand||groupInput.brand, item.code), data: item };
                     })}
                     onChange={(opts) => setGroupInput({...groupInput, children: opts ? opts.map(o => o.data) : []})}
                   />
                   <div style={{ marginTop: '10px', maxHeight: '120px', overflowY: 'auto', fontSize:'11px', background:'#fff', border:'1px solid #eee', borderRadius:'4px' }}>
                      {groupInput.children.length === 0 && <div style={{padding:'10px', color:'#999', textAlign:'center'}}>선택 상품 없음.</div>}
                      {groupInput.children.map((c, i) => <div key={i} style={{borderBottom:'1px solid #f0f0f0', padding:'6px 8px', display:'flex', justifyContent:'space-between'}}><span>└ {c?.name} ({c?.code})</span><b style={{color:'red', cursor:'pointer'}} onClick={()=>setGroupInput({...groupInput, children: groupInput.children.filter((_,idx)=>idx!==i)})}>삭제</b></div>)}
                   </div>
                </div>
                <div style={{display:'flex', gap:'5px'}}>
                  <div style={{flex:1}}><label style={{fontSize:'11px'}}>총 원가</label><input type="number" value={groupInput.cost} onChange={e => setGroupInput({...groupInput, cost: e.target.value})} style={{...inputRegStyle, background:'#fff9db'}} /></div>
                  <div style={{flex:1}}><label style={{fontSize:'11px'}}>총 Tag가</label><input type="number" value={groupInput.tagPrice} onChange={e => setGroupInput({...groupInput, tagPrice: e.target.value})} style={{...inputRegStyle, background:'#fff9db'}} /></div>
                </div>
                <button onClick={handleSaveGroup} style={{width:'100%', padding:'12px', background:'#6c5ce7', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', marginTop:'10px'}}>그룹 저장(수정)하기</button>
              </div>
            </div>
          </div>
        )}

        {/* ======================= [ 메뉴 2: 가격 & 마진 시뮬레이션 ] ======================= */}
        {activeMenu === 'list' && (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', marginBottom: '15px', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile?'1.2rem':'1.5rem' }}>💰 가격/마진 시뮬레이션</h2>
              <div style={{ display: 'flex', gap: '8px', background:'#fff', padding:'8px', borderRadius:'8px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', width: isMobile ? '100%' : 'auto', boxSizing:'border-box', overflowX:'auto', whiteSpace:'nowrap' }}>
                <button onClick={handleExpandAll} style={{padding:'6px 10px', background:'#34495e', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>▼ 전체열기</button>
                <button onClick={handleCollapseAll} style={{padding:'6px 10px', background:'#7f8c8d', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>▶ 전체닫기</button>
                <div style={{width:'1px', background:'#ddd', margin:'0 2px'}}></div>
                <button onClick={downloadListExcel} style={{padding:'6px 10px', background:'#27ae60', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>📄 {selectedCodes.length > 0 ? "선택 엑셀" : "전체 엑셀"}</button>
                <select value={priceTemplateBrand} onChange={e => setPriceTemplateBrand(e.target.value)} style={{padding:'5px 6px', fontSize:'11px', borderRadius:'4px', border:'1px solid #8e44ad', color:'#8e44ad', fontWeight:'bold', cursor:'pointer'}}>
                  <option value=''>브랜드 선택</option>
                  {brands.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <button onClick={downloadPriceTemplate} style={{padding:'6px 10px', background:'#8e44ad', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>📋 가격양식 다운</button>
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', background:'#f8f9fa', padding:'4px 8px', borderRadius:'4px', border:'1px solid #ddd'}}>
                  📁 가격/기본수정
                  <input type="file" onChange={handleListExcelUpload} style={{display:'none'}} />
                </label>
                <div style={{display:'flex', alignItems:'center', gap:'4px', background:'#fff3cd', padding:'4px 10px', borderRadius:'6px', border:'1px solid #f0c040'}}>
                  <span style={{fontSize:'11px', fontWeight:'bold', whiteSpace:'nowrap'}}>💸 수수료율</span>
                  <input
                    type="number" value={feeRateInput} min="0" max="100" step="0.1"
                    onChange={e => handleFeeRateChange(e.target.value)}
                    style={{width:'42px', fontSize:'12px', fontWeight:'bold', textAlign:'center', border:'1px solid #f0c040', borderRadius:'4px', padding:'2px 4px'}}
                  />
                  <span style={{fontSize:'11px', fontWeight:'bold'}}>%</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:'4px', background:'#fef0f0', padding:'4px 10px', borderRadius:'6px', border:'1px solid #f5c0c0'}}>
                  <span style={{fontSize:'11px', fontWeight:'bold', whiteSpace:'nowrap'}}>📦 고정비</span>
                  <input
                    type="number" value={fixedCostInput} min="0" step="100"
                    onChange={e => handleFixedCostChange(e.target.value)}
                    style={{width:'60px', fontSize:'12px', fontWeight:'bold', textAlign:'center', border:'1px solid #f5c0c0', borderRadius:'4px', padding:'2px 4px'}}
                  />
                  <span style={{fontSize:'11px', fontWeight:'bold'}}>원</span>
                </div>
              </div>
            </div>
            
            <div style={{ background:'#fff', padding:'12px', borderRadius:'12px', marginBottom:'10px', display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' }}>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">복종 전체</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">브랜드 전체</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}</select>
              <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">시즌 전체</option>{seasons.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}>
                <option value="전체">구분 전체</option>
                <option value="단품">단품</option>
                <option value="묶음">묶음</option>
                <option value="세트">세트</option>
              </select>
              <div style={{ display:'flex', width: isMobile ? '100%' : 'auto', gap:'5px' }}>
                <input
                  placeholder="검색 (품번,상품명) 후 엔터"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => { if(e.key === 'Enter') setSearchTerm(searchInput); }}
                  style={{padding:'6px', flex:1, minWidth:'120px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'12px'}}
                />
                <button onClick={() => setSearchTerm(searchInput)} style={{padding:'6px 15px', background:PRIMARY_COLOR, color:'#fff', border:'none', borderRadius:'6px', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap'}}>조회</button>
              </div>
            </div>


            <div style={{ background:'#ebf3f9', padding:'8px', borderRadius:'8px', marginBottom:'15px', display:'flex', gap:'8px', alignItems:'center', border:'1px solid #3498db', overflowX:'auto', whiteSpace:'nowrap' }}>
              <strong style={{fontSize:'11px'}}>⚡ 일괄변경 ({selectedCodes.length}):</strong>
              <input type="number" placeholder="원가" onChange={e => setBatchInput({...batchInput, cost: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="Tag가" onChange={e => setBatchInput({...batchInput, tagPrice: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="네이버" onChange={e => setBatchInput({...batchInput, priceNaver: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="쿠팡" onChange={e => setBatchInput({...batchInput, priceCoupang: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="로켓" onChange={e => setBatchInput({...batchInput, priceRocket: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="골드" onChange={e => setBatchInput({...batchInput, priceGold: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="행사가" onChange={e => setBatchInput({...batchInput, priceSale: e.target.value})} style={batchInputStyle} />
              <button onClick={handleBatchUpdate} style={{padding:'4px 10px', background:'#e67e22', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>적용</button>
              <div style={{ width: '1px', height: '20px', background: '#3498db', margin: '0 2px' }}></div>
              <button onClick={handleBatchDelete} style={{padding:'4px 10px', background:'#e74c3c', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>🗑️ 삭제</button>
            </div>

            <div style={{ background:'#fff', borderRadius:'12px', overflowX:'auto', boxShadow:'0 4px 15px rgba(0,0,0,0.05)', maxHeight: isMobile ? '65vh' : '80vh' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ ...thStyle, ...fX(cols.chk.l, true), ...cellS(cols.chk) }}><input type="checkbox" onChange={handleSelectAll} checked={selectedCodes.length > 0 && selectedCodes.length === visibleData.filter(i=>!i.isGhost).length} /></th>
                    <th style={{ ...thStyle, ...fX(cols.brd.l, true), ...cellS(cols.brd) }} onClick={() => handleSort('brand')}>브랜드</th>
                    <th style={{ ...thStyle, ...fX(cols.sea.l, true), ...cellS(cols.sea) }} onClick={() => handleSort('season')}>시즌</th>
                    <th style={{ ...thStyle, ...fX(cols.typ.l, true), ...cellS(cols.typ) }} onClick={() => handleSort('type')}>구분</th>
                    <th style={{ ...thStyle, ...fX(cols.cod.l, true), ...cellS(cols.cod) }} onClick={() => handleSort('code')}>품번</th>
                    <th style={{ ...thStyle, ...fX(cols.cat.l, true), ...cellS(cols.cat) }} onClick={() => handleSort('category')}>복종</th>
                    <th style={{ ...thStyle, ...fX(cols.sty.l, true), ...cellS(cols.sty) }} onClick={() => handleSort('style_no')}>스타일</th>
                    <th style={{ ...thStyle, ...fX(cols.nam.l, true), ...cellS(cols.nam), textAlign:'left' }} onClick={() => handleSort('name')}>상품명</th>
                    <th style={{ ...thStyle, ...fX(cols.cst.l, true), ...cellS(cols.cst) }} onClick={() => handleSort('cost')}>원가</th>
                    <th style={{ ...thStyle, ...fX(cols.tag.l, true), ...cellS(cols.tag), borderRight: '2px solid #aaa' }} onClick={() => handleSort('tag_price')}>Tag가</th>
                    <th style={{...thStyle, width:'80px'}} onClick={() => handleSort('price_naver')}><div style={{fontSize:'9px',color:'#aaa'}}>이전</div>네이버</th>
                    <th style={{...thStyle, width:'80px'}} onClick={() => handleSort('price_coupang')}><div style={{fontSize:'9px',color:'#aaa'}}>이전</div>쿠팡</th>
                    <th style={{...thStyle, width:'80px'}} onClick={() => handleSort('price_rocket')}><div style={{fontSize:'9px',color:'#aaa'}}>이전</div>로켓</th>
                    <th style={{...thStyle, width:'80px'}} onClick={() => handleSort('price_gold')}><div style={{fontSize:'9px',color:'#aaa'}}>이전</div>골드</th>
                    <th style={{...thStyle, width:'85px', background:'#fff9f9'}} onClick={() => handleSort('price_sale')}><div style={{fontSize:'9px',color:'#aaa'}}>이전</div><span style={{color:'#e17055'}}>행사가</span></th>
                    <th style={{...thStyle, width:'50px'}}>수수료</th>
                    <th style={{...thStyle, width:'55px'}}>정산액</th>
                    <th style={{...thStyle, width:'35px'}}>배수</th>
                    <th style={{...thStyle, width:'95px', background:'#fff9f9'}} onClick={() => handleSort('margin')}><div style={{fontSize:'9px',color:'#aaa'}}>이전</div><span style={{color:'#e74c3c'}}>마진</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((item, idx) => {
                    const isGhost = item.isGhost;
                    const isChild = item.isMappedChild;
                    const itemKey = makeKey(item.brand, item.code);
                    const trBg = selectedCodes.includes(itemKey) ? '#fff9db' : (isChild ? '#f8fbfc' : '#fff');
                    const typeStr = String(item.type || '');
                    const isGroupType = typeStr.includes('묶음') || typeStr.includes('세트');
                    const prevN = item.prevNaver || 0;
                    const prevS = item.prevSale || 0;
                    const curS = Number(item.price_sale || 0);
                    const curMargin = (curS - Math.floor(curS * (feeRate / 100))) - Number(item.cost || 0) - fixedCost;

                    // 스택형 가격 셀 렌더
                    const stackCell = (field, prevVal, curVal, isSaleCol = false) => (
                      isGhost ? <span style={{color:GHOST_COLOR}}>-</span> :
                      <div style={{display:'flex',flexDirection:'column',gap:'1px',alignItems:'flex-end'}}>
                        <span style={{fontSize:'9px',color:'#bbb',textDecoration: prevVal !== (Number(item[field]||0)) ? 'line-through' : 'none'}}>{prevVal.toLocaleString()}</span>
                        <div style={{display:'flex',alignItems:'center',gap:'2px'}}>
                          {renderInlineCell(item,field,curVal,false,{color:getDiffColor(prevVal,curVal),bold:prevVal!==curVal,width:'62px'})}
                          {isSaleCol && <span style={{fontSize:'9px',color:'#aaa'}}>({item.discSale}%)</span>}
                        </div>
                      </div>
                    );

                    return (
                      <tr key={`${itemKey}-${idx}`} style={{ background: trBg }}>
                        <td style={{ ...tdStyle, ...fX(cols.chk.l), ...cellS(cols.chk), background: trBg }}>{!isGhost && <input type="checkbox" checked={selectedCodes.includes(itemKey)} onChange={() => setSelectedCodes(prev => prev.includes(itemKey) ? prev.filter(c => c !== itemKey) : [...prev, itemKey])} />}</td>
                        <td style={{ ...tdStyle, ...fX(cols.brd.l), ...cellS(cols.brd), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.brand}</span> : renderInlineCell(item,'brand',item.brand,false,{inputType:'select',options:brands,width:'65px'})}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sea.l), ...cellS(cols.sea), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.season}</span> : renderInlineCell(item,'season',item.season,false,{inputType:'select',options:seasons,width:'55px'})}</td>
                        <td style={{ ...tdStyle, ...fX(cols.typ.l), ...cellS(cols.typ), background: trBg, color: isGhost?GHOST_COLOR:(isGroupType?'#6c5ce7':(isChild?'#888':'#999')), fontWeight:isGroupType?'bold':'normal' }}>
                          {isGroupType && <span onClick={()=>toggleGroup(itemKey)} style={{cursor:'pointer',marginRight:'4px',color:'#6c5ce7'}}>{collapsedGroups.includes(itemKey)?'▶':'▼'}</span>}
                          {item.type}
                        </td>
                        <td style={{ ...tdStyle, ...fX(cols.cod.l), ...cellS(cols.cod), background: trBg, paddingLeft:isChild?'10px':'2px' }}>
                          {isChild && <span style={{color:'#bdc3c7',marginRight:'3px'}}>└</span>}
                          <span style={{color:isGhost?GHOST_COLOR:'inherit'}}>{(isChild && item.parentIsSet) ? `${item.code}(단품별도)` : item.code}</span>
                        </td>
                        <td style={{ ...tdStyle, ...fX(cols.cat.l), ...cellS(cols.cat), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.category}</span> : renderInlineCell(item,'category',item.category,false,{inputType:'select',options:categories,width:'55px'})}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sty.l), ...cellS(cols.sty), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.style_no}</span> : renderInlineCell(item,'style_no',item.style_no,false,{inputType:'text'})}</td>
                        <td style={{ ...tdStyle, ...fX(cols.nam.l), ...cellS(cols.nam), background: trBg, textAlign:'left', paddingLeft:isChild?'10px':'2px' }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.name}(중복)</span> : renderInlineCell(item,'name',item.name,false,{inputType:'text'})}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cst.l), ...cellS(cols.cst), background: trBg }}>{renderInlineCell(item,'cost',item.cost,isGhost,{width:'50px'})}</td>
                        <td style={{ ...tdStyle, ...fX(cols.tag.l), ...cellS(cols.tag), background: trBg, borderRight:'2px solid #aaa' }}>{renderInlineCell(item,'tag_price',item.tag_price,isGhost,{width:'55px',bold:true})}</td>
                        <td style={{...tdStyle,textAlign:'right',paddingRight:'6px'}}>{stackCell('price_naver',prevN,Number(item.price_naver||0))}</td>
                        <td style={{...tdStyle,textAlign:'right',paddingRight:'6px'}}>{stackCell('price_coupang',item.prevCoupang||0,Number(item.price_coupang||0))}</td>
                        <td style={{...tdStyle,textAlign:'right',paddingRight:'6px'}}>{stackCell('price_rocket',item.prevRocket||0,Number(item.price_rocket||0))}</td>
                        <td style={{...tdStyle,textAlign:'right',paddingRight:'6px'}}>{stackCell('price_gold',item.prevGold||0,Number(item.price_gold||0))}</td>
                        <td style={{...tdStyle,textAlign:'right',paddingRight:'6px',background:'#fffaf8'}}>{stackCell('price_sale',prevS,curS,true)}</td>
                        <td style={tdStyle}>{isGhost?<span style={{color:GHOST_COLOR}}>-</span>:Math.floor(curS*(feeRate/100)).toLocaleString()}</td>
                        <td style={{...tdStyle,fontWeight:'bold'}}>{isGhost?<span style={{color:GHOST_COLOR}}>-</span>:(curS-Math.floor(curS*(feeRate/100))).toLocaleString()}</td>
                        <td style={tdStyle}>{isGhost?<span style={{color:GHOST_COLOR}}>-</span>:item.ratio}</td>
                        <td style={{...tdStyle,textAlign:'right',paddingRight:'6px',background:'#fff9f9'}}>
                          {isGhost?<span style={{color:GHOST_COLOR}}>-</span>:
                          <div style={{display:'flex',flexDirection:'column',gap:'1px',alignItems:'flex-end'}}>
                            <span style={{fontSize:'9px',color:'#bbb',textDecoration:curMargin!==Number(item.prevMargin||0)?'line-through':'none'}}>{Number(item.prevMargin||0).toLocaleString()}</span>
                            <span style={{fontWeight:'bold',color:curMargin>Number(item.prevMargin||0)?'#2980b9':curMargin<Number(item.prevMargin||0)?'#e74c3c':'#222'}}>{curMargin.toLocaleString()}</span>
                          </div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================= [ 메뉴 3: 신규 재고 & 발주 관리 ] ======================= */}
        {activeMenu === 'inventory' && (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', marginBottom: '15px', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile?'1.2rem':'1.5rem' }}>📦 재고 및 발주 관리</h2>
              
              <div style={{ display: 'flex', gap: '8px', background:'#fff', padding:'8px', borderRadius:'8px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', width: isMobile ? '100%' : 'auto', boxSizing:'border-box', overflowX:'auto', whiteSpace:'nowrap' }}>
                <button onClick={handleExpandAll} style={{padding:'6px 10px', background:'#34495e', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>▼ 전체열기</button>
                <button onClick={handleCollapseAll} style={{padding:'6px 10px', background:'#7f8c8d', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>▶ 전체닫기</button>
                <div style={{width:'1px', background:'#ddd', margin:'0 2px'}}></div>
                {/* 💡 3번 재고발주 메뉴 엑셀 다운로드 버튼 */}
                <button onClick={downloadListExcel} style={{padding:'6px 10px', background:'#27ae60', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>📄 {selectedCodes.length > 0 ? "선택 엑셀" : "전체 엑셀"}</button>
                <div style={{width:'1px', background:'#ddd', margin:'0 2px'}}></div>
                <span style={{fontSize:'10px', color:'#999', fontWeight:'bold'}}>온라인재고:</span>
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', background:'#e8f8f5', padding:'5px 10px', borderRadius:'6px', border:'1px solid #1abc9c', color:'#16a085', fontWeight:'bold'}}>
                  📦 몽벨
                  <input type="file" accept=".xlsx,.xls" onChange={handleMWInventoryExcelUpload} style={{display:'none'}} />
                </label>
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', background:'#e8f8f5', padding:'5px 10px', borderRadius:'6px', border:'1px solid #1abc9c', color:'#16a085', fontWeight:'bold'}}>
                  📦 라온팩토리
                  <input type="file" accept=".xlsx,.xls" onChange={handleRaonInventoryExcelUpload} style={{display:'none'}} />
                </label>
                <div style={{width:'1px', background:'#ddd', margin:'0 2px'}}></div>
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', background:'#f4ecf7', padding:'5px 10px', borderRadius:'6px', border:'1px solid #8e44ad', color:'#8e44ad', fontWeight:'bold'}}>
                  🏢 본사재고
                  <input type="file" accept=".xlsx,.xls" onChange={handleHqStockExcelUpload} style={{display:'none'}} />
                </label>
                <div style={{width:'1px', background:'#ddd', margin:'0 2px'}}></div>
                <span style={{fontSize:'10px', color:'#999', fontWeight:'bold'}}>발주:</span>
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', background:'#fef5e7', padding:'5px 10px', borderRadius:'6px', border:'1px solid #e67e22', color:'#d35400', fontWeight:'bold'}}>
                  🛒 몽벨
                  <input type="file" accept=".xlsx,.xls" onChange={handleMWOrderExcelUpload} style={{display:'none'}} />
                </label>
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'4px', cursor:'pointer', background:'#fef5e7', padding:'5px 10px', borderRadius:'6px', border:'1px solid #e67e22', color:'#d35400', fontWeight:'bold'}}>
                  🛒 라온팩토리
                  <input type="file" accept=".xlsx,.xls" onChange={handleRaonOrderExcelUpload} style={{display:'none'}} />
                </label>
              </div>
            </div>
            
            <div style={{ background:'#fff', padding:'12px', borderRadius:'12px', marginBottom:'10px', display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' }}>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">복종 전체</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">브랜드 전체</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}</select>
              <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">시즌 전체</option>{seasons.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}>
                <option value="전체">구분 전체</option>
                <option value="단품">단품</option>
                <option value="묶음">묶음</option>
                <option value="세트">세트</option>
              </select>
              <div style={{ display:'flex', width: isMobile ? '100%' : 'auto', gap:'5px' }}>
                <input
                  placeholder="검색 (품번,상품명) 후 엔터"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => { if(e.key === 'Enter') setSearchTerm(searchInput); }}
                  style={{padding:'6px', flex:1, minWidth:'120px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'12px'}}
                />
                <button onClick={() => setSearchTerm(searchInput)} style={{padding:'6px 15px', background:PRIMARY_COLOR, color:'#fff', border:'none', borderRadius:'6px', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap'}}>조회</button>
              </div>
            </div>

            <div style={{ background:'#fff', borderRadius:'12px', overflowX:'auto', boxShadow:'0 4px 15px rgba(0,0,0,0.05)', maxHeight: isMobile ? '65vh' : '80vh' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ ...thStyle, ...fX(cols.chk.l, true), ...cellS(cols.chk) }}><input type="checkbox" onChange={handleSelectAll} checked={selectedCodes.length > 0 && selectedCodes.length === visibleData.length} /></th>
                    <th style={{ ...thStyle, ...fX(cols.brd.l, true), ...cellS(cols.brd) }} onClick={() => handleSort('brand')}>브랜드</th>
                    <th style={{ ...thStyle, ...fX(cols.sea.l, true), ...cellS(cols.sea) }} onClick={() => handleSort('season')}>시즌</th>
                    <th style={{ ...thStyle, ...fX(cols.typ.l, true), ...cellS(cols.typ) }} onClick={() => handleSort('type')}>구분</th>
                    <th style={{ ...thStyle, ...fX(cols.cod.l, true), ...cellS(cols.cod) }} onClick={() => handleSort('code')}>품번</th>
                    <th style={{ ...thStyle, ...fX(cols.cat.l, true), ...cellS(cols.cat) }} onClick={() => handleSort('category')}>복종</th>
                    <th style={{ ...thStyle, ...fX(cols.sty.l, true), ...cellS(cols.sty) }} onClick={() => handleSort('style_no')}>스타일</th>
                    <th style={{ ...thStyle, ...fX(cols.nam.l, true), ...cellS(cols.nam), textAlign:'left', borderRight: '2px solid #aaa' }} onClick={() => handleSort('name')}>상품명</th>
                    <th style={{...thStyle, width:'70px'}} onClick={() => handleSort('order_w1')}>1주발주</th>
                    <th style={{...thStyle, width:'70px'}} onClick={() => handleSort('order_w2')}>2주발주</th>
                    <th style={{...thStyle, width:'70px'}} onClick={() => handleSort('order_w3')}>3주발주</th>
                    <th style={{...thStyle, width:'80px', color:'#27ae60'}} onClick={() => handleSort('stock')}>온라인재고</th>
                    <th style={{...thStyle, width:'80px'}} onClick={() => handleSort('hq_stock')}>본사재고</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((item, idx) => {
                    const isGhost = item.isGhost;
                    const isChild = item.isMappedChild;
                    const itemKey = makeKey(item.brand, item.code);
                    const trBg = selectedCodes.includes(itemKey) ? '#fff9db' : (isChild ? '#f8fbfc' : '#fff');
                    const txtColor = isGhost ? '#95a5a6' : 'inherit';

                    const typeStr = String(item.type || '');
                    const isGroupType = typeStr.includes('묶음') || typeStr.includes('세트');
                    
                    return (
                      <tr key={`inv-${itemKey}-${idx}`} style={{ background: trBg, color: txtColor }}>
                        <td style={{ ...tdStyle, ...fX(cols.chk.l), ...cellS(cols.chk), background: trBg }}>
                           <input type="checkbox" checked={selectedCodes.includes(itemKey)} onChange={() => setSelectedCodes(prev => prev.includes(itemKey) ? prev.filter(c => c !== itemKey) : [...prev, itemKey])} />
                        </td>
                        <td style={{ ...tdStyle, ...fX(cols.brd.l), ...cellS(cols.brd), background: trBg }}>{item.brand}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sea.l), ...cellS(cols.sea), background: trBg }}>{item.season}</td>
                        
                        <td style={{ ...tdStyle, ...fX(cols.typ.l), ...cellS(cols.typ), background: trBg, fontWeight: isGroupType?'bold':'normal' }}>
                          {isGroupType && (
                            <span onClick={() => toggleGroup(itemKey)} style={{cursor:'pointer', marginRight:'4px', display:'inline-block', width:'12px', color:'#6c5ce7'}}>
                              {collapsedGroups.includes(itemKey) ? '▶' : '▼'}
                            </span>
                          )}
                          {item.type}
                        </td>

                        <td style={{ ...tdStyle, ...fX(cols.cod.l), ...cellS(cols.cod), background: trBg, paddingLeft: isChild?'10px':'2px' }}>{isChild && <span style={{color:'#bdc3c7', marginRight:'3px'}}>└</span>}{(isChild && item.parentIsSet) ? `${item.code}(단품별도)` : item.code}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cat.l), ...cellS(cols.cat), background: trBg }}>{item.category}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sty.l), ...cellS(cols.sty), background: trBg }}>{item.style_no}</td>
                        <td style={{ ...tdStyle, ...fX(cols.nam.l), ...cellS(cols.nam), background: trBg, textAlign:'left', paddingLeft: isChild?'10px':'2px', borderRight: '2px solid #aaa' }}>
                          {item.name} {isGhost && <span style={{fontSize:'10px', color:'#e74c3c'}}>(중복)</span>}
                        </td>
                        
                        <td style={{...tdStyle}}>{renderInlineCell(item,'order_w1',item.order_w1,isGhost,{width:'55px'})}</td>
                        <td style={{...tdStyle}}>{renderInlineCell(item,'order_w2',item.order_w2,isGhost,{width:'55px'})}</td>
                        <td style={{...tdStyle}}>{renderInlineCell(item,'order_w3',item.order_w3,isGhost,{width:'55px'})}</td>
                        <td style={{...tdStyle}}>{renderInlineCell(item,'stock',item.stock,isGhost,{width:'60px',color:'#27ae60',bold:true})}</td>
                        <td style={{...tdStyle}}>{renderInlineCell(item,'hq_stock',item.hq_stock,isGhost,{width:'60px'})}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ====== 엑셀 업로드 신규 항목 확인 팝업 ====== */}
    {pendingExcelUpload && (
      <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.5)',zIndex:9999,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{background:'#fff',borderRadius:'12px',padding:'28px 32px',maxWidth:'460px',width:'90%',boxShadow:'0 8px 32px rgba(0,0,0,0.2)'}}>
          <h3 style={{margin:'0 0 16px',fontSize:'16px',color:'#2c3e50'}}>📋 신규 항목이 감지되었습니다</h3>
          <p style={{fontSize:'13px',color:'#555',margin:'0 0 14px'}}>아래 항목들이 현재 목록에 없습니다. 추가하시겠습니까?</p>
          {pendingExcelUpload.newBrands.length > 0 && (
            <div style={{marginBottom:'10px'}}>
              <div style={{fontSize:'12px',fontWeight:'bold',color:'#8e44ad',marginBottom:'4px'}}>브랜드</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {pendingExcelUpload.newBrands.map(b => (
                  <span key={b} style={{background:'#f4ecf7',border:'1px solid #8e44ad',color:'#6c3483',padding:'3px 10px',borderRadius:'12px',fontSize:'12px'}}>{b}</span>
                ))}
              </div>
            </div>
          )}
          {pendingExcelUpload.newCategories.length > 0 && (
            <div style={{marginBottom:'10px'}}>
              <div style={{fontSize:'12px',fontWeight:'bold',color:'#2980b9',marginBottom:'4px'}}>복종</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {pendingExcelUpload.newCategories.map(c => (
                  <span key={c} style={{background:'#ebf5fb',border:'1px solid #2980b9',color:'#1a5276',padding:'3px 10px',borderRadius:'12px',fontSize:'12px'}}>{c}</span>
                ))}
              </div>
            </div>
          )}
          {pendingExcelUpload.newSeasons.length > 0 && (
            <div style={{marginBottom:'10px'}}>
              <div style={{fontSize:'12px',fontWeight:'bold',color:'#27ae60',marginBottom:'4px'}}>시즌</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
                {pendingExcelUpload.newSeasons.map(s => (
                  <span key={s} style={{background:'#eafaf1',border:'1px solid #27ae60',color:'#1e8449',padding:'3px 10px',borderRadius:'12px',fontSize:'12px'}}>{s}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{display:'flex',gap:'12px',marginTop:'20px',justifyContent:'flex-end'}}>
            <button onClick={() => setPendingExcelUpload(null)}
              style={{padding:'8px 22px',background:'#ecf0f1',color:'#555',border:'none',borderRadius:'6px',fontSize:'13px',cursor:'pointer',fontWeight:'bold'}}>
              X 취소
            </button>
            <button onClick={async () => {
              const { rows, newBrands, newCategories, newSeasons } = pendingExcelUpload;
              setPendingExcelUpload(null);
              const inserts = [];
              for (const b of newBrands) inserts.push(supabase.from('brands').insert({ name: b }));
              for (const c of newCategories) inserts.push(supabase.from('categories').insert({ name: c }));
              for (const s of newSeasons) inserts.push(supabase.from('seasons').insert({ name: s }));
              await Promise.all(inserts);
              await applyListExcelUpload(rows);
            }}
              style={{padding:'8px 22px',background:'#27ae60',color:'#fff',border:'none',borderRadius:'6px',fontSize:'13px',cursor:'pointer',fontWeight:'bold'}}>
              O 추가 후 업로드
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

export default App;