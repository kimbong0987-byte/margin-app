import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { supabase } from './supabaseClient'; 

// 💡 텍스트 비교 시 띄어쓰기(공백)만 안전하게 제거하는 함수
const cleanStr = (s) => String(s || "").replace(/\s+/g, '').toUpperCase();

// 💡 브랜드와 품번을 결합하여 고유한 키를 만드는 함수
const makeKey = (brand, code) => `${brand}|||${code}`;

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
  const [sortConfig, setSortConfig] = useState({ key: 'code', direction: 'asc' });
  const [selectedCodes, setSelectedCodes] = useState([]); 

  const [batchInput, setBatchInput] = useState({ 
    cost: '', tagPrice: '', priceNaver: '', priceCoupang: '', priceRocket: '', priceGold: '', priceSale: '' 
  });
  
  const [editingItem, setEditingItem] = useState(null); 
  const [editRow, setEditRow] = useState({});

  const [tempChild, setTempChild] = useState({ 
    brand: '', season: '', category: '', 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' 
  });
  const [groupInput, setGroupInput] = useState({ 
    brand: '', season: '', type: '묶음', category: '', groupCode: '', styleNo: '', groupName: '', cost: '', tagPrice: '', children: [] 
  });

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [collapsedGroups, setCollapsedGroups] = useState([]);

  // 인라인 셀 편집
  const [editingCell, setEditingCell] = useState(null); // { key, field }
  const [editingCellValue, setEditingCellValue] = useState('');
  const isSavingCellRef = React.useRef(false);

  // 필터 강화
  const [marginFilter, setMarginFilter] = useState({ min: '', max: '' });
  const [quickFilter, setQuickFilter] = useState('');

  // 수수료율 설정 (localStorage 저장)
  const [feeRate, setFeeRate] = useState(() => Number(localStorage.getItem('feeRate') || 18));
  const [feeRateInput, setFeeRateInput] = useState(() => String(localStorage.getItem('feeRate') || '18'));

  const handleFeeRateChange = (val) => {
    setFeeRateInput(val);
    const n = Number(val);
    if (!isNaN(n) && n >= 0 && n <= 100) {
      setFeeRate(n);
      localStorage.setItem('feeRate', n);
    }
  };

  // ==========================================
  // 2. 초기 데이터 로드
  // ==========================================
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
      
      let searchString = String(item.code || "") + String(item.style_no || "") + String(item.name || "");
      if (item.children && Array.isArray(item.children)) {
          item.children.forEach(c => {
              searchString += String(c.code || "") + String(c.name || "");
          });
      }
      const matchSearch = term === '' || searchString.toLowerCase().includes(term);

      return matchCat && matchBrand && matchSeason && matchSearch;
    };

    const matchedGroups = groups.filter(isMatch).map(g => ({ ...g, type: g.type || '묶음' }));
    const matchedSingles = masterProducts.filter(isMatch).map(p => ({ ...p, type: '단품' }));

    const matchedMappedCodes = new Set();
    matchedGroups.forEach(g => {
      if (g.children) {
        g.children.forEach(c => {
          const childKey = makeKey(g.brand, c.code);
          if (masterMap.has(childKey)) matchedMappedCodes.add(childKey);
        });
      }
    });

    const standaloneSingles = matchedSingles.filter(s => !matchedMappedCodes.has(makeKey(s.brand, s.code)));
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
       calcItem.margin = (sale - Math.floor(sale * (feeRate / 100))) - cost - 5000;

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

          expandedResult.push({ 
            ...liveChild,
            brand: liveChild.brand || item.brand,
            season: liveChild.season || item.season,
            category: liveChild.category || item.category,
            type: 'ㄴ 구성', 
            isMappedChild: true, 
            parentCode: item.code,
            parentBrand: item.brand,
            isGhost: isGhost,
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
      const pSale = Number(item.prev_sale || item.price_sale || 0);
      const pMargin = (pSale - Math.floor(pSale * (feeRate / 100))) - cost - 5000;
      const discSale = tag === 0 ? 0 : Math.round((1 - (sale / tag)) * 100);
      const margin = (sale - fee) - cost - 5000;
      return {
        ...item, fee, settle, prevMargin: pMargin, margin,
        ratio: cost > 0 ? (sale / cost).toFixed(1) : "0.0", discSale
      };
    });

    return mapped.filter(item => {
      if (item.isMappedChild) return true; // 자식 행은 필터 통과
      const m = item.margin || 0;
      if (marginFilter.min !== '' && m < Number(marginFilter.min)) return false;
      if (marginFilter.max !== '' && m > Number(marginFilter.max)) return false;
      if (quickFilter === 'neg') return m < 0;
      if (quickFilter === 'zero-stock') return Number(item.stock || 0) === 0;
      if (quickFilter === 'has-order') return (Number(item.order_w1||0)+Number(item.order_w2||0)+Number(item.order_w3||0)) > 0;
      return true;
    });
  }, [masterProducts, groups, filterCategory, filterBrand, filterSeason, searchTerm, sortConfig, marginFilter, quickFilter, feeRate]);

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

  const saveEdit = async (item) => {
    const typeStr = String(item.type || '');
    const tbl = (typeStr.includes('단품') || typeStr.includes('구성')) ? 'master_products' : 'groups';
    
    await supabase.from(tbl).update({
      brand: editRow.brand, season: editRow.season, category: editRow.category, style_no: editRow.style_no, name: editRow.name, 
      cost: Number(editRow.cost), tag_price: Number(editRow.tag_price), price_naver: Number(editRow.price_naver || 0), 
      price_coupang: Number(editRow.price_coupang||0), price_rocket: Number(editRow.price_rocket||0), 
      price_gold: Number(editRow.price_gold||0), price_sale: Number(editRow.price_sale || 0),
      stock: Number(editRow.stock || 0),
      hq_stock: Number(editRow.hq_stock || 0),
      order_w1: Number(editRow.order_w1 || 0),
      order_w2: Number(editRow.order_w2 || 0),
      order_w3: Number(editRow.order_w3 || 0),
      prev_naver: Number(item.price_naver || 0), prev_sale: Number(item.price_sale || 0)
    }).eq('code', editingItem.code).eq('brand', editingItem.brand); 
    
    setEditingItem(null); 
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

  // 인라인 셀 저장
  const handleCellSave = async (item, field, value) => {
    if (isSavingCellRef.current) return;
    isSavingCellRef.current = true;
    const numVal = Number(String(value).replace(/,/g, '') || 0);
    const tbl = groups.some(g => g.code === item.code && g.brand === item.brand) ? 'groups' : 'master_products';
    const updateData = { [field]: numVal };
    if (field === 'price_sale') updateData.prev_sale = Number(item.price_sale || 0);
    if (field === 'price_naver') updateData.prev_naver = Number(item.price_naver || 0);
    await supabase.from(tbl).update(updateData).eq('code', item.code).eq('brand', item.brand);
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
      const margin = (curS - Math.floor(curS * (feeRate / 100))) - cost - 5000;

      return {
        "구분": item.type, "품번": item.code, "브랜드": item.brand || '', "시즌": item.season || '',
        "복종": item.category || '', "스타일코드": item.style_no || '', "상품명": item.name || '',
        "원가": item.cost || 0, "Tag가": item.tag_price || 0,
        "네이버(변경)": item.price_naver || 0, "쿠팡(변경)": item.price_coupang || 0, 
        "로켓(변경)": item.price_rocket || 0, "골드(변경)": item.price_gold || 0, "행사가(변경)": item.price_sale || 0,
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

  const handleListExcelUpload = async (e) => {
    const file = e.target.files[0]; 
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const rows = XLSX.utils.sheet_to_json(XLSX.read(ev.target.result, {type:'binary'}).Sheets[XLSX.read(ev.target.result, {type:'binary'}).SheetNames[0]], { defval: "" });
        
        const updatePromises = [];

        for(const r of rows) {
          const c = String(r["품번"] || "").trim();
          const b = String(r["브랜드"] || "").trim();
          if (!c || !b) continue;

          const tbl = groups.some(g=>g.code===c && g.brand===b) ? 'groups' : 'master_products';
          const payload = {};

          if ("브랜드" in r) payload.brand = String(r["브랜드"]);
          if ("시즌" in r) payload.season = String(r["시즌"]);
          if ("복종" in r) payload.category = String(r["복종"]);
          if ("스타일코드" in r) payload.style_no = String(r["스타일코드"]);
          if ("상품명" in r) payload.name = String(r["상품명"]);
          
          if ("원가" in r) payload.cost = Number(String(r["원가"]).replace(/,/g, '') || 0);
          if ("Tag가" in r) payload.tag_price = Number(String(r["Tag가"]).replace(/,/g, '') || 0);
          if ("네이버(변경)" in r) payload.price_naver = Number(String(r["네이버(변경)"]).replace(/,/g, '') || 0);
          if ("쿠팡(변경)" in r) payload.price_coupang = Number(String(r["쿠팡(변경)"]).replace(/,/g, '') || 0);
          if ("로켓(변경)" in r) payload.price_rocket = Number(String(r["로켓(변경)"]).replace(/,/g, '') || 0);
          if ("골드(변경)" in r) payload.price_gold = Number(String(r["골드(변경)"]).replace(/,/g, '') || 0);
          if ("행사가(변경)" in r) payload.price_sale = Number(String(r["행사가(변경)"]).replace(/,/g, '') || 0);
          
          if ("온라인재고" in r) payload.stock = Number(String(r["온라인재고"]).replace(/,/g, '') || 0);
          if ("본사재고" in r) payload.hq_stock = Number(String(r["본사재고"]).replace(/,/g, '') || 0);
          if ("1주발주" in r) payload.order_w1 = Number(String(r["1주발주"]).replace(/,/g, '') || 0);
          if ("2주발주" in r) payload.order_w2 = Number(String(r["2주발주"]).replace(/,/g, '') || 0);
          if ("3주발주" in r) payload.order_w3 = Number(String(r["3주발주"]).replace(/,/g, '') || 0);

          if (Object.keys(payload).length > 0) {
            updatePromises.push(supabase.from(tbl).update(payload).eq('code', c).eq('brand', b));
          }
        }
        
        await Promise.all(updatePromises);
        alert("✅ 엑셀 일괄 수정 업로드 완료!\n(다운로드 하셨던 엑셀의 모든 변경사항이 완벽하게 반영되었습니다.)"); 
        fetchData();
      } catch (err) {
        console.error(err);
        alert("❌ 엑셀 처리 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file); 
    e.target.value = null;
  };

  const handleInventoryExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const workbook = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        
        let headerRowIndex = -1;
        let cIdx=-1, xIdx=-1, lIdx=-1, pIdx=-1, rIdx=-1, tIdx=-1, vIdx=-1;
        
        for (let i = 0; i < Math.min(15, rows.length); i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;
          
          const foundC = row.findIndex(cell => cleanStr(cell) === "상품코드");
          const foundX = row.findIndex(cell => cleanStr(cell) === "합재고");
          if (foundC !== -1 && foundX !== -1) {
             headerRowIndex = i;
             cIdx = foundC; xIdx = foundX;
             lIdx = row.findIndex(cell => cleanStr(cell) === "바코드");
             pIdx = row.findIndex(cell => cleanStr(cell).includes("옵션별칭1"));
             rIdx = row.findIndex(cell => cleanStr(cell).includes("옵션별칭2"));
             tIdx = row.findIndex(cell => cleanStr(cell).includes("옵션별칭3"));
             vIdx = row.findIndex(cell => cleanStr(cell).includes("옵션별칭4"));
             break;
          }
        }

        if (headerRowIndex === -1) return alert("❌ '상품코드' 또는 '합재고' 항목을 찾지 못했습니다.");

        const stockMap = {}; 
        const barcodeMap = {}; 
        const allProducts = [...masterProducts, ...groups];

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;

          let cValue = cleanStr(row[cIdx]);
          if (cValue.includes('-')) {
              cValue = cValue.split('-')[0];
          }

          const xValue = Number(String(row[xIdx] || "0").replace(/,/g, '')) || 0; 

          if (cValue && cValue !== "상품코드") {
            const targetProduct = allProducts.find(p => cleanStr(p.code) === cValue);

            if (targetProduct) {
              const mainKey = makeKey(targetProduct.brand, targetProduct.code);
              stockMap[mainKey] = (stockMap[mainKey] || 0) + xValue; 
              
              if (!barcodeMap[mainKey]) barcodeMap[mainKey] = new Set();
              
              [lIdx, pIdx, rIdx, tIdx, vIdx].forEach(idx => {
                  if (idx !== -1) {
                      const val = cleanStr(row[idx]);
                      if (val && val !== "0" && val !== "-") barcodeMap[mainKey].add(val);
                  }
              });
            }
          }
        }

        const updatePromises = [];
        let updatedCount = 0;

        for (const [key, stockVal] of Object.entries(stockMap)) {
          const [b, c] = key.split('|||');
          const isGroup = groups.some(g => g.code === c && g.brand === b);
          const targetTable = isGroup ? 'groups' : 'master_products';

          const newBarcodeStr = Array.from(barcodeMap[key] || []).filter(Boolean).join(',');
          
          updatePromises.push(
            supabase.from(targetTable).update({ stock: stockVal, barcode: newBarcodeStr }).eq('code', c).eq('brand', b)
          );
          updatedCount++;
        }
        await Promise.all(updatePromises);
        alert(`📦 온라인재고 갱신 완료!\n\n✅ 메인코드 통합 업데이트: ${updatedCount}건`);
        fetchData();
      } catch (err) { 
        console.error(err);
        alert("❌ 재고 엑셀 처리 중 오류가 발생했습니다."); 
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; 
  };

  const handleHqStockExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const workbook = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: "A", defval: "" });

        const hqMap = {}; 
        let matchedCount = 0;
        let unmatchedCount = 0;

        const allProducts = [...masterProducts, ...groups];

        rows.forEach(row => {
          const cValue = cleanStr(row["C"]);
          const nValue = Number(String(row["N"] || "0").replace(/,/g, '')) || 0;

          if (cValue && !cValue.includes("상품바코드") && !cValue.includes("기본항목")) {
            let targetProduct = allProducts.find(p => {
              const bArray = String(p.barcode || "").split(',').map(cleanStr);
              return bArray.includes(cValue) || cleanStr(p.code) === cValue;
            });

            if (targetProduct) {
              const mainKey = makeKey(targetProduct.brand, targetProduct.code);
              hqMap[mainKey] = (hqMap[mainKey] || 0) + nValue;
              matchedCount++;
            } else {
              unmatchedCount++; 
            }
          }
        });

        const updatePromises = [];
        let updatedDbCount = 0;

        for (const [key, stockVal] of Object.entries(hqMap)) {
          const [b, c] = key.split('|||');
          const isGroup = groups.some(g => g.code === c && g.brand === b);
          const targetTable = isGroup ? 'groups' : 'master_products';

          updatePromises.push(supabase.from(targetTable).update({ hq_stock: stockVal }).eq('code', c).eq('brand', b));
          updatedDbCount++;
        }

        await Promise.all(updatePromises);
        alert(`🏢 본사재고 매핑 완료!\n\n✅ 일치하여 수량 반영된 바코드: ${matchedCount}건\n✅ DB 갱신된 메인코드 수: ${updatedDbCount}품번\n❌ 무시된 타상품/미등록 바코드: ${unmatchedCount}건`);
        fetchData();
      } catch (err) {
        console.error(err);
        alert("❌ 본사재고 엑셀 처리 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; 
  };

  const handleOrderExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const workbook = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: "A", defval: "" });

        const orderMap = {}; 
        let matchedCount = 0;
        let unmatchedCount = 0;

        const allProducts = [...masterProducts, ...groups];

        rows.forEach(row => {
          const aValue = String(row["A"] || ""); 
          const kValue = Number(String(row["K"]||"0").replace(/,/g, '')) || 0; 
          const lValue = Number(String(row["L"]||"0").replace(/,/g, '')) || 0; 
          const mValue = Number(String(row["M"]||"0").replace(/,/g, '')) || 0; 

          let styleCode = "";
          const match = aValue.match(/\(([^)]+)\)/);
          if (match) {
            styleCode = cleanStr(match[1]);
          } else {
            styleCode = cleanStr(aValue);
          }

          if (styleCode && styleCode.length > 2 && !styleCode.includes("상품명")) {
            let targetProduct = allProducts.find(p => {
              const bArray = String(p.barcode || "").split(',').map(cleanStr);
              return bArray.includes(styleCode) || cleanStr(p.code) === styleCode;
            });

            if (targetProduct) {
              const mainKey = makeKey(targetProduct.brand, targetProduct.code);
              if (!orderMap[mainKey]) orderMap[mainKey] = { w1: 0, w2: 0, w3: 0 };
              
              orderMap[mainKey].w1 += kValue;
              orderMap[mainKey].w2 += lValue;
              orderMap[mainKey].w3 += mValue;
              matchedCount++;
            } else {
              unmatchedCount++;
            }
          }
        });

        const updatePromises = [];
        let updatedDbCount = 0;

        for (const [key, orders] of Object.entries(orderMap)) {
          const [b, c] = key.split('|||');
          const isGroup = groups.some(g => g.code === c && g.brand === b);
          const targetTable = isGroup ? 'groups' : 'master_products';

          updatePromises.push(
            supabase.from(targetTable).update({
              order_w1: orders.w1,
              order_w2: orders.w2,
              order_w3: orders.w3
            }).eq('code', c).eq('brand', b)
          );
          updatedDbCount++;
        }

        await Promise.all(updatePromises);
        alert(`🛒 발주 데이터 매핑 완료!\n\n✅ 일치하여 반영된 품번: ${matchedCount}건\n✅ DB 갱신된 메인코드 수: ${updatedDbCount}품번\n❌ 무시된 타상품: ${unmatchedCount}건`);
        fetchData();
      } catch (err) {
        console.error(err);
        alert("❌ 발주 엑셀 처리 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; 
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
    mng: { w: 36,  l: 26 },
    brd: { w: 70,  l: 62 },   
    sea: { w: 60,  l: 132 },  
    typ: { w: 60,  l: 192 },
    cod: { w: 80,  l: 252 },
    cat: { w: 60,  l: 332 },
    sty: { w: 130, l: 392 },
    nam: { w: 320, l: 522 }, 
    cst: { w: 60,  l: 842 }, 
    tag: { w: 65,  l: 902 }, 
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

  // 인라인 셀 편집 렌더 헬퍼
  const renderInlineCell = (item, field, currentValue, isGhostItem, isRowEditing, opts = {}) => {
    if (isGhostItem) return <span style={{color:GHOST_COLOR}}>-</span>;
    const ik = makeKey(item.brand, item.code);
    const isIC = editingCell?.key === ik && editingCell?.field === field;
    const { width = '55px', color, bold } = opts;
    const inputS = { ...inlineCellInputStyle, width, ...(color ? {color} : {}) };

    if (isRowEditing) {
      return <input type="number" value={editRow[field]||''} onChange={e=>setEditRow({...editRow,[field]:e.target.value})} style={{...inputS, border:'1px solid #ccc'}} />;
    }
    if (isIC) {
      return <input type="number" value={editingCellValue} autoFocus
        onChange={e=>setEditingCellValue(e.target.value)}
        onKeyDown={e=>{if(e.key==='Enter')handleCellSave(item,field,editingCellValue);if(e.key==='Escape')setEditingCell(null);}}
        onBlur={()=>handleCellSave(item,field,editingCellValue)}
        style={inputS} />;
    }
    const disp = (Number(currentValue||0)).toLocaleString();
    return <span onClick={()=>{setEditingCell({key:ik,field});setEditingCellValue(currentValue||0);}}
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
                      setGroupInput({
                        brand: opt.data.brand || '', season: opt.data.season || '', type: opt.data.type || '묶음', category: opt.data.category || '', 
                        groupCode: opt.data.code || '', styleNo: opt.data.style_no || '', groupName: opt.data.name || '', 
                        cost: opt.data.cost || '', tagPrice: opt.data.tag_price || '', children: opt.data.children || []
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
                     value={(groupInput?.children || []).map(c => ({ label: c?.name || '', value: makeKey(groupInput.brand, c?.code), data: c }))} 
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
              </div>
            </div>
            
            <div style={{ background:'#fff', padding:'12px', borderRadius:'12px', marginBottom:'10px', display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' }}>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">복종 전체</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">브랜드 전체</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}</select>
              <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">시즌 전체</option>{seasons.map(s => <option key={s} value={s}>{s}</option>)}</select>
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

            {/* 마진 범위 & 퀵 필터 */}
            <div style={{ background:'#f8f9fa', padding:'8px 12px', borderRadius:'8px', marginBottom:'8px', display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', border:'1px solid #ddd', fontSize:'11px' }}>
              <strong>🔍 마진 범위:</strong>
              <input type="number" placeholder="최소" value={marginFilter.min} onChange={e=>setMarginFilter({...marginFilter,min:e.target.value})} style={{width:'70px',padding:'3px 5px',border:'1px solid #ccc',borderRadius:'4px',fontSize:'11px'}} />
              <span>~</span>
              <input type="number" placeholder="최대" value={marginFilter.max} onChange={e=>setMarginFilter({...marginFilter,max:e.target.value})} style={{width:'70px',padding:'3px 5px',border:'1px solid #ccc',borderRadius:'4px',fontSize:'11px'}} />
              <button onClick={()=>setMarginFilter({min:'',max:''})} style={{padding:'3px 8px',border:'1px solid #ccc',borderRadius:'4px',fontSize:'11px',cursor:'pointer',background:'#fff'}}>초기화</button>
              <div style={{width:'1px',height:'20px',background:'#ddd'}}/>
              <strong>⚡ 퀵필터:</strong>
              {[
                {id:'neg', label:'🔴 마진 마이너스'},
                {id:'zero-stock', label:'📦 온라인재고 0'},
                {id:'has-order', label:'🛒 발주 있음'},
              ].map(({id,label}) => (
                <button key={id} onClick={()=>setQuickFilter(quickFilter===id?'':id)}
                  style={{padding:'3px 10px',border:`1px solid ${quickFilter===id?'#e74c3c':'#ccc'}`,borderRadius:'12px',fontSize:'11px',cursor:'pointer',background:quickFilter===id?'#fdf0f0':'#fff',color:quickFilter===id?'#e74c3c':'#555',fontWeight:quickFilter===id?'bold':'normal'}}>
                  {label}
                </button>
              ))}
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
                    <th style={{ ...thStyle, ...fX(cols.mng.l, true), ...cellS(cols.mng) }}>관리</th>
                    <th style={{ ...thStyle, ...fX(cols.brd.l, true), ...cellS(cols.brd) }} onClick={() => handleSort('brand')}>브랜드</th>
                    <th style={{ ...thStyle, ...fX(cols.sea.l, true), ...cellS(cols.sea) }} onClick={() => handleSort('season')}>시즌</th>
                    <th style={{ ...thStyle, ...fX(cols.typ.l, true), ...cellS(cols.typ) }} onClick={() => handleSort('type')}>구분</th>
                    <th style={{ ...thStyle, ...fX(cols.cod.l, true), ...cellS(cols.cod) }} onClick={() => handleSort('code')}>품번</th>
                    <th style={{ ...thStyle, ...fX(cols.cat.l, true), ...cellS(cols.cat) }} onClick={() => handleSort('category')}>복종</th>
                    <th style={{ ...thStyle, ...fX(cols.sty.l, true), ...cellS(cols.sty) }} onClick={() => handleSort('style_no')}>스타일</th>
                    <th style={{ ...thStyle, ...fX(cols.nam.l, true), ...cellS(cols.nam), textAlign:'left' }} onClick={() => handleSort('name')}>상품명</th>
                    <th style={{ ...thStyle, ...fX(cols.cst.l, true), ...cellS(cols.cst) }} onClick={() => handleSort('cost')}>원가</th>
                    <th style={{ ...thStyle, ...fX(cols.tag.l, true), ...cellS(cols.tag), borderRight: '2px solid #aaa' }} onClick={() => handleSort('tag_price')}>Tag가</th>
                    <th style={{...thStyle, width:'105px'}} onClick={() => handleSort('price_naver')}>네이버 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}} onClick={() => handleSort('price_coupang')}>쿠팡 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}} onClick={() => handleSort('price_rocket')}>로켓 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}} onClick={() => handleSort('price_gold')}>골드 (이전→변경)</th>
                    <th style={{...thStyle, width:'115px', color:'#e17055', background:'#fff9f9'}} onClick={() => handleSort('price_sale')}>행사가 (이전→변경)</th>
                    <th style={{...thStyle, width:'50px'}}>수수료</th>
                    <th style={{...thStyle, width:'55px'}}>정산액</th>
                    <th style={{...thStyle, width:'35px'}}>배수</th>
                    <th style={{...thStyle, width:'120px', color:'red'}} onClick={() => handleSort('margin')}>마진 (이전→변경)</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleData.map((item, idx) => {
                    const isGhost = item.isGhost;
                    const isE = editingItem && editingItem.code === item.code && editingItem.brand === item.brand && !isGhost; 
                    const isChild = item.isMappedChild;
                    const itemKey = makeKey(item.brand, item.code);
                    const trBg = selectedCodes.includes(itemKey) ? '#fff9db' : (isE ? '#e3f2fd' : (isChild ? '#f8fbfc' : '#fff'));
                    
                    const typeStr = String(item.type || '');
                    const isGroupType = typeStr.includes('묶음') || typeStr.includes('세트');

                    const prevN = Number(item.prev_naver || item.price_naver || 0);
                    const prevS = Number(item.prev_sale || item.price_sale || 0);
                    const curS = isE ? Number(editRow.price_sale || 0) : Number(item.price_sale || 0);
                    const curMargin = (curS - Math.floor(curS * (feeRate / 100))) - Number(item.cost || 0) - 5000;
                    
                    return (
                      <tr key={`${itemKey}-${idx}`} style={{ background: trBg }}>
                        <td style={{ ...tdStyle, ...fX(cols.chk.l), ...cellS(cols.chk), background: trBg }}>{!isGhost && <input type="checkbox" checked={selectedCodes.includes(itemKey)} onChange={() => setSelectedCodes(prev => prev.includes(itemKey) ? prev.filter(c => c !== itemKey) : [...prev, itemKey])} />}</td>
                        <td style={{ ...tdStyle, ...fX(cols.mng.l), ...cellS(cols.mng), background: trBg }}>{!isGhost ? (isE ? <button onClick={()=>saveEdit(item)} style={btnStyle}>완료</button> : <button onClick={()=>{setEditingItem({brand: item.brand, code: item.code}); setEditRow({...item});}} style={btnStyle}>수정</button>) : <span style={{color:GHOST_COLOR}}>-</span>}</td>
                        <td style={{ ...tdStyle, ...fX(cols.brd.l), ...cellS(cols.brd), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.brand}</span> : (isE ? <select value={editRow.brand||''} onChange={e=>setEditRow({...editRow, brand:e.target.value})} style={{fontSize:'10px', padding:'0', width:'100%'}}><option value="">-</option>{brands.map(b=><option key={b} value={b}>{b}</option>)}</select> : item.brand)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sea.l), ...cellS(cols.sea), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.season}</span> : (isE ? <select value={editRow.season||''} onChange={e=>setEditRow({...editRow, season:e.target.value})} style={{fontSize:'10px', padding:'0', width:'100%'}}><option value="">-</option>{seasons.map(s=><option key={s} value={s}>{s}</option>)}</select> : item.season)}</td>
                        
                        <td style={{ ...tdStyle, ...fX(cols.typ.l), ...cellS(cols.typ), background: trBg, color: isGhost ? GHOST_COLOR : (isGroupType?'#6c5ce7':(isChild?'#b2bec3':'#999')), fontWeight: isGroupType?'bold':'normal' }}>
                          {isGroupType && (
                            <span onClick={() => toggleGroup(itemKey)} style={{cursor:'pointer', marginRight:'4px', display:'inline-block', width:'12px', color:'#6c5ce7'}}>
                              {collapsedGroups.includes(itemKey) ? '▶' : '▼'}
                            </span>
                          )}
                          {item.type}
                        </td>
                        
                        <td style={{ ...tdStyle, ...fX(cols.cod.l), ...cellS(cols.cod), background: trBg, paddingLeft: isChild?'10px':'2px' }}>{isChild && <span style={{color:'#bdc3c7', marginRight:'3px'}}>└</span>}<span style={{color: isGhost ? GHOST_COLOR : 'inherit'}}>{item.code}</span></td>
                        <td style={{ ...tdStyle, ...fX(cols.cat.l), ...cellS(cols.cat), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.category}</span> : (isE ? <select value={editRow.category||''} onChange={e=>setEditRow({...editRow, category:e.target.value})} style={{fontSize:'10px', padding:'0', width:'100%'}}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select> : item.category)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sty.l), ...cellS(cols.sty), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.style_no}</span> : (isE ? <input value={editRow.style_no||''} onChange={e=>setEditRow({...editRow, style_no:e.target.value})} style={{width:'90%', fontSize:'10px'}}/> : item.style_no)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.nam.l), ...cellS(cols.nam), background: trBg, textAlign:'left', paddingLeft: isChild?'10px':'2px' }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.name} (중복)</span> : (isE ? <input value={editRow.name||''} onChange={e=>setEditRow({...editRow, name:e.target.value})} style={{width:'95%', fontSize:'10px'}}/> : item.name)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cst.l), ...cellS(cols.cst), background: trBg }}>{renderInlineCell(item,'cost',item.cost,isGhost,isE,{width:'50px'})}</td>
                        <td style={{ ...tdStyle, ...fX(cols.tag.l), ...cellS(cols.tag), background: trBg, borderRight: '2px solid #aaa' }}>{renderInlineCell(item,'tag_price',item.tag_price,isGhost,isE,{width:'55px',bold:true})}</td>
                        <td style={tdStyle}>{isGhost?<span style={{color:GHOST_COLOR}}>-</span>:(<>{prevN.toLocaleString()} → {renderInlineCell(item,'price_naver',item.price_naver,false,isE,{color:getDiffColor(prevN,isE?editRow.price_naver:item.price_naver)})}</>)}</td>
                        <td style={tdStyle}>{isGhost?<span style={{color:GHOST_COLOR}}>-</span>:(<>{(item.price_coupang||0).toLocaleString()} → {renderInlineCell(item,'price_coupang',item.price_coupang,false,isE)}</>)}</td>
                        <td style={tdStyle}>{isGhost?<span style={{color:GHOST_COLOR}}>-</span>:(<>{(item.price_rocket||0).toLocaleString()} → {renderInlineCell(item,'price_rocket',item.price_rocket,false,isE)}</>)}</td>
                        <td style={tdStyle}>{isGhost?<span style={{color:GHOST_COLOR}}>-</span>:(<>{(item.price_gold||0).toLocaleString()} → {renderInlineCell(item,'price_gold',item.price_gold,false,isE)}</>)}</td>
                        <td style={{...tdStyle,background:isE?'#fff9f9':'inherit'}}>{isGhost?<span style={{color:GHOST_COLOR}}>-</span>:<><span style={{color:'#e17055'}}>{prevS.toLocaleString()} → </span>{renderInlineCell(item,'price_sale',item.price_sale,false,isE,{color:getDiffColor(prevS,isE?editRow.price_sale:item.price_sale),width:'60px'})}{!isE&&<span style={{fontSize:'10px',color:'#999',marginLeft:'2px'}}>({item.discSale}%)</span>}</>}</td>
                        <td style={tdStyle}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : Math.floor(curS * (feeRate / 100)).toLocaleString()}</td>
                        <td style={{...tdStyle, fontWeight: isGhost ? 'normal' : 'bold'}}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (curS - Math.floor(curS * (feeRate / 100))).toLocaleString()}</td>
                        <td style={tdStyle}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : item.ratio}</td>
                        <td style={{...tdStyle, color:'red', fontWeight: isGhost ? 'normal' : 'bold', background: isE ? '#fff5f5' : '#fff9f9'}}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (<>{Number(item.prevMargin || 0).toLocaleString()} → {curMargin.toLocaleString()}</>)}</td>
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
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', background:'#e8f8f5', padding:'6px 12px', borderRadius:'6px', border:'1px solid #1abc9c', color:'#16a085', fontWeight:'bold'}}>
                  📦 온라인재고 (사전생성)
                  <input type="file" onChange={handleInventoryExcelUpload} style={{display:'none'}} />
                </label>
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', background:'#f4ecf7', padding:'6px 12px', borderRadius:'6px', border:'1px solid #8e44ad', color:'#8e44ad', fontWeight:'bold'}}>
                  🏢 본사재고 (매핑업뎃)
                  <input type="file" onChange={handleHqStockExcelUpload} style={{display:'none'}} />
                </label>
                <label style={{fontSize:'11px', display:'flex', alignItems:'center', gap:'5px', cursor:'pointer', background:'#fef5e7', padding:'6px 12px', borderRadius:'6px', border:'1px solid #e67e22', color:'#d35400', fontWeight:'bold'}}>
                  🛒 발주수량 (매핑업뎃)
                  <input type="file" onChange={handleOrderExcelUpload} style={{display:'none'}} />
                </label>
              </div>
            </div>
            
            <div style={{ background:'#fff', padding:'12px', borderRadius:'12px', marginBottom:'10px', display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' }}>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">복종 전체</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">브랜드 전체</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}</select>
              <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">시즌 전체</option>{seasons.map(s => <option key={s} value={s}>{s}</option>)}</select>
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
                    <th style={{ ...thStyle, ...fX(cols.mng.l, true), ...cellS(cols.mng) }}>관리</th>
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
                    const isE = editingItem && editingItem.code === item.code && editingItem.brand === item.brand && !isGhost; 
                    const isChild = item.isMappedChild;
                    const itemKey = makeKey(item.brand, item.code);
                    const trBg = selectedCodes.includes(itemKey) ? '#fff9db' : (isE ? '#e3f2fd' : (isChild ? '#f8fbfc' : '#fff'));
                    const txtColor = isGhost ? '#95a5a6' : 'inherit'; 
                    
                    const typeStr = String(item.type || '');
                    const isGroupType = typeStr.includes('묶음') || typeStr.includes('세트');
                    
                    return (
                      <tr key={`inv-${itemKey}-${idx}`} style={{ background: trBg, color: txtColor }}>
                        <td style={{ ...tdStyle, ...fX(cols.chk.l), ...cellS(cols.chk), background: trBg }}>
                           <input type="checkbox" checked={selectedCodes.includes(itemKey)} onChange={() => setSelectedCodes(prev => prev.includes(itemKey) ? prev.filter(c => c !== itemKey) : [...prev, itemKey])} />
                        </td>
                        <td style={{ ...tdStyle, ...fX(cols.mng.l), ...cellS(cols.mng), background: trBg }}>
                           {isE ? <button onClick={()=>saveEdit(item)} style={btnStyle}>완료</button> : <button onClick={()=>{setEditingItem({brand: item.brand, code: item.code}); setEditRow({...item});}} style={btnStyle}>수정</button>}
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

                        <td style={{ ...tdStyle, ...fX(cols.cod.l), ...cellS(cols.cod), background: trBg, paddingLeft: isChild?'10px':'2px' }}>{isChild && <span style={{color:'#bdc3c7', marginRight:'3px'}}>└</span>}{item.code}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cat.l), ...cellS(cols.cat), background: trBg }}>{item.category}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sty.l), ...cellS(cols.sty), background: trBg }}>{item.style_no}</td>
                        <td style={{ ...tdStyle, ...fX(cols.nam.l), ...cellS(cols.nam), background: trBg, textAlign:'left', paddingLeft: isChild?'10px':'2px', borderRight: '2px solid #aaa' }}>
                          {item.name} {isGhost && <span style={{fontSize:'10px', color:'#e74c3c'}}>(중복)</span>}
                        </td>
                        
                        <td style={{...tdStyle}}>{renderInlineCell(item,'order_w1',item.order_w1,isGhost,isE,{width:'55px'})}</td>
                        <td style={{...tdStyle}}>{renderInlineCell(item,'order_w2',item.order_w2,isGhost,isE,{width:'55px'})}</td>
                        <td style={{...tdStyle}}>{renderInlineCell(item,'order_w3',item.order_w3,isGhost,isE,{width:'55px'})}</td>
                        <td style={{...tdStyle}}>{renderInlineCell(item,'stock',item.stock,isGhost,isE,{width:'60px',color:'#27ae60',bold:true})}</td>
                        <td style={{...tdStyle}}>{renderInlineCell(item,'hq_stock',item.hq_stock,isGhost,isE,{width:'60px'})}</td>
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
  );
}

export default App;