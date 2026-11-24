/* ══════════ ÁLBUM DE PREGUNTAS · Portal del ser ══════════
   EN DESARROLLO (no publicado). Requiere 4_BASE_DE_DATOS/45_album_preguntas.sql.
   Usa _sb y curSer del portal del ser. Se dibuja en <div id="albumBox"></div>.
   Reglas: 1 giro por día + giros extra (sesiones, clase, a mano desde el admin), el tema no se elige,
   pueden salir repetidas, 120 figuritas (20 × 6 temas), premio al completar un tema y el álbum. */
(function(){
  const AREAS=['Ser Infinito','Propósito','Vínculos','Cuerpo','Emprender','Viajes'];
  const COL={'Ser Infinito':'#9B82D4',Propósito:'#C9503C',Vínculos:'#C46A8E',Cuerpo:'#3DAA6A',Emprender:'#D4863A',Viajes:'#5B9BD5'};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let est=null,girando=false,rot=0;

  const css=document.createElement('style');
  css.textContent=`
#albumBox{margin-bottom:14px}
.alb-card{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:18px;border:1px solid rgba(201,168,76,.35);
  background:linear-gradient(135deg,rgba(201,168,76,.16),rgba(155,130,212,.10));backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);cursor:pointer}
.alb-card .ai{font-size:30px;line-height:1}
.alb-card .at{flex:1;min-width:0}
.alb-card .at b{display:block;color:var(--gl);font-size:15px}
.alb-card .at span{font-size:12px;color:var(--muted)}
.alb-bar{height:5px;border-radius:5px;background:rgba(255,255,255,.08);margin-top:7px;overflow:hidden}
.alb-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--gl));border-radius:5px}
.alb-cta{padding:10px 14px;border-radius:12px;border:0;background:linear-gradient(135deg,var(--gold),var(--gl));color:#1a1206;font-weight:800;font-size:13px;white-space:nowrap;cursor:pointer}
.alb-cta.off{background:rgba(255,255,255,.08);color:var(--muted)}
.alb-ov{position:fixed;inset:0;z-index:900;background:rgba(6,6,10,.94);backdrop-filter:blur(8px);overflow-y:auto;display:none}
.alb-ov.open{display:block}
.alb-in{max-width:720px;margin:0 auto;padding:22px 16px 60px}
.alb-top{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}
.alb-top h2{font-size:22px;color:var(--gl);font-weight:700}
.alb-x{background:none;border:1px solid var(--border);color:var(--text);border-radius:10px;padding:6px 12px;cursor:pointer}
.alb-sub{font-size:13px;color:var(--muted);margin-bottom:18px}
.alb-spin{border:1px solid var(--border);border-radius:20px;padding:20px;background:var(--card);text-align:center;margin-bottom:22px}
.alb-wheel{width:210px;height:210px;margin:0 auto 14px;position:relative}
.alb-wheel svg{width:100%;height:100%;transition:transform 3.2s cubic-bezier(.17,.67,.2,1)}
.alb-wheel:after{content:"";position:absolute;top:-6px;left:50%;transform:translateX(-50%);border:10px solid transparent;border-top:16px solid var(--gl)}
.alb-btns{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.alb-fig{max-width:360px;margin:6px auto 0;border-radius:18px;padding:22px 20px;color:#1a1206;text-align:left;box-shadow:0 20px 50px rgba(0,0,0,.4);animation:albIn .5s ease}
@keyframes albIn{from{transform:scale(.7) rotate(-6deg);opacity:0}to{transform:none;opacity:1}}
.alb-fig small{font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;opacity:.75}
.alb-fig p{font-size:19px;line-height:1.4;font-weight:600;margin:10px 0 12px;font-family:Georgia,serif}
.alb-tag{display:inline-block;font-size:11px;font-weight:800;padding:3px 10px;border-radius:20px;background:rgba(0,0,0,.18)}
.alb-premio{margin-top:14px;padding:14px;border-radius:14px;background:rgba(201,168,76,.15);border:1px solid var(--gold);color:var(--gl);font-weight:700}
.alb-area{margin-bottom:22px}
.alb-ah{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.alb-ah b{font-size:15px}
.alb-ah span{font-size:12px;color:var(--muted);margin-left:auto}
.alb-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:5px}
.alb-s{aspect-ratio:3/4;max-height:64px;border-radius:8px;border:1px dashed rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;font-size:13px;color:rgba(255,255,255,.25);position:relative}
.alb-s.ok{border:0;color:#1a1206;font-weight:800;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.3)}
.alb-s.ok:after{content:attr(data-x);position:absolute;top:3px;right:5px;font-size:9px;font-weight:800;opacity:.7}
.alb-modal{position:fixed;inset:0;z-index:950;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;padding:20px}
.alb-modal.open{display:flex}
@media(max-width:520px){.alb-grid{grid-template-columns:repeat(5,1fr)}}`;
  document.head.appendChild(css);

  const ov=document.createElement('div');ov.className='alb-ov';ov.innerHTML='<div class="alb-in" id="albIn"></div>';
  const md=document.createElement('div');md.className='alb-modal';md.onclick=e=>{if(e.target===md)md.classList.remove('open');};
  document.body.append(ov,md);

  const tot=()=>Object.values(est?.totales||{}).reduce((a,b)=>a+b,0)||120;
  const tengo=()=>(est?.figuritas||[]).length;

  async function cargar(){
    if(typeof curSer==='undefined'||!curSer||!curSer.email||typeof _sb==='undefined')return;
    const {data,error}=await _sb.rpc('album_estado',{p_email:curSer.email,p_lang:'es'});
    if(error||!data||data.error){document.getElementById('albumBox').innerHTML='';return;}
    est=data;pintarCard();if(ov.classList.contains('open'))pintarAlbum();
  }
  function girosTxt(){
    const d=est.diario_disponible,x=est.extras||0;
    if(d)return x?`🎡 Girar hoy · +${x} extra`:'🎡 Girar hoy';
    return x?`🎡 ${x} giro${x>1?'s':''} extra`:'Volvé mañana ✦';
  }
  function pintarCard(){
    const box=document.getElementById('albumBox');if(!box)return;
    const pc=Math.round(tengo()/tot()*100);
    const puede=est.diario_disponible||est.extras>0;
    box.innerHTML=`<div class="alb-card" onclick="albumAbrir()"><span class="ai">📖</span>
      <div class="at"><b>Mi álbum de preguntas</b><span>${tengo()} de ${tot()} figuritas</span><div class="alb-bar"><i style="width:${pc}%"></i></div></div>
      <button class="alb-cta ${puede?'':'off'}" onclick="event.stopPropagation();albumAbrir(${puede?'true':'false'})">${girosTxt()}</button></div>`;
  }

  function ruedaSVG(){
    const n=AREAS.length,r=100,c=105;let s='';
    AREAS.forEach((a,i)=>{
      const a0=(i/n)*2*Math.PI-Math.PI/2,a1=((i+1)/n)*2*Math.PI-Math.PI/2;
      const x0=c+r*Math.cos(a0),y0=c+r*Math.sin(a0),x1=c+r*Math.cos(a1),y1=c+r*Math.sin(a1);
      const am=(a0+a1)/2,tx=c+62*Math.cos(am),ty=c+62*Math.sin(am);
      s+=`<path d="M${c},${c} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z" fill="${COL[a]}" stroke="#06060A" stroke-width="2"/>
          <text x="${tx}" y="${ty}" fill="#1a1206" font-size="10.5" font-weight="800" text-anchor="middle" dominant-baseline="middle" transform="rotate(${am*180/Math.PI+90} ${tx} ${ty})">${a}</text>`;
    });
    return `<svg viewBox="0 0 210 210" id="albSvg" style="transform:rotate(${rot}deg)">${s}<circle cx="105" cy="105" r="16" fill="#06060A" stroke="#C9A84C" stroke-width="2"/></svg>`;
  }

  function pintarAlbum(resultado){
    const el=document.getElementById('albIn');
    const porArea={};(est.figuritas||[]).forEach(f=>{(porArea[f.area]=porArea[f.area]||{})[f.numero]=f;});
    const puedeD=est.diario_disponible,x=est.extras||0;
    let spin=`<div class="alb-spin"><div class="alb-wheel">${ruedaSVG()}</div>`;
    if(resultado){
      const f=resultado.figurita;
      spin+=`<div class="alb-fig" style="background:linear-gradient(135deg,${COL[f.area]},#F5E4A8)">
        <small>${esc(f.area)} · Nº ${f.numero}</small><p>${esc(f.texto)}</p>
        <span class="alb-tag">${resultado.nueva?'✨ ¡Nueva!':'Repetida · la tenés '+resultado.veces+' veces'}</span></div>`;
      if(resultado.album_completo)spin+=`<div class="alb-premio">🏆 ¡Completaste el álbum entero! Te ganaste un premio: Juan Cruz se va a comunicar con vos.</div>`;
      else if(resultado.area_completa)spin+=`<div class="alb-premio">🏆 ¡Completaste ${esc(f.area)}! Te ganaste un premio: Juan Cruz se va a comunicar con vos.</div>`;
    }
    spin+=`<div class="alb-btns" style="margin-top:16px">
      ${puedeD?`<button class="alb-cta" onclick="albumGirar('diario')">🎡 Girar el giro de hoy</button>`:''}
      ${x?`<button class="alb-cta" onclick="albumGirar('extra')">🎡 Usar giro extra (${x})</button>`:''}
      ${!puedeD&&!x?`<div style="font-size:13px;color:var(--muted)">Ya giraste hoy. Volvé mañana por otra pregunta ✦<br>Sumás giros extra con cada sesión y con la clase.</div>`:''}
    </div></div>`;
    const areas=AREAS.map(a=>{
      const t=(est.totales||{})[a]||20,mias=porArea[a]||{},n=Object.keys(mias).length;
      const logro=(est.logros||[]).some(l=>l.tipo==='area'&&l.area===a);
      let slots='';for(let i=1;i<=t;i++){const f=mias[i];
        slots+=f?`<div class="alb-s ok" style="background:${COL[a]}" data-x="${f.veces>1?'×'+f.veces:''}" onclick="albumVer('${esc(f.id)}')">${i}</div>`:`<div class="alb-s">${i}</div>`;}
      return `<div class="alb-area"><div class="alb-ah"><span style="width:10px;height:10px;border-radius:50%;background:${COL[a]}"></span><b>${a}</b>${logro?' 🏆':''}<span>${n} / ${t}</span></div><div class="alb-grid">${slots}</div></div>`;
    }).join('');
    el.innerHTML=`<div class="alb-top"><h2>📖 Mi álbum de preguntas</h2><button class="alb-x" onclick="albumCerrar()">✕</button></div>
      <div class="alb-sub">${tengo()} de ${tot()} figuritas · ${est.giros_total||0} giros. Cada día tenés un giro: el tema lo elige la ruleta.</div>
      ${spin}${areas}`;
  }

  window.albumAbrir=function(){if(!est)return;ov.classList.add('open');document.body.style.overflow='hidden';pintarAlbum();};
  window.albumCerrar=function(){ov.classList.remove('open');document.body.style.overflow='';pintarCard();};
  window.albumVer=function(id){
    const f=(est.figuritas||[]).find(x=>x.id===id);if(!f)return;
    md.innerHTML=`<div class="alb-fig" style="background:linear-gradient(135deg,${COL[f.area]},#F5E4A8)"><small>${esc(f.area)} · Nº ${f.numero}</small><p>${esc(f.texto)}</p>
      <span class="alb-tag">${f.veces>1?'La tenés '+f.veces+' veces':'✦'}</span></div>`;
    md.classList.add('open');
  };
  window.albumGirar=async function(tipo){
    if(girando)return;girando=true;
    document.querySelectorAll('.alb-btns button').forEach(b=>b.disabled=true);
    const {data,error}=await _sb.rpc('album_girar',{p_email:curSer.email,p_tipo:tipo,p_lang:'es'});
    if(error||!data||data.error){girando=false;
      alertaSuave(data&&data.error==='ya_giro_hoy'?'Ya usaste el giro de hoy ✦':data&&data.error==='album_vacio'?'El álbum todavía se está preparando ✦':'No se pudo girar. Probá de nuevo.');
      await cargar();return;}
    // la rueda cae en el tema que tocó
    const i=AREAS.indexOf(data.figurita.area),seg=360/AREAS.length;
    rot+=360*5+(360-((i+.5)*seg)-(rot%360));
    const svg=document.getElementById('albSvg');if(svg)svg.style.transform=`rotate(${rot}deg)`;
    setTimeout(async()=>{
      const r=await _sb.rpc('album_estado',{p_email:curSer.email,p_lang:'es'});
      if(r.data&&!r.data.error)est=r.data;
      girando=false;pintarAlbum(data);
    },3300);
  };
  function alertaSuave(t){const d=document.createElement('div');d.textContent=t;
    d.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1426;border:1px solid var(--gold);color:var(--gl);padding:10px 18px;border-radius:12px;z-index:1000;font-size:13px';
    document.body.appendChild(d);setTimeout(()=>d.remove(),3000);}

  /* se carga cuando la persona entra al portal */
  window.albumCargar=cargar;
  const _show=window.showAppScreen;
  if(typeof _show==='function'){window.showAppScreen=function(){const r=_show.apply(this,arguments);cargar();return r;};}
})();
