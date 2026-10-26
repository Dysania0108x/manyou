import { useState } from 'react';
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
  {id:'full',name:'PHOTO'},
  {id:'gallery',name:'GALLERY'},
  {id:'archive',name:'ATLAS'}
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
    ctx.fillStyle='#242527';ctx.font='500 28px sans-serif';ctx.fillText('POSTCARD',105,108);
    ctx.strokeStyle='#d3d4d5';ctx.beginPath();ctx.moveTo(105,145);ctx.lineTo(1395,145);ctx.stroke();
    ctx.fillStyle='#292929';ctx.font='36px sans-serif';
    fitText(ctx,card.message,120,260,1230,65,9);
    ctx.font='24px sans-serif';ctx.fillStyle='#777';
    if(card.location)fitText(ctx,card.location,120,825,1100,42,2);
    if(card.dateLabel)fitText(ctx,card.dateLabel,120,890,1100,42,2);
  }else{
    const image=new Image();image.crossOrigin='anonymous';image.src=photoUrl;
    await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('无法读取这张照片，请确认原件仍在本地。'));});
    const margin=card.layout==='full'?0:card.layout==='gallery'?95:80;
    const bottom=card.layout==='full'?0:card.layout==='gallery'?155:240;
    const w=WIDTH-2*margin,h=HEIGHT-margin-bottom;
    const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight);
    const cropW=w/scale,cropH=h/scale;
    ctx.drawImage(image,(image.naturalWidth-cropW)/2,(image.naturalHeight-cropH)/2,cropW,cropH,margin,margin,w,h);
    if(card.layout!=='full'){
      ctx.fillStyle='#292a2c';ctx.font=card.layout==='archive'?'600 64px sans-serif':'500 25px sans-serif';
      if(card.location)ctx.fillText(card.location,margin,HEIGHT-(card.layout==='archive'?112:85));
      ctx.fillStyle='#818286';ctx.font='22px sans-serif';
      if(card.dateLabel)ctx.fillText(card.dateLabel,margin,HEIGHT-42);
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
  const [hasSaved,setHasSaved]=useState(false);
  const photoUrl=media?.online?convertFileSrc(media.path):'';
  const dirty=JSON.stringify({layout:draft.layout,message:draft.message,location:draft.location,dateLabel:draft.dateLabel})!==JSON.stringify({layout:card.layout,message:card.message,location:card.location,dateLabel:card.dateLabel});
  const update=(patch:Partial<Postcard>)=>{setDraft(v=>({...v,...patch}));setSaved(false);};
  const persist=async()=>{setBusy(true);setError('');try{await onSave({...draft,updatedAt:new Date().toISOString()});setSaved(true);setHasSaved(true);}catch(e){setError(String(e));}finally{setBusy(false);}};
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
      <header className="postcard-toolbar"><button onClick={onClose}><X size={18}/> 返回</button><strong>POSTCARD STUDIO</strong><div className="postcard-toolbar-actions"><button disabled={busy} onClick={exportSide}><Download size={16}/> 导出{back?'背面':'正面'}</button><button disabled={busy||(hasSaved&&!dirty)} onClick={persist}><Save size={16}/>{saved?'已保存':'保存'}</button></div></header>
      <div className="postcard-main">
        <section className="postcard-stage">
          <div className="postcard-stage-top"><span>{back?'02 / BACK':'01 / FRONT'}</span><button onClick={()=>setBack(x=>!x)}><RotateCcw size={15}/> 翻转明信片</button></div>
          <div className={'postcard-paper '+(back?'is-back':'')+' layout-'+draft.layout} onClick={()=>{if(!back)setBack(true)}} title={back?'在卡片上直接写字':'点击翻面'}>
            {back?<div className="postcard-back"><div className="postcard-back-title">POSTCARD</div><div className="postcard-back-grid"><div className="postcard-handwriting" onClick={e=>e.stopPropagation()}><textarea aria-label="明信片背面文字" value={draft.message} onChange={e=>update({message:e.target.value})} placeholder="写一点什么……" /></div><div className="postcard-address">{draft.location&&<span>{draft.location}</span>}{draft.dateLabel&&<span>{draft.dateLabel}</span>}</div></div></div>:
              <><div className="postcard-image">{photoUrl?<img src={photoUrl} alt="明信片照片"/>:<div className="postcard-missing">原始照片暂时不可用</div>}</div>{draft.layout!=='full'&&(draft.location||draft.dateLabel)&&<div className="postcard-front-caption">{draft.location&&<strong>{draft.location}</strong>}{draft.dateLabel&&<span>{draft.dateLabel}</span>}</div>}</>}
          </div>
          <div className="postcard-stage-bottom"><button onClick={()=>setBack(false)} className={!back?'current':''}><ArrowLeft size={14}/> 正面</button><button onClick={()=>setBack(true)} className={back?'current':''}>背面 <ArrowRight size={14}/></button></div>
        </section>
        <aside className="postcard-settings">
          <h2>Design your card</h2>
          <label>LAYOUT</label>
          <div className="postcard-layout-options">{layouts.map(l=><button key={l.id} className={draft.layout===l.id?'selected':''} onClick={()=>{update({layout:l.id});setBack(false)}}><div className={'layout-swatch swatch-'+l.id}><div/></div><span>{l.name}</span></button>)}</div>
          <label htmlFor="postcard-location">LOCATION · OPTIONAL</label><input id="postcard-location" value={draft.location} onChange={e=>update({location:e.target.value})} placeholder="某个地方"/>
          <label htmlFor="postcard-date">DATE · OPTIONAL</label><input id="postcard-date" value={draft.dateLabel} onChange={e=>update({dateLabel:e.target.value})} placeholder="某一天"/>
          <label htmlFor="postcard-message">YOUR MESSAGE</label><textarea id="postcard-message" rows={7} value={draft.message} onChange={e=>update({message:e.target.value})} placeholder="写给过去、未来，或者某个人……"/>
          <div className="postcard-settings-footer"><button onClick={async()=>{if(window.confirm('删除这张明信片？原始照片不会被删除。'))await onDelete(draft.id);}}><Trash2 size={14}/> 删除明信片</button><span>原图不会被修改</span></div>
          {error&&<div className="postcard-error">{error}</div>}
        </aside>
      </div>
    </div>
  </div>;
}
