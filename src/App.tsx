import { useEffect, useMemo, useRef, useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { ArrowLeft, ArrowRight, ArrowUpRight, FolderOpen, Heart, Image as ImageIcon, LayoutGrid, List, Play, RefreshCw, Search, Shuffle, Video, X } from 'lucide-react';
import type { MediaItem, SourceRoot } from './types';
import PostcardEditor from './PostcardEditor';
import type { Postcard } from './postcards';
import { loadPostcards, savePostcard, deletePostcard } from './postcards';
import { addRoot, loadMedia, loadRoots, removeRoot, replaceScannedFiles, toggleFavorite, updateRootName } from './storage';

type ScanResult={path:string;relativePath:string;filename:string;extension:string;kind:'image'|'video';size:number;modifiedAt:string;folderName:string};
type View='全部'|'地点相册'|'时间线'|'收藏'|'明信片';
const makeId=()=>crypto.randomUUID();
const fmtDate=(s:string)=>{const n=Number(s);if(!n)return '日期未知';return new Date(n*1000).toLocaleDateString('zh-CN',{year:'numeric',month:'short',day:'numeric'});};
const fmtSize=(n:number)=>n<1024*1024?Math.max(1,Math.round(n/1024))+' KB':(n/1024/1024).toFixed(1)+' MB';

export default function App(){
  const [roots,setRoots]=useState<SourceRoot[]>([]);
  const [items,setItems]=useState<MediaItem[]>([]);
  const [view,setView]=useState<View>('全部');
  const [activeRoot,setActiveRoot]=useState<string|null>(null);
  const [activeFolder,setActiveFolder]=useState<string|null>(null);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selection,setSelection]=useState<MediaItem|null>(null);
  const [renameId,setRenameId]=useState<string|null>(null);
  const [renameValue,setRenameValue]=useState('');
  const [listMode,setListMode]=useState(false);
  const [showSources,setShowSources]=useState(false);
  const [pageCount,setPageCount]=useState(48);
  const loadSentinel=useRef<HTMLDivElement|null>(null);
  const [photoUrls,setPhotoUrls]=useState<Record<string,string>>({});
  const [postcards,setPostcards]=useState<Postcard[]>([]);
  const [editingPostcard,setEditingPostcard]=useState<Postcard|null>(null);
  const reload=async()=>{const [r,m]=await Promise.all([loadRoots(),loadMedia()]);setRoots(r);setItems(m);};
  useEffect(()=>{reload().catch(e=>setError(String(e)));loadPostcards().then(setPostcards).catch(e=>setError(String(e)));},[]);
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
    if(activeFolder)list=list.filter(x=>x.rootId+'::'+(x.relativePath.includes('/')?x.relativePath.split('/').slice(0,-1).join('/'):'.')===activeFolder);
    if(query)list=list.filter(x=>(x.filename+' '+x.relativePath+' '+x.folderName).toLowerCase().includes(query.toLowerCase()));
    return [...list].sort((a,b)=>Number(b.modifiedAt)-Number(a.modifiedAt));
  },[items,view,activeRoot,activeFolder,query]);
  useEffect(()=>{let active=true;const candidates=visible.slice(0,pageCount).filter(x=>x.kind==='image'&&!photoUrls[x.path]).slice(0,48);if(!candidates.length)return;Promise.all(candidates.map(async x=>[x.path,convertFileSrc(x.path)] as const)).then(pairs=>{if(active)setPhotoUrls(old=>({...old,...Object.fromEntries(pairs)}));});return()=>{active=false;};},[visible,photoUrls,pageCount]);
  useEffect(()=>{setPageCount(48);},[view,activeRoot,query]);
  const displayed=visible.slice(0,pageCount);
  const hasMore=view!=='地点相册'&&visible.length>pageCount;
  useEffect(()=>{if(!hasMore||!loadSentinel.current)return;const observer=new IntersectionObserver(entries=>{if(entries[0]?.isIntersecting)setPageCount(n=>Math.min(n+48,visible.length));},{rootMargin:'700px 0px'});observer.observe(loadSentinel.current);return()=>observer.disconnect();},[hasMore,visible.length,view,pageCount]);
  const folders=useMemo(()=>{const groups=new Map<string,{rootId:string;rel:string;name:string;items:MediaItem[]}>();for(const item of items.filter(x=>x.online)){const rel=item.relativePath.includes('/')?item.relativePath.split('/').slice(0,-1).join('/'):'.';const key=item.rootId+'::'+rel;const group=groups.get(key)||{rootId:item.rootId,rel,name:rel==='.'?(roots.find(r=>r.id===item.rootId)?.displayName||'根目录'):rel.split('/').pop()||rel,items:[]};group.items.push(item);groups.set(key,group);}return [...groups.entries()].map(([key,value])=>({key,...value})).sort((a,b)=>a.rel.localeCompare(b.rel,'zh-CN'));},[items,roots]);
  const timelineGroups=useMemo(()=>{const groups=new Map<string,MediaItem[]>();for(const item of displayed){const date=Number(item.modifiedAt)?new Date(Number(item.modifiedAt)*1000):null;const key=date&&!Number.isNaN(date.getTime())?date.toLocaleDateString('zh-CN',{year:'numeric',month:'long'}):'日期未知';groups.set(key,[...(groups.get(key)||[]),item]);}return [...groups.entries()];},[displayed]);
  const pickMedia=async(item:MediaItem)=>{try{setSelection({...item,thumbnailPath:convertFileSrc(item.path)});}catch{setSelection(item);}};
  const favorite=async(item:MediaItem)=>{const next=await toggleFavorite(item);setItems(old=>old.map(x=>x.path===item.path?{...x,favorite:next}:x));if(selection?.path===item.path)setSelection({...selection,favorite:next});};
  const scanAll=async()=>{if(loading)return;setLoading(true);try{for(const root of roots)await scanRoot(root,false);}finally{setLoading(false);}};
  const renameRoot=async()=>{if(!renameId||!renameValue.trim())return;await updateRootName(renameId,renameValue.trim());setRoots(await loadRoots());setRenameId(null);};
  const removeSource=async(root:SourceRoot)=>{if(!window.confirm('从漫游索引中移除“'+root.displayName+'”？不会删除原始文件。'))return;await removeRoot(root.id);if(activeRoot===root.id){setActiveRoot(null);setActiveFolder(null);}await reload();};
  useEffect(()=>{if(!selection)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){setSelection(null);return;}if(event.key==='ArrowLeft'||event.key==='ArrowRight'){const index=visible.findIndex(x=>x.path===selection.path);if(index<0)return;const next=visible[index+(event.key==='ArrowRight'?1:-1)];if(next)setSelection(next);}};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);},[selection,visible]);
  const createPostcard=(item:MediaItem)=>{if(item.kind!=='image'){setError('请先选择一张照片制作明信片。');return;}const now=new Date().toISOString();setEditingPostcard({id:makeId(),photoPath:item.path,layout:'archive',message:'',location:'',dateLabel:Number(item.modifiedAt)?new Date(Number(item.modifiedAt)*1000).toLocaleDateString('en-GB',{month:'long',year:'numeric'}):'',createdAt:now,updatedAt:now});setSelection(null);};
  const persistPostcard=async(card:Postcard)=>{await savePostcard(card);setPostcards(await loadPostcards());setEditingPostcard(card);};
  const removePostcard=async(id:string)=>{await deletePostcard(id);setPostcards(await loadPostcards());setEditingPostcard(null);};
  const surprise=()=>{if(!items.length)return;const available=items.filter(x=>x.online);if(available.length)setSelection(available[Math.floor(Math.random()*available.length)]);};
  const heading=activeFolder?(folders.find(f=>f.key===activeFolder)?.name||'相册'):view==='全部'?'照片':view==='地点相册'?'足迹':view==='时间线'?'时光':view==='明信片'?'明信片':'收藏';
  return <div className="shell">
    <header className="editorial-header">
      <button className="editorial-brand" onClick={()=>{setView('全部');setActiveRoot(null);setActiveFolder(null)}}>MANYOU<span>漫游</span></button>
      <nav className="editorial-nav" aria-label="主要导航">
        {([{label:'全部',name:'照片'},{label:'地点相册',name:'足迹'},{label:'时间线',name:'时光'},{label:'明信片',name:'明信片'},{label:'收藏',name:'收藏'}] as const).map(n=><button key={n.label} className={view===n.label?'selected':''} onClick={()=>{setView(n.label);setActiveRoot(null);setActiveFolder(null)}}>{n.name}</button>)}
      </nav>
      <div className="editorial-tools"><button onClick={surprise} title="随机漫游" aria-label="随机漫游"><Shuffle size={17}/></button><button onClick={()=>setShowSources(x=>!x)} title="管理照片来源" aria-label="管理照片来源"><FolderOpen size={17}/></button><button onClick={chooseFolder} className="header-add">＋ 导入文件夹</button></div>
    </header>
    {showSources&&<div className="source-drawer"><div className="source-drawer-title">照片来源 <button onClick={()=>setShowSources(false)} aria-label="关闭"><X size={16}/></button></div>{roots.map(root=><div className="source-drawer-row" key={root.id}><button onClick={()=>{setActiveRoot(root.id);setActiveFolder(null);setView('全部');setShowSources(false)}}><FolderOpen size={15}/>{root.displayName}</button><button onClick={()=>{setRenameId(root.id);setRenameValue(root.displayName);setShowSources(false)}}>管理</button></div>)}<button className="source-drawer-add" onClick={chooseFolder}>＋ 添加来源</button></div>}
    <main className="main">
      <header className="topbar"><div className="breadcrumbs">{activeRoot?roots.find(r=>r.id===activeRoot)?.displayName:'我的影像'} <span>/</span> {heading}</div><div className="top-actions"><label className="searchbox"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索照片与文件夹"/></label><button className="icon-btn" disabled={loading||roots.length===0} onClick={scanAll} title="重新扫描"><RefreshCw size={16} className={loading?'spinning':''}/></button><button className="icon-btn" onClick={()=>setListMode(!listMode)} title={listMode?'摄影墙视图':'列表视图'}>{listMode?<LayoutGrid size={16}/>:<List size={16}/>}</button></div></header>
      <section className="page-head"><div><div className="eyebrow">{view==='全部'?'THE PHOTO ARCHIVE':view==='地点相册'?'PLACES & FOLDERS':view==='时间线'?'THROUGH THE YEARS':view==='明信片'?'POSTCARD COLLECTION':'SELECTED MOMENTS'}</div><h1>{heading}</h1><p>{activeFolder?folders.find(f=>f.key===activeFolder)?.rel:activeRoot?roots.find(r=>r.id===activeRoot)?.displayName:view==='全部'?`${visible.length.toLocaleString()} PHOTOS & VIDEOS`:view==='地点相册'?`${folders.length} COLLECTIONS`:view==='时间线'?'按文件日期浏览 · 拍摄时间解析待完善':view==='明信片'?`${postcards.length} POSTCARDS`:`${visible.length} FAVORITES`}</p></div></section>
      {error&&<div className="message error">{error}<button onClick={()=>setError('')}><X size={14}/></button></div>}
      {notice&&<div className="message">{notice}<button onClick={()=>setNotice('')}><X size={14}/></button></div>}
      {view==='明信片'?<div className="postcard-collection">{postcards.map(card=>{const media=items.find(x=>x.path===card.photoPath);return <button className="postcard-collection-item" key={card.id} onClick={()=>setEditingPostcard(card)}><div className={'postcard-collection-cover layout-'+card.layout}>{media?.online?<img loading="lazy" src={convertFileSrc(media.path)} alt="明信片"/>:<div className="postcard-unavailable">原件暂不可用</div>}</div><div className="postcard-collection-meta"><strong>{card.location||'一张明信片'}</strong><span>{card.dateLabel||new Date(card.createdAt).toLocaleDateString('zh-CN')}</span></div></button>})}{postcards.length===0&&<div className="postcard-collection-empty"><span>POSTCARDS</span><h2>从一张照片开始。</h2><p>在照片详情中选择「制作明信片」。</p><button onClick={()=>setView('全部')}>去看看照片 <ArrowRight size={15}/></button></div>}</div>:
       view==='地点相册'&&!activeFolder?<div className="album-grid">{folders.map((folder,i)=><button key={folder.key} className={'album-card tint-'+(i%4)} onClick={()=>{setActiveRoot(folder.rootId);setActiveFolder(folder.key)}}><div className="album-cover">{folder.items.find(x=>x.kind==='image'&&photoUrls[x.path])?<img loading="lazy" src={photoUrls[folder.items.find(x=>x.kind==='image'&&photoUrls[x.path])!.path]} alt=""/>:<FolderOpen size={25}/>}<span>{folder.items.length} 张</span></div><strong>{folder.name}</strong><small>{folder.rel==='.'?'根目录':folder.rel}</small></button>)}<button className="album-add" onClick={chooseFolder}><FolderOpen size={22}/><span>添加文件夹</span></button></div>:
       view==='时间线'?<div className="timeline-gallery">{timelineGroups.map(([month,group])=><section className="timeline-month" key={month}><div className="timeline-month-title"><h2>{month}</h2><span>{group.length} 张{visible.length>pageCount?' · 当前已加载部分':''}</span></div><div className="timeline-photos">{group.map(item=><button key={item.path} onClick={()=>pickMedia(item)} className="timeline-photo">{item.kind==='image'&&photoUrls[item.path]?<img loading="lazy" src={photoUrls[item.path]} alt={item.filename}/>:item.kind==='video'?<Video size={25}/>:<ImageIcon size={25}/>}<span>{item.filename}</span></button>)}</div></section>)}</div>:
       view==='收藏'&&visible.length===0?<div className="empty"><Heart size={28}/><strong>还没有收藏</strong><span>喜欢的照片可以在这里留下。</span></div>:
       visible.length===0?<div className="empty"><div className="empty-illustration"><ImageIcon size={34}/><FolderOpen size={22}/></div><strong>{roots.length?'这里还没有照片':'从一个文件夹开始'}</strong><span>{roots.length?'重新扫描文件夹，或选择其他来源。':'选择桌面上的照片总文件夹，漫游会自动读取里面的子文件夹。'}</span><button className="primary-btn" onClick={chooseFolder}><FolderOpen size={16}/>选择照片文件夹</button></div>:
       <>{!listMode?<div className="photo-wall">{displayed.map(item=><article key={item.path} className={'photo-card '+(item.favorite?'is-favorite':'')}><button className="photo-open" onClick={()=>pickMedia(item)}><div className={'photo-placeholder '+item.kind}>{item.kind==='video'?<><Video size={27}/><span className="play-mark"><Play size={11} fill="currentColor"/></span></>:photoUrls[item.path]?<img loading="lazy" src={photoUrls[item.path]} alt=""/>:<ImageIcon size={24}/>}</div><div className="photo-caption"><strong>{item.filename}</strong><span>{item.folderName} · {item.kind==='video'?'视频': '照片'}</span></div></button><button className="favorite-btn" onClick={()=>favorite(item)} aria-label="收藏"><Heart size={16} fill={item.favorite?'currentColor':'none'}/></button></article>)}</div>:<div className="media-list"><div className="list-head"><span>文件</span><span>文件夹</span><span>类型</span><span>大小</span></div>{displayed.map(item=><div className="media-list-row" key={item.path}><button onClick={()=>pickMedia(item)}>{item.kind==='video'?<Video size={15}/>:<ImageIcon size={15}/>} {item.filename}</button><span>{item.folderName}</span><span>{item.kind==='video'?'视频':'照片'}</span><span>{fmtSize(item.size)}</span><button className="row-favorite" onClick={()=>favorite(item)}><Heart size={14} fill={item.favorite?'currentColor':'none'}/></button></div>)}</div>}</>}
      {hasMore&&<div ref={loadSentinel} className="auto-load-sentinel" aria-label="滚动时自动加载更多照片"><span>正在按需加载 · {Math.min(pageCount,visible.length)} / {visible.length}</span></div>}
      <footer className="statusbar"><span>MANYOU / PRIVATE ARCHIVE</span><span>{visible.length} FILES</span><span>LOCAL ONLY</span></footer>
    </main>
    {selection&&<div className="detail-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelection(null)}}><aside className="detail-panel"><div className="detail-top"><span>{selection.kind==='video'?'VIDEO':'PHOTOGRAPH'} · {Math.max(1,visible.findIndex(x=>x.path===selection.path)+1)} / {visible.length}</span><div className="detail-navigation"><button className="icon-btn" disabled={visible.findIndex(x=>x.path===selection.path)<=0} onClick={()=>setSelection(visible[visible.findIndex(x=>x.path===selection.path)-1])}><ArrowLeft size={17}/></button><button className="icon-btn" disabled={visible.findIndex(x=>x.path===selection.path)>=visible.length-1} onClick={()=>setSelection(visible[visible.findIndex(x=>x.path===selection.path)+1])}><ArrowRight size={17}/></button><button className="icon-btn" onClick={()=>setSelection(null)}><X size={17}/></button></div></div><div className="detail-preview">{selection.kind==='video'?<video controls src={convertFileSrc(selection.path)} />:<img src={photoUrls[selection.path]||convertFileSrc(selection.path)} alt={selection.filename}/>}</div><h2>{selection.filename}</h2><p className="detail-path">{selection.path}</p><div className="metadata"><div><span>所在文件夹</span><strong>{selection.folderName}</strong></div><div><span>文件大小</span><strong>{fmtSize(selection.size)}</strong></div><div><span>文件类型</span><strong>{selection.extension.toUpperCase()}</strong></div><div><span>修改时间</span><strong>{fmtDate(selection.modifiedAt)}</strong></div></div>{selection.kind==='image'&&<button className="detail-action postcard-create" onClick={()=>createPostcard(selection)}>＋ 制作明信片</button>}<button className="detail-action" onClick={()=>favorite(selection)}><Heart size={16} fill={selection.favorite?'currentColor':'none'}/>{selection.favorite?'取消收藏':'收藏这张照片'}</button><button className="detail-action secondary" onClick={()=>openPath(selection.path).catch(()=>setError("无法打开原文件，请在 Finder 中手动定位。"))}><ArrowUpRight size={16}/>在系统中打开原文件</button><p className="detail-privacy">漫游只读取文件信息，不会修改原始照片。</p></aside></div>}
    {editingPostcard&&<PostcardEditor key={editingPostcard.id} card={editingPostcard} media={items.find(x=>x.path===editingPostcard.photoPath)} onSave={persistPostcard} onDelete={removePostcard} onClose={()=>setEditingPostcard(null)}/>}
    {renameId&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setRenameId(null)}}><form className="rename-modal" onSubmit={async e=>{e.preventDefault();await renameRoot();}}><h2>来源名称</h2><p>只修改漫游里的显示名称，不会重命名 Finder 文件夹。</p><input value={renameValue} onChange={e=>setRenameValue(e.target.value)} autoFocus/><div className="modal-actions"><button type="button" onClick={()=>setRenameId(null)}>取消</button><button type="button" onClick={async()=>{const root=roots.find(x=>x.id===renameId);if(root)await removeSource(root);setRenameId(null);}}>移除此来源</button><button type="submit">保存</button></div></form></div>}
  </div>;
}
