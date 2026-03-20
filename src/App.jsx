import React, { useState, useEffect } from 'react';
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

  // 🌟 모바일 감지 상태
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  // ==========================================
  // 2. 초기 데이터 로드 & 화면 크기 감지
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

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedCodes(getProcessedData().filter(i => !i.isGhost).map(item => item.code));
    } else {
      setSelectedCodes([]);
    }
  };

  const getProcessedData = () => {
    const isMatch = (item) => {
      const matchCat = filterCategory === '전체' || item.category === filterCategory;
      const matchBrand = filterBrand === '전체' || item.brand === filterBrand;
      const matchSeason = filterSeason === '전체' || item.season === filterSeason;
      const term = (searchTerm || '').toLowerCase().trim();
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
      const discSale = tag === 0 ? 0 : Math.round((1 - (sale / tag)) * 100);
      
      return { 
        ...item, fee, settle, margin, prevMargin: pMargin, 
        ratio: cost > 0 ? (sale / cost).toFixed(1) : "0.0", discSale 
      };
    });
  };

  // ==========================================
  // 4. 추가/삭제/저장 함수
  // ==========================================
  const addCategory = async () => { 
    if(!newCatInput.trim()) return; 
    await supabase.from('categories').insert([{name: newCatInput}]); 
    setNewCatInput(''); fetchData(); 
  };
  const deleteCategory = async (n) => { 
    if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('categories').delete().eq('name',n); fetchData(); } 
  };
  const addBrand = async () => { 
    if(!newBrandInput.trim()) return; 
    await supabase.from('brands').insert([{name: newBrandInput}]); 
    setNewBrandInput(''); fetchData(); 
  };
  const deleteBrand = async (n) => { 
    if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('brands').delete().eq('name',n); fetchData(); } 
  };
  const addSeason = async () => { 
    if(!newSeasonInput.trim()) return; 
    await supabase.from('seasons').insert([{name: newSeasonInput}]); 
    setNewSeasonInput(''); fetchData(); 
  };
  const deleteSeason = async (n) => { 
    if(window.confirm(`[${n}] 삭제하시겠습니까?`)) { await supabase.from('seasons').delete().eq('name',n); fetchData(); } 
  };

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
    await supabase.from('groups').insert([{ 
      brand: groupInput.brand, season: groupInput.season, type: groupInput.type, category: groupInput.category, 
      code: groupInput.groupCode, style_no: groupInput.styleNo, name: groupInput.groupName, 
      cost: Number(groupInput.cost || 0), tag_price: Number(groupInput.tagPrice || 0), children: groupInput.children 
    }]);
    alert("✅ 그룹 저장 완료"); 
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

  const downloadListExcel = () => {
    let src = getProcessedData().filter(i => !i.isGhost);
    if (selectedCodes.length) src = src.filter(i => selectedCodes.includes(i.code));
    
    const ws = XLSX.utils.json_to_sheet(src.map(i => ({ "품번": i.code, "상품명": i.name, "원가": i.cost, "행사가": i.price_sale })));
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "MD_LineSheet.xlsx");
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
      alert("✅ 업로드 완료"); 
      fetchData();
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

  const thStyle = { boxSizing: 'border-box', padding: '4px', background: '#f8f9fa', borderBottom: '2px solid #ddd', borderRight: '1px solid #eee', fontSize: '11px', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 10, whiteSpace: 'nowrap', textAlign: 'center' };
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
    : { width: '85px', minWidth: '85px', backgroundColor: '#2c3e50', color: '#fff', padding: '20px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', position:'fixed', height:'100vh', zIndex: 200 };

  const mainContentStyle = isMobile
    ? { flex: 1, padding: '15px', boxSizing: 'border-box', width: '100%', overflowY: 'auto', paddingBottom: '80px' }
    : { flex: 1, padding: '20px', boxSizing: 'border-box', marginLeft: '85px', width: 'calc(100% - 85px)', overflowY: 'auto' };

  const miniMenuStyle = (active) => ({ 
    width: isMobile ? '80px' : '75px', height: isMobile ? '45px' : '65px', borderRadius: '10px', display: 'flex', 
    flexDirection: isMobile ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', marginBottom: isMobile ? '0' : '15px', 
    cursor: 'pointer', backgroundColor: active ? PRIMARY_COLOR : 'transparent', color: active ? '#fff' : '#b2bec3', border: active ? 'none' : '1px solid #455a64', gap: isMobile ? '5px' : '0'
  });

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100vh', width: '100vw', backgroundColor: '#f4f7f6', position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
      
      {/* ⬅️ 네비게이션 */}
      <div style={sidebarStyle}>
        {!isMobile && <h2 style={{ color: PRIMARY_COLOR, fontSize: '0.7rem', marginBottom: '30px', textAlign: 'center' }}>LINE<br/>SHEET</h2>}
        <div onClick={() => setActiveMenu('register')} style={miniMenuStyle(activeMenu === 'register')}><span style={{fontWeight:'bold'}}>1</span><span style={{fontSize:'10px'}}>상품등록</span></div>
        <div onClick={() => setActiveMenu('list')} style={miniMenuStyle(activeMenu === 'list')}><span style={{fontWeight:'bold'}}>2</span><span style={{fontSize:'10px'}}>조회/수정</span></div>
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
              
              {/* --- 단품 등록 영역 --- */}
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
                  options={(masterProducts || []).map(p => ({ label: `[${p?.code || ''}] ${p?.name || ''}`, data: p }))} 
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

              {/* --- 그룹 등록 영역 --- */}
              <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', borderLeft: `5px solid #6c5ce7`, boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
                <h3 style={{ color: '#6c5ce7', marginBottom: '15px', fontSize: isMobile?'1rem':'1.17em' }}>📦 2. 그룹/세트 최종 구성</h3>
                
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
                   <label style={{fontSize:'12px', fontWeight:'bold', display:'block', marginBottom:'8px'}}>🔗 구성 단품 매핑</label>
                   
                   <Select isMulti closeMenuOnSelect={false} controlShouldRenderValue={false} placeholder="상품 검색..." 
                     options={(masterProducts || []).filter(p => {
                       const gName = (groupInput?.groupName || '').toLowerCase().trim();
                       const gStyle = (groupInput?.styleNo || '').toLowerCase().trim();
                       if (!gName && !gStyle) return true;
                       const pName = String(p?.name || '').toLowerCase();
                       const pStyle = String(p?.style_no || '').toLowerCase();
                       return (gName && (pName.includes(gName) || pStyle.includes(gName))) || (gStyle && (pStyle.includes(gStyle) || pName.includes(gStyle)));
                     }).map(p => ({ label: `[${p?.code || ''}] ${p?.style_no || ''} - ${p?.name || ''}`, value: p?.code, data: p }))} 
                     value={(groupInput?.children || []).map(c => ({ label: c?.name || '', value: c?.code || '', data: c }))} 
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
                
                <button onClick={handleSaveGroup} style={{width:'100%', padding:'12px', background:'#6c5ce7', color:'#fff', border:'none', borderRadius:'6px', fontWeight:'bold', cursor:'pointer', marginTop:'10px'}}>그룹 저장하기</button>
              </div>
            </div>
          </div>
        )}

        {/* ======================= [ 메뉴 2: 리스트 & 일괄변경 ] ======================= */}
        {activeMenu === 'list' && (
          <div style={{ width: '100%' }}>
            
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'flex-end', marginBottom: '15px', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: isMobile?'1.2rem':'1.5rem' }}>🔍 마진 시뮬레이션</h2>
              <div style={{ display: 'flex', gap: '8px', background:'#fff', padding:'8px', borderRadius:'8px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', width: isMobile ? '100%' : 'auto', boxSizing:'border-box', overflowX:'auto' }}>
                <button onClick={downloadListExcel} style={{padding:'6px 10px', background:'#27ae60', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', fontWeight:'bold', whiteSpace:'nowrap'}}>📄 {selectedCodes.length > 0 ? "선택 엑셀" : "전체 엑셀"}</button>
                <div style={{width:'1px', background:'#ddd', margin:'0 2px'}}></div>
                <input type="file" onChange={handleListExcelUpload} style={{fontSize:'11px', width:'150px'}} />
              </div>
            </div>
            
            <div style={{ background:'#fff', padding:'12px', borderRadius:'12px', marginBottom:'10px', display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap', boxShadow:'0 2px 5px rgba(0,0,0,0.05)' }}>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">복종 전체</option>{categories.map(c => <option key={c} value={c}>{c}</option>)}</select>
              <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">브랜드 전체</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}</select>
              <select value={filterSeason} onChange={e => setFilterSeason(e.target.value)} style={{padding:'6px', borderRadius:'6px', border:'1px solid #ddd', fontSize:'12px', flex: isMobile? '1 1 45%' : 'none'}}><option value="전체">시즌 전체</option>{seasons.map(s => <option key={s} value={s}>{s}</option>)}</select>
              
              <div style={{ display:'flex', width: isMobile ? '100%' : 'auto', gap:'5px' }}>
                <input placeholder="검색 (품번,상품명)" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} style={{padding:'6px', flex:1, minWidth:'120px', border:'1px solid #ddd', borderRadius:'6px', fontSize:'12px'}} />
                <button onClick={fetchData} style={{padding:'6px 15px', background:PRIMARY_COLOR, color:'#fff', border:'none', borderRadius:'6px', fontSize:'12px', cursor:'pointer', whiteSpace:'nowrap'}}>조회</button>
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