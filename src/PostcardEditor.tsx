import { useEffect, useRef, useState } from 'react';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { ArrowLeft, ArrowRight, Download, RotateCcw, Save, Trash2, X } from 'lucide-react';
import type { MediaItem } from './types';
import type { Postcard, PostcardLayout } from './postcards';

type Props = {
  card: Postcard;
  media: MediaItem | undefined;
  onSave: (card:Postcard)=>Promise<void>;
  onDelete: (id:string)=>Promise<void>;
  onClose: ()=>void;
};
const layouts:{id:PostcardLayout;name:string}[]=[
  {id:'full',name:'满版'},
  {id:'gallery',name:'留白'},
  {id:'archive',name:'档案'}
];
const WIDTH=1500, HEIGHT=1000;
function fitText(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth:number,lineHeight:number,maxLines:number) {
  let line='',row=0;
  for(const char of text) {
    const next=line+char;
    if(ctx.measureText(next).width>maxWidth&&line) {
      ctx.fillText(line,x,y+row*lineHeight);row++;line=char;
      if(row>=maxLines)return;
    }else line=next;
  }
  if(line&&row<maxLines)ctx.fillText(line,x,y+row*lineHeight);
}
async function renderCanvas(card:Postcard,photoUrl:string,back:boolean):Promise<HTMLCanvasElement> {
  const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建图片画布');
  ctx.fillStyle='#f7f5f0';ctx.fillRect(0,0,WIDTH,HEIGHT);
  if(back){
    ctx.fillStyle='#242527';ctx.font='bold 28px sans-serif';ctx.fillText('MANYOU / POSTCARD',80,92);
    ctx.strokeStyle='#b7b6b0';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(760,155);ctx.lineTo(760,870);ctx.stroke();
    ctx.strokeRect(1190,82,220,190);
    ctx.font='22px sans-serif';ctx.fillStyle='#777';ctx.fillText('STAMP',1250,180);
    ctx.fillStyle='#292929';ctx.font='36px sans-serif';
    fitText(ctx,card.message,90,270,580,65,9);
    ctx.font='24px sans-serif';ctx.fillStyle='#777';
    fitText(ctx,card.location,825,700,540,42,2);
    fitText(ctx,card.dateLabel,825,790,540,42,2);
    ctx.font='20px sans-serif';ctx.fillText('A MOMENT, KEPT.',90,918);
  }else{
    const image=new Image();image.crossOrigin='anonymous';image.src=photoUrl;
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('无法读取这张照片，请确认原件仍在本地。'));});
    const margin=card.layout==='full'?0:card.layout==='gallery'?76:100;
    const bottom=card.layout==='full'?0:card.layout==='gallery'?110:175;
    const w=WIDTH-2*margin,h=HEIGHT-margin-bottom;
    const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight);
    const cropW=w/scale,cropH=h/scale;
    ctx.drawImage(image,(image.naturalWidth-cropW)/2,(image.naturalHeight-cropH)/2,cropW,cropH,margin,margin,w,h);
    if(card.layout!=='full'){
      ctx.fillStyle='#292a2c';ctx.font='bold 24px sans-serif';
      ctx.fillText(card.layout==='gallery'?'MANYOU':(card.location||'MANYOU').toUpperCase(),margin,HEIGHT-67);
      ctx.fillStyle='#818286';ctx.font='22px sans-serif';
      ctx.fillText(card.dateLabel||'A MOMENT, KEPT.',margin,HEIGHT-30);
    }
  }
  return canvas;
}
export default function PostcardEditor({card,media,onSave,onDelete,onClose}:Props){
  const [draft,setDraft]=useState(card);
  const [back,setBack]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [saved,setSaved]=useState(false);
  const photoUrl=media?.online?convertFileSrc(media.path):'';
  const dirty=JSON.stringify({layout:draft.layout,message:draft.message,location:draft.location,dateLabel:draft.dateLabel})!==JSON.stringify({layout:card.layout,message:card.message,location:card.location,dateLabel:card.dateLabel});
  const liveRef=useRef(draft);
  useEffect(()=>{liveRef.current=draft;},[draft]);
  const update=(patch:Partial<Postcard>)=>{setDraft(v=>({...v,...patch}));setSaved(false);};
  const persist=async()=>{setBusy(true);setError('');try{await onSave({...draft,updatedAt:new Date().toISOString()});setSaved(true);}catch(e){setError(String(e));}finally{setBusy(false);}};
  const exportSide=async()=>{
    if(!photoUrl){setError('照片原件不可用，无法导出。');return;}
    setBusy(true);setError('');
    try{
      const target=await save({title:'导出明信片 PNG',defaultPath:'manyou-postcard-'+(back?'back':'front')+'.png',filters:[{name:'PNG',extensions:['png']}]});
      if(!target)return;
      const canvas=await renderCanvas(draft,photoUrl,back);
      const dataUrl=canvas.toDataURL('image/png');
      await invoke('save_postcard_png',{path:target,dataUrl});
    }catch(e){setError('导出失败：'+String(e));}finally{setBusy(false);}
  };
  return <div className="postcard-overlay" role="dialog" aria-modal="true" aria-label="编辑明信片">
    <div className="postcard-workspace">
      <header className="postcard-toolbar"><button onClick={onClose}><X size={18}/> 返回</button><strong>POSTCARD STUDIO <span>明信片工作室</span></strong><div className="postcard-toolbar-actions"><button disabled={busy} onClick={exportSide}><Download size={16}/> 导出{back?'背面':'正面'}</button><button disabled={busy||!dirty} onClick={persist}><Save size={16}/>{saved?'已保存':'保存'}</button></div></header>
      <div className="postcard-main">
        <section className="postcard-stage">
          <div className="postcard-stage-top"><span>{back?'02 / BACK':'01 / FRONT'}</span><button onClick={()=>setBack(x=>!x)}><RotateCcw size={15}/> 翻转明信片</button></div>
          <button className={'postcard-paper '+(back?'is-back':'')+' layout-'+draft.layout} onClick={()=>setBack(x=>!x)} title="点击翻面">
            {back?<div className="postcard-back"><div className="postcard-back-head">MANYOU / POSTCARD</div><div className="postcard-back-grid"><div className="postcard-handwriting">{draft.message||'写给某个地方，某一天。'}</div><div className="postcard-address"><div className="postcard-stamp">STAMP</div><span>{draft.location||'PLACE'}</span><span>{draft.dateLabel||'DATE'}</span></div></div><small>A MOMENT, KEPT.</small></div>:
              <><div className="postcard-image">{photoUrl?<img src={photoUrl} alt="明信片照片"/>:<div className="postcard-missing">原始照片暂时不可用</div>}</div>{draft.layout!=='full'&&<div className="postcard-front-caption"><strong>{draft.layout==='archive'?draft.location||'MANYOU':'MANYOU'}</strong><span>{draft.dateLabel||'A MOMENT, KEPT.'}</span></div>}</>}
          </button>
          <div className="postcard-stage-bottom"><button onClick={()=>setBack(false)} className={!back?'current':''}><ArrowLeft size={14}/> 正面</button><button onClick={()=>setBack(true)} className={back?'current':''}>背面 <ArrowRight size={14}/></button></div>
        </section>
        <aside className="postcard-settings">
          <div className="postcard-setting-title">MAKE IT YOURS <span>01 / 03</span></div>
          <h2>留住这一刻。</h2>
          <p>一张照片，两面故事。</p>
          <label>正面版式</label>
          <div className="postcard-layout-options">{layouts.map(l=><button key={l.id} className={draft.layout===l.id?'selected':''} onClick={()=>{update({layout:l.id});setBack(false)}}><div className={'layout-swatch swatch-'+l.id}><div/></div><span>{l.name}</span></button>)}</div>
          <label htmlFor="postcard-location">地点（可选）</label><input id="postcard-location" value={draft.location} onChange={e=>update({location:e.target.value})} placeholder="某个地方"/>
          <label htmlFor="postcard-date">日期（可选）</label><input id="postcard-date" value={draft.dateLabel} onChange={e=>update({dateLabel:e.target.value})} placeholder="某一天"/>
          <label htmlFor="postcard-message">背面文字</label><textarea id="postcard-message" rows={7} value={draft.message} onChange={e=>update({message:e.target.value})} placeholder="写给过去、未来，或者某个人……"/>
          <div className="postcard-settings-footer"><button onClick={async()=>{if(window.confirm('删除这张明信片？原始照片不会被删除。'))await onDelete(draft.id);}}><Trash2 size={14}/> 删除明信片</button><span>原图不会被修改</span></div>
          {error&&<div className="postcard-error">{error}</div>}
        </aside>
      </div>
    </div>
  </div>;
}
