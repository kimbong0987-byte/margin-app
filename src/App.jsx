import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Select from 'react-select';
import { supabase } from './supabaseClient'; 

function App() {
  // 1. 공통 상태
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

  // 2. 조회 필터/정렬
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('전체');
  const [filterBrand, setFilterBrand] = useState('전체');   
  const [filterSeason, setFilterSeason] = useState('전체'); 
  const [sortConfig, setSortConfig] = useState({ key: 'code', direction: 'asc' });
  const [selectedCodes, setSelectedCodes] = useState([]); 

  // 3. 일괄 수정 및 개별 수정
  const [batchInput, setBatchInput] = useState({ 
    cost: '', tagPrice: '', priceNaver: '', priceCoupang: '', priceRocket: '', priceGold: '', priceSale: '' 
  });
  const [editingCode, setEditingCode] = useState(null);
  const [editRow, setEditRow] = useState({});

  // 4. 등록 메뉴 상태
  const [tempChild, setTempChild] = useState({ brand: '', season: '', category: '', 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' });
  const [groupInput, setGroupInput] = useState({ brand: '', season: '', type: '묶음', category: '', groupCode: '', styleNo: '', groupName: '', cost: '', tagPrice: '', children: [] });

  useEffect(() => { fetchData(); }, [activeMenu]);

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
    } catch (e) { console.error("데이터 로드 실패", e); }
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const calcDiscount = (p, t) => {
    const pp = Number(p || 0); const tt = Number(t || 0);
    return tt === 0 ? 0 : Math.round((1 - (pp / tt)) * 100);
  };

  const getDiffColor = (o, c) => {
    const oo = Number(o || 0); const cc = Number(c || 0);
    if (!cc || oo === cc) return 'inherit';
    return cc > oo ? '#2980b9' : '#e74c3c'; 
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedCodes(getProcessedData().filter(i => !i.isGhost).map(item => item.code));
    else setSelectedCodes([]);
  };

  const getProcessedData = () => {
    const isMatch = (item) => {
      const matchCat = filterCategory === '전체' || item.category === filterCategory;
      const matchBrand = filterBrand === '전체' || item.brand === filterBrand;
      const matchSeason = filterSeason === '전체' || item.season === filterSeason;
      const term = searchTerm.toLowerCase().trim();
      const matchSearch = term === '' || (String(item.code || "") + String(item.style_no || "") + String(item.name || "")).toLowerCase().includes(term);
      return matchCat && matchBrand && matchSeason && matchSearch;
    };
    const mGroups = groups.filter(isMatch).map(g => ({ ...g, type: g.type || '묶음' }));
    const mSingles = masterProducts.filter(isMatch).map(p => ({ ...p, type: '단품' }));
    const mCodes = new Set();
    mGroups.forEach(g => { if (g.children) g.children.forEach(c => mCodes.add(c.code)); });
    const standalone = mSingles.filter(s => !mCodes.has(s.code));
    let top = [...mGroups, ...standalone];
    top.sort((a, b) => {
      let vA = a[sortConfig.key]; let vB = b[sortConfig.key];
      if (['cost', 'tag_price', 'price_sale', 'margin'].includes(sortConfig.key)) { vA = Number(vA || 0); vB = Number(vB || 0); }
      else { vA = String(vA || "").toLowerCase(); vB = String(vB || "").toLowerCase(); }
      return sortConfig.direction === 'asc' ? (vA < vB ? -1 : 1) : (vA > vB ? -1 : 1);
    });
    const res = []; const rendered = new Set();
    top.forEach(item => {
      res.push(item);
      if ((item.type === '묶음' || item.type === '세트') && item.children) {
        item.children.forEach(cSnap => {
          const live = masterProducts.find(p => p.code === cSnap.code) || cSnap;
          const isG = rendered.has(live.code);
          res.push({ ...live, brand: live.brand||item.brand, season: live.season||item.season, category: live.category||item.category, type: 'ㄴ 구성', isMappedChild: true, parentCode: item.code, isGhost: isG });
          if (!isG) rendered.add(live.code);
        });
      }
    });
    return res.map(item => {
      const c = Number(item.cost || 0); const t = Number(item.tag_price || 0); const s = Number(item.price_sale || 0); 
      const fee = Math.floor(s * 0.18); const set = s - fee; const m = set - c - 5000;
      const pS = Number(item.prev_sale || item.price_sale || 0);
      const pM = (pS - Math.floor(pS * 0.18)) - c - 5000;
      return { ...item, fee, settle: set, margin: m, prevMargin: pM, ratio: c > 0 ? (s / c).toFixed(1) : "0.0", discSale: calcDiscount(s, t) };
    });
  };

  const addCategory = async () => { if(!newCatInput.trim()) return; await supabase.from('categories').insert([{name: newCatInput}]); setNewCatInput(''); fetchData(); };
  const deleteCategory = async (n) => { if(window.confirm(`${n} 삭제?`)) { await supabase.from('categories').delete().eq('name',n); fetchData(); } };
  const addBrand = async () => { if(!newBrandInput.trim()) return; await supabase.from('brands').insert([{name: newBrandInput}]); setNewBrandInput(''); fetchData(); };
  const deleteBrand = async (n) => { if(window.confirm(`${n} 삭제?`)) { await supabase.from('brands').delete().eq('name',n); fetchData(); } };
  const addSeason = async () => { if(!newSeasonInput.trim()) return; await supabase.from('seasons').insert([{name: newSeasonInput}]); setNewSeasonInput(''); fetchData(); };
  const deleteSeason = async (n) => { if(window.confirm(`${n} 삭제?`)) { await supabase.from('seasons').delete().eq('name',n); fetchData(); } };

  const handleRegisterMaster = async () => {
    await supabase.from('master_products').upsert([{ 
      brand: tempChild.brand, season: tempChild.season, category: tempChild.category, 
      code: tempChild.품번코드, style_no: tempChild.스타일넘버, name: tempChild.상품명, 
      cost: Number(tempChild.원가 || 0), tag_price: Number(tempChild.tag가 || 0) 
    }], { onConflict: 'code' });
    alert("저장 완료"); setTempChild(p => ({ ...p, 품번코드: '', 스타일넘버: '', 상품명: '', 원가: '', tag가: '' })); fetchData();
  };

  const handleSaveGroup = async () => {
    await supabase.from('groups').insert([{ 
      brand: groupInput.brand, season: groupInput.season, type: groupInput.type, category: groupInput.category, 
      code: groupInput.groupCode, style_no: groupInput.styleNo, name: groupInput.groupName, 
      cost: Number(groupInput.cost || 0), tag_price: Number(groupInput.tagPrice || 0), children: groupInput.children 
    }]);
    alert("그룹 저장 완료"); setGroupInput(p => ({ ...p, groupCode:'', styleNo:'', groupName:'', cost:'', tagPrice:'', children:[] })); fetchData();
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
    setEditingCode(null); fetchData();
  };

  const handleBatchUpdate = async () => {
    if (!selectedCodes.length) return alert("선택된 상품 없음");
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
    alert("일괄 변경 완료"); setSelectedCodes([]); fetchData();
  };

  const handleBatchDelete = async () => {
    if (!selectedCodes.length || !window.confirm("정말 삭제하시겠습니까?")) return;
    const gDel = groups.filter(g => selectedCodes.includes(g.code)).map(g => g.code);
    const mDel = masterProducts.filter(p => selectedCodes.includes(p.code)).map(p => p.code);
    if (gDel.length) await supabase.from('groups').delete().in('code', gDel);
    if (mDel.length) await supabase.from('master_products').delete().in('code', mDel);
    alert("삭제 완료"); setSelectedCodes([]); fetchData();
  };

  const downloadListExcel = () => {
    let src = getProcessedData().filter(i => !i.isGhost);
    if (selectedCodes.length) src = src.filter(i => selectedCodes.includes(i.code));
    const ws = XLSX.utils.json_to_sheet(src.map(i => ({ "품번": i.code, "상품명": i.name, "원가": i.cost, "행사가": i.price_sale })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "MD_LineSheet.xlsx");
  };

  const handleListExcelUpload = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const rows = XLSX.utils.sheet_to_json(XLSX.read(ev.target.result, {type:'binary'}).Sheets[XLSX.read(ev.target.result, {type:'binary'}).SheetNames[0]]);
      for(const r of rows) {
        const c = String(r["품번"]);
        const tbl = groups.some(g=>g.code===c) ? 'groups' : 'master_products';
        await supabase.from(tbl).update({ cost: Number(r["원가"]||0), price_sale: Number(r["행사가"]||0) }).eq('code', c);
      }
      alert("업로드 완료"); fetchData();
    };
    reader.readAsBinaryString(file);
  };

  // 스타일 정의
  const thStyle = { boxSizing: 'border-box', padding: '4px', background: '#f8f9fa', borderBottom: '2px solid #ddd', borderRight: '1px solid #eee', fontSize: '11px', fontWeight: 'bold', position: 'sticky', top: 0, zIndex: 10, whiteSpace: 'nowrap', textAlign: 'center' };
  const tdStyle = { boxSizing: 'border-box', padding: '3px 4px', borderBottom: '1px solid #eee', borderRight: '1px solid #f9f9f9', fontSize: '11px', whiteSpace: 'nowrap', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis' };
  
  // ✅ 상품명 450px 확장 반영 및 고정 틀 좌표 재계산
  const cols = {
    chk: { w: 26,  l: 0 },
    mng: { w: 36,  l: 26 },
    brd: { w: 70,  l: 62 },   
    sea: { w: 60,  l: 132 },  
    typ: { w: 60,  l: 192 },
    cod: { w: 80,  l: 252 },
    cat: { w: 60,  l: 332 },
    sty: { w: 130, l: 392 },
    nam: { w: 450, l: 522 }, // 상품명 450px 확장
    cst: { w: 60,  l: 972 }, // 고정 위치 자동 밀림 (522 + 450)
    tag: { w: 65,  l: 1032 },// (972 + 60)
  };

  const fX = (l, h = false) => ({ position: 'sticky', left: `${l}px`, zIndex: h ? 20 : 10, background: h ? '#f8f9fa' : 'inherit' });
  const cellS = (c) => ({ width: `${c.w}px`, minWidth: `${c.w}px`, maxWidth: `${c.w}px` });
  const batchInputStyle = { width: '55px', fontSize: '10px', padding: '2px', border: '1px solid #ccc', borderRadius: '3px' };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100vw', backgroundColor: '#f4f7f6', position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}>
      
      {/* 사이드바 */}
      <div style={{ width: '85px', minWidth: '85px', backgroundColor: '#2c3e50', color: '#fff', padding: '20px 5px', display: 'flex', flexDirection: 'column', alignItems: 'center', position:'fixed', height:'100vh', zIndex: 200 }}>
        <h2 style={{ color: '#3498db', fontSize: '0.7rem', marginBottom: '30px' }}>LINE SHEET</h2>
        <div onClick={() => setActiveMenu('register')} style={{cursor:'pointer', marginBottom:'20px', color: activeMenu==='register'?'#3498db':'#fff'}}>등록</div>
        <div onClick={() => setActiveMenu('list')} style={{cursor:'pointer', color: activeMenu==='list'?'#3498db':'#fff'}}>조회</div>
      </div>

      <div style={{ flex: 1, padding: '20px', marginLeft: '85px', width: 'calc(100% - 85px)', overflowY: 'auto' }}>
        
        {activeMenu === 'register' && (
          <div>
            <h2>💎 상품 등록</h2>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'20px'}}>
              <div style={{background:'#fff', padding:'20px', borderRadius:'12px'}}>
                <h3>단품 등록</h3>
                <select value={tempChild.brand} onChange={e=>setTempChild({...tempChild, brand:e.target.value})}><option value="">브랜드</option>{brands.map(b=><option key={b}>{b}</option>)}</select>
                <input placeholder="품번" value={tempChild.품번코드} onChange={e=>setTempChild({...tempChild, 품번코드:e.target.value})} style={{display:'block', width:'100%', margin:'10px 0'}} />
                <input placeholder="상품명" value={tempChild.상품명} onChange={e=>setTempChild({...tempChild, 상품명:e.target.value})} style={{display:'block', width:'100%', margin:'10px 0'}} />
                <button onClick={handleRegisterMaster} style={{width:'100%', padding:'10px', background:'#00cec9', color:'#fff', border:'none'}}>저장</button>
              </div>
            </div>
          </div>
        )}

        {activeMenu === 'list' && (
          <div style={{ width: '100%' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'15px' }}>
              <h2>🔍 마진 시뮬레이션</h2>
              <button onClick={downloadListExcel} style={{background:'#27ae60', color:'#fff', padding:'5px 15px', border:'none', borderRadius:'4px'}}>엑셀 다운로드</button>
            </div>
            
            {/* ✅ 일괄 변경 바 (누락된 항목들 추가 완료) */}
            <div style={{ background:'#ebf3f9', padding:'8px 12px', borderRadius:'8px', marginBottom:'15px', display:'flex', gap:'8px', alignItems:'center', border:'1px solid #3498db' }}>
              <strong style={{fontSize:'11px'}}>⚡ 일괄변경 ({selectedCodes.length}건):</strong>
              <input type="number" placeholder="원가" onChange={e => setBatchInput({...batchInput, cost: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="Tag가" onChange={e => setBatchInput({...batchInput, tagPrice: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="네이버" onChange={e => setBatchInput({...batchInput, priceNaver: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="쿠팡" onChange={e => setBatchInput({...batchInput, priceCoupang: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="로켓" onChange={e => setBatchInput({...batchInput, priceRocket: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="골드" onChange={e => setBatchInput({...batchInput, priceGold: e.target.value})} style={batchInputStyle} />
              <input type="number" placeholder="행사가" onChange={e => setBatchInput({...batchInput, priceSale: e.target.value})} style={batchInputStyle} />
              <button onClick={handleBatchUpdate} style={{padding:'4px 10px', background:'#e67e22', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer'}}>적용</button>
              <button onClick={handleBatchDelete} style={{padding:'4px 12px', background:'#e74c3c', color:'#fff', border:'none', borderRadius:'4px', fontSize:'11px', cursor:'pointer', marginLeft:'auto'}}>🗑️ 선택 삭제</button>
            </div>

            <div style={{ background:'#fff', borderRadius:'12px', overflowX:'auto', maxHeight:'80vh' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: 'max-content' }}>
                <thead>
                  <tr style={{ background: '#f8f9fa' }}>
                    <th style={{ ...thStyle, ...fX(cols.chk.l, true), ...cellS(cols.chk) }}><input type="checkbox" onChange={handleSelectAll} checked={selectedCodes.length > 0} /></th>
                    <th style={{ ...thStyle, ...fX(cols.mng.l, true), ...cellS(cols.mng) }}>관리</th>
                    <th style={{ ...thStyle, ...fX(cols.brd.l, true), ...cellS(cols.brd) }}>브랜드</th>
                    <th style={{ ...thStyle, ...fX(cols.sea.l, true), ...cellS(cols.sea) }}>시즌</th>
                    <th style={{ ...thStyle, ...fX(cols.typ.l, true), ...cellS(cols.typ) }}>구분</th>
                    <th style={{ ...thStyle, ...fX(cols.cod.l, true), ...cellS(cols.cod) }}>품번</th>
                    <th style={{ ...thStyle, ...fX(cols.cat.l, true), ...cellS(cols.cat) }}>복종</th>
                    <th style={{ ...thStyle, ...fX(cols.sty.l, true), ...cellS(cols.sty) }}>스타일</th>
                    <th style={{ ...thStyle, ...fX(cols.nam.l, true), ...cellS(cols.nam), textAlign:'left' }}>상품명</th>
                    <th style={{ ...thStyle, ...fX(cols.cst.l, true), ...cellS(cols.cst) }}>원가</th>
                    <th style={{ ...thStyle, ...fX(cols.tag.l, true), ...cellS(cols.tag), borderRight: '2px solid #aaa' }}>Tag가</th>
                    <th style={{...thStyle, width:'105px'}}>네이버 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}}>쿠팡 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}}>로켓 (이전→변경)</th>
                    <th style={{...thStyle, width:'105px'}}>골드 (이전→변경)</th>
                    <th style={{...thStyle, width:'115px', color:'#e17055', background:'#fff9f9'}}>행사가 (이전→변경)</th>
                    <th style={{...thStyle, width:'120px', color:'red'}}>마진 (이전→변경)</th>
                  </tr>
                </thead>
                <tbody>
                  {getProcessedData().map((item, idx) => {
                    const isG = item.isGhost; const isE = editingCode === item.code && !isG;
                    const trBg = selectedCodes.includes(item.code) ? '#fff9db' : (isE ? '#e3f2fd' : (item.isMappedChild ? '#f8fbfc' : '#fff'));
                    const curS = isE ? Number(editRow.price_sale || 0) : Number(item.price_sale || 0);
                    const curMargin = (curS - Math.floor(curS * 0.18)) - Number(item.cost || 0) - 5000;
                    return (
                      <tr key={idx} style={{ background: trBg }}>
                        <td style={{ ...tdStyle, ...fX(cols.chk.l), ...cellS(cols.chk), background: trBg }}>{!isG && <input type="checkbox" checked={selectedCodes.includes(item.code)} onChange={()=>setSelectedCodes(prev=>prev.includes(item.code)?prev.filter(c=>c!==item.code):[...prev,item.code])}/>}</td>
                        <td style={{ ...tdStyle, ...fX(cols.mng.l), ...cellS(cols.mng), background: trBg }}>{!isG ? (isE ? <button onClick={()=>saveEdit(item)}>완료</button> : <button onClick={()=>{setEditingCode(item.code); setEditRow({...item});}}>수정</button>) : <span style={{color:GHOST_COLOR}}>-</span>}</td>
                        <td style={{ ...tdStyle, ...fX(cols.brd.l), ...cellS(cols.brd), background: trBg }}>{isE ? <input value={editRow.brand||''} onChange={e=>setEditRow({...editRow, brand:e.target.value})} style={{width:'90%'}}/> : item.brand}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sea.l), ...cellS(cols.sea), background: trBg }}>{isE ? <input value={editRow.season||''} onChange={e=>setEditRow({...editRow, season:e.target.value})} style={{width:'90%'}}/> : item.season}</td>
                        <td style={{ ...tdStyle, ...fX(cols.typ.l), ...cellS(cols.typ), background: trBg, color: isG?GHOST_COLOR:(item.type.includes('묶음')?'#6c5ce7':'#999') }}>{item.type}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cod.l), ...cellS(cols.cod), background: trBg }}>{item.isMappedChild && '└'}{item.code}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cat.l), ...cellS(cols.cat), background: trBg }}>{item.category}</td>
                        <td style={{ ...tdStyle, ...fX(cols.sty.l), ...cellS(cols.sty), background: trBg }}>{item.style_no}</td>
                        <td style={{ ...tdStyle, ...fX(cols.nam.l), ...cellS(cols.nam), background: trBg, textAlign:'left' }}>{isE ? <input value={editRow.name||''} onChange={e=>setEditRow({...editRow, name:e.target.value})} style={{width:'95%'}}/> : item.name}</td>
                        <td style={{ ...tdStyle, ...fX(cols.cst.l), ...cellS(cols.cst), background: trBg }}>{isE ? <input type="number" value={editRow.cost} onChange={e=>setEditRow({...editRow, cost:e.target.value})} style={{width:'45px'}}/> : item.cost?.toLocaleString()}</td>
                        <td style={{ ...tdStyle, ...fX(cols.tag.l), ...cellS(cols.tag), background: trBg, borderRight:'2px solid #aaa' }}>{isE ? <input type="number" value={editRow.tag_price} onChange={e=>setEditRow({...editRow, tag_price:e.target.value})} style={{width:'45px'}}/> : item.tag_price?.toLocaleString()}</td>
                        <td style={tdStyle}>{isG?'-':<>{(item.price_naver||0).toLocaleString()} → {isE?<input type="number" value={editRow.price_naver} onChange={e=>setEditRow({...editRow, price_naver:e.target.value})} style={{width:'50px'}}/>: (item.price_naver||0).toLocaleString()}</>}</td>
                        <td style={tdStyle}>{isG?'-':<>{(item.price_coupang||0).toLocaleString()} → {isE?<input type="number" value={editRow.price_coupang} onChange={e=>setEditRow({...editRow, price_coupang:e.target.value})} style={{width:'50px'}}/>: (item.price_coupang||0).toLocaleString()}</>}</td>
                        <td style={tdStyle}>{isG?'-':<>{(item.price_rocket||0).toLocaleString()} → {isE?<input type="number" value={editRow.price_rocket} onChange={e=>setEditRow({...editRow, price_rocket:e.target.value})} style={{width:'50px'}}/>: (item.price_rocket||0).toLocaleString()}</>}</td>
                        <td style={tdStyle}>{isG?'-':<>{(item.price_gold||0).toLocaleString()} → {isE?<input type="number" value={editRow.price_gold} onChange={e=>setEditRow({...editRow, price_gold:e.target.value})} style={{width:'50px'}}/>: (item.price_gold||0).toLocaleString()}</>}</td>
                        <td style={{...tdStyle, color:'#e17055'}}>{isG?'-':<>{(item.price_sale||0).toLocaleString()} → {isE?<input type="number" value={editRow.price_sale} onChange={e=>setEditRow({...editRow, price_sale:e.target.value})} style={{width:'50px'}}/>: (item.price_sale||0).toLocaleString()}</>}</td>
                        <td style={{...tdStyle, color:'red', fontWeight:'bold'}}>{isG?'-':<>{item.prevMargin?.toLocaleString()} → {curMargin?.toLocaleString()}</>}</td>
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