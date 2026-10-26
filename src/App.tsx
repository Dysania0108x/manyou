import { useEffect, useMemo, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { ArrowUpRight, Clock3, FolderOpen, Heart, Image as ImageIcon, LayoutGrid, List, Play, RefreshCw, Search, Video, X } from 'lucide-react';
import type { MediaItem, SourceRoot } from './types';
import { addRoot, loadMedia, loadRoots, removeRoot, replaceScannedFiles, toggleFavorite, updateRootName } from './storage';

type ScanResult={path:string;relativePath:string;filename:string;extension:string;kind:'image'|'video';size:number;modifiedAt:string;folderName:string};
type View='全部'|'地点相册'|'时间线'|'收藏';
const makeId=()=>crypto.randomUUID();
const fmtDate=(s:string)=>{const n=Number(s);if(!n)return '日期未知';return new Date(n*1000).toLocaleDateString('zh-CN',{year:'numeric',month:'short',day:'numeric'});};
const fmtSize=(n:number)=>n<1024*1024?Math.max(1,Math.round(n/1024))+' KB':(n/1024/1024).toFixed(1)+' MB';

export default function App(){
  const [roots,setRoots]=useState<SourceRoot[]>([]);
  const [items,setItems]=useState<MediaItem[]>([]);
  const [view,setView]=useState<View>('全部');
  const [activeRoot,setActiveRoot]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selection,setSelection]=useState<MediaItem|null>(null);
  const [renameId,setRenameId]=useState<string|null>(null);
  const [renameValue,setRenameValue]=useState('');
  const [listMode,setListMode]=useState(false);
  const [pageCount,setPageCount]=useState(48);
  const [photoUrls,setPhotoUrls]=useState<Record<string,string>>({});
  const reload=async()=>{const [r,m]=await Promise.all([loadRoots(),loadMedia()]);setRoots(r);setItems(m);};
  useEffect(()=>{reload().catch(e=>setError(String(e)));},[]);
  const scanRoot=async(root:SourceRoot,manageLoading=true)=>{
    if(manageLoading)setLoading(true);setError('');
    try{
      const scanned=await invoke<ScanResult[]>('scan_folder',{path:root.path});
      const existing=items;
      const converted:MediaItem[]=scanned.map(f=>({id:makeId(),rootId:root.id,path:f.path,relativePath:f.relativePath,filename:f.filename,extension:f.extension,kind:f.kind,size:f.size,modifiedAt:f.modifiedAt,createdAt:new Date().toISOString(),favorite:existing.some(e=>e.path===f.path&&e.favorite),online:true,folderName:f.folderName}));
      await replaceScannedFiles(root,converted);await reload();setNotice('已更新 '+converted.length+' 个文件');
    }catch(e){setError('扫描失败：'+String(e));}finally{if(manageLoading)setLoading(false);}
  };
  const chooseFolder=async()=>{
    const selected=await open({directory:true,multiple:true,title:'选择照片文件夹'});
    if(!selected)return;
    const paths=Array.isArray(selected)?selected:[selected];
    setLoading(true);setError('');
    try{
      for(const path of paths){
        const existing=roots.find(r=>r.path===path);
        const root=existing||{id:makeId(),path,displayName:path.split('/').filter(Boolean).pop()||path,createdAt:new Date().toISOString()};
        await addRoot(root);
        await scanRoot(root,false);
      }
      await reload();
    }catch(e){setError('添加失败：'+String(e));}finally{setLoading(false);}
  };
  const visible=useMemo(()=>{
    let list=items.filter(x=>x.online);
    if(view==='收藏')list=list.filter(x=>x.favorite);
    if(activeRoot)list=list.filter(x=>x.rootId===activeRoot);
    if(query)list=list.filter(x=>(x.filename+' '+x.relativePath+' '+x.folderName).toLowerCase().includes(query.toLowerCase()));
    return [...list].sort((a,b)=>Number(b.modifiedAt)-Number(a.modifiedAt));
  },[items,view,activeRoot,query]);
  useEffect(()=>{let active=true;const candidates=visible.slice(0,pageCount).filter(x=>x.kind==='image'&&!photoUrls[x.path]).slice(0,48);if(!candidates.length)return;Promise.all(candidates.map(async x=>[x.path,convertFileSrc(x.path)] as const)).then(pairs=>{if(active)setPhotoUrls(old=>({...old,...Object.fromEntries(pairs)}));});return()=>{active=false;};},[visible,photoUrls,pageCount]);
  useEffect(()=>{setPageCount(48);},[view,activeRoot,query]);
  const displayed=visible.slice(0,pageCount);
  const pickMedia=async(item:MediaItem)=>{try{setSelection({...item,thumbnailPath:convertFileSrc(item.path)});}catch{setSelection(item);}};
  const favorite=async(item:MediaItem)=>{const next=await toggleFavorite(item);setItems(old=>old.map(x=>x.path===item.path?{...x,favorite:next}:x));if(selection?.path===item.path)setSelection({...selection,favorite:next});};
  const scanAll=async()=>{if(loading)return;setLoading(true);try{for(const root of roots)await scanRoot(root,false);}finally{setLoading(false);}};
  const renameRoot=async()=>{if(!renameId||!renameValue.trim())return;await updateRootName(renameId,renameValue.trim());setRoots(await loadRoots());setRenameId(null);};
  const removeSource=async(root:SourceRoot)=>{if(!window.confirm('从漫游索引中移除“'+root.displayName+'”？不会删除原始文件。'))return;await removeRoot(root.id);if(activeRoot===root.id)setActiveRoot(null);await reload();};
  const heading=view==='全部'?'照片':view==='地点相册'?'文件夹':view==='时间线'?'时光':'收藏';
  return <div className="shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>{setView('全部');setActiveRoot(null)}}><span className="brand-mark"><ImageIcon size={20}/></span><span>漫游<span className="brand-dot">。</span><small>MANYOU</small></span></button>
      <div className="side-section-label">浏览</div>
      {([{label:'全部',icon:LayoutGrid},{label:'地点相册',icon:FolderOpen},{label:'时间线',icon:Clock3},{label:'收藏',icon:Heart}] as const).map(n=>{const Icon=n.icon;return <button key={n.label} className={'side-link '+(view===n.label&&!activeRoot?'active':'')} onClick={()=>{setView(n.label);setActiveRoot(null)}}><Icon size={16}/><span>{n.label}</span>{n.label==='全部'&&<em>{items.length}</em>}</button>})}
      <div className="side-section-label source-label">照片来源 <button onClick={chooseFolder} title="添加照片文件夹">＋</button></div>
      <div className="roots-list">{roots.map(root=><div key={root.id} className={'root-item '+(activeRoot===root.id?'selected':'')}><button className="root-select" onClick={()=>{setActiveRoot(root.id);setView('全部')}}><FolderOpen size={15}/><span title={root.path}>{root.displayName}</span></button><button className="root-menu" title="管理来源" onClick={()=>{setRenameId(root.id);setRenameValue(root.displayName)}}>···</button></div>)}</div>
      <button className="add-source" onClick={chooseFolder}>＋ 添加文件夹</button>
      <div className="sidebar-bottom"><span className="privacy-dot"/><span>照片只留在你的设备上</span></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumbs">{activeRoot?roots.find(r=>r.id===activeRoot)?.displayName:'我的影像'} <span>/</span> {heading}</div><div className="top-actions"><label className="searchbox"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索照片与文件夹"/></label><button className="icon-btn" disabled={loading||roots.length===0} onClick={scanAll} title="重新扫描"><RefreshCw size={16} className={loading?'spinning':''}/></button><button className="icon-btn" onClick={()=>setListMode(!listMode)} title={listMode?'摄影墙视图':'列表视图'}>{listMode?<LayoutGrid size={16}/>:<List size={16}/>}</button></div></header>
      <section className="page-head"><div><div className="eyebrow">YOUR PERSONAL IMAGE ARCHIVE</div><h1>{heading}</h1><p>{activeRoot?roots.find(r=>r.id===activeRoot)?.path:view==='全部'?'所有来源，安静地汇集在这里。':view==='地点相册'?'沿用你已有的文件夹，不替你重新分类。':view==='时间线'?'按文件修改时间浏览。':'留住你最喜欢的画面。'}</p></div><button className="primary-btn" onClick={chooseFolder} disabled={loading}><FolderOpen size={16}/>{loading?'正在扫描…':'添加文件夹'}</button></section>
      {error&&<div className="message error">{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}
      {notice&&<div className="message">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
      {view==='地点相册'&&!activeRoot?<div className="album-grid">{roots.map((root,i)=><button key={root.id} className={'album-card tint-'+(i%4)} onClick={()=>{setActiveRoot(root.id);setView('全部')}}><div className="album-cover"><FolderOpen size={25}/><span>{items.filter(x=>x.rootId===root.id&&x.online).length} 个文件</span></div><strong>{root.displayName}</strong><small>{root.path}</small></button>)}<button className="album-add" onClick={chooseFolder}><FolderOpen size={22}/><span>添加文件夹</span></button></div>:
       view==='时间线'?<div className="timeline-list">{displayed.map(item=><button key={item.path} className="timeline-row" onClick={()=>pickMedia(item)}><span>{new Date(Number(item.modifiedAt)*1000).toLocaleDateString('zh-CN')}</span><strong>{item.filename}</strong><small>{item.kind==='video'?'视频':'照片'} · {item.folderName}</small></button>)}</div>:
       view==='收藏'&&visible.length===0?<div className="empty"><Heart size={28}/><strong>还没有收藏</strong><span>喜欢的照片可以在这里留下。</span></div>:
       visible.length===0?<div className="empty"><div className="empty-illustration"><ImageIcon size={34}/><FolderOpen size={22}/></div><strong>{roots.length?'这里还没有照片':'从一个文件夹开始'}</strong><span>{roots.length?'重新扫描文件夹，或选择其他来源。':'选择桌面上的照片总文件夹，漫游会自动读取里面的子文件夹。'}</span><button className="primary-btn" onClick={chooseFolder}><FolderOpen size={16}/>选择照片文件夹</button></div>:
       <>{view==='地点相册'&&activeRoot===null&&null}{!listMode?<div className="photo-wall">{displayed.map(item=><article key={item.path} className={'photo-card '+(item.favorite?'is-favorite':'')}><button className="photo-open" onClick={()=>pickMedia(item)}><div className={'photo-placeholder '+item.kind}>{item.kind==='video'?<><Video size={27}/><span className="play-mark"><Play size={11} fill="currentColor"/></span></>:photoUrls[item.path]?<img loading="lazy" src={photoUrls[item.path]} alt=""/>:<ImageIcon size={24}/>}</div><div className="photo-caption"><strong>{item.filename}</strong><span>{item.folderName} · {item.kind==='video'?'视频': '照片'}</span></div></button><button className="favorite-btn" onClick={()=>favorite(item)} aria-label="收藏"><Heart size={16} fill={item.favorite?'currentColor':'none'}/></button></article>)}</div>:<div className="media-list"><div className="list-head"><span>文件</span><span>文件夹</span><span>类型</span><span>大小</span></div>{displayed.map(item=><div className="media-list-row" key={item.path}><button onClick={()=>pickMedia(item)}>{item.kind==='video'?<Video size={15}/>:<ImageIcon size={15}/>} {item.filename}</button><span>{item.folderName}</span><span>{item.kind==='video'?'视频':'照片'}</span><span>{fmtSize(item.size)}</span><button className="row-favorite" onClick={()=>favorite(item)}><Heart size={14} fill={item.favorite?'currentColor':'none'}/></button></div>)}</div>}</>}
      {visible.length>pageCount&&<button className="load-more" onClick={()=>setPageCount(n=>n+48)}>继续加载 · 已显示 {Math.min(pageCount,visible.length)} / {visible.length}</button>}
      <footer className="statusbar"><span>{visible.length} 个文件</span><span>{roots.length} 个来源</span><span>原件保持不动 · 本地索引</span></footer>
    </main>
    {selection&&<div className="detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelection(null)}}><aside className="detail-panel"><div className="detail-top"><span>{selection.kind==='video'?'视频':'照片'}详情</span><button className="icon-btn" onClick={()=>setSelection(null)}><X size={17}/></button></div><div className="detail-preview">{selection.kind==='video'?<video controls src={convertFileSrc(selection.path)} />:<img src={photoUrls[selection.path]||convertFileSrc(selection.path)} alt={selection.filename}/>}</div><h2>{selection.filename}</h2><p className="detail-path">{selection.path}</p><div className="metadata"><div><span>所在文件夹</span><strong>{selection.folderName}</strong></div><div><span>文件大小</span><strong>{fmtSize(selection.size)}</strong></div><div><span>文件类型</span><strong>{selection.extension.toUpperCase()}</strong></div><div><span>修改时间</span><strong>{fmtDate(selection.modifiedAt)}</strong></div></div><button className="detail-action" onClick={()=>favorite(selection)}><Heart size={16} fill={selection.favorite?'currentColor':'none'}/>{selection.favorite?'取消收藏':'收藏这张照片'}</button><button className="detail-action secondary" onClick={()=>openPath(selection.path).catch(()=>setError('无法打开原文件，请在 Finder 中手动定位。'))}><ArrowUpRight size={16}/>在 Finder / 默认应用中打开</button><button className="detail-action secondary" onClick={()=>openPath(selection.path).catch(()=>setError("无法打开原文件，请在 Finder 中手动定位。"))}><ArrowUpRight size={16}/>在系统中打开原文件</button><p className="detail-privacy">漫游只读取文件信息，不会修改原始照片。</p></aside></div>}
    {renameId&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setRenameId(null)}}><form className="rename-modal" onSubmit={async e=>{e.preventDefault();await renameRoot();}}><h2>来源名称</h2><p>只修改漫游里的显示名称，不会重命名 Finder 文件夹。</p><input value={renameValue} onChange={e=>setRenameValue(e.target.value)} autoFocus/><div className="modal-actions"><button type="button" onClick={()=>setRenameId(null)}>取消</button><button type="button" onClick={async()=>{const root=roots.find(x=>x.id===renameId);if(root)await removeSource(root);setRenameId(null);}}>移除此来源</button><button type="submit">保存</button></div></form></div>}
  </div>;
}
