import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { supabase } from './supabaseClient'; 

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
  const [editingCode, setEditingCode] = useState(null);
  const [editRow, setEditRow] = useState({});

  const [tempChild, setTempChild] = useState({ 
    brand: '', season: '', category: '', 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' 
  });
  const [groupInput, setGroupInput] = useState({ 
    brand: '', season: '', type: '묶음', category: '', groupCode: '', styleNo: '', groupName: '', cost: '', tagPrice: '', children: [] 
  });

  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const [collapsedGroups, setCollapsedGroups] = useState([]);

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
  // 3. 유틸리티 및 데이터 가공 (피벗 롤업 최적화)
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

  const toggleGroup = (code) => {
    setCollapsedGroups(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const handleExpandAll = () => setCollapsedGroups([]);
  const handleCollapseAll = () => setCollapsedGroups(groups.map(g => g.code));

  const processedData = useMemo(() => {
    const masterMap = new Map();
    masterProducts.forEach(p => masterMap.set(p.code, p));

    const term = (searchTerm || '').toLowerCase().trim();

    const isMatch = (item) => {
      const matchCat = filterCategory === '전체' || item.category === filterCategory;
      const matchBrand = filterBrand === '전체' || item.brand === filterBrand;
      const matchSeason = filterSeason === '전체' || item.season === filterSeason;
      const matchSearch = term === '' || (String(item.code || "") + String(item.style_no || "") + String(item.name || "")).toLowerCase().includes(term);
      return matchCat && matchBrand && matchSeason && matchSearch;
    };

    const matchedGroups = groups.filter(isMatch).map(g => ({ ...g, type: g.type || '묶음' }));
    const matchedSingles = masterProducts.filter(isMatch).map(p => ({ ...p, type: '단품' }));

    const matchedMappedCodes = new Set();
    matchedGroups.forEach(g => {
      if (g.children) {
        g.children.forEach(c => {
          if (masterMap.has(c.code)) matchedMappedCodes.add(c.code);
        });
      }
    });

    const standaloneSingles = matchedSingles.filter(s => !matchedMappedCodes.has(s.code));
    let topLevel = [...matchedGroups, ...standaloneSingles];

    // 💡 [피벗 롤업 로직] 부모(그룹)는 오직 자식들의 합계로만 덮어씌웁니다.
    topLevel = topLevel.map(item => {
       let calcItem = { ...item };
       
       calcItem.order_w1 = Number(calcItem.order_w1 || 0);
       calcItem.order_w2 = Number(calcItem.order_w2 || 0);
       calcItem.order_w3 = Number(calcItem.order_w3 || 0);
       calcItem.stock = Number(calcItem.stock || 0);
       calcItem.hq_stock = Number(calcItem.hq_stock || 0);

       if ((calcItem.type === '묶음' || calcItem.type === '세트') && calcItem.children && calcItem.children.length > 0) {
           let sumW1 = 0, sumW2 = 0, sumW3 = 0, sumStock = 0, sumHqStock = 0;
           calcItem.children.forEach(childSnapshot => {
               const liveChild = masterMap.get(childSnapshot.code);
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
       calcItem.margin = (sale - Math.floor(sale * 0.18)) - cost - 5000;

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
    const renderedChildCodes = new Set();

    topLevel.forEach(item => {
      expandedResult.push(item);
      if ((item.type === '묶음' || item.type === '세트') && item.children) {
        item.children.forEach(childSnapshot => {
          const liveChild = masterMap.get(childSnapshot.code);
          if (!liveChild) return; 

          const isGhost = renderedChildCodes.has(liveChild.code);
          
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
            isGhost: isGhost,
            order_w1: w1,
            order_w2: w2,
            order_w3: w3,
            stock: Number(liveChild.stock || 0),
            hq_stock: Number(liveChild.hq_stock || 0)
          });

          if (!isGhost) {
            renderedChildCodes.add(liveChild.code);
          }
        });
      }
    });

    return expandedResult.map(item => {
      const cost = Number(item.cost || 0); 
      const tag = Number(item.tag_price || 0);
      const sale = Number(item.price_sale || 0); 
      const fee = Math.floor(sale * 0.18); 
      const settle = sale - fee; 
      const pSale = Number(item.prev_sale || item.price_sale || 0);
      const pMargin = (pSale - Math.floor(pSale * 0.18)) - cost - 5000;
      const discSale = tag === 0 ? 0 : Math.round((1 - (sale / tag)) * 100);
      
      return { 
        ...item, fee, settle, prevMargin: pMargin,
        ratio: cost > 0 ? (sale / cost).toFixed(1) : "0.0", discSale 
      };
    });
  }, [masterProducts, groups, filterCategory, filterBrand, filterSeason, searchTerm, sortConfig]);

  const visibleData = useMemo(() => {
    return processedData.filter(item => !(item.isMappedChild && collapsedGroups.includes(item.parentCode)));
  }, [processedData, collapsedGroups]);

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      if (activeMenu === 'inventory') {
        setSelectedCodes(visibleData.map(item => item.code));
      } else {
        setSelectedCodes(visibleData.filter(i => !i.isGhost).map(item => item.code));
      }
    } else {
      setSelectedCodes([]);
    }
  };

  // ==========================================
  // 4. 데이터 처리
  // ==========================================
  const addCategory = async () => { if(!newCatInput.trim()) return; await supabase.from('categories').insert([{name: newCatInput}]); setNewCatInput(''); fetchData(); };
  const deleteCategory = async (n) => { if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('categories').delete().eq('name',n); fetchData(); } };
  const addBrand = async () => { if(!newBrandInput.trim()) return; await supabase.from('brands').insert([{name: newBrandInput}]); setNewBrandInput(''); fetchData(); };
  const deleteBrand = async (n) => { if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('brands').delete().eq('name',n); fetchData(); } };
  const addSeason = async () => { if(!newSeasonInput.trim()) return; await supabase.from('seasons').insert([{name: newSeasonInput}]); setNewSeasonInput(''); fetchData(); };
  const deleteSeason = async (n) => { if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('seasons').delete().eq('name',n); fetchData(); } };

  const handleRegisterMaster = async () => {
    await supabase.from('master_products').upsert([{ 
      brand: tempChild.brand, season: tempChild.season, category: tempChild.category, 
      code: tempChild.품번코드, style_no: tempChild.스타일넘버, name: tempChild.상품명, 
      cost: Number(tempChild.원가 || 0), tag_price: Number(tempChild.tag가 || 0) 
    }], { onConflict: 'code' });
    alert("✅ 저장 완료"); 
    setTempChild({ brand: '', season: '', category: '', 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' }); 
    fetchData();
  };

  const handleSaveGroup = async () => {
    await supabase.from('groups').upsert([{ 
      brand: groupInput.brand, season: groupInput.season, type: groupInput.type, category: groupInput.category, 
      code: groupInput.groupCode, style_no: groupInput.styleNo, name: groupInput.groupName, 
      cost: Number(groupInput.cost || 0), tag_price: Number(groupInput.tagPrice || 0), children: groupInput.children 
    }], { onConflict: 'code' });
    alert("✅ 그룹 저장(덮어쓰기) 완료"); 
    setGroupInput({ brand: '', season: '', type: '묶음', category: '', groupCode: '', styleNo: '', groupName: '', cost: '', tagPrice: '', children: [] }); 
    fetchData();
  };

  const saveEdit = async (item) => {
    const tbl = (item.type.includes('단품') || item.type.includes('구성')) ? 'master_products' : 'groups';
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
    }).eq('code', editingCode);
    
    setEditingCode(null); 
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

    await Promise.all([
      supabase.from('groups').update(up).in('code', selectedCodes),
      supabase.from('master_products').update(up).in('code', selectedCodes)
    ]);
    alert("✅ 일괄 변경 완료"); 
    setSelectedCodes([]); 
    fetchData();
  };

  const handleBatchDelete = async () => {
    if (!selectedCodes.length || !window.confirm("⚠️ 정말 삭제하시겠습니까?")) return;
    const gDel = groups.filter(g => selectedCodes.includes(g.code)).map(g => g.code);
    const mDel = masterProducts.filter(p => selectedCodes.includes(p.code)).map(p => p.code);
    
    if (gDel.length) await supabase.from('groups').delete().in('code', gDel);
    if (mDel.length) await supabase.from('master_products').delete().in('code', mDel);
    
    alert("✅ 삭제 완료"); 
    setSelectedCodes([]); 
    fetchData();
  };

  // ==========================================
  // 📊 엑셀 처리 (★ 무조건 100% 매칭 로직)
  // ==========================================
  const handleExcelUpload = async () => {
    if (!selectedFile) return alert("파일을 선택해주세요.");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = XLSX.read(e.target.result, { type: 'binary' });
        const parsedRows = XLSX.utils.sheet_to_json(data.Sheets[data.SheetNames[0]]);
        const parsed = parsedRows.map(i => ({ 
          brand: String(i.브랜드 || ''), season: String(i.시즌 || ''), category: String(i.복종 || '미분류'), 
          code: String(i.품번 || ''), style_no: String(i.스타일 || ''), name: String(i.상품명 || ''), 
          cost: Number(i.원가 || 0), tag_price: Number(i.Tag가 || 0) 
        }));
        await supabase.from('master_products').upsert(parsed, { onConflict: 'code' });
        alert("✅ 마스터 엑셀 업로드 성공!"); 
        setSelectedFile(null);
        fetchData();
      } catch (err) { alert("엑셀 파싱 에러"); }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const downloadListExcel = () => {
    let src = activeMenu === 'inventory' ? processedData : processedData.filter(i => !i.isGhost);
    if (selectedCodes.length) src = src.filter(i => selectedCodes.includes(i.code));
    
    const dataToExport = src.map(item => ({
      "구분": item.type, "품번": item.code, "브랜드": item.brand || '', "시즌": item.season || '',
      "복종": item.category || '', "스타일코드": item.style_no || '', "상품명": item.name || '',
      "원가": item.cost || 0, "Tag가": item.tag_price || 0, "온라인재고": item.stock || 0, "본사재고": item.hq_stock || 0,
      "1주발주": item.order_w1 || 0, "2주발주": item.order_w2 || 0, "3주발주": item.order_w3 || 0,
      "네이버(변경)": item.price_naver || 0, "쿠팡(변경)": item.price_coupang || 0, 
      "로켓(변경)": item.price_rocket || 0, "골드(변경)": item.price_gold || 0, "행사가(변경)": item.price_sale || 0
    }));

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
      const rows = XLSX.utils.sheet_to_json(XLSX.read(ev.target.result, {type:'binary'}).Sheets[XLSX.read(ev.target.result, {type:'binary'}).SheetNames[0]]);
      for(const r of rows) {
        const c = String(r["품번"]);
        const tbl = groups.some(g=>g.code===c) ? 'groups' : 'master_products';
        await supabase.from(tbl).update({ cost: Number(r["원가"]||0), price_sale: Number(r["행사가"]||0) }).eq('code', c);
      }
      alert("✅ 변경 업로드 완료"); 
      fetchData();
    };
    reader.readAsBinaryString(file); e.target.value = null;
  };

  // 📦 [Step 1] 온라인재고: 공백 완벽 제거 후 '바코드 사전' 저장
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
          
          const foundC = row.findIndex(cell => String(cell || "").replace(/\s+/g, '') === "상품코드");
          const foundX = row.findIndex(cell => String(cell || "").replace(/\s+/g, '') === "합재고");
          if (foundC !== -1 && foundX !== -1) {
             headerRowIndex = i;
             cIdx = foundC; xIdx = foundX;
             lIdx = row.findIndex(cell => String(cell || "").replace(/\s+/g, '') === "바코드");
             pIdx = row.findIndex(cell => String(cell || "").replace(/\s+/g, '').includes("옵션별칭1"));
             rIdx = row.findIndex(cell => String(cell || "").replace(/\s+/g, '').includes("옵션별칭2"));
             tIdx = row.findIndex(cell => String(cell || "").replace(/\s+/g, '').includes("옵션별칭3"));
             vIdx = row.findIndex(cell => String(cell || "").replace(/\s+/g, '').includes("옵션별칭4"));
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

          // 공백 완벽 제거
          const cValue = String(row[cIdx] || "").replace(/\s+/g, '');
          const xValue = Number(String(row[xIdx] || "0").replace(/,/g, '')) || 0; 

          if (cValue && cValue !== "상품코드") {
            let targetProduct = allProducts.find(p => String(p.code).replace(/\s+/g, '') === cValue);
            
            // 못찾으면 메인코드로 한 번만 시도 
            if (!targetProduct && cValue.includes('-')) {
                const baseCode = cValue.split('-')[0];
                targetProduct = allProducts.find(p => String(p.code).replace(/\s+/g, '') === baseCode);
            }

            if (targetProduct) {
              const mainCode = targetProduct.code;
              stockMap[mainCode] = (stockMap[mainCode] || 0) + xValue; 
              
              if (!barcodeMap[mainCode]) barcodeMap[mainCode] = new Set();
              
              // 엑셀의 P, R, T, V열 바코드 추출
              [lIdx, pIdx, rIdx, tIdx, vIdx].forEach(idx => {
                  if (idx !== -1) {
                      const val = String(row[idx] || "").replace(/\s+/g, '');
                      if (val && val !== "0") barcodeMap[mainCode].add(val);
                  }
              });
            }
          }
        }

        const updatePromises = [];
        let updatedCount = 0;

        for (const [code, stockVal] of Object.entries(stockMap)) {
          const isGroup = groups.some(g => g.code === code);
          const targetTable = isGroup ? 'groups' : 'master_products';
          const existingProduct = allProducts.find(p => p.code === code);

          if (existingProduct) {
            // 과거 찌꺼기 무시! 깔끔한 새 바코드 사전으로 덮어쓰기
            const newBarcodeStr = Array.from(barcodeMap[code] || []).filter(Boolean).join(',');
            updatePromises.push(
              supabase.from(targetTable).update({ stock: stockVal, barcode: newBarcodeStr }).eq('code', code)
            );
            updatedCount++;
          }
        }
        await Promise.all(updatePromises);
        alert(`📦 온라인재고(사전) 갱신 완료!\n\n✅ 업데이트된 품번: ${updatedCount}건\n(바코드 사전이 완벽히 청소/갱신되었습니다!)`);
        fetchData();
      } catch (err) { 
        console.error(err);
        alert("❌ 재고 엑셀 처리 중 오류가 발생했습니다."); 
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; 
  };

  // 🏢 [Step 2] 본사재고: 1:1 완벽 매칭 (공백 무시)
  const handleHqStockExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const workbook = XLSX.read(ev.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

        let headerRowIndex = -1;
        let barcodeColIdx = -1;
        let stockColIdx = -1;

        for (let i = 0; i < Math.min(15, rows.length); i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;

          const bIdx = row.findIndex(cell => String(cell || "").replace(/\s+/g, '') === "상품바코드");
          const sIdx = row.findIndex(cell => String(cell || "").replace(/\s+/g, '') === "실재고");
          if (bIdx !== -1 && sIdx !== -1) {
             headerRowIndex = i;
             barcodeColIdx = bIdx;
             stockColIdx = sIdx;
             break;
          }
        }

        if (headerRowIndex === -1) return alert("❌ 엑셀에서 '상품바코드' 또는 '실재고' 항목을 찾지 못했습니다.");

        const hqMap = {}; 
        let matchedCount = 0;
        let unmatchedCount = 0;

        const allProducts = [...masterProducts, ...groups];

        for (let i = headerRowIndex + 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || !Array.isArray(row)) continue;

          // 공백 완벽 제거
          const cValue = String(row[barcodeColIdx] || "").replace(/\s+/g, '');
          const nValue = Number(String(row[stockColIdx] || "0").replace(/,/g, '')) || 0;

          if (cValue && !cValue.includes("상품바코드") && !cValue.includes("기본항목")) {
            // 💡 1:1 매핑 (사전 OR 품번)
            let targetProduct = allProducts.find(p => {
              const barcodeStr = String(p.barcode || "").replace(/\s+/g, '');
              const barcodeArray = barcodeStr ? barcodeStr.split(',') : [];
              return barcodeArray.includes(cValue) || String(p.code).replace(/\s+/g, '') === cValue;
            });

            if (targetProduct) {
              const mainCode = targetProduct.code;
              hqMap[mainCode] = (hqMap[mainCode] || 0) + nValue;
              matchedCount++;
            } else {
              unmatchedCount++;
            }
          }
        }

        const updatePromises = [];
        let updatedDbCount = 0;

        for (const [code, stockVal] of Object.entries(hqMap)) {
          const isGroup = groups.some(g => g.code === code);
          const targetTable = isGroup ? 'groups' : 'master_products';

          updatePromises.push(supabase.from(targetTable).update({ hq_stock: stockVal }).eq('code', code));
          updatedDbCount++;
        }

        await Promise.all(updatePromises);
        alert(`🏢 본사재고 1:1 매핑 완료!\n\n✅ 완벽 일치(수량 반영됨): ${matchedCount}건\n❌ 미등록 바코드(무시됨): ${unmatchedCount}건`);
        fetchData();
      } catch (err) {
        console.error(err);
        alert("❌ 본사재고 엑셀 처리 중 오류가 발생했습니다.");
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = null; 
  };

  // 🛒 [Step 3] 발주수량: 1:1 완벽 매칭 (공백 무시)
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
          // 괄호() 안의 코드를 우선 찾고, 없으면 A열 전체를 가져옵니다.
          const match = aValue.match(/\(([^)]+)\)/);
          if (match) {
            styleCode = match[1].replace(/\s+/g, '');
          } else {
            styleCode = aValue.replace(/\s+/g, '');
          }

          if (styleCode) {
            let targetProduct = allProducts.find(p => {
              const barcodeStr = String(p.barcode || "").replace(/\s+/g, '');
              const barcodeArray = barcodeStr ? barcodeStr.split(',') : [];
              return barcodeArray.includes(styleCode) || String(p.code).replace(/\s+/g, '') === styleCode;
            });

            if (targetProduct) {
              const mainCode = targetProduct.code;
              if (!orderMap[mainCode]) orderMap[mainCode] = { w1: 0, w2: 0, w3: 0 };
              
              orderMap[mainCode].w1 += kValue;
              orderMap[mainCode].w2 += lValue;
              orderMap[mainCode].w3 += mValue;
              matchedCount++;
            } else {
              unmatchedCount++;
            }
          }
        });

        const updatePromises = [];
        let updatedDbCount = 0;

        for (const [code, orders] of Object.entries(orderMap)) {
          const isGroup = groups.some(g => g.code === code);
          const targetTable = isGroup ? 'groups' : 'master_products';

          updatePromises.push(
            supabase.from(targetTable).update({
              order_w1: orders.w1,
              order_w2: orders.w2,
              order_w3: orders.w3
            }).eq('code', code)
          );
          updatedDbCount++;
        }

        await Promise.all(updatePromises);
        alert(`🛒 발주 데이터 1:1 매핑 완료!\n\n✅ 완벽 일치(수량 반영됨): ${matchedCount}건\n❌ 미등록 품번(무시됨): ${unmatchedCount}건`);
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

  const sidebarStyle = isMobile
    ? { width: '100%', height: '65px', backgroundColor: '#2c3e50', color: '#fff', display: 'flex', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', position:'fixed', bottom: 0, left: 0, zIndex: 999, padding: '0 10px', boxSizing: 'border-box' }
    : { width