import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { supabase } from './supabaseClient'; 

function App() {
  // ==========================================
  // 1. 공통 시스템 상태
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

  // ==========================================
  // 2. 조회 페이지 필터/정렬 상태
  // ==========================================
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('전체');
  const [filterBrand, setFilterBrand] = useState('전체');   
  const [filterSeason, setFilterSeason] = useState('전체'); 
  const [sortConfig, setSortConfig] = useState({ key: 'code', direction: 'asc' });
  const [selectedCodes, setSelectedCodes] = useState([]); 

  // ==========================================
  // 3. 일괄 수정 바 및 개별 수정 상태
  // ==========================================
  const [batchInput, setBatchInput] = useState({ 
    cost: '', tagPrice: '', priceNaver: '', priceCoupang: '', priceRocket: '', priceGold: '', priceSale: '' 
  });
  const [editingCode, setEditingCode] = useState(null);
  const [editRow, setEditRow] = useState({});

  // ==========================================
  // 4. 등록 메뉴 상세 상태
  // ==========================================
  const [tempChild, setTempChild] = useState({ 
    brand: '', season: '', category: '', 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' 
  });
  const [groupInput, setGroupInput] = useState({ 
    brand: '', season: '', type: '묶음', category: '', groupCode: '', styleNo: '', groupName: '', cost: '', tagPrice: '', children: [] 
  });

  // ==========================================
  // 5. 데이터 동기화 및 로딩
  // ==========================================
  useEffect(() => { 
    fetchData(); 
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
  // 6. 유틸리티 함수
  // ==========================================
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const calcDiscount = (price, tag) => {
    const p = Number(price || 0); const t = Number(tag || 0);
    return t === 0 ? 0 : Math.round((1 - (p / t)) * 100);
  };

  const getDiffColor = (original, current) => {
    const orig = Number(original || 0); const curr = Number(current || 0);
    if (!curr || orig === curr) return 'inherit';
    return curr > orig ? '#2980b9' : '#e74c3c'; 
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedCodes(getProcessedData().filter(i => !i.isGhost).map(item => item.code));
    } else {
      setSelectedCodes([]);
    }
  };

  // ==========================================
  // 7. 그룹-단품 매핑 정렬 및 Ghost Row 가공 로직
  // ==========================================
  const getProcessedData = () => {
    const isMatch = (item) => {
      const matchCat = filterCategory === '전체' || item.category === filterCategory;
      const matchBrand = filterBrand === '전체' || item.brand === filterBrand;
      const matchSeason = filterSeason === '전체' || item.season === filterSeason;
      const term = searchTerm.toLowerCase().trim();
      const matchSearch = term === '' || (String(item.code || "") + String(item.style_no || "") + String(item.name || "")).toLowerCase().includes(term);
      return matchCat && matchBrand && matchSeason && matchSearch;
    };

    const matchedGroups = groups.filter(isMatch).map(g => ({ ...g, type: g.type || '묶음' }));
    const matchedSingles = masterProducts.filter(isMatch).map(p => ({ ...p, type: '단품' }));

    const matchedMappedCodes = new Set();
    matchedGroups.forEach(g => {
      if (g.children) {
        g.children.forEach(c => matchedMappedCodes.add(c.code));
      }
    });

    const standaloneSingles = matchedSingles.filter(s => !matchedMappedCodes.has(s.code));

    let topLevel = [...matchedGroups, ...standaloneSingles];
    topLevel.sort((a, b) => {
      let vA = a[sortConfig.key]; let vB = b[sortConfig.key];
      if (['cost', 'tag_price', 'price_sale', 'margin'].includes(sortConfig.key)) { 
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
          const liveChild = masterProducts.find(p => p.code === childSnapshot.code) || childSnapshot;
          const isGhost = renderedChildCodes.has(liveChild.code);
          
          expandedResult.push({ 
            ...liveChild,
            brand: liveChild.brand || item.brand,
            season: liveChild.season || item.season,
            category: liveChild.category || item.category,
            type: 'ㄴ 구성', 
            isMappedChild: true, 
            parentCode: item.code,
            isGhost: isGhost 
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
      const margin = settle - cost - 5000;
      const pSale = Number(item.prev_sale || item.price_sale || 0);
      const pMargin = (pSale - Math.floor(pSale * 0.18)) - cost - 5000;
      
      return { 
        ...item, fee, settle, margin, prevMargin: pMargin, 
        ratio: cost > 0 ? (sale / cost).toFixed(1) : "0.0", discSale: calcDiscount(sale, tag) 
      };
    });
  };

  // ==========================================
  // 8. 설정 데이터 추가/삭제 로직
  // ==========================================
  const addCategory = async () => {
    if (!newCatInput.trim()) return;
    await supabase.from('categories').insert([{ name: newCatInput.trim() }]);
    setNewCatInput(''); fetchData();
  };
  const deleteCategory = async (name) => {
    if(!window.confirm(`[${name}] 삭제하시겠습니까?`)) return;
    await supabase.from('categories').delete().eq('name', name); fetchData();
  };
  const addBrand = async () => {
    if (!newBrandInput.trim()) return;
    await supabase.from('brands').insert([{ name: newBrandInput.trim() }]);
    setNewBrandInput(''); fetchData();
  };
  const deleteBrand = async (name) => {
    if(!window.confirm(`[${name}] 브랜드를 삭제하시겠습니까?`)) return;
    await supabase.from('brands').delete().eq('name', name); fetchData();
  };
  const addSeason = async () => {
    if (!newSeasonInput.trim()) return;
    await supabase.from('seasons').insert([{ name: newSeasonInput.trim() }]);
    setNewSeasonInput(''); fetchData();
  };
  const deleteSeason = async (name) => {
    if(!window.confirm(`[${name}] 시즌을 삭제하시겠습니까?`)) return;
    await supabase.from('seasons').delete().eq('name', name); fetchData();
  };

  // ==========================================
  // 9. [등록 메뉴] 마스터 저장 및 엑셀 로직
  // ==========================================
  const downloadExcelTemplate = () => {
    const templateData = [{ "브랜드": "몽벨", "시즌": "24SS", "복종": "상의", "품번": "TS-100", "스타일": "ST-01", "상품명": "기본 티셔츠", "원가": 5000, "Tag가": 20000 }];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "양식"); 
    XLSX.writeFile(wb, "MD_상품등록양식.xlsx");
  };

  const handleExcelUpload = async () => {
    if (!selectedFile) return alert("파일을 선택해주세요.");
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = XLSX.read(e.target.result, { type: 'binary' });
        const parsedRows = XLSX.utils.sheet_to_json(data.Sheets[data.SheetNames[0]]);
        const parsed = parsedRows.map(i => ({ 
          brand: i.브랜드 || '', season: i.시즌 || '', category: i.복종 || '미분류', 
          code: String(i.품번 || ''), style_no: String(i.스타일 || ''), name: i.상품명 || '', 
          cost: Number(i.원가 || 0), tag_price: Number(i.Tag가 || 0) 
        }));
        await supabase.from('master_products').upsert(parsed, { onConflict: 'code' });
        alert("엑셀 업로드 성공!"); fetchData();
      } catch (err) { 
        alert("엑셀 파싱 에러"); 
      }
    };
    reader.readAsBinaryString(selectedFile);
  };

  const handleRegisterMaster = async () => {
    const missing = [];
    if (!tempChild.brand) missing.push("브랜드");
    if (!tempChild.season) missing.push("시즌");
    if (!tempChild.category) missing.push("복종");
    if (!tempChild.품번코드) missing.push("품번코드");
    if (!tempChild.스타일넘버) missing.push("스타일넘버");
    if (!tempChild.상품명) missing.push("상품명");
    if (String(tempChild.원가).trim() === '') missing.push("원가");
    if (String(tempChild.tag가).trim() === '') missing.push("Tag가");

    if (missing.length > 0) return alert(`❌ 필수 항목 누락:\n- ${missing.join('\n- ')}`);

    const isCodeDupe = masterProducts.some(p => p.code === tempChild.품번코드);
    const isStyleDupe = masterProducts.some(p => p.style_no === tempChild.스타일넘버);

    if (isCodeDupe || isStyleDupe) {
      if (!window.confirm(`⚠️ 중복 데이터가 존재합니다. 덮어쓰시겠습니까?`)) return;
    }

    await supabase.from('master_products').upsert([{ 
      brand: tempChild.brand, season: tempChild.season, category: tempChild.category, 
      code: tempChild.품번코드, style_no: tempChild.스타일넘버, name: tempChild.상품명, 
      cost: Number(tempChild.원가 || 0), tag_price: Number(tempChild.tag가 || 0) 
    }], { onConflict: 'code' });
    
    alert("✅ 단품 마스터 저장 완료"); 
    setTempChild(prev => ({ ...prev, 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' }));
    fetchData();
  };

  const handleSaveGroup = async () => {
    const missing = [];
    if (!groupInput.brand) missing.push("브랜드");
    if (!groupInput.season) missing.push("시즌");
    if (!groupInput.groupCode) missing.push("그룹 품번");
    if (!groupInput.children.length) missing.push("단품 매핑");

    if (missing.length > 0) return alert(`❌ 필수 항목 누락:\n- ${missing.join('\n- ')}`);

    if (groups.some(g => g.code === groupInput.groupCode || g.style_no === groupInput.styleNo)) {
      return alert("🚫 중복되는 그룹상품입니다.");
    }

    const { error } = await supabase.from('groups').insert([{ 
      brand: groupInput.brand, season: groupInput.season, type: groupInput.type, category: groupInput.category, 
      code: groupInput.groupCode, style_no: groupInput.styleNo, name: groupInput.groupName, 
      cost: Number(groupInput.cost || 0), tag_price: Number(groupInput.tagPrice || 0), children: groupInput.children 
    }]);

    if (!error) {
      alert("✅ 그룹 저장 완료!"); 
      setGroupInput(prev => ({ ...prev, groupCode: '', styleNo: '', groupName: '', cost: '', tagPrice: '', children: [] }));
      fetchData();
    }
  };

  // ==========================================
  // 10. [조회 메뉴 전용] 수정, 일괄변경, 삭제, 엑셀
  // ==========================================
  const saveEdit = async (item) => {
    if (item.isGhost) return; 
    const targetTable = (item.type.includes('단품') || item.type.includes('구성')) ? 'master_products' : 'groups';
    const { error } = await supabase.from(targetTable).update({
      brand: editRow.brand, season: editRow.season, category: editRow.category, 
      style_no: editRow.style_no, name: editRow.name, cost: Number(editRow.cost), tag_price: Number(editRow.tag_price),
      price_naver: Number(editRow.price_naver || 0), price_coupang: Number(editRow.price_coupang || 0), 
      price_rocket: Number(editRow.price_rocket || 0), price_gold: Number(editRow.price_gold || 0), 
      price_sale: Number(editRow.price_sale || 0),
      prev_naver: Number(item.price_naver || 0), prev_sale: Number(item.price_sale || 0)
    }).eq('code', editingCode);

    if (!error) { 
      alert("수정 완료"); 
      setEditingCode(null); 
      fetchData(); 
    }
  };

  const handleBatchUpdate = async () => {
    if (selectedCodes.length === 0) return alert("선택된 상품이 없습니다.");
    const updateData = {};
    if (batchInput.cost) updateData.cost = Number(batchInput.cost);
    if (batchInput.tagPrice) updateData.tag_price = Number(batchInput.tagPrice);
    if (batchInput.priceNaver) updateData.price_naver = Number(batchInput.priceNaver);
    if (batchInput.priceCoupang) updateData.price_coupang = Number(batchInput.priceCoupang);
    if (batchInput.priceRocket) updateData.price_rocket = Number(batchInput.priceRocket);
    if (batchInput.priceGold) updateData.price_gold = Number(batchInput.priceGold);
    if (batchInput.priceSale) updateData.price_sale = Number(batchInput.priceSale);

    await Promise.all([
      supabase.from('groups').update(updateData).in('code', selectedCodes),
      supabase.from('master_products').update(updateData).in('code', selectedCodes)
    ]);
    alert("일괄 변경 완료"); 
    setSelectedCodes([]); 
    fetchData();
  };

  const handleBatchDelete = async () => {
    if (selectedCodes.length === 0) return alert("삭제할 상품을 선택해주세요.");
    
    if (!window.confirm(`⚠️ 정말로 선택한 ${selectedCodes.length}건의 상품을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;

    try {
      const groupsToDelete = groups.filter(g => selectedCodes.includes(g.code)).map(g => g.code);
      const masterToDelete = masterProducts.filter(p => selectedCodes.includes(p.code)).map(p => p.code);

      const deletePromises = [];
      if (groupsToDelete.length > 0) {
        deletePromises.push(supabase.from('groups').delete().in('code', groupsToDelete));
      }
      if (masterToDelete.length > 0) {
        deletePromises.push(supabase.from('master_products').delete().in('code', masterToDelete));
      }

      await Promise.all(deletePromises);
      
      alert(`✅ 총 ${selectedCodes.length}건이 삭제되었습니다.`);
      setSelectedCodes([]);
      fetchData();
    } catch (err) {
      console.error(err);
      alert("삭제 중 오류가 발생했습니다.");
    }
  };

  const downloadListExcel = () => {
    let sourceData = getProcessedData().filter(item => !item.isGhost);
    if (selectedCodes.length > 0) {
      sourceData = sourceData.filter(item => selectedCodes.includes(item.code));
    }
    if(sourceData.length === 0) return alert("데이터가 없습니다.");

    const dataToExport = sourceData.map(item => ({
      "구분": item.type, "품번": item.code, "브랜드": item.brand || '', "시즌": item.season || '',
      "복종": item.category || '', "스타일코드": item.style_no || '', "상품명": item.name || '',
      "원가": item.cost || 0, "Tag가": item.tag_price || 0, "네이버(변경)": item.price_naver || 0,
      "쿠팡(변경)": item.price_coupang || 0, "로켓(변경)": item.price_rocket || 0, "골드(변경)": item.price_gold || 0,
      "행사가(변경)": item.price_sale || 0
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "조회데이터");
    XLSX.writeFile(wb, "MD_라인시트_데이터.xlsx");
  };

  const handleListExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const parsedRows = XLSX.utils.sheet_to_json(XLSX.read(event.target.result, { type: 'binary' }).Sheets[XLSX.read(event.target.result, { type: 'binary' }).SheetNames[0]], { defval: "" });
        const allData = [...groups, ...masterProducts];
        let updateCount = 0;

        const parseNum = (val) => {
          if (!val) return null;
          if (typeof val === 'number') return val;
          const num = Number(String(val).replace(/,/g, '').replace(/원/g, '').trim());
          return isNaN(num) ? null : num;
        };
        
        for (const row of parsedRows) {
          const code = String(row["품번"]).trim();
          const targetItem = allData.find(item => item.code === code);
          if (targetItem) {
            const targetTable = (targetItem.type && (targetItem.type.includes('묶음') || targetItem.type.includes('세트'))) ? 'groups' : 'master_products';
            await supabase.from(targetTable).update({
              brand: row["브랜드"] || targetItem.brand, season: row["시즌"] || targetItem.season,
              category: row["복종"] || targetItem.category, style_no: row["스타일코드"] || targetItem.style_no, name: row["상품명"] || targetItem.name,
              cost: parseNum(row["원가"]) ?? targetItem.cost, tag_price: parseNum(row["Tag가"]) ?? targetItem.tag_price,
              price_naver: parseNum(row["네이버(변경)"]) ?? targetItem.price_naver, price_sale: parseNum(row["행사가(변경)"]) ?? targetItem.price_sale,
              prev_naver: Number(targetItem.price_naver || 0), prev_sale: Number(targetItem.price_sale || 0)
            }).eq('code', code);
            updateCount++;
          }
        }
        alert(`${updateCount}건 업데이트 완료!`); fetchData();
      } catch (err) { alert("에러 발생"); }
    };
    reader.readAsBinaryString(file); e.target.value = null;
  };

  // ==========================================
  // 11. 레이아웃 정의 (초밀착 및 넓이 조절)
  // ==========================================
  const PRIMARY_COLOR = '#3498db';
  const GHOST_COLOR = '#bdc3c7'; 

  const thStyle = { boxSizing: 'border-box', padding: '4px 4px', background: '#f8f9fa', borderBottom: '2px solid #ddd', borderRight: '1px solid #eee', fontSize: '11px', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 10, whiteSpace: 'nowrap', textAlign: 'center', cursor: 'pointer', overflow: 'hidden' };
  const tdStyle = { boxSizing: 'border-box', padding: '3px 4px', borderBottom: '1px solid #eee', borderRight: '1px solid #f9f9f9', fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' };
  
  // ✅ 상품명 450px 확장 및 틀고정(Sticky) 좌표 완벽 적용
  const cols = {
    chk: { w: 26,  l: 0 },
    mng: { w: 36,  l: 26 },
    brd: { w: 70,  l: 62 },   
    sea: { w: 60,  l: 132 },  
    typ: { w: 60,  l: 192 },
    cod: { w: 80,  l: 252 },
    cat: { w: 60,  l: 332 },
    sty: { w: 130, l: 392 },
    nam: { w: 450, l: 522 }, // 상품명 450px 확보!
    cst: { w: 60,  l: 972 }, // 522 + 450 = 972
    tag: { w: 65,  l: 1032 },// 972 + 60 = 1032
  };

  const fX = (left, isHeader = false) => ({ position: 'sticky', left: `${left}px`, zIndex: isHeader ? 20 : 10, background: isHeader ? '#f8f9fa' : 'inherit' });
  const cellS = (c) => ({ width: `${c.w}px`, minWidth: `${c.w}px`, maxWidth: `${c.w}px` });

  const miniMenuStyle = (active) => ({ width: '75px', height: '65px', borderRadius: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', marginBottom: '15px', cursor: 'pointer', backgroundColor: active ? PRIMARY_COLOR : 'transparent', color: active ? '#fff' : '#b2bec3', border: active ? 'none' : '1px solid #455a64' });
  const inputRegStyle = { padding: '8px', border: '1px solid #ddd', borderRadius: '6px', width: '100%', boxSizing: 'border-box', marginBottom: '10px' };
  const btnStyle = { padding:'2px 4px', background:'#eee', border:'1px solid #ccc', borderRadius:'3px', fontSize:'10px', cursor:'pointer' };
  const compareInputStyle = { width: '50px', fontSize: '10px', padding: '2px', border: '1px solid #3498db', borderRadius: '2px' };
  const batchInputStyle = { width: '55px', fontSize: '10px', padding: '4px', border: '1px solid #ccc', borderRadius: '3px' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', backgroundColor: '#f4f7f6', position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
      
      {/* ⬅️ 사이드바 */}
      <div style={{ width: '85px', minWidth: '85px', backgroundColor: '#2c3e50', color: '#fff', padding: '20px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', position:'fixed', height:'100vh', zIndex: 200 }}>
        <h2 style={{ color: PRIMARY_COLOR, fontSize: '0.7rem', marginBottom: '30px', textAlign: 'center' }}>LINE<br/>SHEET</h2>
        <div onClick={() => setActiveMenu('register')} style={miniMenuStyle(activeMenu === 'register')}><span>1</span><span style={{fontSize:'10px'}}>상품등록</span></div>
        <div onClick={() => setActiveMenu('list')} style={miniMenuStyle(activeMenu === 'list')}><span>2</span><span style={{fontSize:'10px'}}>조회/수정</span></div>
      </div>

      <div style={{ flex: 1, padding: '20px', boxSizing: 'border-box', marginLeft: '85px', width: 'calc(100% - 85px)', overflowY: 'auto' }}>
        
        {activeMenu === 'register' && (
          <div style={{ width: '100%' }}>
            <h2 style={{ marginBottom: '20px' }}>💎 상품 통합 등록</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', marginBottom: '20px' }}>
              <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: `5px solid #e17055`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                 <strong>🏷️ 브랜드 설정</strong>
                 <input placeholder="새 브랜드 + 엔터" value={newBrandInput} onChange={e => setNewBrandInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addBrand()} style={{padding:'6px', width:'100%', border:'1px solid #ddd', marginTop:'10px', borderRadius:'6px'}} />
                 <div style={{ display: 'flex', gap: '4px', marginTop:'10px', flexWrap:'wrap' }}>
                   {brands.map(b => <span key={b} style={{background:'#fcf0ed', padding:'4px 8px', borderRadius:'15px', fontSize:'11px'}}>{b} <b onClick={()=>deleteBrand(b)} style={{color:'red', cursor:'pointer', marginLeft:'4px'}}>×</b></span>)}
                 </div>
              </div>
              <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: `5px solid #0984e3`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                 <strong>❄️ 시즌 설정</strong>
                 <input placeholder="새 시즌 + 엔터" value={newSeasonInput} onChange={e => setNewSeasonInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSeason()} style={{padding:'6px', width:'100%', border:'1px solid #ddd', marginTop:'10px', borderRadius:'6px'}} />
                 <div style={{ display: 'flex', gap: '4px', marginTop:'10px', flexWrap:'wrap' }}>
                   {seasons.map(s => <span key={s} style={{background:'#eef6fc', padding:'4px 8px', borderRadius:'15px', fontSize:'11px'}}>{s} <b onClick={()=>deleteSeason(s)} style={{color:'red', cursor:'pointer', marginLeft:'4px'}}>×</b></span>)}
                 </div>
              </div>
              <div style={{ background: '#fff', padding: '15px', borderRadius: '12px', borderLeft: `5px solid ${PRIMARY_COLOR}`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                 <strong>📁 복종 설정</strong>
                 <input placeholder="새 복종 + 엔터" value={newCatInput} onChange={e => setNewCatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCategory()} style={{padding:'6px', width:'100%', border:'1px solid #ddd', marginTop:'10px', borderRadius:'6px'}} />
                 <div style={{ display: 'flex', gap: '4px', marginTop:'10px', flexWrap:'wrap' }}>
                   {categories.map(c => <span key={c} style={{background:'#ebf3f9', padding:'4px 8px', borderRadius:'15px', fontSize:'11px'}}>{c} <b onClick={()=>deleteCategory(c)} style={{color:'red', cursor:'pointer', marginLeft:'4px'}}>×</b></span>)}
                 </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', borderLeft: `5px solid #00cec9`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'15px' }}>
                  <h3 style={{color:'#00cec9', margin:0}}>📋 1. 단품 마스터 등록</h3>
                  <button onClick={downloadExcelTemplate} style={{fontSize:'11px', padding:'5px 10px', cursor:'pointer', borderRadius:'4px'}}>📄 양식 다운로드</button>
                </div>
                <div style={{ marginBottom:'15px', padding:'10px', background:'#f8f9fa', border:'1px dashed #ccc', borderRadius:'8px', display:'flex', gap:'5px', alignItems: 'center' }}>
                   <input type="file" onChange={(e)=>setSelectedFile(e.target.files[0])} style={{fontSize:'12px', flex:1}}/>
                   <button onClick={handleExcelUpload} style={{fontSize:'12px', background:'#00cec9', color:'#fff', border:'none', borderRadius:'4px', padding:'6px 12px', cursor:'pointer'}}>🚀 엑셀 업로드</button>
                </div>
                <Select placeholder="기존 상품 검색 및 수정..." options={masterProducts.map(p => ({ label: `[${p.code}] ${p.name}`, data: p }))} onChange={(opt) => setTempChild({brand: opt.data.brand, season: opt.data.season, category: opt.data.category, 품번코드: opt.data.code, 스타일넘버: opt.data.style_no, 상품명: opt.data.name, 원가: opt.data.cost, tag가: opt.data.tag_price})} />
                <div style={{ marginTop: '15px' }}>
                   <div style={{display:'flex', gap:'5px', marginBottom:'8px'}}>
                     <select value={tempChild.brand} onChange={e=>setTempChild({...tempChild, brand:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">브랜드</option>{brands.map(b=><option key={b} value={b}>{b}</option>)}</select>
                     <select value={tempChild.season} onChange={e=>setTempChild({...tempChild, season:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">시즌</option>{seasons.map(s=><option key={s} value={s}>{s}</option>)}</select>
                   </div>
                   <div style={{display:'flex', gap:'5px', marginBottom:'8px'}}>
                     <select value={tempChild.category} onChange={e=>setTempChild({...tempChild, category:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">복종</option>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select>
                     <input placeholder="품번코드 (필수)" value={tempChild.품번코드} onChange={e=>setTempChild({...tempChild, 품번코드:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}} />
                   </div>
                   <input placeholder="스타일넘버" value={tempChild.스타일넘버} onChange={e=>setTempChild({...tempChild, 스타일넘버:e.target.value})} style={inputRegStyle} />
                   <input placeholder="상품명 (필수)" value={tempChild.상품명} onChange={e=>setTempChild({...tempChild, 상품명:e.target.value})} style={inputRegStyle} />
                   <div style={{display:'flex', gap:'5px'}}><input type="number" placeholder="원가" value={tempChild.원가} onChange={e=>setTempChild({...tempChild, 원가:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}} /><input type="number" placeholder="Tag가" value={tempChild.tag가} onChange={e=>setTempChild({...tempChild, tag가:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}} /></div>
                   <button onClick={handleRegisterMaster} style={{width:'100%', padding:'12px', background:'#00cec9', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'bold', marginTop:'10px', cursor:'pointer'}}>단품 정보 저장하기</button>
                </div>
              </div>

              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', borderLeft: `5px solid #6c5ce7`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                <h3 style={{ color: '#6c5ce7', marginBottom: '15px' }}>📦 2. 그룹/세트 최종 구성</h3>
                <div style={{display:'flex', gap:'5px', marginBottom:'8px'}}><select value={groupInput.brand} onChange={e=>setGroupInput({...groupInput, brand:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">브랜드</option>{brands.map(b=><option key={b} value={b}>{b}</option>)}</select><select value={groupInput.season} onChange={e=>setGroupInput({...groupInput, season:e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">시즌</option>{seasons.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                <div style={{display:'flex', gap:'5px', marginBottom:'10px'}}><select value={groupInput.type} onChange={e => setGroupInput({...groupInput, type: e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="묶음">묶음상품</option><option value="세트">세트상품</option></select><select value={groupInput.category} onChange={e => setGroupInput({...groupInput, category: e.target.value})} style={{padding:'8px', flex:1, borderRadius:'6px', border:'1px solid #ddd'}}><option value="">복종</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <input placeholder="그룹 관리용 품번 (필수)" value={groupInput.groupCode} onChange={e => setGroupInput({...groupInput, groupCode: e.target.value})} style={inputRegStyle} />
                <input placeholder="그룹 스타일넘버" value={groupInput.styleNo} onChange={e => setGroupInput({...groupInput, styleNo: e.target.value})} style={inputRegStyle} />
                <input placeholder="그룹 상품명 (노출명)" value={groupInput.groupName} onChange={e => setGroupInput({...groupInput, groupName: e.target.value})} style={inputRegStyle} />
                <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '8px', border: '1px solid #ddd', marginBottom:'10px' }}>
                   <label style={{fontSize:'12px', fontWeight:'bold', display:'block', marginBottom:'8px'}}>🔗 구성 단품 매핑 (자동 필터 연동)</label>
                   <Select isMulti closeMenuOnSelect={false} controlShouldRenderValue={false} placeholder="그룹명/스타일 입력 시 자동 필터..." options={masterProducts.filter(p => {
                       const gName = groupInput.groupName.toLowerCase().trim();
                       const gStyle = groupInput.styleNo.toLowerCase().trim();
                       if (!gName && !gStyle) return true;
                       return (gName && (String(p.name).toLowerCase().includes(gName) || String(p.style_no).toLowerCase().includes(gName))) || (gStyle && (String(p.style_no).toLowerCase().includes(gStyle) || String(p.name).toLowerCase().includes(gStyle)));
                     }).map(p => ({ label: `[${p.code}] ${p.style_no} - ${p.name}`, value: p.code, data: p }))} value={groupInput.children.map(c => ({ label: c.name, value: c.code, data: c }))} onChange={(opts) => setGroupInput({...groupInput, children: opts ? opts.map(o => o.data) : []})} />
                   <div style={{ marginTop: '10px', maxHeight: '120px', overflowY: 'auto', fontSize:'11px', background:'#fff', border:'1px solid #eee', borderRadius:'4px' }}>
                      {groupInput.children.length === 0 && <div style={{padding:'10px', color:'#999', textAlign:'center'}}>선택 상품 없음.</div>}
                      {groupInput.children.map((c, i) => <div key={i} style={{borderBottom:'1px solid #f0f0f0', padding:'6px 8px', display:'flex', justifyContent:'space-between'}}><span>└ {c.name} ({c.code})</span><b style={{color:'red', cursor:'pointer'}} onClick={()=>setGroupInput({...groupInput, children: groupInput.children.filter((_,idx)=>idx!==i)})}>삭제</b></div>)}
                   </div>
                </div>
                <div style={{display:'flex', gap:'5px'}}><div style={{flex:1}}><label style={{fontSize:'11px'}}>총 원가</label><input type="number" value={groupInput.cost} onChange={e => setGroupInput({...groupInput, cost: e.target.value})} style={{...inputRegStyle, background:'#fff9db'}} /></div><div style={{flex:1}}><label style={{fontSize:'11px'}}>총 Tag가</label><input type="number" value={groupInput.tagPrice} onChange={e => setGroupInput({...groupInput, tagPrice: e.target.value})} style={{...inputRegStyle, background:'#fff9db'}} /></div></div>
                <button onClick={handleSaveGroup} style={{width:'100%', padding:'12px', background:'#6c5ce7', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'bold', cursor:'pointer'}}>그룹 저장하기</button>
              </div>
            </div>
          </div>
        )}

        {/* 메뉴 2: 조회/수정 */}
        {activeMenu === 'list' && (
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '15px' }}>
              <h2 style={{ margin: 0 }}>🔍 조회 및 마진 시뮬레이션</h2>
              <div style={{ display: 'flex', gap: '8px', background:'#fff', padding:'8px 12px', borderRadius:'8px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' }}>
                <button onClick={downloadListExcel} style={{padding:'6px 12px', background:'#27ae60', color:'#fff', border:'none', borderRadius:'4px', fontSize:'12px', cursor:'pointer', fontWeight:'bold'}}>📄 {selectedCodes.length > 0 ? "선택항목 다운로드" : "목록 다운로드"}</button>
                <div style={{width:'1px', background:'#ddd', margin:'0 5px'}}></div>
                <input type="file" onChange={handleListExcelUpload} style={{fontSize:'11px', width:'180px'}} />
              </div>
            </div>
            
            <div style={{ background:'#fff', padding:'12px', borderRadius:'12px', marginBottom:'10px', display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' }}>
              <strong>📂 복종:</strong><select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px'}}><option value="전체">전체</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <strong>🏷️ 브랜드:</strong><select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px'}}><option value="전체">전체</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}</select>
              <strong>❄️ 시즌:</strong><select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px'}}><option value="전체">전체</option>{seasons.map(s => <option key={s} value={s}>{s}</option>)}</select>
              <strong style={{marginLeft:'10px'}}>🔎 검색:</strong><input placeholder="품번, 스타일, 상품명..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{padding:'6px', width:'200px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'12px'}} /><button onClick={fetchData} style={{padding:'6px 15px', background:PRIMARY_COLOR, color:'#fff', border:'none', borderRadius:'6px', fontSize:'12px', cursor:'pointer'}}>조회</button>
            </div>

            <div style={{ background:'#ebf3f9', padding:'8px 12px', borderRadius:'8px', marginBottom:'15px', display:'flex', gap:'8px', alignItems:'center', border:'1px solid #3498db' }}>
              <strong style={{fontSize:'11px'}}>⚡ 일괄변경 ({selectedCodes.length}건):</strong>
              <input type="number" placeholder="원가" onChange={e => setBatchInput({...batchInput, cost: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="Tag가" onChange={e => setBatchInput({...batchInput, tagPrice: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="네이버" onChange={e => setBatchInput({...batchInput, priceNaver: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="쿠팡" onChange={e => setBatchInput({...batchInput, priceCoupang: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="로켓" onChange={e => setBatchInput({...batchInput, priceRocket: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="골드" onChange={e => setBatchInput({...batchInput, priceGold: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="행사가" onChange={e => setBatchInput({...batchInput, priceSale: e.target.value})} style={batchInputStyle} />
              <button onClick={handleBatchUpdate} style={{padding:'4px 10px', background:'#e67e22', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>적용</button>
              
              <div style={{ width: '1px', height: '20px', background: '#3498db', margin: '0 5px' }}></div>
              
              <button onClick={handleBatchDelete} style={{padding:'4px 12px', background:'#e74c3c', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold'}}>🗑️ 선택 삭제</button>
            </div>

            <div style={{ background:'#fff', borderRadius:'12px', overflowX:'auto', boxShadow:'0 4px 15px rgba(0,0,0,0.05)', maxHeight:'80vh' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ ...thStyle, ...fX(cols.chk.l, true), ...cellS(cols.chk) }}><input type="checkbox" onChange={handleSelectAll} checked={selectedCodes.length > 0 && selectedCodes.length === getProcessedData().filter(i=>!i.isGhost).length} /></th>
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
                    <th style={{...thStyle, width:'105px'}}>네이버 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}}>쿠팡 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}}>로켓 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}}>골드 (이전→변경)</th>
                    <th style={{...thStyle, width:'115px', color:'#e17055', background:'#fff9f9'}}>행사가 (이전→변경)</th>
                    <th style={{...thStyle, width:'50px'}}>수수료</th>
                    <th style={{...thStyle, width:'55px'}}>정산액</th>
                    <th style={{...thStyle, width:'35px'}}>배수</th>
                    <th style={{...thStyle, width:'120px', color:'red'}}>마진 (이전→변경)</th>
                  </tr>
                </thead>
                <tbody>
                  {getProcessedData().map((item, idx) => {
                    const isGhost = item.isGhost;
                    const isE = editingCode === item.code && !isGhost;
                    const isChild = item.isMappedChild;
                    const trBg = selectedCodes.includes(item.code) ? '#fff9db' : (isE ? '#e3f2fd' : (isChild ? '#f8fbfc' : '#fff'));
                    const prevN = Number(item.prev_naver || item.price_naver || 0);
                    const prevS = Number(item.prev_sale || item.price_sale || 0);
                    const curS = isE ? Number(editRow.price_sale || 0) : Number(item.price_sale || 0);
                    const curMargin = (curS - Math.floor(curS * 0.18)) - Number(item.cost || 0) - 5000;
                    
                    return (
                      <tr key={`${item.code}-${idx}`} style={{ background: trBg }}>
                        <td style={{ ...tdStyle, ...fX(cols.chk.l), ...cellS(cols.chk), background: trBg }}>{!isGhost && <input type="checkbox" checked={selectedCodes.includes(item.code)} onChange={() => setSelectedCodes(prev => prev.includes(item.code) ? prev.filter(c => c !== item.code) : [...prev, item.code])} />}</td>
                        <td style={{ ...tdStyle, ...fX(cols.mng.l), ...cellS(cols.mng), background: trBg }}>{!isGhost ? (isE ? <button onClick={()=>saveEdit(item)} style={btnStyle}>완료</button> : <button onClick={()=>{setEditingCode(item.code); setEditRow({...item});}} style={btnStyle}>수정</button>) : <span style={{color:GHOST_COLOR}}>-</span>}</td>
                        <td style={{ ...tdStyle, ...fX(cols.brd.l), ...cellS(cols.brd), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.brand}</span> : (isE ? <select value={editRow.brand||''} onChange={e=>setEditRow({...editRow, brand:e.target.value})} style={{fontSize:'10px', padding:'0', width:'100%'}}><option value="">-</option>{brands.map(b=><option key={b} value={b}>{b}</option>)}</select> : item.brand)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sea.l), ...cellS(cols.sea), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.season}</span> : (isE ? <select value={editRow.season||''} onChange={e=>setEditRow({...editRow, season:e.target.value})} style={{fontSize:'10px', padding:'0', width:'100%'}}><option value="">-</option>{seasons.map(s=><option key={s} value={s}>{s}</option>)}</select> : item.season)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.typ.l), ...cellS(cols.typ), background: trBg, color: isGhost ? GHOST_COLOR : (item.type.includes('묶음')?'#6c5ce7':(isChild?'#b2bec3':'#999')), fontWeight: item.type.includes('묶음')?'bold':'normal' }}>{item.type}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cod.l), ...cellS(cols.cod), background: trBg, paddingLeft: isChild?'10px':'2px' }}>{isChild && <span style={{color:'#bdc3c7', marginRight:'3px'}}>└</span>}<span style={{color: isGhost ? GHOST_COLOR : 'inherit'}}>{item.code}</span></td>
                        <td style={{ ...tdStyle, ...fX(cols.cat.l), ...cellS(cols.cat), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.category}</span> : (isE ? <select value={editRow.category||''} onChange={e=>setEditRow({...editRow, category:e.target.value})} style={{fontSize:'10px', padding:'0', width:'100%'}}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select> : item.category)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sty.l), ...cellS(cols.sty), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.style_no}</span> : (isE ? <input value={editRow.style_no||''} onChange={e=>setEditRow({...editRow, style_no:e.target.value})} style={{width:'90%', fontSize:'10px'}}/> : item.style_no)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.nam.l), ...cellS(cols.nam), background: trBg, textAlign:'left', paddingLeft: isChild?'10px':'2px' }}>{isGhost ? <span style={{color:GHOST_COLOR}}>{item.name} (중복)</span> : (isE ? <input value={editRow.name||''} onChange={e=>setEditRow({...editRow, name:e.target.value})} style={{width:'95%', fontSize:'10px'}}/> : item.name)}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cst.l), ...cellS(cols.cst), background: trBg }}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (isE ? <input type="number" value={editRow.cost||''} onChange={e=>setEditRow({...editRow, cost:e.target.value})} style={{width:'40px', fontSize:'10px'}}/> : (item.cost || 0).toLocaleString())}</td>
                        <td style={{ ...tdStyle, ...fX(cols.tag.l), ...cellS(cols.tag), background: trBg, borderRight: '2px solid #aaa', fontWeight: isGhost ? 'normal' : 'bold' }}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (isE ? <input type="number" value={editRow.tag_price||''} onChange={e=>setEditRow({...editRow, tag_price:e.target.value})} style={{width:'40px', fontSize:'10px'}}/> : (item.tag_price || 0).toLocaleString())}</td>
                        <td style={tdStyle}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (<>{prevN.toLocaleString()} → {isE ? <input type="number" value={editRow.price_naver} onChange={e=>setEditRow({...editRow, price_naver:e.target.value})} style={{...compareInputStyle, color: getDiffColor(prevN, editRow.price_naver)}}/> : <span style={{color: getDiffColor(prevN, item.price_naver), marginLeft:'4px'}}>{(item.price_naver || 0).toLocaleString()}</span>}</>)}</td>
                        <td style={tdStyle}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (<>{(item.price_coupang || 0).toLocaleString()} → {isE ? <input type="number" value={editRow.price_coupang} onChange={e=>setEditRow({...editRow, price_coupang:e.target.value})} style={compareInputStyle}/> : <span style={{marginLeft:'4px'}}>{(item.price_coupang || 0).toLocaleString()}</span>}</>)}</td>
                        <td style={tdStyle}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (<>{(item.price_rocket || 0).toLocaleString()} → {isE ? <input type="number" value={editRow.price_rocket} onChange={e=>setEditRow({...editRow, price_rocket:e.target.value})} style={compareInputStyle}/> : <span style={{marginLeft:'4px'}}>{(item.price_rocket || 0).toLocaleString()}</span>}</>)}</td>
                        <td style={tdStyle}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (<>{(item.price_gold || 0).toLocaleString()} → {isE ? <input type="number" value={editRow.price_gold} onChange={e=>setEditRow({...editRow, price_gold:e.target.value})} style={compareInputStyle}/> : <span style={{marginLeft:'4px'}}>{(item.price_gold || 0).toLocaleString()}</span>}</>)}</td>
                        <td style={{...tdStyle, color:'#e17055', background: isE ? '#fff9f9' : 'inherit'}}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (<>{prevS.toLocaleString()} → {isE ? <input type="number" value={editRow.price_sale} onChange={e=>setEditRow({...editRow, price_sale:e.target.value})} style={{...compareInputStyle, width:'45px', color: getDiffColor(prevS, editRow.price_sale)}}/> : <span style={{color: getDiffColor(prevS, item.price_sale), marginLeft:'4px'}}>{(item.price_sale || 0).toLocaleString()}({item.discSale}%)</span>}</>)}</td>
                        <td style={tdStyle}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : Math.floor(curS * 0.18).toLocaleString()}</td>
                        <td style={{...tdStyle, fontWeight: isGhost ? 'normal' : 'bold'}}>{isGhost ? <span style={{color:GHOST_COLOR}}>-</span> : (curS - Math.floor(curS * 0.18)).toLocaleString()}</td>
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
      </div>
    </div>
  );
}

export default App;