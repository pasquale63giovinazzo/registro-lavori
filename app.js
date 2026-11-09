/* Registro dei lavori – app telefono (solo lettura).
   Dati: dati.bin = "REG2" + nonce(12) + AES-256-GCM(JSON), uguale a telefono.py.
   La chiave arriva nel link (#k=...), resta solo su questo telefono. */
"use strict";
const CATEGORIE = [
  ["Siti clienti","--c-siti"],["Gestionali da vendere","--c-gest"],["App per clienti","--c-app"],
  ["Marketing e social","--c-mkt"],["Personale","--c-pers"],["Liste e ricerche","--c-liste"],
  ["Prove e demo","--c-prove"],["Archivio e materiale","--c-arch"]];
const SERVIZI = ["GitHub","Netlify","Supabase","Aruba"];
const K_CHIAVE = "registro-chiave", K_COPIA = "registro-copia";
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const linkSicuro = u => /^https?:\/\//i.test(u||"") ? u : "";
const classeStato = s => ({"Online":"s-online","Online di prova":"s-online","Pronto":"s-online","Consegnato":"s-online","In uso":"s-online",
  "In lavorazione":"s-lavoro","Bozza":"s-lavoro","Demo":"s-lavoro","Prova":"s-lavoro","Da verificare":"s-verifica"})[s] || "s-spento";
const ls = { get(k){ try{return localStorage.getItem(k);}catch(e){return null;} }, set(k,v){ try{localStorage.setItem(k,v);}catch(e){} }, del(k){ try{localStorage.removeItem(k);}catch(e){} } };

let D = null, vista = "progetti", filtro = "";

/* ── chiave e collegamento ── */
function chiaveDaTesto(t){ const m = /[#&]k=([A-Za-z0-9_-]{40,})/.exec(t||""); return m ? m[1] : null; }
function prendiChiaveDalLink(){
  const k = chiaveDaTesto(location.hash);
  if(k){ ls.set(K_CHIAVE,k); ls.del(K_COPIA); history.replaceState(null,"",location.pathname+location.search); }
}
const b64u = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((s.length+3)%4)), c=>c.charCodeAt(0));
const daB64 = s => Uint8Array.from(atob(s), c=>c.charCodeAt(0));
const aB64 = u => { let s=""; for(let i=0;i<u.length;i+=8192) s+=String.fromCharCode.apply(null,u.subarray(i,i+8192)); return btoa(s); };

async function decifra(buf, chiave){
  const u = new Uint8Array(buf);
  const magia = String.fromCharCode(...u.slice(0,4));
  if(magia!=="REG2" && magia!=="REG1") throw new Error("formato");
  const k = await crypto.subtle.importKey("raw", b64u(chiave), "AES-GCM", false, ["decrypt"]);
  const piano = await crypto.subtle.decrypt({name:"AES-GCM", iv:u.slice(4,16)}, k, u.slice(16));
  if(magia==="REG2") return JSON.parse(new TextDecoder().decode(piano));
  const ds = new Blob([piano]).stream().pipeThrough(new DecompressionStream("gzip"));
  return JSON.parse(await new Response(ds).text());
}

async function avvia(){
  prendiChiaveDalLink();
  const chiave = ls.get(K_CHIAVE);
  if(!chiave){ mostraCollega(); return; }
  // 1) copia salvata sul telefono: si apre subito, anche senza internet
  const copia = ls.get(K_COPIA);
  if(copia){ try{ D = await decifra(daB64(copia).buffer, chiave); mostraApp(true); }catch(e){} }
  // 2) copia più recente da internet
  try{
    const r = await fetch("dati.bin?v="+Date.now(), {cache:"no-store"});
    if(!r.ok) throw new Error("rete");
    const buf = await r.arrayBuffer();
    try{ D = await decifra(buf, chiave); }
    catch(e){ ls.del(K_COPIA); mostraCollega("La chiave di questo telefono non è più valida. Collega di nuovo il telefono con il nuovo QR del PC."); return; }
    ls.set(K_COPIA, aB64(new Uint8Array(buf)));
    mostraApp(false);
  }catch(e){
    if(D) $("#agg").textContent = `Copia del ${D.generato_il} · senza internet`;
    else mostraCollega("Non riesco a scaricare i dati: controlla la connessione e riapri l'app.");
  }
}

function mostraCollega(errore){
  ["#cerca","#filtri","#barra","#v-progetti","#v-account","#v-prom"].forEach(s=>$(s).hidden=true);
  $("#collega").hidden=false; $("#errCollega").textContent = errore||""; $("#agg").textContent="";
}
$("#btnIncolla").onclick = ()=>{
  const k = chiaveDaTesto($("#incolla").value);
  if(!k){ $("#errCollega").textContent = "Il link non contiene la chiave. Copialo di nuovo per intero dal PC."; return; }
  ls.set(K_CHIAVE,k); ls.del(K_COPIA); $("#collega").hidden=true; avvia();
};

/* ── interfaccia ── */
function mostraApp(daCopia){
  $("#collega").hidden=true; $("#cerca").hidden=false; $("#filtri").hidden=false; $("#barra").hidden=false;
  $("#agg").textContent = `Aggiornato il ${D.generato_il}`+(daCopia?" · controllo…":"");
  disegna();
}
function promemoria(){
  const R=[], P=D.progetti;
  P.filter(p=>p.nuovo).forEach(p=>R.push([p,"Cartella nuova: la scheda è ancora vuota."]));
  P.filter(p=>!p.nuovo&&p.stato==="Da verificare").forEach(p=>R.push([p,"Stato da verificare."]));
  P.filter(p=>/da verificare|da confermare/i.test((p.netlify_account||"")+" "+(p.supabase_account||""))).forEach(p=>R.push([p,"Account da confermare."]));
  P.filter(p=>p.da_fare).forEach(p=>R.push([p,"Da fare: "+p.da_fare]));
  return R;
}
function testoAccount(p,srv){
  if(srv==="GitHub") return p.github||"";
  if(srv==="Netlify") return p.netlify_account||"";
  if(srv==="Supabase") return (p.supabase_account||"")+" "+(p.supabase_trovato||[]).join(" ");
  return [p.dominio,p.online,p.note].join(" ");
}
function usa(p,a){
  const ch=(a.chiave||"").split("|").map(x=>x.trim().toLowerCase()).filter(Boolean);
  const t=testoAccount(p,a.servizio).toLowerCase(); return ch.some(c=>t.includes(c));
}

function disegna(){
  const P=D.progetti;
  const conta = f => P.filter(f).length;
  const F=[["","Tutti",P.length],["online","Online",conta(p=>/^Online/.test(p.stato))],
    ["lavoro","In lavorazione",conta(p=>classeStato(p.stato)==="s-lavoro")],
    ...CATEGORIE.map(([c])=>["cat:"+c,c,conta(p=>p.categoria===c)]).filter(x=>x[2])];
  $("#filtri").innerHTML = F.map(([k,t,n])=>`<button type="button" data-f="${esc(k)}" aria-pressed="${filtro===k}">${esc(t)} · ${n}</button>`).join("");
  $("#filtri").hidden = vista!=="progetti"; $("#cerca").hidden = vista==="prom";
  const R=promemoria(); $("#nProm").textContent = R.length||"";
  ["progetti","account","prom"].forEach(v=>$("#v-"+v).hidden = v!==vista);
  document.querySelectorAll(".barra button").forEach(b=>{ if(b.dataset.v===vista) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  const q=$("#cerca").value.trim().toLowerCase();
  if(vista==="progetti") disegnaProgetti(P,q);
  if(vista==="account") disegnaAccount(P,q);
  if(vista==="prom") $("#v-prom").innerHTML = R.map(([p,t])=>`<button class="prom" type="button" data-apri="${esc(p.cartella)}"><b>${esc(p.nome)}</b><small>${esc(t)}</small></button>`).join("") || `<div class="vuoto">Niente da sistemare.</div>`;
}

function disegnaProgetti(P,q){
  const L=P.filter(p=>{
    if(filtro==="online"&&!/^Online/.test(p.stato)) return false;
    if(filtro==="lavoro"&&classeStato(p.stato)!=="s-lavoro") return false;
    if(filtro.startsWith("cat:")&&p.categoria!==filtro.slice(4)) return false;
    if(q){ const t=[p.nome,p.cliente,p.cartella,p.online,p.github,p.netlify_account,p.supabase_account,p.dominio,p.note].join(" ").toLowerCase(); if(!t.includes(q)) return false; }
    return true;
  });
  if(!L.length){ $("#v-progetti").innerHTML=`<div class="vuoto">Nessun lavoro trovato. Cambia la ricerca o tocca «Tutti».</div>`; return; }
  let h="";
  CATEGORIE.forEach(([c,col])=>{
    const G=L.filter(p=>p.categoria===c).sort((a,b)=>a.nome.localeCompare(b.nome,"it")); if(!G.length) return;
    h+=`<div class="gruppo">${esc(c)}<span>${G.length}</span></div>`;
    h+=G.map(p=>{
      const b=[]; if(p.nuovo) b.push(`<span class="bollo b-nuovo">Nuovo</span>`);
      if(p.github) b.push(`<span class="bollo">GitHub</span>`);
      if(p.netlify_account||/netlify/.test(p.online)) b.push(`<span class="bollo">Netlify</span>`);
      if(p.supabase_account||(p.supabase_trovato||[]).length) b.push(`<span class="bollo">Supabase</span>`);
      if(p.admin) b.push(`<span class="bollo">/admin</span>`);
      return `<button class="card" type="button" data-apri="${esc(p.cartella)}" data-cat="${esc(c)}" style="--tab:var(${col})">
        <span class="stato ${classeStato(p.stato)}">${esc(p.stato)}</span><h3>${esc(p.nome)}</h3>
        ${p.cliente?`<p class="cli">${esc(p.cliente)}</p>`:""}${b.length?`<div class="bolli">${b.join("")}</div>`:""}</button>`;
    }).join("");
  });
  $("#v-progetti").innerHTML=h;
}

function disegnaAccount(P,q){
  const A=D.account.filter(a=>!q||[a.servizio,a.nome,a.a_cosa_serve,a.note].join(" ").toLowerCase().includes(q));
  $("#v-account").innerHTML = A.map(a=>{
    const u=P.filter(p=>usa(p,a)), srv=SERVIZI.includes(a.servizio)?a.servizio:"Altro", l=linkSicuro(a.dove_si_entra);
    return `<article class="acc srv-${srv}"><div class="srv">${esc(a.servizio)}</div><h3>${esc(a.nome)}</h3>
      ${a.a_cosa_serve?`<p>${esc(a.a_cosa_serve)}</p>`:""}${a.note?`<p class="nota">${esc(a.note)}</p>`:""}
      <p><b>${u.length}</b> progett${u.length===1?"o":"i"}</p>
      <div class="chip-lista">${u.map(p=>`<button class="chip" type="button" data-apri="${esc(p.cartella)}">${esc(p.nome)}</button>`).join("")}</div>
      ${l?`<div class="azioni" style="margin-top:12px"><a class="btn chiaro" href="${esc(l)}" target="_blank" rel="noopener">Vai a ${esc(a.servizio)}</a></div>`:""}</article>`;
  }).join("") || `<div class="vuoto">Nessun account trovato.</div>`;
}

function apri(cartella){
  const p=D.progetti.find(x=>x.cartella===cartella); if(!p) return;
  $("#fTit").textContent=p.nome;
  const r=[["Stato",`<span class="stato ${classeStato(p.stato)}">${esc(p.stato)}</span>`],["Categoria",esc(p.categoria)]];
  if(p.cliente) r.push(["Cliente",esc(p.cliente)]);
  if(p.online) r.push(["Online",`<span class="mono">${esc(p.online)}</span>`]);
  if(p.github) r.push(["GitHub",esc(p.github)]);
  if(p.netlify_account) r.push(["Netlify",esc(p.netlify_account)]);
  if(p.supabase_account||(p.supabase_trovato||[]).length) r.push(["Supabase",esc([p.supabase_account,...(p.supabase_trovato||[]).map(x=>"progetto "+x)].filter(Boolean).join(" · "))]);
  if(p.dominio) r.push(["Dominio",esc(p.dominio)]);
  if(p.admin) r.push(["Pannello","/admin per cambiare testi e foto"]);
  if((p.installer||[]).length) r.push(["Installer",esc(p.installer.join(", "))]);
  if(p.da_fare) r.push(["Da fare",esc(p.da_fare)]);
  r.push(["Cartella sul PC",`<span class="mono">${esc(p.cartella)}</span>`]);
  if(p.ultima_modifica) r.push(["Ultima modifica",new Date(p.ultima_modifica*1000).toLocaleDateString("it-IT",{day:"2-digit",month:"long",year:"numeric"})]);
  const on=linkSicuro(p.online), gh=p.github?`https://github.com/${p.github}`:"";
  $("#fCorpo").innerHTML = `<div class="azioni">${on?`<a class="btn" href="${esc(on)}" target="_blank" rel="noopener">Apri il sito</a>`:""}${gh?`<a class="btn chiaro" href="${esc(gh)}" target="_blank" rel="noopener">GitHub</a>`:""}</div>
    <dl class="dati">${r.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join("")}</dl>${p.note?`<div class="note">${esc(p.note)}</div>`:""}`;
  $("#foglio").classList.add("aperto"); $("#velo").classList.add("aperto"); $("#chiudi").focus();
}
function chiudi(){ $("#foglio").classList.remove("aperto"); $("#velo").classList.remove("aperto"); }

document.addEventListener("click",e=>{
  const a=e.target.closest("[data-apri]"); if(a){ apri(a.dataset.apri); return; }
  const f=e.target.closest("[data-f]"); if(f){ filtro=f.dataset.f; disegna(); return; }
  const v=e.target.closest(".barra button"); if(v){ vista=v.dataset.v; chiudi(); disegna(); scrollTo(0,0); }
});
$("#cerca").addEventListener("input",disegna);
$("#chiudi").onclick=chiudi; $("#velo").onclick=chiudi;
document.addEventListener("keydown",e=>{ if(e.key==="Escape") chiudi(); });
addEventListener("hashchange",()=>{ if(chiaveDaTesto(location.hash)) avvia(); });
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
avvia();
