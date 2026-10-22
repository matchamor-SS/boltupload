/* Set & Settled app code. Same code as the tested prototype; see README "What was changed from the prototype". */

const STATUSES=[["lead","Lead"],["pitched","Pitched"],["confirmed","Confirmed"],["played","Played"],["paid","Paid"],["lost","Lost"]];
const TASKS=[["contract","Contract signed"],["deposit","Deposit received"],["media","Media person booked"],["loadin","Confirm set time & load-in"],["promo","Promo posted"],["music","Set prepped"]];
const STAGES=["lead","pitched","confirmed","played","paid"];
const STAGE_L={lead:"Lead",pitched:"Pitched",confirmed:"Confirmed",played:"Played",paid:"Paid"};
const STAGE_DEFAULT_NAMES={lead:"Lead",pitched:"Pitched",confirmed:"Confirmed",played:"Played",paid:"Paid",lost:"Lost"};
const KINDS=["lead","pitched","confirmed","played","paid","lost"];
const KIND={};const K=s=>KIND[s]||s;
const defBase=like=>like==="confirmed"||like==="played"?"show":"stage";
function pipeline(){const P=S.pipeline&&Array.isArray(S.pipeline.stages)&&S.pipeline.stages.length?S.pipeline.stages:null;
  if(P)return P.map(p=>({key:p.key,name:(p.name||"").trim()||STAGE_DEFAULT_NAMES[p.key]||"Stage",like:KINDS.includes(p.like)?p.like:(KINDS.includes(p.key)?p.key:"pitched"),base:p.base||defBase(p.like||p.key)}));
  return KINDS.map(k=>({key:k,name:((S.stageNames||{})[k]||"").trim()||STAGE_DEFAULT_NAMES[k],like:k,base:defBase(k)}))}
const stName=k=>{const p=pipeline().find(x=>x.key===k);return p?p.name:(STAGE_DEFAULT_NAMES[k]||k)};
const kindName=k=>{const p=pipeline().find(x=>x.like===k);return p?p.name:STAGE_DEFAULT_NAMES[k]};
function applyStageNames(){const P=pipeline();
  STATUSES.splice(0,STATUSES.length,...P.map(p=>[p.key,p.name]));STAGES.splice(0,STAGES.length,...P.filter(p=>p.like!=="lost").map(p=>p.key));
  Object.keys(KIND).forEach(k=>delete KIND[k]);P.forEach(p=>{KIND[p.key]=p.like;STAGE_L[p.key]=p.name;STAGE_BASE[p.key]=p.base});
  if(typeof setStage!=="undefined"&&!STAGES.includes(setStage))setStage=STAGES[0]||"";
  const lg=document.getElementById("calLegend");if(lg)lg.innerHTML=`<span><i style="background:var(--accent)"></i>${esc(kindName("confirmed"))}</span><span><i style="border:1px dashed var(--warn)"></i>${esc(kindName("pitched"))} / ${esc(kindName("lead"))}</span><span><i style="background:var(--hot)"></i>${esc(kindName("played"))}</span><span><i style="background:repeating-linear-gradient(135deg,var(--muted) 0 2px,transparent 2px 4px)"></i>Blocked</span><span><i style="border-left:3px solid var(--muted)"></i>Google Calendar</span>`}
const STAGE_BASE={lead:"stage",pitched:"stage",confirmed:"show",played:"show",paid:"stage"};
const STAGE_DEF={
  lead:[{key:"ld_research",label:"Research the venue or promoter",offset:0},{key:"ld_avail",label:"Check the date works for you",offset:0},{key:"ld_pitch",label:"Send pitch email",offset:1}],
  pitched:[{key:"pt_follow1",label:"Follow up if no reply",offset:5},{key:"pt_follow2",label:"Second follow-up",offset:12},{key:"pt_terms",label:"Agree on fee and set time",offset:14}],
  played:[{key:"pl_thanks",label:"Thank-you & follow-up email to coordinator",offset:1},{key:"pl_invoice",label:"Send invoice",offset:1},{key:"pl_media",label:"Collect photos & video from media",offset:3},{key:"pl_recap",label:"Post show recap",offset:3},{key:"pl_rebook",label:"Ask about a rebooking date",offset:7}],
  paid:[{key:"pd_check",label:"Check payment matches the invoice",offset:0},{key:"pd_thanks",label:"Thank them for payment",offset:1}]};
const STAGE_OFFS={stage:[[null,"No due date"],[0,"Right away"],[1,"1 day after"],[2,"2 days after"],[3,"3 days after"],[5,"5 days after"],[7,"1 week after"],[12,"12 days after"],[14,"2 weeks after"],[30,"30 days after"]]};
const CTYPES=[["venue","Venue / festival"],["promoter","Promoter / collective"],["media","Media"],["other","Other"]];
const VKINDS=[["club","Club / bar"],["festival","Festival"],["space","Event space"],["other","Other"]];
const MKINDS=[["photo","Photo"],["video","Video"],["both","Photo & video"]];
const orgFirst=c=>c.type==="venue"||(c.type==="promoter"&&c.pkind==="collective");
const cName=c=>!c?"":orgFirst(c)?(c.org||c.name||""):(c.name||c.org||"");
const relVenues=p=>S.contacts.filter(v=>v.type==="venue"&&((p.venueIds||[]).includes(v.id)||(v.promoterIds||[]).includes(p.id)));
const relPromoters=v=>S.contacts.filter(p=>p.type==="promoter"&&((p.venueIds||[]).includes(v.id)||(v.promoterIds||[]).includes(p.id)));
const isColl=c=>c&&c.type==="promoter"&&c.pkind==="collective";
const collIds=p=>[...new Set([...(p.collectiveIds||[]),p.collectiveId].filter(Boolean))];
const collectivesOf=p=>!p||isColl(p)?[]:S.contacts.filter(x=>isColl(x)&&(collIds(p).includes(x.id)||x.mainContactId===p.id));
const collectiveOf=p=>collectivesOf(p)[0]||null;
const membersOf=col=>S.contacts.filter(p=>p.type==="promoter"&&!isColl(p)&&(collIds(p).includes(col.id)||col.mainContactId===p.id));
const venuesFor=p=>{const out=[...relVenues(p)];collectivesOf(p).forEach(col=>relVenues(col).forEach(v=>{if(!out.includes(v))out.push(v)}));return out};
const personOpts=(list,sel)=>list.map(p=>`<option value="${p.id}" ${p.id===sel?"selected":""}>${esc(cName(p))}</option>`).join("");
const cSub=c=>{if(!c)return"";if(c.type==="venue"){const ps=relPromoters(c).map(cName);return[(VKINDS.find(k=>k[0]===c.vkind)||[])[1]||"",ps.length?(c.vkind==="festival"?"Run by ":"Booked by ")+ps.join(", "):"",(cName(contact(c.bookingContactId))||c.name)?"Contact: "+(cName(contact(c.bookingContactId))||c.name):"",c.city].filter(Boolean).join(" · ")}
  if(c.type==="promoter"){const vs=venuesFor(c).map(cName);
    if(isColl(c)){const m=cName(contact(c.mainContactId))||c.name,n=membersOf(c).length;return[m?"Contact: "+m:"Collective",n>1?n+" promoters":"",vs.length?"Books "+vs.join(", "):""].filter(Boolean).join(" · ")}
    return[collectivesOf(c).map(cName).join(", ")||c.org||"",vs.length?"Books "+vs.join(", "):""].filter(Boolean).join(" · ")}
  if(c.type==="media")return[(MKINDS.find(k=>k[0]===c.mkind)||[])[1]||"",c.rate].filter(Boolean).join(" · ");
  return[c.org,c.email].filter(Boolean).join(" · ")};
/* Expense categories with the Schedule C line a preparer would usually map them to */
const ECATS0=[["Gear","Gear & equipment","Line 22 Supplies (big items may be Line 13 Depreciation)"],["Music","Music & tracks","Line 27a Other expenses"],["Software","Software & subscriptions","Line 27a Other expenses"],
  ["Promo","Promo & advertising","Line 8 Advertising"],["Media","Photo, video & contract help","Line 11 Contract labor"],["Fees","Fees & commissions","Line 10 Commissions and fees"],
  ["Travel","Travel (flights, hotels)","Line 24a Travel"],["Car","Car, mileage & parking","Line 9 Car and truck expenses"],["Meals","Meals (usually 50%)","Line 24b Deductible meals"],["MerchCost","Merch inventory (cost of goods sold)","Part III → Line 4 Cost of goods sold"],["Other","Other","Line 27a Other expenses"]];
const INCLINES=["Line 1 Gross receipts","Line 6 Other income","Schedule E (royalties outside your music business)","Not taxable (reimbursement or transfer)"];
const ICATS0=[["Gig","Gig fee","Line 1 Gross receipts"],["Tips","Tips","Line 1 Gross receipts"],["Merch","Merch sales","Line 1 Gross receipts"],["Royalties","Streaming & royalties","Line 1 Gross receipts"],["Other","Other","Line 6 Other income"]];
const INC_DEF_LINE=k=>(ICATS0.find(x=>x[0]===k)||[])[2]||"Line 1 Gross receipts";
const ECATS=ECATS0.map(x=>[...x]),ICATS=ICATS0.map(x=>[...x]);
const catOf=(list,k)=>list.find(c=>c[0]===k)||[k||"Other",k&&k!=="Other"?k:"Other",(list.find(c=>c[0]==="Other")||[])[2]||"Line 27a Other expenses"];
const TAXLINES=["Part III → Line 4 Cost of goods sold","Line 8 Advertising","Line 9 Car and truck expenses","Line 10 Commissions and fees","Line 11 Contract labor","Line 13 Depreciation","Line 15 Insurance","Line 17 Legal and professional services","Line 18 Office expense","Line 20b Rent or lease (other business property)","Line 21 Repairs and maintenance","Line 22 Supplies","Line 23 Taxes and licenses","Line 24a Travel","Line 24b Deductible meals","Line 25 Utilities","Line 27a Other expenses"];
const ICATS_DEF=null,ECATS_DEF=null;
function applyFinCats(){const f=S.fincats||{};if(Array.isArray(f.income)&&f.income.length)ICATS.splice(0,ICATS.length,...f.income.map(x=>[x.key,x.label,x.line||INC_DEF_LINE(x.key)]));else ICATS.splice(0,ICATS.length,...ICATS0.map(x=>[...x]));
  if(Array.isArray(f.expense)&&f.expense.length)ECATS.splice(0,ECATS.length,...f.expense.map(x=>[x.key,x.label,x.line||"Line 27a Other expenses"]));else ECATS.splice(0,ECATS.length,...ECATS0.map(x=>[...x]))}
const bookingIncType=b=>{const k=b.incomeType||"Gig";return ICATS.some(x=>x[0]===k)?k:(ICATS.find(x=>x[0]==="Gig")||ICATS[0]||["Gig"])[0]};
const typeUse=(kind,k)=>(kind==="income"?S.income:S.expenses).filter(x=>(x.category||"Other")===k).length+(kind==="income"?S.bookings.filter(b=>+b.fee&&bookingIncType(b)===k).length:0);
async function saveFinCats(inc,exp){const nd={income:inc.map(([key,label,line])=>({key,label,line:line||INC_DEF_LINE(key)})),expense:exp.map(([key,label,line])=>({key,label,line}))};if(await save("settings","fincats",nd)){S.fincats=nd;applyFinCats();render();return true}return false}
async function addFinType(kind,label){label=label.trim();if(!label)return null;const list=(kind==="income"?ICATS:ECATS).map(x=>[...x]);
  const ex=list.find(x=>x[1].toLowerCase()===label.toLowerCase());if(ex)return ex[0];const key="c_"+newKey();
  if(kind==="income"){const oi=list.findIndex(x=>x[0]==="Other");list.splice(oi<0?list.length:oi,0,[key,label,"Line 1 Gross receipts"])}else{const oi=list.findIndex(x=>x[0]==="Other");list.splice(oi<0?list.length:oi,0,[key,label,"Line 27a Other expenses"])}
  if(await saveFinCats(kind==="income"?list:ICATS,kind==="income"?ECATS:list)){toast(`Added “${label}”`);return key}return null}
function typesSheet(back){let inc=ICATS.map(x=>[...x]),exp=ECATS.map(x=>[...x]),dirty=false;
  const row=(kind,x,i)=>{const n=typeUse(kind,x[0]);return `<div class="pl-row"><input data-tn="${kind}:${i}" value="${esc(x[1])}" maxlength="40" aria-label="Type name">${kind==="expense"?`<select data-tl="${i}" aria-label="Tax line for ${esc(x[1])}">${[...new Set([x[2],...TAXLINES])].map(l=>`<option ${l===x[2]?"selected":""}>${esc(l)}</option>`).join("")}</select>`:`<select data-til="${i}" aria-label="Tax line for ${esc(x[1])}">${[...new Set([x[2]||"Line 1 Gross receipts",...INCLINES])].map(l=>`<option ${l===(x[2]||"Line 1 Gross receipts")?"selected":""}>${esc(l)}</option>`).join("")}</select>`}${n?`<span class="note pl-n">${n} used</span>`:""}<button class="x" data-tdel="${kind}:${i}" aria-label="Remove ${esc(x[1])}">×</button></div>`};
  sheet(`<h3>Income &amp; expense types</h3><p class="note" style="margin:0">Rename, add or remove the types you pick from when logging money. Each type carries the federal Schedule C line it usually goes on in your tax report.</p>
  <div><div class="eyebrow" style="margin:6px 0">Income types</div><div id="ty-inc" class="ty-exp"></div><div class="addline"><input id="ty-inc-new" placeholder="New income type, e.g. Workshops" aria-label="New income type"><button class="btn small" data-tadd="income">Add</button></div></div>
  <div><div class="eyebrow" style="margin:6px 0">Expense types</div><div id="ty-exp" class="ty-exp"></div><div class="addline"><input id="ty-exp-new" placeholder="New expense type, e.g. Lessons" aria-label="New expense type"><button class="btn small" data-tadd="expense">Add</button></div></div>
  <div class="actions"><span class="note" id="ty-dirty"></span><span class="spacer"></span><button class="btn" data-cancel>${back?"Back":"Close"}</button><button class="btn primary" data-save disabled>Save</button></div>`,root=>{
    const $r=q=>root.querySelector(q),mark=()=>{dirty=true;$r("[data-save]").disabled=false;$r("#ty-dirty").textContent="Unsaved changes"};
    const draw=()=>{$r("#ty-inc").innerHTML=inc.map((x,i)=>row("income",x,i)).join("");$r("#ty-exp").innerHTML=exp.map((x,i)=>row("expense",x,i)).join("");
      root.querySelectorAll("[data-tn]").forEach(el=>el.oninput=()=>{const [k,i]=el.dataset.tn.split(":");(k==="income"?inc:exp)[+i][1]=el.value;mark()});
      root.querySelectorAll("[data-tl]").forEach(el=>el.onchange=()=>{exp[+el.dataset.tl][2]=el.value;mark()});
      root.querySelectorAll("[data-til]").forEach(el=>el.onchange=()=>{inc[+el.dataset.til][2]=el.value;mark()});
      root.querySelectorAll("[data-tdel]").forEach(el=>el.onclick=()=>{const [k,i]=el.dataset.tdel.split(":"),L=k==="income"?inc:exp,x=L[+i],n=typeUse(k,x[0]);
        if(L.length<=1){toast("Keep at least one type");return}if(n){toast(`“${x[1]}” is used by ${n} ${n>1?"entries or bookings":"entry or booking"}. Change ${n>1?"them":"it"} to another type first.`);return}
        L.splice(+i,1);mark();draw()})};
    draw();
    root.querySelectorAll("[data-tadd]").forEach(b=>{const k=b.dataset.tadd,inp=$r(k==="income"?"#ty-inc-new":"#ty-exp-new");const add=()=>{const v=inp.value.trim();if(!v)return;const L=k==="income"?inc:exp,oi=L.findIndex(x=>x[0]==="Other"),it=k==="income"?["c_"+newKey(),v,"Line 1 Gross receipts"]:["c_"+newKey(),v,"Line 27a Other expenses"];L.splice(oi<0?L.length:oi,0,it);inp.value="";mark();draw()};b.onclick=add;inp.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();add()}}});
    $r("[data-cancel]").onclick=()=>back?back():close();
    $r("[data-save]").onclick=async()=>{if([...inc,...exp].some(x=>!x[1].trim())){toast("Every type needs a name");return}const pi=ICATS.map(x=>[...x]),pe=ECATS.map(x=>[...x]);
      if(await saveFinCats(inc.map(x=>[x[0],x[1].trim(),x[2]]),exp.map(x=>[x[0],x[1].trim(),x[2]]))){toast("Types saved",()=>saveFinCats(pi,pe));back?back():close()}}})}
function typeSelect(id,kind,val){const L=kind==="income"?ICATS:ECATS;return `<select id="${id}" class="srch" data-k="category">${L.map(x=>`<option value="${esc(x[0])}" ${x[0]===val?"selected":""}>${esc(x[1])}</option>`).join("")}${val&&!L.some(x=>x[0]===val)?`<option value="${esc(val)}" selected>${esc(val)}</option>`:""}<option value="__newtype__">＋ Add new type…</option></select>`}
function wireTypeSelect(root,id,kind,onPick){const sel=root.querySelector("#"+id),wrap=root.querySelector("#"+id+"-new");let prev=sel.value;
  sel.addEventListener("change",()=>{if(sel.value!=="__newtype__"){prev=sel.value;onPick&&onPick(sel.value);return}sel.value=prev;wrap.hidden=false;wrap.querySelector("input").focus()});
  const add=async()=>{const inp=wrap.querySelector("input"),k=await addFinType(kind,inp.value);if(!k)return;inp.value="";wrap.hidden=true;
    sel.innerHTML=typeSelect(id,kind,k).replace(/^<select[^>]*>|<\/select>$/g,"");sel.value=k;prev=k;onPick&&onPick(k)};
  wrap.querySelector("button").onclick=add;wrap.querySelector("input").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();add()}}}
const newTypeRow=id=>`<div class="addline" id="${id}-new" hidden><input placeholder="Name the new type" aria-label="New type name"><button type="button" class="btn small">Add</button></div>`;
const expCatLabel=e=>e.category==="Other"&&e.otherLabel?e.otherLabel:catOf(ECATS,e.category)[1];
const incCatLabel=i=>i.category==="Other"&&i.otherLabel?i.otherLabel:catOf(ICATS,i.category)[1];
const S={sentLog:[],bookings:[],contacts:[],expenses:[],income:[],links:[],templates:[],blocks:[],kitFiles:[],profile:{},kit:{},avail:null,drive:{},stages:null,stageNames:{},pipeline:null,fincats:null,checklist:null};
let txFilter="all";
const FP={preset:"year:"+new Date().getFullYear(),from:"",to:""};
try{const sv=JSON.parse(localStorage.getItem("hq-fin")||"null");if(sv&&sv.preset)Object.assign(FP,sv)}catch(e){}
const newKey=()=>"c"+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
const DEF_OFF={contract:-21,deposit:-14,media:-14,loadin:-3,promo:-7,music:-2,invoice:1};
const OFFSETS=[[null,"No due date"],[-30,"30 days before"],[-21,"3 weeks before"],[-14,"2 weeks before"],[-10,"10 days before"],[-7,"1 week before"],[-5,"5 days before"],[-3,"3 days before"],[-2,"2 days before"],[-1,"Day before"],[0,"Day of show"],[1,"Day after"],[3,"3 days after"],[7,"1 week after"]];
const offOf=it=>it.offset!==undefined?it.offset:(DEF_OFF[it.key]??null);
const offList=st=>STAGE_BASE[st]==="stage"?STAGE_OFFS.stage:OFFSETS;
const offLabelFor=(st,o)=>{const f=offList(st).find(x=>x[0]===o);return f?f[1]:""};
const offLabel=o=>{const f=OFFSETS.find(x=>x[0]===o);return f?f[1]:o<0?(-o)+" days before":o+" days after"};
const stageDate=(b,st)=>((b.stageAt||{})[st])||(b.status===st?(b.updatedAt||b.createdAt||"").slice(0,10):"")||(b.createdAt||"").slice(0,10)||today();
const dueOf=(b,it,st="confirmed")=>{if(it.due==="none")return"";if(it.due)return it.due;const o=offOf(it);if(o==null)return"";const base=STAGE_BASE[st]==="stage"?stageDate(b,st):b.date;return base?addDays(base,o):""};
const dueState=(ds,done)=>!ds||done?"":ds<today()?"late":ds<=addDays(today(),3)?"soon":"";
const dueShort=ds=>ds?parseD(ds).toLocaleDateString("en-US",{month:"short",day:"numeric"}):"";
const defChecklist=()=>(Array.isArray(S.checklist)?S.checklist:TASKS.map(([key,label])=>({key,label,offset:DEF_OFF[key]})));
const stageDefaults=st=>st==="confirmed"?defChecklist():(S.stages&&Array.isArray(S.stages[st])?S.stages[st]:STAGE_DEF[st]||[]);
const clFor=(b,st)=>{const m=b.checklists||{};if(Array.isArray(m[st]))return m[st];if(st==="confirmed"&&Array.isArray(b.checklist))return b.checklist;return stageDefaults(st)};
const clOf=b=>clFor(b,"confirmed");
function stagesFor(b){if(!b||K(b.status)==="lost")return[];const ci=STAGES.indexOf(b.status);if(ci<0)return[];const at=b.stageAt||{};
  return STAGES.filter((s,i)=>i<=ci&&(s===b.status||at[s]||(K(s)==="confirmed"&&["played","paid"].includes(K(b.status))&&STAGES.indexOf(s)<ci)))}
function tasksOf(b){const out=[];stagesFor(b).forEach(st=>clFor(b,st).forEach(it=>{const done=!!(b.tasks||{})[it.key];out.push({b,st,it,key:it.key,label:it.label,done,due:dueOf(b,it,st)})}));return out}
const allTasks=()=>sortedBookings().flatMap(tasksOf);
const clPatch=(b,st,list)=>({checklists:{[st]:list}});
const withStage=(b,st)=>({...(b.stageAt||{}),[st]:(b.stageAt||{})[st]||today()});
let calM=(()=>{const d=new Date();return new Date(d.getFullYear(),d.getMonth(),1)})();
let db=null, canWrite=true, tab="home", bFilter="active", cFilter="all";
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=n=>"$"+Math.round(Number(n)||0).toLocaleString("en-US");
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const today=()=>ymd(new Date());
const year=()=>Number(S.profile.goalYear)||new Date().getFullYear();
const parseD=d=>d?new Date(d+"T12:00:00"):null;
const fmtD=d=>{const x=parseD(d);return x?x.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}):"No date"};
const contactName=id=>cName(S.contacts.find(c=>c.id===id));
const contact=id=>S.contacts.find(c=>c.id===id);
const NAV=[["google","Google Maps"],["apple","Apple Maps"],["waze","Waze"]];
const navUrl=(addr,app)=>{const q=encodeURIComponent(addr);app=app||S.profile.navApp||"google";
  return app==="apple"?`https://maps.apple.com/?daddr=${q}`:app==="waze"?`https://waze.com/ul?q=${q}&navigate=yes`:`https://www.google.com/maps/dir/?api=1&destination=${q}`};
const bAddr=b=>b&&(b.address||(contact(b.venueId)||{}).address)||"";
const addrLink=(addr,cls="")=>addr?`<a class="addr ${cls}" href="${esc(navUrl(addr))}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg><span>${esc(addr)}</span></a>`:"";
const navAlts=addr=>addr?`<span class="note">Open in: ${NAV.map(([k,l])=>`<a href="${esc(navUrl(addr,k))}" target="_blank" rel="noopener">${l}</a>`).join(" · ")}</span>`:"";
function toast(t,undo){const el=$("#toast");el.innerHTML="";const sp=document.createElement("span");sp.textContent=t;el.append(sp);
  if(undo){const b=document.createElement("button");b.type="button";b.className="tundo";b.textContent="Undo";b.onclick=()=>{el.hidden=true;clearTimeout(toast.t);undo()};el.append(b)}
  el.hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>el.hidden=true,undo?7000:2200)}
/* ---------- pickers: searchable dropdowns + month-view date picker ---------- */
const CARET='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
const CALI='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';
const PK={open:null};
function closePop(){if(!PK.open)return;PK.open.el.remove();const a=PK.open.anchor;PK.open=null;document.removeEventListener("pointerdown",PK.out,true);window.removeEventListener("scroll",PK.scr,true);window.removeEventListener("resize",PK.scr);if(PK.refocus)try{a.focus()}catch(e){}}
function placePop(pop,anchor,minW){const r=anchor.getBoundingClientRect(),vw=innerWidth,vh=innerHeight,w=Math.min(Math.max(r.width,minW||280),vw-24);
  pop.style.width=w+"px";pop.style.left=Math.min(Math.max(12,r.left),vw-w-12)+"px";const below=vh-r.bottom-12,above=r.top-12;
  if(below>=320||below>=above){pop.style.top=(r.bottom+6)+"px";pop.style.bottom="";pop.style.maxHeight=Math.max(220,below-6)+"px"}else{pop.style.bottom=(vh-r.top+6)+"px";pop.style.top="";pop.style.maxHeight=Math.max(220,above-6)+"px"}}
function openPop(anchor,build,minW){closePop();const pop=document.createElement("div");pop.className="pop";document.body.appendChild(pop);PK.open={el:pop,anchor};PK.refocus=true;build(pop);placePop(pop,anchor,minW);
  PK.out=e=>{if(!pop.contains(e.target)&&!anchor.contains(e.target)){PK.refocus=false;closePop()}};PK.scr=e=>{if(e&&e.target&&pop.contains(e.target))return;PK.refocus=false;closePop()};
  document.addEventListener("pointerdown",PK.out,true);setTimeout(()=>{window.addEventListener("scroll",PK.scr,true);window.addEventListener("resize",PK.scr)},50);
  pop.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();closePop()}})}
function pickFire(el){el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}))}
function pkLabelFor(el,btn){const f=el.closest(".f");const lab=(el.id&&f&&f.querySelector(`label[for="${el.id}"]`))||null;if(lab){btn.id=el.id+"-pk";lab.htmlFor=btn.id}else if(el.getAttribute("aria-label"))btn.setAttribute("aria-label",el.getAttribute("aria-label"))}
function enhanceSelect(sel){sel.dataset.pk="1";const btn=document.createElement("button");btn.type="button";btn.className="pick-btn";btn.setAttribute("aria-haspopup","listbox");sel.after(btn);sel.classList.add("pk-hidden");pkLabelFor(sel,btn);
  const key=()=>sel.value+"|"+sel.options.length+"|"+((sel.selectedOptions[0]||{}).textContent||"");
  sel._sync=()=>{const o=sel.selectedOptions[0];btn.innerHTML=`<span class="pk-l${!sel.value?" ph":""}">${esc(o?o.textContent:"")}</span>${CARET}`;sel._last=key()};sel._key=key;sel._sync();
  btn.onclick=()=>{if(PK.open&&PK.open.anchor===btn){closePop();return}openPop(btn,pop=>{
    const items=[];[...sel.children].forEach(ch=>{if(ch.tagName==="OPTGROUP"){const g=ch.label;[...ch.children].forEach(o=>items.push({o,g}))}else items.push({o:ch,g:""})});
    const many=items.length>3;pop.innerHTML=`${many?`<div class="ps"><input type="search" placeholder="Search…" aria-label="Search options"></div>`:""}<div class="pl" role="listbox"></div>`;
    const list=pop.querySelector(".pl"),q=pop.querySelector("input");let act=-1,vis=[];
    const draw=()=>{const t=(q&&q.value||"").trim().toLowerCase();vis=[];let html="",lastG=null,tail="";
      items.forEach((it,i)=>{const v=it.o.value,txt=it.o.textContent,isNew=v.startsWith("__");if(it.o.disabled)return;
        if(t&&!isNew&&!txt.toLowerCase().includes(t))return;if(t&&v==="__all__")return;
        const b=`<button type="button" class="pi${isNew?" new":""}" role="option" data-i="${i}" aria-selected="${v===sel.value&&!isNew}">${esc(txt)}</button>`;
        if(t&&isNew){tail+=b;return}
        if(it.g!==lastG){lastG=it.g;if(it.g)html+=`<div class="ph">${esc(it.g)}</div>`}
        vis.push(i);html+=b});
      const real=vis.filter(i=>!items[i].o.value.startsWith("__")).length;
      list.innerHTML=html+(t&&!real?`<div class="pe">No matches for “${esc(q.value)}”.</div>`:"")+(tail?`<div class="ph">Not listed?</div>`+tail:"");
      act=t&&real?[...list.querySelectorAll(".pi")].findIndex(b=>!b.classList.contains("new")):-1;mark();
      list.querySelectorAll(".pi").forEach(b=>b.onclick=()=>choose(+b.dataset.i))};
    const choose=i=>{const v=items[i].o.value;PK.refocus=true;closePop();if(sel.value!==v||v.startsWith("__")){sel.value=v;sel._sync();pickFire(sel)}};
    const mark=()=>{list.querySelectorAll(".pi").forEach((b,j)=>b.classList.toggle("act",j===act));const a=list.querySelectorAll(".pi")[act];a&&a.scrollIntoView({block:"nearest"})};
    pop.addEventListener("keydown",e=>{const n=list.querySelectorAll(".pi").length;if(e.key==="ArrowDown"){e.preventDefault();act=Math.min(n-1,act+1);mark()}else if(e.key==="ArrowUp"){e.preventDefault();act=Math.max(0,act-1);mark()}else if(e.key==="Enter"&&act>=0){e.preventDefault();list.querySelectorAll(".pi")[act].click()}});
    if(q)q.addEventListener("input",draw);draw();
    setTimeout(()=>{if(q)q.focus();else{const s=list.querySelector('[aria-selected="true"]')||list.querySelector(".pi");s&&s.focus()}const s2=list.querySelector('[aria-selected="true"]');s2&&s2.scrollIntoView({block:"nearest"})},20)})}}
function fmtPick(ds){const d=parseD(ds);return d?d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric",year:"numeric"}):""}
function enhanceDate(inp){inp.dataset.pk="1";const btn=document.createElement("button");btn.type="button";btn.className="pick-btn date";btn.setAttribute("aria-haspopup","dialog");inp.after(btn);inp.classList.add("pk-hidden");pkLabelFor(inp,btn);
  inp._key=()=>inp.value+"|"+inp.min+"|"+inp.max;
  const compact=inp.classList.contains("duein");if(compact){btn.classList.add("due");if(inp.dataset.state)btn.dataset.state=inp.dataset.state}
  inp._sync=()=>{btn.innerHTML=compact?`<span class="pk-l${inp.value?"":" ph"}">${inp.value?(btn.dataset.state==="late"?"Overdue · ":"Due ")+esc(dueShort(inp.value)):"Set due"}</span>`:`${CALI}<span class="pk-l${inp.value?"":" ph"}">${inp.value?esc(fmtPick(inp.value)):"Pick a date"}</span>`;inp._last=inp._key()};inp._sync();
  btn.onclick=()=>{if(PK.open&&PK.open.anchor===btn){closePop();return}openPop(btn,pop=>{pop.classList.add("cal-pop");
    const sel=inp.value,base=parseD(sel||today());let vy=base.getFullYear(),vm=base.getMonth(),mode="days";const mn=inp.min||"",mx=inp.max||"";
    const MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const set=ds=>{PK.refocus=true;closePop();if(inp.value!==ds){inp.value=ds;inp._sync();pickFire(inp)}};
    const draw=()=>{let h=`<div class="cal-h"><button type="button" class="btn small" data-nav="-1" aria-label="${mode==="days"?"Previous month":"Previous year"}">‹</button><button type="button" class="t" data-mode aria-label="Pick a month">${mode==="days"?new Date(vy,vm,1).toLocaleDateString("en-US",{month:"long",year:"numeric"}):vy}</button><button type="button" class="btn small" data-nav="1" aria-label="${mode==="days"?"Next month":"Next year"}">›</button></div>`;
      if(mode==="days"){const first=new Date(vy,vm,1),start=new Date(first);start.setDate(1-first.getDay());h+=`<div class="cal-g">${"SMTWTFS".split("").map(d=>`<span class="w">${d}</span>`).join("")}`;
        for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);if(i>=35&&d.getMonth()!==vm)break;const ds=ymd(d),dis=(mn&&ds<mn)||(mx&&ds>mx);
          h+=`<button type="button" data-d="${ds}" class="${d.getMonth()!==vm?"o ":""}${ds===today()?"td ":""}${ds===sel?"sel":""}" ${dis?"disabled":""} aria-label="${esc(fmtPick(ds))}">${d.getDate()}</button>`}h+=`</div>`}
      else h+=`<div class="cal-m">${MN.map((m,i)=>`<button type="button" data-m="${i}" class="${i===vm?"sel":""}">${m}</button>`).join("")}</div>`;
      h+=`<div class="cal-f"><button type="button" class="btn small" data-today ${(mn&&today()<mn)||(mx&&today()>mx)?"disabled":""}>Today</button>${inp.required?"":`<button type="button" class="btn small" data-clear>Clear</button>`}</div>`;
      pop.innerHTML=h;
      pop.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>{const n=+b.dataset.nav;if(mode==="days"){vm+=n;if(vm<0){vm=11;vy--}if(vm>11){vm=0;vy++}}else vy+=n;draw()});
      pop.querySelector("[data-mode]").onclick=()=>{mode=mode==="days"?"months":"days";draw()};
      pop.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{vm=+b.dataset.m;mode="days";draw()});
      pop.querySelectorAll("[data-d]").forEach(b=>b.onclick=()=>set(b.dataset.d));
      const td=pop.querySelector("[data-today]");td.onclick=()=>set(today());const cl=pop.querySelector("[data-clear]");if(cl)cl.onclick=()=>set("")};
    draw();setTimeout(()=>{const s=pop.querySelector(".sel")||pop.querySelector(".td");s&&s.focus()},20)},300)}}
function enhanceAll(){document.querySelectorAll('select.srch:not([data-pk])').forEach(enhanceSelect);document.querySelectorAll('input[type="date"]:not([data-pk])').forEach(enhanceDate)}
new MutationObserver(enhanceAll).observe(document.body,{childList:true,subtree:true});
setInterval(()=>{document.querySelectorAll('[data-pk]').forEach(el=>{if(el._key&&el._key()!==el._last)el._sync()})},250);
function svgWave(){let p="";for(let i=0;i<40;i++){const h=8+Math.abs(Math.sin(i*1.7)*Math.cos(i*.6))*52;p+=`<rect x="${i*4.5}" y="${35-h/2}" width="2.5" height="${h}" rx="1.2" fill="currentColor"/>`}return `<svg class="wave" viewBox="0 0 180 70" aria-hidden="true">${p}</svg>`}

/* ---------- views ---------- */
const TAB_NAMES={home:"Home",bookings:"Bookings",calendar:"Calendar",tasks:"Tasks",contacts:"People",money:"Financials",comms:"Comms",kit:"Kit",settings:"Settings"};let TAB_STACK=[];
function goTab(t){if(t!==tab){TAB_STACK.push({tab,y:window.scrollY});if(TAB_STACK.length>20)TAB_STACK.shift()}setTab(t,true)}
function goBack(){const p=TAB_STACK.pop();if(!p)return;close();setTab(p.tab,true);requestAnimationFrame(()=>window.scrollTo(0,p.y||0))}
function renderBackBar(){const bb=document.getElementById("backBar");if(!bb)return;const p=TAB_STACK[TAB_STACK.length-1];bb.hidden=!p;if(p)bb.querySelector("span").textContent="Back to "+(TAB_NAMES[p.tab]||"previous")}
function setTab(t,keep){if(!keep)TAB_STACK=[];const changed=tab!==t;tab=t;if(changed)requestAnimationFrame(()=>{const v=document.querySelector(`section[data-view="${t}"]`);if(v){v.classList.remove("enter");void v.offsetWidth;v.classList.add("enter");setTimeout(()=>v.classList.remove("enter"),700)}});if(t==="comms")setTimeout(renderMailPick,0);if(t==="kit")setTimeout(renderPromoLists,0);{const sb=document.getElementById("setBtn");sb&&sb.setAttribute("aria-pressed",t==="settings")}document.querySelectorAll("[data-view]").forEach(s=>s.hidden=s.dataset.view!==t);
  document.querySelectorAll("#tabs button").forEach(b=>b.setAttribute("aria-current",b.dataset.tab===t));
  try{localStorage.setItem("hq-tab",t)}catch(e){} window.scrollTo(0,0);renderBackBar()}
document.querySelectorAll("#tabs button").forEach(b=>b.onclick=()=>setTab(b.dataset.tab));
if(["home","bookings","calendar","tasks","contacts","money","comms","kit","settings"].includes(location.hash.slice(1)))tab=location.hash.slice(1);
else{try{tab=localStorage.getItem("hq-tab")||"home"}catch(e){}}
setTab(tab);

function render(){
  $("#yearLbl").textContent=year()+" season";
  renderHome();renderBookings();renderCalendar();renderTasks();renderContacts();renderMoney();renderKit();renderAvatars();
}
function sortedBookings(){return [...S.bookings].sort((a,b)=>(a.date||"9999").localeCompare(b.date||"9999"))}
function upcoming(){return sortedBookings().filter(b=>b.date>=today()&&["confirmed","pitched"].includes(K(b.status)))}
function inYear(b){return (b.date||"").startsWith(String(year()))}

function taskRow(t){const st=dueState(t.due,t.done);
  return `<div class="row trow" style="cursor:default"><input type="checkbox" class="tcb" data-task="${t.b.id}:${esc(t.key)}" ${t.done?"checked":""} aria-label="${esc(t.label)}">
    <button class="main tmain" data-open-task="${t.b.id}|${t.st}|${esc(t.key)}"><span class="t" style="display:block;${t.done?"text-decoration:line-through;color:var(--muted)":""}">${esc(t.label)}</span><span class="sub" style="display:block">${esc(bookingName(t.b))} · <span class="s-${K(t.st)}">${STAGE_L[t.st]}</span>${t.b.date?" · show "+esc(dueShort(t.b.date)):""}</span></button>
    ${t.due?`<span class="duepill ${st}">${st==="late"?"Overdue · ":""}${esc(dueShort(t.due))}</span>`:`<span class="duepill">No date</span>`}</div>`}
const TF={show:"open",when:"all",event:"",stage:"all",from:"",to:""};
try{Object.assign(TF,JSON.parse(localStorage.getItem("hq-tasks")||"{}"))}catch(e){}
const saveTF=()=>{try{localStorage.setItem("hq-tasks",JSON.stringify(TF))}catch(e){}};
function renderTasks(){const all=allTasks();
  document.querySelectorAll("#tShow [data-tshow]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.tshow===TF.show));
  $("#tWhen").value=TF.when;$("#tCustom").hidden=TF.when!=="custom";
  const ev=$("#tEvent"),evs=sortedBookings().filter(b=>stagesFor(b).length);
  ev.innerHTML=`<option value="">All events</option>${evs.map(b=>`<option value="${b.id}" ${b.id===TF.event?"selected":""}>${esc(bookingName(b)+(b.date?" · "+dueShort(b.date):""))}</option>`).join("")}`;if(TF.event&&!evs.some(b=>b.id===TF.event))TF.event="";ev.value=TF.event;
  $("#tStage").innerHTML=[["all","All stages"],...STAGES.map(s=>[s,STAGE_L[s]])].map(([k,l])=>`<button class="chip" data-tstage="${k}" aria-pressed="${TF.stage===k}">${l}</button>`).join("");
  const t0=today(),w=addDays(t0,7),m=addDays(t0,30);
  let L=all.filter(t=>(TF.show==="all"||(TF.show==="done"?t.done:!t.done))&&(!TF.event||t.b.id===TF.event)&&(TF.stage==="all"||t.st===TF.stage));
  L=L.filter(t=>{const d=t.due;switch(TF.when){case"late":return d&&d<t0&&!t.done;case"today":return d===t0;case"week":return d&&d>=t0&&d<=w;case"month":return d&&d>=t0&&d<=m;case"nodate":return!d;
    case"custom":{const f=TF.from||"0000",e=TF.to||"9999";return d&&d>=f&&d<=e}default:return true}});
  L.sort((a,b)=>(a.due||"9999").localeCompare(b.due||"9999")||bookingName(a.b).localeCompare(bookingName(b.b)));
  $("#tTitle").textContent={open:"To do",done:"Done",all:"All tasks"}[TF.show];
  const late=L.filter(t=>dueState(t.due,t.done)==="late").length;$("#tCount").textContent=`${L.length} ${L.length===1?"task":"tasks"}${late?" · "+late+" overdue":""}`;
  const bucket=t=>!t.due?"No due date":t.due<t0?"Overdue":t.due===t0?"Today":t.due<=w?"Next 7 days":t.due<=m?"Next 30 days":"Later";
  let html="",last=null;L.forEach(t=>{const g=t.done&&TF.show!=="done"?"Done":bucket(t);if(g!==last){last=g;html+=`<div class="tgrp">${g}</div>`}html+=taskRow(t)});
  $("#tList").innerHTML=L.length?`<div class="list">${html}</div>`:`<div class="empty">${all.length?"No tasks match these filters.":"Tasks show up here as your bookings move through each stage."}</div>`}
document.getElementById("tShow").addEventListener("click",e=>{const b=e.target.closest("[data-tshow]");if(b){TF.show=b.dataset.tshow;saveTF();renderTasks()}});
document.getElementById("tStage").addEventListener("click",e=>{const b=e.target.closest("[data-tstage]");if(b){TF.stage=b.dataset.tstage;saveTF();renderTasks()}});
document.getElementById("tWhen").addEventListener("change",e=>{TF.when=e.target.value;if(TF.when==="custom"&&!TF.from){TF.from=today();TF.to=addDays(today(),30);$("#tFrom").value=TF.from;$("#tTo").value=TF.to}saveTF();renderTasks()});
document.getElementById("tEvent").addEventListener("change",e=>{TF.event=e.target.value;saveTF();renderTasks()});
["tFrom","tTo"].forEach(id=>document.getElementById(id).addEventListener("change",e=>{if(e.target.value){TF[id==="tFrom"?"from":"to"]=e.target.value;saveTF();renderTasks()}}));
document.getElementById("tFrom").value=TF.from||"";document.getElementById("tTo").value=TF.to||"";
document.getElementById("newTask").onclick=()=>newTaskSheet();
function newTaskSheet(){const evs=sortedBookings().filter(b=>stagesFor(b).length);if(!evs.length){toast("Add a booking first");return}
  const pre=TF.event&&evs.some(b=>b.id===TF.event)?TF.event:(evs.find(b=>b.date>=today())||evs[0]).id;
  sheet(`<h3>Add a task</h3>
  <div class="f"><label for="nt-b">Event</label><select id="nt-b" class="srch">${evs.map(b=>`<option value="${b.id}" ${b.id===pre?"selected":""}>${esc(bookingName(b)+(b.date?" · "+dueShort(b.date):""))}</option>`).join("")}</select></div>
  ${field("nt-l","Task","","text",'placeholder="e.g. Send rider to sound tech"')}
  <div class="frow"><div class="f"><label for="nt-s">Stage</label><select id="nt-s"></select></div>${field("nt-d","Due date","","date")}</div>
  <div class="actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Add task</button></div>`,root=>{
    const bs=root.querySelector("#nt-b"),ss=root.querySelector("#nt-s");
    const fillS=()=>{const b=S.bookings.find(x=>x.id===bs.value);ss.innerHTML=stagesFor(b).map(s=>`<option value="${s}" ${s===b.status?"selected":""}>${STAGE_L[s]}</option>`).join("")};
    bs.addEventListener("change",fillS);fillS();
    root.querySelector("[data-cancel]").onclick=close;
    root.querySelector("[data-save]").onclick=async()=>{const b=S.bookings.find(x=>x.id===bs.value),l=root.querySelector("#nt-l").value.trim(),st=ss.value,d=root.querySelector("#nt-d").value;
      if(!l){toast("Name the task");root.querySelector("#nt-l").focus();return}
      const it={key:newKey(),label:l,offset:null};if(d)it.due=d;
      if(await patch("bookings",b.id,{...clPatch(b,st,[...clFor(b,st),it])})){close();toast("Task added to "+bookingName(b))}}})}
let STG={};try{STG=JSON.parse(localStorage.getItem("hq-stg")||"{}")}catch(e){}
const stgOpen=(b,st)=>{const v=STG[b.id+":"+st];return v===undefined?st===b.status:v};
const setStgOpen=(b,st,v)=>{STG[b.id+":"+st]=v;try{localStorage.setItem("hq-stg",JSON.stringify(STG))}catch(e){}};
function taskSheet(bid,st,k,back){navSheet("t:"+bid+":"+k,()=>taskSheet(bid,st,k,back));const b=S.bookings.find(x=>x.id===bid);if(!b)return;const it=clFor(b,st).find(t=>t.key===k);if(!it){toast("That task was removed");return}
  const done=!!(b.tasks||{})[k],due=dueOf(b,it,st),def=it.due?"":due,o=offOf(it);
  sheet(`<div class="head"><div style="min-width:0"><span class="pill s-${K(st)}">${STAGE_L[st]}</span>${done?' <span class="pill s-paid">Done</span>':""}</div><button class="btn small" data-openb>Open booking</button></div>
  ${field("ts-l","Task",it.label,"text")}
  <div class="f"><label>Event</label><div><b>${esc(bookingName(b))}</b>${b.date?` · show ${esc(fmtD(b.date))}`:""}</div></div>
  <div class="f"><label for="ts-d">Due date</label><input type="date" id="ts-d" value="${esc(due)}">
    <span class="note">${it.due?`Set by you.${o!=null?` <button type="button" class="btn small" data-reset style="margin-left:4px">Use default (${esc(offLabelFor(st,o)||"")})</button>`:""}`:o!=null?`Default: ${esc(offLabelFor(st,o)||"")} ${STAGE_BASE[st]==="stage"?"moving to "+STAGE_L[st]:"the show"}.`:"No default due date."}</span></div>
  <div class="f"><label for="ts-n">Notes</label><textarea id="ts-n" style="min-height:80px" placeholder="Details, links, who to contact…">${esc(it.notes||"")}</textarea></div>
  <div class="actions">${delBtn()}<button class="btn" data-done>${done?"Mark not done":"Mark done"}</button><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`,root=>{
    const $r=q=>root.querySelector(q),ret=()=>back?back():close();
    $r("[data-cancel]").onclick=ret;$r("[data-openb]").onclick=()=>bookingView(b.id);
    const rs=$r("[data-reset]");let reset=false;if(rs)rs.onclick=()=>{reset=true;const dd=$r("#ts-d");dd.value=addDays(STAGE_BASE[st]==="stage"?stageDate(b,st):b.date||today(),o);rs.textContent="Default will be used"};
    $r("[data-done]").onclick=async()=>{await toggleTask(b.id,k,!done);ret()};
    armDelete(root,async()=>{const cur=S.bookings.find(x=>x.id===bid)||b,list=clFor(cur,st),idx=list.findIndex(t=>t.key===k),removed=list[idx],wasDone=!!(cur.tasks||{})[k];
      if(await patch("bookings",cur.id,{...clPatch(cur,st,list.filter(t=>t.key!==k)),tasks:{[k]:false}})){ret();
        toast("Task removed",async()=>{const c2=S.bookings.find(x=>x.id===bid)||cur,l2=[...clFor(c2,st)];l2.splice(Math.min(idx,l2.length),0,removed);await patch("bookings",c2.id,{...clPatch(c2,st,l2),tasks:{[k]:!!wasDone}});toast("Task restored")})}});
    $r("[data-save]").onclick=async()=>{const cur=S.bookings.find(x=>x.id===bid)||b,l=$r("#ts-l").value.trim();if(!l){toast("Name the task");return}
      const dv=$r("#ts-d").value,nit={...it,label:l,notes:$r("#ts-n").value.trim()};
      if(reset)delete nit.due;else if(!dv)nit.due="none";else if(dv!==def||it.due)nit.due=dv;
      if(await patch("bookings",cur.id,{...clPatch(cur,st,clFor(cur,st).map(t=>t.key===k?nit:t))})){toast("Task saved");ret()}}})}
function renderHome(){const wl=document.getElementById("welcome");if(wl)wl.hidden=!!((S.profile||{}).djName||(S.profile||{}).myName)&&S.bookings.length>0;
  const nx=upcoming().find(b=>K(b.status)==="confirmed");
  if(nx){const days=Math.round((parseD(nx.date)-parseD(today()))/864e5);
    $("#nextShow").innerHTML=`${svgWave()}<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;position:relative">
      <div style="min-width:0"><div class="eyebrow">Next show</div><h3>${esc(nx.title||contactName(nx.venueId)||"Untitled show")}</h3>
      <div class="meta">${esc(fmtD(nx.date))}${nx.city?" · "+esc(nx.city):""}${nx.fee?" · "+money(nx.fee):""}</div>
      ${bAddr(nx)?`<div>${addrLink(bAddr(nx))}</div>`:""}
      <button class="btn small" style="margin-top:12px" data-open-booking="${nx.id}">Open booking</button></div>
      <div style="text-align:right;flex:none"><div class="count num">${days}</div><div class="eyebrow">${days===1?"day":"days"} out</div></div></div>`;
  }else $("#nextShow").innerHTML=`${svgWave()}<div style="position:relative"><div class="eyebrow">Next show</div><h3>Nothing confirmed yet</h3><div class="meta">Add a booking and mark it Confirmed to see it here.</div><button class="btn small" style="margin-top:12px" data-new="booking">+ New booking</button></div>`;

  const yb=S.bookings.filter(inYear);
  const played=yb.filter(b=>["played","paid"].includes(K(b.status))).length;
  const conf=yb.filter(b=>K(b.status)==="confirmed").length;
  const gS=Number(S.profile.goalShows)||0, gM=Number(S.profile.goalIncome)||0;
  const paid=yb.filter(b=>K(b.status)==="paid").reduce((s,b)=>s+(+b.fee||0),0);
  const owed=yb.filter(b=>["confirmed","played"].includes(K(b.status))).reduce((s,b)=>s+(+b.fee||0),0);
  const pct=(v,g)=>g?Math.min(100,v/g*100):0;
  $("#goalShows").innerHTML=`<div class="eyebrow">Shows goal · ${year()}</div>
    <div class="lbl"><span><b class="num">${played}</b> played <span class="note">+ ${conf} ${esc(kindName("confirmed").toLowerCase())}</span></span><span class="num">${gS?"of "+gS:"no goal set"}</span></div>
    <div class="bar"><i class="ghost" style="width:${pct(played+conf,gS)}%"></i><i style="width:${pct(played,gS)}%"></i></div>
    ${gS?"":`<button class="btn small" data-edit-profile style="align-self:flex-start">Set goals</button>`}`;
  $("#goalMoney").innerHTML=`<div class="eyebrow">Income goal · ${year()}</div>
    <div class="lbl"><span><b class="num">${money(paid)}</b> paid <span class="note">+ ${money(owed)} booked</span></span><span class="num">${gM?"of "+money(gM):"no goal set"}</span></div>
    <div class="bar"><i class="ghost" style="width:${pct(paid+owed,gM)}%"></i><i style="width:${pct(paid,gM)}%"></i></div>
    ${gM?"":`<button class="btn small" data-edit-profile style="align-self:flex-start">Set goals</button>`}`;

  const todos=allTasks().filter(t=>!t.done).sort((x,y)=>(x.due||"9999").localeCompare(y.due||"9999"));
  $("#todoCount").textContent=todos.length?`${todos.length} open${todos.filter(t=>dueState(t.due,false)==="late").length?" · "+todos.filter(t=>dueState(t.due,false)==="late").length+" overdue":""}`:"";
  $("#todos").innerHTML=todos.length?todos.map(taskRow).join(""):`<div class="empty">All caught up. Tasks show up here as bookings move through each stage.</div>`;

  $("#pipeline").innerHTML=STATUSES.filter(s=>K(s[0])!=="lost").map(([k,l])=>`<button class="stat chip" style="border-radius:12px;text-align:left;padding:10px 12px;color:var(--ink)" data-filter-go="${k}"><span class="eyebrow s-${K(k)}">${l}</span><b class="num">${S.bookings.filter(b=>b.status===k).length}</b></button>`).join("");

  $("#playedYear").textContent=year();
  const vc={};yb.filter(b=>["played","paid"].includes(K(b.status))).forEach(b=>{const n=contactName(b.venueId)||b.title||"Unnamed";vc[n]=vc[n]||{n:0,$:0};vc[n].n++;vc[n].$+=(+b.fee||0)});
  const vs=Object.entries(vc).sort((a,b)=>b[1].n-a[1].n).slice(0,6);
  $("#venues").innerHTML=vs.length?vs.map(([n,v])=>`<div class="row" style="cursor:default"><span class="main t">${esc(n)}</span><span class="num note">${v.n} show${v.n>1?"s":""}</span><span class="num" style="width:80px;text-align:right">${money(v.$)}</span></div>`).join(""):`<div class="empty">Shows you mark Played or Paid show up here.</div>`;
}

function bookingRow(b){const d=parseD(b.date);
  return `<button class="row" data-open-booking="${b.id}"><span class="date">${d?`<b>${d.getDate()}</b><i>${d.toLocaleDateString("en-US",{month:"short"})}</i>`:"<i>TBD</i>"}</span>
  <span class="main"><span class="t" style="display:block">${esc(b.title||contactName(b.venueId)||"Untitled")}</span><span class="sub" style="display:block">${esc([contactName(b.venueId),b.city].filter(Boolean).join(" · ")||"No venue yet")}</span></span>
  <span style="display:flex;flex-direction:column;align-items:flex-end;gap:4px"><span class="pill s-${K(b.status)}">${esc((STATUSES.find(s=>s[0]===b.status)||[])[1]||b.status)}</span>${b.fee?`<span class="num note">${money(b.fee)}</span>`:""}</span></button>`}
function renderBookings(){
  const F=[["active","Active"],["upcoming","Upcoming"],...STATUSES,["all","All"]];
  $("#bookingFilter").innerHTML=F.map(([k,l])=>`<button class="chip" aria-pressed="${bFilter===k}" data-bf="${k}"${k==="all"?' style="margin-left:auto"':""}>${l}</button>`).join("");
  let L=sortedBookings();
  if(bFilter==="active")L=L.filter(b=>!["paid","lost"].includes(K(b.status)));
  else if(bFilter==="upcoming")L=L.filter(b=>b.date>=today()&&K(b.status)!=="lost");
  else if(bFilter!=="all")L=L.filter(b=>b.status===bFilter);
  $("#bookingList").innerHTML=L.length?L.map(bookingRow).join(""):`<div class="empty">No bookings here yet. Tap “New booking” to log a lead, a pitch, or a confirmed show.</div>`;
}
function renderContacts(){
  $("#contactFilter").innerHTML=[["all","All"],...CTYPES].map(([k,l])=>`<button class="chip" aria-pressed="${cFilter===k}" data-cf="${k}">${l}</button>`).join("");
  const L=S.contacts.filter(c=>cFilter==="all"||c.type===cFilter).sort((a,b)=>cName(a).localeCompare(cName(b)));
  $("#contactList").innerHTML=L.length?L.map(c=>`<div class="row" style="cursor:default;flex-wrap:wrap;row-gap:4px"><button class="row" style="padding:0;border:0;flex:1;min-width:0" data-open-contact="${c.id}"><span class="main"><span class="t" style="display:block">${esc(cName(c))}</span><span class="sub" style="display:block">${esc(cSub(c)||c.email||"")}</span></span><span class="pill" style="color:var(--muted)">${esc(c.type==="venue"&&c.vkind==="festival"?"Festival":c.type==="promoter"&&c.pkind==="collective"?"Collective":(CTYPES.find(t=>t[0]===c.type)||[,"Other"])[1].split(" /")[0])}</span></button><button class="btn small" data-reach="${c.id}" aria-label="Contact ${esc(cName(c))}">Contact</button>${c.address?`<div style="flex-basis:100%;font-size:13px">${addrLink(c.address)}</div>`:""}</div>`).join("")
   :`<div class="empty">Add the venues, promoters and media people you work with. Once they're here, picking one on a booking fills in their details.</div>`;
}
/* ---------- financials ---------- */
const bookingName=b=>b.title||contactName(b.venueId)||"Show";
const payerName=b=>{const v=contact(b.promoterId)||contact(b.venueId);return v?(v.org||v.name):(b.title||"Unnamed payer")};
const recvDate=b=>b.paidDate||b.date||"";
const inR=(d,R)=>!!d&&d>=R.from&&d<=R.to;
function finTx(R){const tx=[];
  S.bookings.forEach(b=>{if(!(+b.fee))return;
    if(K(b.status)==="paid"&&inR(recvDate(b),R))tx.push({kind:"income",received:true,date:recvDate(b),amount:+b.fee,title:bookingName(b),cat:catOf(ICATS,bookingIncType(b))[1],line:catOf(ICATS,bookingIncType(b))[2]||"Line 1 Gross receipts",payer:payerName(b),ref:{booking:b.id},pm:b.payMethod||"",pref:b.payRef||"",note:b.date&&b.paidDate&&b.paidDate!==b.date?"Show on "+fmtD(b.date):""});
    else if(["confirmed","played"].includes(K(b.status))&&inR(b.date,R))tx.push({kind:"income",received:false,date:b.date,amount:+b.fee,title:bookingName(b),cat:catOf(ICATS,bookingIncType(b))[1],line:catOf(ICATS,bookingIncType(b))[2]||"Line 1 Gross receipts",payer:payerName(b),ref:{booking:b.id},note:"Not paid yet"})});
  S.income.forEach(i=>{if(inR(i.date,R))tx.push({kind:"income",received:true,date:i.date,amount:+i.amount||0,title:i.desc||incCatLabel(i),cat:incCatLabel(i),payer:cName(contact(i.sourceId))||i.source||"",line:catOf(ICATS,i.category)[2]||"Line 1 Gross receipts",ref:{income:i.id},pm:i.payMethod||"",pref:i.payRef||"",note:i.notes||""})});
  S.expenses.forEach(e=>{if(inR(e.date,R)){const bk=e.bookingId&&S.bookings.find(b=>b.id===e.bookingId);
    tx.push({kind:"expense",date:e.date,amount:+e.amount||0,title:e.desc||expCatLabel(e),cat:expCatLabel(e),catKey:e.category||"Other",line:catOf(ECATS,e.category)[2],purpose:e.purpose||"",show:bk?bookingName(bk):"",pm:e.payMethod||"",pref:e.payRef||"",ref:{expense:e.id}})}});
  return tx.sort((a,b)=>(b.date||"").localeCompare(a.date||""))}
function finYears(){const ys=new Set([new Date().getFullYear()]);[...S.bookings.map(b=>K(b.status)==="paid"?recvDate(b):b.date),...S.expenses.map(e=>e.date),...S.income.map(i=>i.date)].forEach(d=>{const y=parseInt(d);if(y>2000)ys.add(y)});return [...ys].sort((a,b)=>b-a)}
/* date range: presets or custom */
function finRange(){const n=new Date(),Y=n.getFullYear(),M=n.getMonth(),q=Math.floor(M/3),p=FP.preset;
  const r=(a,b,label)=>({from:ymd(a),to:ymd(b),label,year:null});
  if(p.startsWith("year:")){const y=+p.slice(5);return {from:y+"-01-01",to:y+"-12-31",label:String(y),year:y}}
  if(p==="ytd")return r(new Date(Y,0,1),n,"Year to date");
  if(p==="qthis")return r(new Date(Y,q*3,1),new Date(Y,q*3+3,0),`Q${q+1} ${Y}`);
  if(p==="qlast"){const d=new Date(Y,q*3-3,1);return r(d,new Date(d.getFullYear(),d.getMonth()+3,0),`Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`)}
  if(p==="mthis")return r(new Date(Y,M,1),new Date(Y,M+1,0),n.toLocaleDateString("en-US",{month:"long",year:"numeric"}));
  if(p==="mlast"){const d=new Date(Y,M-1,1);return r(d,new Date(Y,M,0),d.toLocaleDateString("en-US",{month:"long",year:"numeric"}))}
  if(p==="l12")return r(new Date(Y,M-11,1),new Date(Y,M+1,0),"Last 12 months");
  const f=FP.from||ymd(new Date(Y,0,1)),t=FP.to||ymd(n);const a=f<=t?f:t,b=f<=t?t:f;
  const sd=d=>parseD(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  return {from:a,to:b,label:`${sd(a)} – ${sd(b)}`,year:null}}
function periodHtml(prefix){const yrs=finYears(),o=(v,l)=>`<option value="${v}" ${FP.preset===v?"selected":""}>${l}</option>`;
  return `<select id="${prefix}-pre" aria-label="Date range">${yrs.map(y=>o("year:"+y,String(y))).join("")}${o("ytd","Year to date")}${o("qthis","This quarter")}${o("qlast","Last quarter")}${o("mthis","This month")}${o("mlast","Last month")}${o("l12","Last 12 months")}${o("custom","Custom dates…")}</select>
  ${FP.preset==="custom"?`<input type="date" id="${prefix}-from" value="${esc(finRange().from)}" aria-label="From"><span class="to">to</span><input type="date" id="${prefix}-to" value="${esc(finRange().to)}" aria-label="To">`:""}`}
function wirePeriod(root,prefix,after){const sel=root.querySelector("#"+prefix+"-pre");
  sel.onchange=()=>{FP.preset=sel.value;if(sel.value==="custom"&&!FP.from){const R=finRange();FP.from=R.from;FP.to=R.to}saveFP();after()};
  ["from","to"].forEach(k=>{const i=root.querySelector(`#${prefix}-${k}`);if(i)i.onchange=()=>{if(i.value){FP[k]=i.value;saveFP();after()}}})}
function saveFP(){try{localStorage.setItem("hq-fin",JSON.stringify(FP))}catch(e){}}
function renderMoney(){
  const R=finRange(),tx=finTx(R);
  const fp=$("#finPeriod"),active=document.activeElement&&fp.contains(document.activeElement)?document.activeElement.id:null;
  fp.innerHTML=periodHtml("fp");wirePeriod(fp,"fp",renderMoney);if(active){const el=$("#"+active);el&&el.focus()}
  const recv=tx.filter(t=>t.kind==="income"&&t.received).reduce((s,t)=>s+t.amount,0);
  const owed=tx.filter(t=>t.kind==="income"&&!t.received).reduce((s,t)=>s+t.amount,0);
  const exp=tx.filter(t=>t.kind==="expense").reduce((s,t)=>s+t.amount,0);
  const cnt=k=>tx.filter(t=>k==="received"?t.kind==="income"&&t.received:k==="owed"?t.kind==="income"&&!t.received:k==="expense"?t.kind==="expense":true).length;
  $("#moneyStats").innerHTML=[["received","Income received",recv,"var(--ok)"],["owed","Still owed",owed,"var(--warn)"],["expense","Expenses",exp,"var(--hot)"],["all","Net",recv-exp,"var(--ink)"]].map(([k,l,v,c])=>
    `<button class="card stat stat-tile" data-tx="${k}" aria-pressed="${txFilter===k}"><span class="eyebrow">${l} · ${esc(R.label)}</span><b class="num" style="color:${c}">${money(v)}</b><span class="hint">${cnt(k)} ${k==="all"?(cnt(k)===1?"transaction":"transactions"):(cnt(k)===1?"item":"items")} · ${txFilter===k?"showing below":"tap to view"}</span></button>`).join("");
  // monthly chart across the range (up to 24 months)
  const months=[];{const a=parseD(R.from),z=parseD(R.to);let d=new Date(a.getFullYear(),a.getMonth(),1);while(d<=z&&months.length<36){months.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));d=new Date(d.getFullYear(),d.getMonth()+1,1)}}
  const ms=months.slice(-24),mi={},mo={};ms.forEach(m=>{mi[m]=0;mo[m]=0});
  tx.forEach(t=>{const m=(t.date||"").slice(0,7);if(!(m in mi))return;if(t.kind==="expense")mo[m]+=t.amount;else if(t.received)mi[m]+=t.amount});
  const mx=Math.max(1,...ms.map(m=>Math.max(mi[m],mo[m])));
  $("#chart").innerHTML=ms.map(m=>`<div class="m" title="${esc(parseD(m+"-01").toLocaleDateString("en-US",{month:"short",year:"numeric"}))}: ${money(mi[m])} received, ${money(mo[m])} spent"><span class="in" style="height:${mi[m]/mx*100}%"></span><span class="out" style="height:${mo[m]/mx*100}%"></span></div>`).join("");
  $("#months").innerHTML=ms.map(m=>`<span>${"JFMAMJJASOND"[+m.slice(5)-1]}</span>`).join("");
  document.querySelectorAll("#txFilter button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.tx===txFilter));
  const titles={all:"Transactions",received:"Income received",owed:"Still owed",expense:"Expenses"};
  const L=tx.filter(t=>txFilter==="all"||(txFilter==="received"&&t.kind==="income"&&t.received)||(txFilter==="owed"&&t.kind==="income"&&!t.received)||(txFilter==="expense"&&t.kind==="expense"));
  const tot=L.reduce((s,t)=>s+(t.kind==="expense"?-t.amount:t.amount),0);
  $("#txTitle").innerHTML=`${titles[txFilter]} <span class="note num" style="font-family:var(--mono);font-weight:400">${L.length?(txFilter==="all"?"net ":"")+(tot<0?"−":"")+money(Math.abs(tot)):""}</span>`;
  $("#txList").innerHTML=L.length?L.map(t=>{const open=t.ref.booking?`data-open-booking="${t.ref.booking}"`:t.ref.income?`data-open-income="${t.ref.income}"`:`data-open-expense="${t.ref.expense}"`;
    const sub=t.kind==="expense"?[t.cat,fmtD(t.date),t.show].filter(Boolean):[t.cat,t.payer,fmtD(t.date)].filter(Boolean);
    const pill=t.kind==="expense"?`<span class="pill" style="color:var(--hot)">Expense</span>`:t.received?`<span class="pill s-paid">Received</span>`:`<span class="pill s-pitched">Owed</span>`;
    return `<button class="row" ${open}><span class="main"><span class="t" style="display:block">${esc(t.title)}</span><span class="sub" style="display:block">${esc(sub.join(" · "))}${t.pm||t.pref?" ":""}${pmTag(t.pm,t.pref)}</span></span>${pill}<span class="num" style="width:84px;text-align:right;color:${t.kind==="expense"?"var(--hot)":"inherit"}">${t.kind==="expense"?"−":""}${money(t.amount)}</span></button>`}).join("")
    :`<div class="empty">${{all:"Nothing in "+R.label+". Booked show fees land here automatically; log expenses and other income with the buttons above.",received:"No income received in "+R.label+". Mark a booking Paid, or log tips, merch or other income.",owed:"Nothing owed for shows in "+R.label+". Confirmed and played shows that aren't marked Paid show up here.",expense:"No expenses logged in "+R.label+"."}[txFilter]}</div>`;
}
function taxData(R){const y=R.label,tx=finTx(R),inc=tx.filter(t=>t.kind==="income"&&t.received),owed=tx.filter(t=>t.kind==="income"&&!t.received),ex=tx.filter(t=>t.kind==="expense");
  const byPayer={};inc.forEach(t=>{const k=t.payer||"Unlisted";byPayer[k]=byPayer[k]||{n:0,amt:0};byPayer[k].n++;byPayer[k].amt+=t.amount});
  const byInc={};inc.forEach(t=>{const k=t.cat;byInc[k]=byInc[k]||{amt:0,line:t.line||"Line 1 Gross receipts"};byInc[k].amt+=t.amount});
  const byCat=ECATS.map(([k,l,line])=>{const items=ex.filter(t=>t.catKey===k);return {k,l,line,amt:items.reduce((s,t)=>s+t.amount,0),n:items.length}}).filter(c=>c.n);
  const others=ex.filter(t=>t.catKey==="Other");
  const gross=inc.reduce((s,t)=>s+t.amount,0),total=ex.reduce((s,t)=>s+t.amount,0),meals=ex.filter(t=>t.catKey==="Meals").reduce((s,t)=>s+t.amount,0);
  const gaps=[...ex.filter(t=>!t.purpose).map(t=>`${t.title} (${fmtD(t.date)}): no business purpose noted`)];
  return {y,R,tx,inc,owed,ex,byPayer:Object.entries(byPayer).sort((a,b)=>b[1].amt-a[1].amt),byInc:Object.entries(byInc).sort((a,b)=>b[1].amt-a[1].amt),byCat,others,gross,total,meals,mealsAdj:meals/2,net:gross-total,netAdj:gross-(total-meals/2),gaps,owedAmt:owed.reduce((s,t)=>s+t.amount,0)}}
function taxBody(d){const p=S.profile;
  const T=(head,rows,foot)=>`<div class="tw"><table><thead><tr>${head.map((h,i)=>`<th class="${i===head.length-1?"r":""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody>${foot?`<tfoot>${foot}</tfoot>`:""}</table></div>`;
  return `<div><div class="eyebrow">${d.R.year?"Tax year "+d.R.year:"Period: "+esc(d.R.label)} · self-employment summary</div><h3 style="font-size:22px;margin-top:4px">${esc(p.myName||"")}${p.djName?" · "+esc(p.djName):""}</h3><div class="note">Generated ${esc(fmtD(today()))} from Set &amp; Settled. Covers ${esc(fmtD(d.R.from))} to ${esc(fmtD(d.R.to))}. Cash basis: income counts on the day you were paid.</div></div>
  <div class="stats">${[["Gross receipts",d.gross],["Total expenses",d.total],["Net profit",d.net]].map(([l,v])=>`<div class="stat"><span class="eyebrow">${l}</span><b class="num" style="font-size:22px">${money(v)}</b></div>`).join("")}</div>
  ${d.meals?`<div class="note">Meals are usually only 50% deductible: counting ${money(d.mealsAdj)} of ${money(d.meals)} gives a net of <b class="num">${money(d.netAdj)}</b>.</div>`:""}
  <div><h3 style="font-size:16px;margin-bottom:6px">Income by payer</h3>${d.byPayer.length?T(["Payer","Payments","Amount"],d.byPayer.map(([n,v])=>`<tr><td>${esc(n)}${d.R.year&&v.amt>=(d.R.year>=2026?2000:600)?` <span class="pill" style="color:var(--warn)">may send 1099</span>`:""}</td><td class="r">${v.n}</td><td class="r">${money(v.amt)}</td></tr>`),`<tr class="tot"><td>Total</td><td></td><td class="r">${money(d.gross)}</td></tr>`):`<div class="note">No income received in ${d.y}.</div>`}</div>
  ${d.byInc.length?`<div><h3 style="font-size:16px;margin-bottom:6px">Income by type</h3>${T(["Type","Usual Schedule C line","Amount"],d.byInc.map(([n,v])=>`<tr><td>${esc(n)}</td><td>${esc(v.line)}</td><td class="r">${money(v.amt)}</td></tr>`))}</div>`:""}
  <div><h3 style="font-size:16px;margin-bottom:6px">Expenses by category</h3>${d.byCat.length?T(["Category","Usual Schedule C line","Amount"],d.byCat.map(c=>`<tr><td>${esc(c.l)} <span class="note">(${c.n})</span></td><td>${esc(c.line)}</td><td class="r">${money(c.amt)}</td></tr>`),`<tr class="tot"><td>Total</td><td></td><td class="r">${money(d.total)}</td></tr>`):`<div class="note">No expenses logged in ${d.y}.</div>`}
    ${d.others.length?`<div class="note" style="margin-top:6px">“Other” includes: ${d.others.map(t=>esc(t.cat)+" "+money(t.amount)).join(", ")}</div>`:""}</div>
  ${d.owed.length?`<div><h3 style="font-size:16px;margin-bottom:6px">Not yet paid (not counted above)</h3>${T(["Show","Date","Amount"],d.owed.map(t=>`<tr><td>${esc(t.title)}</td><td>${esc(fmtD(t.date))}</td><td class="r">${money(t.amount)}</td></tr>`))}</div>`:""}
  ${d.gaps.length?`<div class="warn"><b>Worth filling in before you file:</b><br>${d.gaps.slice(0,8).map(esc).join("<br>")}${d.gaps.length>8?`<br>+ ${d.gaps.length-8} more`:""}</div>`:""}
  <div class="note">This summary organizes your records; it isn't tax advice. Line numbers refer to the federal IRS Schedule C. California starts from those same federal figures on Form 540 and adjusts some items on Schedule CA, so confirm the details with your tax preparer. Mileage isn't tracked here: if you drive to gigs, keep a mileage log too.</div>`}
function taxSheet(){const R=finRange(),d=taxData(R),slug=R.year?String(R.year):`${R.from}_to_${R.to}`;
  sheet(`<div class="head"><h3>Tax report</h3><div class="period" id="tp">${periodHtml("tp")}</div></div>
  ${R.year?"":`<p class="note" style="margin:0">Custom range. For filing, a full calendar year is what you'll usually need; quarters are handy for estimated payments.</p>`}
  <div class="rpt">${taxBody(d)}</div>
  <div class="actions"><button class="btn" data-close>Close</button><button class="btn" data-csv>Download CSV</button><button class="btn primary" data-html>Download report</button></div>
  <p class="note" style="margin:0;text-align:right">The CSV opens in Excel or Google Sheets. The report opens in any browser, where you can print it or save it as a PDF.</p>`,root=>{
    root.querySelector("[data-close]").onclick=close;
    wirePeriod(root,"tp",()=>{renderMoney();taxSheet()});
    root.querySelector("[data-csv]").onclick=()=>dl(`set-and-settled-${slug}-transactions.csv`,taxCsv(d));
    root.querySelector("[data-html]").onclick=()=>dl(`set-and-settled-${slug}-tax-summary.html`,taxHtml(d));
  })}
function csvCell(v){v=String(v??"");return /[",\n]/.test(v)?`"${v.replace(/"/g,'""')}"`:v}
function taxCsv(d){const rows=[["Date","Type","Status","Description","Category","Schedule C line","Payer / show","Paid via","Reference","Business purpose / notes","Amount"]];
  [...d.tx].sort((a,b)=>(a.date||"").localeCompare(b.date||"")).forEach(t=>rows.push([t.date,t.kind==="income"?"Income":"Expense",t.kind==="income"?(t.received?"Received":"Owed"):"Paid",t.title,t.cat,t.line||"Line 1 Gross receipts",t.kind==="income"?t.payer:t.show,pmName(t.pm),t.pref||"",t.kind==="income"?t.note:t.purpose,(t.kind==="expense"?-t.amount:t.amount).toFixed(2)]));
  return rows.map(r=>r.map(csvCell).join(",")).join("\r\n")}
function taxHtml(d){return `<!doctype html><html><head><meta charset="utf-8"><title>Tax summary ${esc(d.R.label)}</title><style>
  body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1A2A1E;background:#fff;max-width:760px;margin:32px auto;padding:0 20px;line-height:1.45}
  .eyebrow,th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:#5F6E61}h3{margin:0}.note{color:#5F6E61;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:14px}td,th{padding:6px 4px;border-bottom:1px solid #DCE3D3;text-align:left}.r{text-align:right;font-variant-numeric:tabular-nums}
  .tot td{font-weight:700;border-bottom:0}.stats{display:flex;gap:28px;flex-wrap:wrap}.stat{display:flex;flex-direction:column}.pill{font-size:11px;border:1px solid #B7791F;color:#B7791F;border-radius:99px;padding:1px 6px}
  .warn{background:#FBF3E4;border:1px solid #E9CF9F;border-radius:8px;padding:10px 12px;font-size:14px}body>div{margin-bottom:22px}b.num{font-size:22px}
  </style></head><body>${taxBody(d)}</body></html>`}
async function dl(filename,data){const d=await claude.use("downloads");if(!d){toast("Downloads aren't available right now");return}
  try{await d.save({filename,data});toast("Saved")}catch(e){if(e&&e.code==="declined")return;toast(e&&e.code==="rate_limited"?"Finish the open download prompt first":"Couldn't save the file")}}
/* ---------- payment safety: usernames only, never bank or card numbers ---------- */
const luhnOk=d=>{let t=0,alt=false;for(let i=d.length-1;i>=0;i--){let n=+d[i];if(alt){n*=2;if(n>9)n-=9}t+=n;alt=!alt}return t%10===0};
const abaOk=d=>d.length===9&&(3*(+d[0]+ +d[3]+ +d[6])+7*(+d[1]+ +d[4]+ +d[7])+(+d[2]+ +d[5]+ +d[8]))%10===0;
/* Returns what it found ("a card number", "bank account details"…) or "". mode "ref" is lighter: transaction ids are long numbers too. */
function finProblem(v,mode){const s2=String(v||"");if(!s2.trim())return "";
  const runs=(s2.match(/\d[\d \-]{5,}\d/g)||[]).map(x=>x.replace(/\D/g,""));
  if(/\b(cvv|cvc|cvv2|security code|exp(iry|iration)?( date)?)\b/i.test(s2)&&/\d{3}/.test(s2))return "card details";
  if(/\b(routing|aba|account\s*(no|num|number|#)|acct|iban|swift|bic|sort\s*code|bank\s*account|checking\s*(account|acct)|savings\s*(account|acct))\b/i.test(s2)&&runs.some(d=>d.length>=6))return "bank account details";
  if(/\b(card\s*(no|num|number|#)|credit\s*card|debit\s*card|visa|mastercard|amex)\b/i.test(s2)&&runs.some(d=>d.length>=12))return "a card number";
  if(mode==="ref"){if(/\b\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{1,7}\b/.test(s2)&&runs.some(d=>d.length>=13&&d.length<=19&&luhnOk(d)))return "a card number";return ""}
  if(runs.some(d=>d.length>=13&&d.length<=19&&/^[2-6]/.test(d)&&luhnOk(d)))return "a card number";
  if(runs.some(abaOk)&&runs.some(d=>d.length>=6&&d.length<=17&&!abaOk(d)))return "bank account details";
  if(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/.test(s2))return "an IBAN";
  return ""}
const finMsg=what=>`Looks like ${what}. You can use it on what you're sending now, but the app won't save it: the numbers are removed when you save (it keeps the last 4 so you know which account).`;
function finMark(el){const p=finProblem(el.value,el.dataset.fincheck);let n=el.parentElement.querySelector(":scope > .finwarn");
  if(p){if(!n){n=document.createElement("div");n.className="warn finwarn";n.setAttribute("role","alert");el.insertAdjacentElement("afterend",n)}n.textContent=finMsg(p)}else if(n)n.remove();return p}
document.addEventListener("input",e=>{const el=e.target.closest&&e.target.closest("[data-fincheck]");if(el)finMark(el)});
/* Nothing with bank or card numbers is ever written to the app's storage: save() and patch() scrub every text value first.
   What the person typed stays in the open form, so the invoice or email they're making right now still has it. */
function redactFin(v,mode){if(typeof v!=="string"||!finProblem(v,mode))return v;
  let out=v.replace(/\b(cvv2?|cvc|security code)\b(\s*[:#]?\s*)\d{3,4}/gi,"$1$2•••").replace(/\b(exp(?:iry|iration)?(?: date)?)(\s*[:#]?\s*)\d{1,2}\s*\/\s*\d{2,4}/gi,"$1$2••/••")
    .replace(/\d[\d \-]{4,}\d/g,m=>{const d=m.replace(/\D/g,"");return d.length>=6?"••••"+d.slice(-4):m});
  out=out.replace(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9•]{4}){3,7}(?:[ ]?[A-Z0-9•]{1,3})?\b/g,m=>"••••"+m.replace(/\s/g,"").slice(-4));
  return out}
let FIN_SCRUBBED=false;
function scrubFin(x,key){if(typeof x==="string"){if(/^https?:\/\//i.test(x)||/(id|ids|url|key)$/i.test(key||""))return x;const r=redactFin(x,/ref$/i.test(key||"")?"ref":undefined);if(r!==x)FIN_SCRUBBED=true;return r}
  if(Array.isArray(x))return x.map(v=>scrubFin(v,key));if(x&&typeof x==="object"){const o={};for(const k in x)o[k]=scrubFin(x[k],k);return o}return x}
function finSavedNote(){if(!FIN_SCRUBBED)return;FIN_SCRUBBED=false;setTimeout(()=>toast("Saved without the bank or card numbers"),1800)}
/* ---------- payment usernames ---------- */
const PH_DEF=[["venmo","Venmo","@username"],["cashapp","Cash App","$cashtag"],["paypal","PayPal","paypal.me/name or email"],["zelle","Zelle","Email or US mobile number"]];
const PH=()=>S.payh||{};
function phClean(k,v){v=String(v||"").trim();if(!v)return {v:""};
  if(k==="venmo"){const u=v.replace(/^https?:\/\/(www\.)?venmo\.com\/(u\/)?/i,"").replace(/^@/,"");return /^[A-Za-z0-9_-]{5,30}$/.test(u)?{v:"@"+u}:{err:"Venmo usernames are 5–30 letters, numbers, - or _ (like @your-name)."}}
  if(k==="cashapp"){const u=v.replace(/^https?:\/\/(www\.)?cash\.app\//i,"").replace(/^\$/,"");return /^[A-Za-z][A-Za-z0-9_-]{0,19}$/.test(u)?{v:"$"+u}:{err:"A $cashtag starts with a letter and is up to 20 characters."}}
  if(k==="paypal"){const m=v.match(/^(?:https?:\/\/)?(?:www\.)?paypal\.me\/([A-Za-z0-9]{1,20})\/?$/i);if(m)return {v:"paypal.me/"+m[1]};return isMail(v.toLowerCase())?{v:v.toLowerCase()}:{err:"Use your paypal.me link or the email on your PayPal account."}}
  if(k==="zelle"){if(isMail(v.toLowerCase()))return {v:v.toLowerCase()};const d=v.replace(/\D/g,"").replace(/^1(?=\d{10}$)/,"");return d.length===10?{v:`(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`}:{err:"Zelle uses the email or US mobile number on your account."}}
  if(k==="other"){if(v.length>140)return {err:"Keep it under 140 characters."};return {v}}
  return {v}}
/* "Venmo: @x · Zelle: …" for the chosen methods (all of them when none are chosen). */
function handlesText(methods,sep){const h=PH(),ms=(methods||[]).filter(m=>PH_DEF.some(([k])=>k===m));
  const keys=ms.length?ms:PH_DEF.map(([k])=>k);const out=keys.filter(k=>h[k]).map(k=>`${(PH_DEF.find(x=>x[0]===k)||[])[1]}: ${h[k]}`);
  if(h.other&&!ms.length)out.push(h.other);return out.join(sep||"\n")}
function renderPay(){const el=$("#payList");if(!el)return;const h=PH(),rows=PH_DEF.filter(([k])=>h[k]).map(([k,l])=>`<div class="row" style="cursor:default"><span class="main"><span class="t" style="display:block">${esc(l)}</span><span class="sub num" style="display:block">${esc(h[k])}</span></span><button class="btn small" data-phcopy="${esc(h[k])}">Copy</button></div>`);
  if(h.other)rows.push(`<div class="row" style="cursor:default"><span class="main"><span class="t" style="display:block">Other</span><span class="sub" style="display:block">${esc(h.other)}</span></span></div>`);
  el.innerHTML=rows.length?rows.join(""):`<div class="empty">No payment usernames yet. Add your Venmo, Cash App, PayPal or Zelle so they show on invoices.</div>`;
  el.querySelectorAll("[data-phcopy]").forEach(x=>x.onclick=()=>copy(x.dataset.phcopy))}
function payForm(){const h=PH();
  sheet(`<h3>How you get paid</h3><p class="note" style="margin:0">Promoters see these on your invoices and in emails that use the payment-usernames fill-in.</p>
  <p class="note" style="margin:0">Bank account, routing and card numbers are never saved. If you type one, the app keeps only the last 4 digits.</p>
  ${PH_DEF.map(([k,l,ph])=>`<div class="f"><label for="ph-${k}">${l}</label><input id="ph-${k}" data-fincheck value="${esc(h[k]||"")}" placeholder="${esc(ph)}" autocomplete="off"></div>`).join("")}
  <div class="f"><label for="ph-other">Other (optional)</label><input id="ph-other" data-fincheck value="${esc(h.other||"")}" placeholder="e.g. Checks payable to Your Legal Name" maxlength="140"><span class="note">Apple Cash, checks or anything else.</span></div>
  <div class="actions"><button class="btn" data-close>Cancel</button><button class="btn primary" data-phsave>Save</button></div>`,root=>{
    root.querySelector("[data-close]").onclick=close;
    root.querySelector("[data-phsave]").onclick=async()=>{const next={};for(const [k] of [...PH_DEF,["other"]]){const el=root.querySelector("#ph-"+k),r=phClean(k,el.value);if(r.err){toast(r.err);el.focus();return}next[k]=r.v;el.value=r.v}
      if(await save("settings","payhandles",next)){S.payh=next;renderPay();close();toast("Payment usernames saved")}}})}
const PAYM=[["venmo","Venmo"],["zelle","Zelle"],["cash","Cash"],["ach","ACH / bank"],["paypal","PayPal"],["cashapp","Cash App"],["check","Check"],["card","Card"],["other","Other"]];
const pmName=k=>(PAYM.find(x=>x[0]===k)||[])[1]||"";
const pmTag=(m,ref)=>m||ref?`<span class="pm">${esc([pmName(m),ref?"#"+String(ref).replace(/^#/,""):""].filter(Boolean).join(" "))}</span>`:"";
function payHtml(px,label,m,ref){return `<div class="f"><label>${label}</label><div class="chips pmchips" id="${px}-pm">${PAYM.map(([k,l])=>`<button type="button" class="chip" data-pm="${k}" aria-pressed="${m===k}">${l}</button>`).join("")}</div>
  <input type="hidden" id="${px}-pmv" data-k="payMethod" value="${esc(m||"")}">
  <input id="${px}-ref" data-k="payRef" value="${esc(ref||"")}" data-fincheck="ref" placeholder="Transaction #, check #, or a note (optional)" style="margin-top:6px;border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:9px 11px;width:100%" aria-label="Payment reference"></div>`}
function wirePay(root,px){const box=root.querySelector("#"+px+"-pm"),hid=root.querySelector("#"+px+"-pmv");if(!box)return;
  box.querySelectorAll("[data-pm]").forEach(b=>b.onclick=()=>{const on=hid.value===b.dataset.pm;hid.value=on?"":b.dataset.pm;box.querySelectorAll("[data-pm]").forEach(x=>x.setAttribute("aria-pressed",!on&&x===b))})}
function incomeForm(i={}){const isNew=!i.id;
  sheet(`<h3>${isNew?"Log income":"Edit income"}</h3><p class="note" style="margin:0">For money not tied to a booking: tips, merch, streaming, a gig you didn't track here.</p>
  ${field("i-desc","Description",i.desc,"text",'data-k="desc" placeholder="e.g. Merch table at Saturday’s show"')}
  <div class="frow">${field("i-amt","Amount ($)",i.amount,"number",'data-k="amount" inputmode="decimal"')}${field("i-date","Date received",i.date||today(),"date",'data-k="date"')}</div>
  <div class="frow"><div class="f"><label for="i-cat">Type <button type="button" class="linkbtn" data-edittypes>Edit types</button></label>${typeSelect("i-cat","income",i.category||(ICATS[0]||[])[0])}${newTypeRow("i-cat")}</div>
  <div class="f"><label for="i-srcid">Paid by</label><select id="i-srcid" class="srch" data-k="sourceId"><option value="">Someone not in People</option><option value="__new__">＋ Add new contact…</option>${(()=>{const g=(l,f)=>{const c=S.contacts.filter(f).sort((a,b)=>cName(a).localeCompare(cName(b)));return c.length?`<optgroup label="${l}">${c.map(x=>`<option value="${x.id}" ${x.id===i.sourceId?"selected":""}>${esc(cName(x))}</option>`).join("")}</optgroup>`:""};
      return g("Promoters & collectives",x=>x.type==="promoter")+g("Venues & festivals",x=>x.type==="venue")+g("Media",x=>x.type==="media")+g("Other",x=>x.type==="other")})()}</select>
    <div id="i-srcWrap" ${i.sourceId?"hidden":""} style="margin-top:6px"><input id="i-src" data-k="source" value="${esc(i.source)}" placeholder="Their name (optional)" style="border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:9px 11px;width:100%"></div></div></div>
  <div id="i-otherWrap" ${i.category==="Other"?"":"hidden"}>${field("i-other","What was it for?",i.otherLabel,"text",'data-k="otherLabel" placeholder="Describe this income"')}</div>
  ${payHtml("i","How it was paid",i.payMethod,i.payRef)}
  <div class="f"><label for="i-notes">Notes</label><textarea id="i-notes" data-k="notes" style="min-height:60px">${esc(i.notes)}</textarea></div>
  <div class="actions">${isNew?"":delBtn()}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>${isNew?"Log it":"Save"}</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;armDelete(root,async()=>{await remove("income",i.id);close()});
    wirePay(root,"i");
    wireTypeSelect(root,"i-cat","income",v=>{root.querySelector("#i-otherWrap").hidden=v!=="Other"});
    root.querySelector("[data-edittypes]").onclick=()=>{const d={...i,...formVals(root)};typesSheet(()=>incomeForm(d))};
    const srcSel=root.querySelector("#i-srcid");let srcPrev=srcSel.value;
    srcSel.addEventListener("change",()=>{if(srcSel.value==="__new__"){srcSel.value=srcPrev;const d={...i,...formVals(root)};contactForm({type:"promoter"},{onSaved:id=>{incomeForm({...d,sourceId:id,source:""});toast("Added and picked")},onCancel:()=>incomeForm(d),back:"Back to income"});return}
      srcPrev=srcSel.value;root.querySelector("#i-srcWrap").hidden=!!srcSel.value});
    root.querySelector("[data-save]").onclick=async()=>{const v=formVals(root);if(!(v.amount>0)){toast("Enter an amount");return}
      if(v.category==="Other"&&!v.otherLabel){toast("Say what it was for");root.querySelector("#i-other").focus();return}
      if(v.category!=="Other")v.otherLabel="";if(v.sourceId)v.source="";
      if(await save("income",i.id,{...strip(i),...v})){close();toast(isNew?"Income logged":"Saved")}}});
}
function inlineRename(row,target,cur,onSave){if(row.querySelector(".cl-edit"))return;
  const inp=document.createElement("input");inp.className="cl-edit";inp.value=cur;inp.setAttribute("aria-label","Step name");
  inp.style.cssText="flex:1;min-width:0;border:1px solid var(--accent);background:var(--bg);border-radius:8px;padding:6px 9px;font:inherit";
  target.hidden=true;row.querySelectorAll("button.x").forEach(b=>b.hidden=true);target.after(inp);inp.focus();inp.select();let done=false;
  const finish=ok=>{if(done)return;done=true;const v=inp.value.trim();inp.remove();target.hidden=false;row.querySelectorAll("button.x").forEach(b=>b.hidden=false);if(ok&&v&&v!==cur)onSave(v)};
  inp.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();finish(true)}else if(e.key==="Escape"){e.preventDefault();e.stopPropagation();finish(false)}};inp.onblur=()=>finish(true)}
let setStage="confirmed";
async function saveDefCl(items){if(await save("settings","checklist",{items}))toast("Checklist updated")}
async function saveStage(st,items){if(st==="confirmed")return saveDefCl(items);const nd={...(S.stages||{}),[st]:items};if(await save("settings","stages",nd)){S.stages=nd;toast(STAGE_L[st]+" checklist updated")}}
function addDefCl(){const i=$("#defClNew"),l=i.value.trim();if(!l)return;i.value="";saveStage(setStage,[...stageDefaults(setStage),{key:newKey(),label:l,offset:STAGE_BASE[setStage]==="stage"?2:null}])}
$("#defClAdd").onclick=addDefCl;$("#defClNew").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();addDefCl()}};
/* profile picture */
function avatarHtml(){const p=S.profile;if(p.avatarId)return `<img src="${esc(__blob(p.avatarId))}" alt="">`;
  const n=(p.djName||p.myName||"S").replace(/[^A-Za-z]/g,"");return esc((n[0]||"S").toUpperCase())}
function renderAvatars(){["#topAvatar","#kitAvatar"].forEach(s=>{const el=$(s);if(el)el.innerHTML=avatarHtml()});
  document.querySelectorAll(".avatar img").forEach(img=>img.onerror=()=>{img.replaceWith(document.createTextNode("S"))})}
$("#backBar").onclick=goBack;
$("#topAvatar").onclick=()=>goTab("settings");
$("#setBtn").onclick=()=>goTab("settings");
$("#setCals").onclick=()=>{if(G.mcp)gPicker();else toast("Google Calendar isn't connected yet")};
const pickPhoto=()=>$("#photoInput").click();
$("#kitAvatar").onclick=pickPhoto;$("#photoBtn").onclick=pickPhoto;
function shrink(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{const m=Math.min(1,512/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=Math.round(img.width*m);c.height=Math.round(img.height*m);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(b=>b?res(b):rej(new Error("encode")),"image/jpeg",.88)};
  img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error("read"))};img.src=url})}
function cropPhoto(file){return new Promise((res,rej)=>{const url=URL.createObjectURL(file),img=new Image();
  img.onload=()=>{URL.revokeObjectURL(url);
    const bg=document.createElement('div');bg.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.8);display:grid;place-items:center;padding:20px';
    const box=document.createElement('div');box.style.cssText='background:var(--surface,#fff);border-radius:14px;padding:16px;max-width:420px;width:100%';
    const h=document.createElement('h3');h.textContent='Crop your photo';h.style.cssText='margin:0 0 8px;font-size:16px';
    const note=document.createElement('p');note.className='note';note.style.cssText='margin:0 0 10px';note.textContent='Drag to position, then Save.';
    const cv=document.createElement('canvas');const sz=Math.min(320,Math.min(img.width,img.height));cv.width=sz;cv.height=sz;cv.style.cssText='width:100%;max-width:320px;border-radius:50%;cursor:grab;touch-action:none;display:block;margin:0 auto';
    const cx=cv.getContext('2d');let scale=Math.max(sz/img.width,sz/img.height);let ox=0,oy=0,dragging=false,dsx=0,dsy=0;
    const draw=()=>{cx.clearRect(0,0,sz,sz);cx.fillStyle='#888';cx.fillRect(0,0,sz,sz);cx.drawImage(img,ox,oy,img.width*scale,img.height*scale)};
    const clamp=()=>{const dw=img.width*scale,dh=img.height*scale;ox=Math.min(0,Math.max(sz-dw,ox));oy=Math.min(0,Math.max(sz-dh,oy))};
    scale=Math.max(sz/img.width,sz/img.height);ox=(sz-img.width*scale)/2;oy=(sz-img.height*scale)/2;clamp();draw();
    cv.addEventListener('pointerdown',e=>{dragging=true;dsx=e.clientX-ox;dsy=e.clientY-oy;cv.setPointerCapture(e.pointerId);cv.style.cursor='grabbing'});
    cv.addEventListener('pointermove',e=>{if(!dragging)return;ox=e.clientX-dsx;oy=e.clientY-dsy;clamp();draw()});
    cv.addEventListener('pointerup',e=>{dragging=false;cv.style.cursor='grab'});
    const zoomWrap=document.createElement('div');zoomWrap.style.cssText='display:flex;align-items:center;gap:8px;margin:10px 0';
    const zoomL=document.createElement('span');zoomL.textContent='Zoom';zoomL.style.cssText='font-size:13px;color:var(--muted,#666)';
    const zoom=document.createElement('input');zoom.type='range';zoom.min='1';zoom.max='4';zoom.step='0.1';zoom.value=scale/(sz/img.width);zoom.style.cssText='flex:1';
    const zoomV=document.createElement('span');zoomV.style.cssText='font-size:12px;color:var(--muted,#666);min-width:30px';
    const baseScale=sz/img.width;
    zoom.oninput=()=>{const ns=baseScale*parseFloat(zoom.value);const cdx=ox+img.width*scale/2,cdy=oy+img.height*scale/2;scale=ns;ox=cdx-img.width*scale/2;oy=cdy-img.height*scale/2;clamp();draw();zoomV.textContent=parseFloat(zoom.value).toFixed(1)+'×'};
    zoomV.textContent=parseFloat(zoom.value).toFixed(1)+'×';zoomWrap.appendChild(zoomL);zoomWrap.appendChild(zoom);zoomWrap.appendChild(zoomV);
    const acts=document.createElement('div');acts.style.cssText='display:flex;gap:8px;justify-content:flex-end;margin-top:10px';
    const cancel=document.createElement('button');cancel.className='btn';cancel.textContent='Cancel';
    const save=document.createElement('button');save.className='btn primary';save.textContent='Save';
    cancel.onclick=()=>{bg.remove();rej(new Error('cancel'))};
    save.onclick=()=>{bg.remove();cv.toBlob(b=>b?res(b):rej(new Error('encode')),'image/jpeg',.88)};
    acts.appendChild(cancel);acts.appendChild(save);
    box.appendChild(h);box.appendChild(note);box.appendChild(cv);box.appendChild(zoomWrap);box.appendChild(acts);bg.appendChild(box);document.body.appendChild(bg)};
  img.onerror=()=>{URL.revokeObjectURL(url);rej(new Error('read'))};img.src=url})}
$("#photoInput").onchange=async e=>{const f=e.target.files&&e.target.files[0];e.target.value="";if(!f)return;
  const assets=await claude.use("assets");if(!assets){toast("Photo uploads aren't available right now");return}
  try{toast("Crop your photo…");const blob=await cropPhoto(f);toast("Uploading photo…");
    const r=await assets.upload(blob);const old=S.profile.avatarId;
    if(await save("settings","profile",{...S.profile,avatarId:r.id})){toast("Photo updated");if(old&&old!==r.id){try{await assets.delete(old)}catch(_){}}}}
  catch(err){if(err&&err.message==="cancel")return;toast(err&&err.message==="read"?"That file isn't an image we can read":"Couldn't upload the photo. Try again.")}};
$("#photoDel").onclick=async()=>{const id=S.profile.avatarId;if(!id)return;const p={...S.profile};delete p.avatarId;
  if(await save("settings","profile",p)){toast("Photo removed");try{const a=await claude.use("assets");a&&await a.delete(id)}catch(_){}}};
/* light / dark */
const SUN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>';
let themePref="light";try{themePref=localStorage.getItem("hq-theme")||"light"}catch(e){}
const isDark=()=>themePref==="dark"||(themePref==="auto"&&getComputedStyle(document.documentElement).colorScheme.includes("dark"));
function applyTheme(){const r=document.documentElement;if(themePref==="auto")r.removeAttribute("data-app-theme");else r.setAttribute("data-app-theme",themePref);
  $("#themeBtn").innerHTML=isDark()?SUN:MOON;$("#themeBtn").setAttribute("aria-label",isDark()?"Switch to light":"Switch to dark");
  document.querySelectorAll("[data-theme-set]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.themeSet===themePref))}
function setTheme(t){themePref=t;try{localStorage.setItem("hq-theme",t)}catch(e){}applyTheme()}
$("#themeBtn").onclick=()=>setTheme(isDark()?"light":"dark");
document.querySelectorAll("[data-theme-set]").forEach(b=>b.onclick=()=>setTheme(b.dataset.themeSet));
applyTheme();
$("#taxBtn").onclick=taxSheet;
$("#finTypes").onclick=()=>typesSheet();
const LGROUPS=[["links","Website & socials"],["music","Mixes & music"],["press","Press & media"],["other","Other"]];
const KKINDS=[["logo","Logo"],["photo","Press photo"],["video","Video"],["other","Other file"]];
const sortedLinks=()=>[...S.links].sort((a,b)=>(LGROUPS.findIndex(g=>g[0]===(a.group||"links"))-LGROUPS.findIndex(g=>g[0]===(b.group||"links")))||(a.order||0)-(b.order||0)||(a.label||"").localeCompare(b.label||""));
const linksText=()=>sortedLinks().map(l=>`${l.label}: ${l.url}`).join("\n");
const filesText=()=>S.kitFiles.filter(f=>f.shareUrl).map(f=>`${f.label}: ${f.shareUrl}`).join("\n");
const promoText=()=>{const pf=(S.kit||{}).promoFolder;return pf&&pf.url?"Logos, photos & videos: "+pf.url:""};
function pressKitText(){const p=S.profile,k=S.kit||{};
  return [p.djName||"",k.bioShort||"",k.genres?"Sound: "+k.genres:"",linksText(),promoText(),filesText(),k.rider?"Tech rider:\n"+k.rider:"",k.hospitality?"Hospitality rider:\n"+k.hospitality:"",
    ["Booking: "+(p.myName||""),p.email,p.phone].filter(Boolean).join(" · ")].filter(x=>x&&x.trim()).join("\n\n")}
$("#copyPress").onclick=()=>copyKitSheet();
function copyKitSheet(){const p=S.profile||{},k=S.kit||{},L=sortedLinks(),F=S.kitFiles.filter(f=>f.shareUrl),pf=k.promoFolder;
  let prev={};try{prev=JSON.parse(localStorage.getItem("hq-copykit")||"{}")}catch(e){}
  const on=(key,def)=>prev[key]!==undefined?!!prev[key]:def;
  const items=[["name","Your DJ name",p.djName,true],["bioShort","Short bio",k.bioShort,true],["bioLong","Long bio",k.bioLong,false],["genres","Genres & sound",k.genres,true],
    ["promo","Promo content folder (link)",pf&&pf.url,true],["tech","Tech rider",k.rider,true],["hosp","Hospitality rider",k.hospitality,false],["notes","Other notes",k.notes,false],["contact","Booking contact",[p.myName,p.email,p.phone].filter(Boolean).join(" · "),true]];
  const cb=(key,label,sub,def,dis)=>`<label class="check" style="${dis?"opacity:.5":""}"><input type="checkbox" data-ck="${esc(key)}" ${!dis&&on(key,def)?"checked":""} ${dis?"disabled":""}> <span style="min-width:0;overflow-wrap:anywhere">${esc(label)}${sub?`<span class="note" style="display:block;font-size:12px">${esc(sub)}</span>`:""}</span></label>`;
  sheet(`<h3>Copy kit</h3><p class="note" style="margin:0">Pick what to include. Your picks are remembered for next time.</p>
  <div class="chips"><button class="btn small" data-ckall>Select all</button><button class="btn small" data-cknone>Clear</button></div>
  <div class="checks">${items.slice(0,4).map(([key,l,v,d])=>cb(key,l,v?String(v).slice(0,60)+(String(v).length>60?"…":""):"Not added yet",d,!v)).join("")}</div>
  <div class="eyebrow" style="margin-top:6px">Links</div><div class="checks">${L.length?L.map(l=>cb("l:"+l.id,l.label,l.url,true)).join(""):`<div class="empty">No links yet.</div>`}</div>
  <div class="eyebrow" style="margin-top:6px">Logos, photos &amp; videos</div><div class="checks">${cb("promo","Promo content folder",pf&&pf.url?pf.url:"No folder set yet",true,!(pf&&pf.url))}${PSUBS.filter(([sk])=>pf&&pf.subs&&pf.subs[sk]).map(([sk,n])=>cb("ps:"+sk,n+" folder","https://drive.google.com/drive/folders/"+pf.subs[sk],false)).join("")}${F.map(f=>cb("f:"+f.id,f.label||"File",f.shareUrl,false)).join("")}</div>
  <div class="eyebrow" style="margin-top:6px">Riders &amp; more</div><div class="checks">${items.slice(5).map(([key,l,v,d])=>cb(key,l,v?String(v).slice(0,60)+(String(v).length>60?"…":""):"Not added yet",d,!v)).join("")}</div>
  <div class="actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-docopy>Copy selected</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;const boxes=()=>[...root.querySelectorAll("[data-ck]:not(:disabled)")];
    root.querySelector("[data-ckall]").onclick=()=>boxes().forEach(c=>c.checked=true);root.querySelector("[data-cknone]").onclick=()=>boxes().forEach(c=>c.checked=false);
    root.querySelector("[data-docopy]").onclick=()=>{const sel={};boxes().forEach(c=>sel[c.dataset.ck]=c.checked);try{localStorage.setItem("hq-copykit",JSON.stringify(sel))}catch(e){}
      const out=[];const v=key=>sel[key]&&(items.find(i=>i[0]===key)||[])[2];
      if(v("name"))out.push(p.djName);if(v("bioShort"))out.push(k.bioShort);if(v("bioLong"))out.push(k.bioLong);if(v("genres"))out.push("Sound: "+k.genres);
      const ls=L.filter(l=>sel["l:"+l.id]);if(ls.length)out.push(ls.map(l=>`${l.label}: ${l.url}`).join("\n"));
      const promo=[];if(sel.promo&&pf&&pf.url)promo.push("Logos, photos & videos: "+pf.url);PSUBS.forEach(([sk,n])=>{if(sel["ps:"+sk]&&pf&&pf.subs&&pf.subs[sk])promo.push(n+": https://drive.google.com/drive/folders/"+pf.subs[sk])});F.filter(f=>sel["f:"+f.id]).forEach(f=>promo.push(`${f.label}: ${f.shareUrl}`));if(promo.length)out.push(promo.join("\n"));
      if(v("tech"))out.push("Tech rider:\n"+k.rider);if(v("hosp"))out.push("Hospitality rider:\n"+k.hospitality);if(v("notes"))out.push(k.notes);if(v("contact"))out.push("Booking: "+items[8][2]);
      const t=out.filter(x=>x&&String(x).trim()).join("\n\n");if(!t){toast("Pick at least one thing to copy");return}copy(t);close()}})}
/* ---------- promo content lives in Drive: Promo folder → Logos / Photos / Videos ---------- */
const PSUBS=[["logos","Logos"],["photos","Photos"],["videos","Videos"]];
const MAX_UP=15*1024*1024;
const promoId=()=>{const pf=(S.kit||{}).promoFolder;if(!pf)return"";if(pf.id)return pf.id;const m=String(pf.url||"").match(/folders\/([A-Za-z0-9_-]{10,})/)||String(pf.url||"").match(/[?&]id=([A-Za-z0-9_-]{10,})/);return m?m[1]:""};
async function promoSubs(mcp){let pid=promoId();if(!pid)return null;let pf=(S.kit||{}).promoFolder||{};
  if(!(await folderAlive(mcp,pid))){if(!(await askGone(`Your promo content folder “${esc(pf.name||"Promo Content")}”`)))throw {code:"quiet"};
    const root=await ensureMktRoot(mcp);const nf=await findOrMakeFolder(mcp,"Promo Content",root.id);pf={url:folderUrl(nf),id:nf.id,name:`${root.title} / Promo Content`};pid=nf.id;
    S.kit={...(S.kit||{}),promoFolder:pf};await save("settings","kit",S.kit);forgetAlive();renderPromoFolder();toast("New Promo Content folder created")}
  const subs={...(pf.subs&&pf.root===pid?pf.subs:{})};let changed=false;
  const dead=[];for(const [k] of PSUBS)if(subs[k]&&!(await folderAlive(mcp,subs[k])))dead.push(k);
  if(dead.length){if(!(await askGone(`Your ${esc(dead.map(k=>PSUBS.find(x=>x[0]===k)[1]).join(", "))} promo folder${dead.length>1?"s":""}`)))throw {code:"quiet"};dead.forEach(k=>delete subs[k])}
  for(const [k,n] of PSUBS)if(!subs[k]){subs[k]=(await findOrMakeFolder(mcp,n,pid)).id;changed=true}
  if(changed){const k2=S.kit||{};const np={...pf,id:pid,root:pid,subs};S.kit={...k2,promoFolder:np};await save("settings","kit",S.kit)}return subs}
const kindFor=f=>/^video\//.test(f.type)?"videos":/logo/i.test(f.name)||/svg/.test(f.type)?"logos":"photos";
const fmtSize=n=>n>=1048576?(n/1048576).toFixed(n>=10485760?0:1)+" MB":Math.max(1,Math.round(n/1024))+" KB";
function promoUploadSheet(){if(!promoId()){toast("Set up your promo content folder first");promoFolderSheet();return}
  let files=[],dest="";
  sheet(`<h3>Add promo content</h3><p class="note" style="margin:0">Files go straight into your Drive folder <b>${esc(((S.kit||{}).promoFolder||{}).name||"Promo Content")}</b>. Nothing is stored in the app.</p>
  <div class="f"><label>Put them in</label><div class="seg" id="pu-dest">${PSUBS.map(([k,n])=>`<button type="button" data-dest="${k}">${n}</button>`).join("")}</div></div>
  <div class="actions" style="justify-content:flex-start"><button class="btn" id="pu-pick">Choose files</button></div>
  <div id="pu-list" class="list"></div>
  <p class="note" style="margin:0">Up to ${fmtSize(MAX_UP)} per file through the app. For bigger videos, open the folder in Drive and drop them in there, with no size limit.</p>
  <div class="actions"><button class="btn" data-cancel>Close</button><button class="btn primary" id="pu-go" disabled>Upload</button></div>`,root=>{
    const q=x=>root.querySelector(x);q("[data-cancel]").onclick=close;
    const setDest=k=>{dest=k;root.querySelectorAll("[data-dest]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.dest===k))};
    root.querySelectorAll("[data-dest]").forEach(b=>b.onclick=()=>setDest(b.dataset.dest));
    const draw=()=>{const sub=((S.kit||{}).promoFolder||{}).subs||{};
      q("#pu-list").innerHTML=files.map((f,i)=>{const big=f.size>MAX_UP;return `<div class="row" style="cursor:default;gap:8px"><span class="main"><span class="t" style="display:block">${esc(f.name)}</span><span class="sub" style="display:block">${fmtSize(f.size)}${big?` · <span style="color:var(--bad)">too big for the app</span>`:f._st?" · "+esc(f._st):""}</span></span>${big?`<a class="btn small" href="${esc(sub[dest]?"https://drive.google.com/drive/folders/"+sub[dest]:(S.kit.promoFolder||{}).url)}" target="_blank" rel="noopener">Open folder in Drive</a>`:""}</div>`}).join("");
      q("#pu-go").disabled=!files.some(f=>f.size<=MAX_UP&&!f._done)};
    q("#pu-pick").onclick=()=>{const i=document.createElement("input");i.type="file";i.multiple=true;i.accept="image/*,video/*,.pdf,.svg,.ai,.eps,.psd,.zip";i.style.display="none";document.body.appendChild(i);
      i.onchange=()=>{files=[...i.files];i.remove();if(files.length&&!dest)setDest(kindFor(files[0]));draw()};i.click()};
    q("#pu-go").onclick=async e=>{const btn=e.currentTarget;if(!dest){toast("Pick Logos, Photos or Videos");return}const mcp=await driveReady();if(!mcp)return;btn.disabled=true;btn.textContent="Uploading…";
      try{const subs=await promoSubs(mcp);draw();let ok=0;
        for(const f of files){if(f.size>MAX_UP||f._done)continue;f._st="uploading…";draw();
          try{await driveUpload(mcp,subs[dest],safeName(f.name),f.type||"application/octet-stream",await b64of(f));f._done=true;f._st="uploaded ✓";ok++}
          catch(err){f._st=err&&err.code==="tool_error"?"Drive refused this file":"failed, try again";if(err&&err.code&&err.code!=="tool_error"){driveErr(err);break}}
          draw()}
        if(ok){toast(`${ok} file${ok>1?"s":""} added to ${PSUBS.find(x=>x[0]===dest)[1]}`);PROMO.at=0;renderPromoLists()}}
      catch(err){if(!err||err.code!=="quiet")driveErr(err)}
      finally{if(btn.isConnected){btn.textContent="Upload";draw()}}};
    setDest("")})}
const PROMO={at:0,data:null,loading:false,key:""};
async function renderPromoLists(){const el=$("#promoLists");if(!el)return;const pf=(S.kit||{}).promoFolder||{},subs=pf.subs||{};
  if(!promoId()||!PSUBS.some(([k])=>subs[k])){el.innerHTML="";return}
  const key=PSUBS.map(([k])=>subs[k]||"").join(",");
  const paint=()=>{const d=PROMO.data||{};el.innerHTML=PSUBS.map(([k,n])=>{const fs=d[k];const url=subs[k]?"https://drive.google.com/drive/folders/"+subs[k]:"";
    return `<div class="lgroup"><div class="head" style="margin-top:8px"><span class="eyebrow">${n}${fs?" · "+fs.length:""}</span>${url?`<span class="chips"><a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">Open</a><button class="btn small" data-copy="${esc(url)}">Copy link</button></span>`:""}</div>
      <div class="list">${fs?fs.length?fs.slice(0,8).map(f=>`<div class="row" style="cursor:default"><span class="main"><span class="t" style="display:block">${esc(f.title)}</span></span><a class="btn small" href="${esc(f.viewUrl||"#")}" target="_blank" rel="noopener">Open</a><button class="btn small" data-copy="${esc(f.viewUrl||"")}">Copy link</button></div>`).join("")+(fs.length>8?`<div class="note" style="padding:4px 0">+ ${fs.length-8} more in Drive</div>`:""):`<div class="empty">Nothing here yet.</div>`:`<div class="empty">${PROMO.loading?"Loading…":"Open Kit to load"}</div>`}</div></div>`}).join("")};
  if(PROMO.key===key&&(PROMO.loading||Date.now()-PROMO.at<120000)){paint();return}
  if(tab!=="kit"){paint();return}
  PROMO.key=key;PROMO.loading=true;paint();const mcp=await claude.use("mcp");if(!mcp){PROMO.loading=false;paint();return}
  const d={};try{for(const [k] of PSUBS){if(!subs[k])continue;const r=await mcp.callTool(GD,"search_files",{query:`parentId = '${subs[k]}'`,pageSize:50,excludeContentSnippets:true},{cache:{staleTime:60000}});d[k]=((r.payload||{}).files||[]).filter(f=>f.mimeType!==FOLDER)}PROMO.data=d;PROMO.at=Date.now()}
  catch(e){}PROMO.loading=false;if(PROMO.key===key)paint()}
/* promo content folder: a link, a Drive folder you pick, or one made under Marketing */
function renderPromoFolder(){const el=$("#promoFolder");if(!el)return;const pf=(S.kit||{}).promoFolder;
  el.innerHTML=pf&&pf.url?`<div class="row" style="cursor:default;gap:8px;flex-wrap:wrap"><span class="main"><span class="t" style="display:block">Shared folder</span><a class="sub" style="display:block" href="${esc(pf.url)}" target="_blank" rel="noopener">${esc(pf.name||pf.url)}</a></span><button class="btn small" data-copy="${esc(pf.url)}">Copy link</button><button class="btn small" id="promoEdit">Change</button></div>`
    :`<div class="row" style="cursor:default;gap:8px;flex-wrap:wrap"><span class="main"><span class="t" style="display:block">Shared folder</span><span class="sub" style="display:block">Point to the Google Drive folder where your logos, photos and videos live.</span></span><button class="btn small primary" id="promoEdit">Set up</button></div>`;
  $("#promoEdit").onclick=promoFolderSheet;promoAliveCheck()}
async function promoAliveCheck(){const pid=promoId();if(!pid)return;const mcp=await claude.use("mcp");if(!mcp)return;let ok=true;try{ok=await folderAlive(mcp,pid)}catch(e){return}
  const el=$("#promoFolder");if(ok||promoId()!==pid||!el)return;
  el.innerHTML=`<div class="row" style="cursor:default;gap:8px;flex-wrap:wrap"><span class="main"><span class="t" style="display:block">Shared folder</span><span class="sub" style="display:block">Your promo folder was deleted from Drive (or is in the Trash).</span></span><button class="btn small primary" data-pfre>Create a new one</button><button class="btn small" id="promoEdit">Change</button></div>`;
  $("#promoEdit").onclick=promoFolderSheet;
  el.querySelector("[data-pfre]").onclick=async e=>{const btn=e.currentTarget;const m2=await driveReady();if(!m2)return;btn.disabled=true;btn.textContent="Creating…";
    try{const root=await ensureMktRoot(m2);const nf=await findOrMakeFolder(m2,"Promo Content",root.id);forgetAlive();await savePromo({url:folderUrl(nf),id:nf.id,name:`${root.title} / Promo Content`})}
    catch(err){if(!err||err.code!=="quiet")driveErr(err);if(btn.isConnected){btn.disabled=false;btn.textContent="Create a new one"}}}}
async function savePromo(v){const k=S.kit||{};if(await save("settings","kit",{...k,promoFolder:v})){S.kit={...k,promoFolder:v};close();toast(v?"Promo folder saved":"Promo folder removed");PROMO.at=0;if(v&&promoId()){const mcp=await claude.use("mcp");if(mcp){try{await promoSubs(mcp);renderPromoLists()}catch(e){}}}}}
function promoFolderSheet(){const pf=(S.kit||{}).promoFolder||{};
  sheet(`<h3>Promo content folder</h3><p class="note" style="margin:0">Where promoters can grab your logos, press photos and videos. In Drive, set the folder's sharing to “Anyone with the link” so they can open it.</p>
  <div class="f"><label for="pf-url">Folder link</label><input id="pf-url" type="url" value="${esc(pf.url||"")}" placeholder="https://drive.google.com/drive/folders/…" style="border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:9px 11px"></div>
  <div class="actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn save" data-pfsave>Save link</button><button class="btn" data-pfpick>Pick from Drive</button><button class="btn" data-pfmake>Create “Promo Content” in Marketing</button></div>
  <div class="list" id="pf-list"></div>
  <div class="actions">${pf.url?`<button class="btn danger" data-pfclear>Remove</button><span class="spacer"></span>`:""}<button class="btn" data-cancel>Cancel</button></div>`,root=>{
    const q=x=>root.querySelector(x);q("[data-cancel]").onclick=close;const clr=q("[data-pfclear]");if(clr)clr.onclick=()=>savePromo(null);
    q("[data-pfsave]").onclick=()=>{const u=q("#pf-url").value.trim();if(!/^https?:\/\//i.test(u)){toast("Paste a full link that starts with https://");return}savePromo({url:u,name:pf.url===u?pf.name||"":""})};
    q("[data-pfmake]").onclick=async e=>{const btn=e.currentTarget;const mcp=await driveReady();if(!mcp)return;btn.disabled=true;btn.textContent="Creating…";
      try{const root=await ensureMktRoot(mcp);
        const f=await findOrMakeFolder(mcp,"Promo Content",root.id);forgetAlive();await savePromo({url:folderUrl(f),id:f.id,name:`${root.title} / Promo Content`})}
      catch(err){if(!err||err.code!=="quiet")driveErr(err);if(btn.isConnected){btn.disabled=false;btn.textContent="Create “Promo Content” in Marketing"}}};
    q("[data-pfpick]").onclick=async()=>{const f=await SS.pickFolder("Choose your promo content folder");if(f)savePromo({url:folderUrl(f),id:f.id,name:f.title})}})}
function kitTextSheet(which){const k=S.kit||{};
  const fields=which==="bio"?[["bioShort","Short bio","For emails, flyers and Instagram. 2–3 sentences.",90],["bioLong","Long bio","For event pages and press.",200],["genres","Genres & sound","e.g. Open-format, house, Latin club, R&amp;B",50]]
    :which==="hospitality"?[["hospitality","Hospitality rider","e.g. 2 drink tickets, water and towels in the booth, guest list +2, parking or rideshare, green room access",200]]
    :which==="notes"?[["notes","Other notes","Anything else promoters should know: travel needs, availability, set preferences, tax or W-9 info",200]]
    :[["rider","Tech rider","e.g. 2× Pioneer CDJ-3000, DJM-900NXS2, booth monitor, 2 hrs minimum set",200]];
  sheet(`<h3>${{bio:"Bio",hospitality:"Hospitality rider",notes:"Other notes"}[which]||"Tech rider"}</h3>${fields.map(([key,l,ph,h])=>`<div class="f"><label for="k-${key}">${l}</label><textarea id="k-${key}" data-k="${key}" style="min-height:${h}px" placeholder="${esc(ph)}">${esc(k[key])}</textarea></div>`).join("")}
  <div class="actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;
    root.querySelector("[data-save]").onclick=async()=>{if(await save("settings","kit",{...k,...formVals(root)})){close();toast("Saved")}}})}
document.addEventListener("click",e=>{const b=e.target.closest("[data-kit-edit],[data-copy-kit],[data-kit-file],[data-kit-save]");if(!b)return;const d=b.dataset;
  if(d.kitEdit)kitTextSheet(d.kitEdit);
  else if(d.copyKit)copy((S.kit||{})[d.copyKit]||"");
  else if(d.kitFile)kitFileForm(S.kitFiles.find(f=>f.id===d.kitFile)||{});
  else if(d.kitSave){const f=S.kitFiles.find(x=>x.id===d.kitSave);if(f)saveKitFile(f)}});
$("#kitUpload").onclick=()=>promoUploadSheet();
$("#kitFileInput").onchange=async e=>{const f=e.target.files&&e.target.files[0];e.target.value="";if(!f)return;
  const assets=await claude.use("assets");if(!assets||!db){toast("Uploads aren't available right now");return}
  toast("Uploading…");
  try{const r=await assets.upload(f);const isLogo=/logo/i.test(f.name);
    const label=f.name.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ").trim()||"Untitled";
    const ref=await db.collection("kitFiles").add({label,kind:isLogo?"logo":(/^image\//.test(f.type)?"photo":/^video\//.test(f.type)?"video":"other"),assetId:r.id,contentType:r.contentType||f.type,fileName:f.name,shareUrl:""});
    toast("Added");kitFileForm({id:ref.id,label,kind:isLogo?"logo":(/^image\//.test(f.type)?"photo":/^video\//.test(f.type)?"video":"other"),assetId:r.id,contentType:r.contentType||f.type,fileName:f.name,shareUrl:""})}
  catch(err){toast(err&&err.code==="too_large"?"That file is too big (20 MB max)":"Couldn't upload that file. Try again.")}};
function kitFileForm(f){
  sheet(`<h3>Edit file</h3>${f.assetId&&/^image\//.test(f.contentType||"")?`<div class="kthumb" style="border-radius:12px;max-height:220px"><img src="${esc(__blob(f.assetId))}" alt=""></div>`:""}
  ${field("kf-label","Name",f.label,"text",'data-k="label" placeholder="e.g. Logo – white on transparent"')}
  <div class="f"><label for="kf-kind">Type</label><select id="kf-kind" data-k="kind">${opt(KKINDS,f.kind||"photo")}</select></div>
  ${field("kf-share","Share link (Drive, Dropbox)",f.shareUrl,"url",'data-k="shareUrl" placeholder="https://drive.google.com/…"')}
  <p class="note" style="margin:0">Promoters can't open files stored here. The share link is what gets copied into emails and your press kit.</p>
  <div class="actions">${delBtn()}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;
    armDelete(root,async()=>{await remove("kitFiles",f.id);close();if(f.assetId){try{const a=await claude.use("assets");a&&await a.delete(f.assetId)}catch(_){}}});
    root.querySelector("[data-save]").onclick=async()=>{const v=formVals(root);if(await save("kitFiles",f.id,{...strip(f),...v})){close();toast("Saved")}}})}
async function saveKitFile(f){try{const r=await fetch(__blob(f.assetId));if(!r.ok)throw 0;const blob=await r.blob();
    const ext=(f.fileName||"").split(".").pop()||((f.contentType||"").split("/")[1]||"png").replace("jpeg","jpg");
    await dl(((f.label||"file").replace(/[^\w\- ]+/g,"").trim()||"file")+"."+ext.toLowerCase(),blob)}
  catch(e){toast("Couldn't get that file. Open it from the thumbnail instead.")}}
let tplFilter="all";try{tplFilter=localStorage.getItem("hq-tplf")||"all"}catch(e){}
/* AI drafting was removed: it sent your booking data to an AI model, which the privacy policy rules out. */
function aiInit(){}
function sortedTemplates(cur){const idx=k=>{const i=STATUSES.findIndex(x=>x[0]===k);return i<0?99:i};
  return [...S.templates].sort((a,b)=>((cur&&b.stage===cur)-(cur&&a.stage===cur))||(idx(a.stage)-idx(b.stage))||(a.name||"").localeCompare(b.name||""))}
function renderKit(){renderMailPick();
  const L=sortedLinks();
  $("#linkList").innerHTML=L.length?LGROUPS.map(([g,gl])=>{const items=L.filter(l=>(l.group||"links")===g);if(!items.length)return"";
    return `<div class="lgroup"><div class="eyebrow" style="margin-top:6px">${gl}</div><div class="list">${items.map(l=>`<div class="row" style="cursor:default"><span class="main"><span class="t" style="display:block">${esc(l.label)}</span><a class="sub" style="display:block" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.url)}</a></span>
    <button class="btn small" data-copy="${esc(l.url)}">Copy</button><button class="btn small" data-open-link="${l.id}">Edit</button></div>`).join("")}</div></div>`}).join("")
    :`<div class="empty">Add your website, EPK, socials and mixes so they're one tap away.</div>`;
  const k=S.kit||{};
  const tx=(lbl,v,key)=>v?`<div class="ktext"><div class="head" style="margin-bottom:4px"><span class="eyebrow">${lbl}</span><button class="btn small" data-copy-kit="${key}">Copy</button></div>${esc(v)}</div>`:"";
  $("#kitBio").innerHTML=(tx("Short bio",k.bioShort,"bioShort")+tx("Long bio",k.bioLong,"bioLong")+tx("Genres & sound",k.genres,"genres"))||`<div class="empty">Add a short bio for emails and flyers, and a longer one for event pages.</div>`;
  $("#kitRider").innerHTML=tx("Rider",k.rider,"rider")||`<div class="empty">List the gear you need (decks, mixer, monitors), set length and anything else promoters should know.</div>`;
  $("#kitHosp").innerHTML=tx("Hospitality",k.hospitality,"hospitality")||`<div class="empty">Drinks, water, guest list, parking or rides, green room: what you need to be looked after on the night.</div>`;
  $("#kitNotes").innerHTML=tx("Notes",k.notes,"notes")||`<div class="empty">Anything else promoters should know.</div>`;
  renderPromoFolder();renderPromoLists();
  const F=[...S.kitFiles].sort((a,b)=>(KKINDS.findIndex(x=>x[0]===a.kind)-KKINDS.findIndex(x=>x[0]===b.kind))||(a.label||"").localeCompare(b.label||""));
  $("#kitFiles").innerHTML=F.length?F.map(f=>{const img=f.assetId&&/^image\//.test(f.contentType||"image/");
    return `<div class="kfile"><div class="kthumb">${img?`<img src="${esc(__blob(f.assetId))}" alt="${esc(f.label)}" loading="lazy">`:`<span class="doc">${esc((f.contentType||"").includes("pdf")?"PDF":"FILE")}</span>`}</div>
    <div class="kb"><span class="t">${esc(f.label||"Untitled")}</span><span class="note" style="font-size:12px">${esc((KKINDS.find(x=>x[0]===f.kind)||KKINDS[2])[1])}${f.shareUrl?" · link ready":" · no share link"}</span>
    <div class="chips">${f.shareUrl?`<button class="btn" data-copy="${esc(f.shareUrl)}">Copy link</button>`:""}${f.assetId?`<button class="btn save" data-kit-save="${f.id}">Save</button>`:""}<button class="btn" data-kit-file="${f.id}">Edit</button></div></div></div>`}).join("")
    :"";$("#legacyNote").hidden=!F.length;
  const p=S.profile;
  $("#kitName").textContent=p.djName||"Your DJ name";$("#kitSub").textContent=[p.myName,p.instagram].filter(Boolean).join(" · ");
  $("#photoDel").hidden=!p.avatarId;
  renderStageEditor();
  $("#stageSeg").innerHTML=STAGES.map(st=>`<button data-setstage="${st}" aria-pressed="${st===setStage}">${STAGE_L[st]}</button>`).join("");
  $("#stageSeg").querySelectorAll("[data-setstage]").forEach(b=>b.onclick=()=>{setStage=b.dataset.setstage;renderKit()});
  $("#stageNote").textContent=STAGE_BASE[setStage]==="stage"?`Due dates count from the day a booking moves to ${STAGE_L[setStage]}.`:`Due dates count from the show date.`;
  const DL=stageDefaults(setStage);
  $("#defCl").innerHTML=DL.map(t=>`<div class="cl-row"><span class="cl-t" style="flex:1;min-width:0;overflow-wrap:anywhere">${esc(t.label)}</span><select class="offsel" data-doff="${esc(t.key)}" aria-label="When ${esc(t.label)} is due">${offList(setStage).map(([o,l])=>`<option value="${o===null?"":o}" ${offOf(t)===o?"selected":""}>${l}</option>`).join("")}</select><button class="x" data-dren="${esc(t.key)}" aria-label="Rename ${esc(t.label)}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><button class="x" data-ddel="${esc(t.key)}" aria-label="Remove ${esc(t.label)}">×</button></div>`).join("")||`<div class="note">No steps for ${STAGE_L[setStage]} yet.</div>`;
  $("#defCl").querySelectorAll("[data-ddel]").forEach(x=>x.onclick=()=>saveStage(setStage,DL.filter(t=>t.key!==x.dataset.ddel)));
  $("#defCl").querySelectorAll("[data-doff]").forEach(x=>x.onchange=()=>{const k=x.dataset.doff,o=x.value===""?null:+x.value;saveStage(setStage,DL.map(t=>t.key===k?{...t,offset:o}:t))});
  $("#defCl").querySelectorAll("[data-dren]").forEach(x=>x.onclick=()=>{const k=x.dataset.dren,row=x.closest(".cl-row");
    inlineRename(row,row.querySelector(".cl-t"),(DL.find(t=>t.key===k)||{}).label||"",v=>saveStage(setStage,DL.map(t=>t.key===k?{...t,label:v}:t)))});
  const tRow=t=>`<button class="row" data-open-template="${t.id}"><span class="main"><span class="t" style="display:block">${esc(t.name)}</span><span class="sub" style="display:block">${esc(t.subject)}</span></span>${t.stage&&STATUSES.some(x=>x[0]===t.stage)?`<span class="pill s-${K(t.stage)}">${esc(stName(t.stage))}</span>`:`<span class="pill" style="color:var(--muted)">Any stage</span>`}<span class="btn small" aria-hidden="true">Use</span></button>`;
  const tagged=t=>t.stage&&STATUSES.some(x=>x[0]===t.stage);
  if(tplFilter!=="all"&&tplFilter!=="any"&&!STATUSES.some(x=>x[0]===tplFilter))tplFilter="all";
  $("#tplFilter").innerHTML=[["all","All"],...STATUSES.filter(([k])=>S.templates.some(t=>t.stage===k)),["any","Any stage"]].map(([k,l])=>{const n=k==="all"?S.templates.length:k==="any"?S.templates.filter(t=>!tagged(t)).length:S.templates.filter(t=>t.stage===k).length;return `<button class="chip" data-tplf="${esc(k)}" aria-pressed="${tplFilter===k}">${esc(l)} <span class="num" style="opacity:.6">${n}</span></button>`}).join("");
  $("#tplFilter").querySelectorAll("[data-tplf]").forEach(b=>b.onclick=()=>{tplFilter=b.dataset.tplf;try{localStorage.setItem("hq-tplf",tplFilter)}catch(e){}renderKit()});
  let tl;if(tplFilter==="all")tl=sortedTemplates().map(tRow).join("");
  else if(tplFilter==="any")tl=sortedTemplates().filter(t=>!tagged(t)).map(tRow).join("");
  else{const own=sortedTemplates().filter(t=>t.stage===tplFilter),gen=sortedTemplates().filter(t=>!tagged(t));tl=own.map(tRow).join("")+(gen.length?`<div class="tgrp">Also works at any stage</div>`+gen.map(tRow).join(""):"")}
  $("#templateList").innerHTML=S.templates.length?(tl||`<div class="empty">No templates for this stage yet. Tag one with “Suggest for stage” when you edit it.</div>`):`<div class="empty">No templates yet.</div>`;
}

/* ---------- calendar ---------- */
const onDay=ds=>S.bookings.filter(b=>b.date===ds&&K(b.status)!=="lost");
const blocksOn=ds=>S.blocks.filter(k=>k.date&&ds>=k.date&&ds<=(k.endDate||k.date));
/* Google Calendar sync: live reads through the viewer's connector, never stored in the app's database */
const GC="Google Calendar";
const G={mcp:null,state:"loading",err:null,byDate:{},from:"",to:"",at:0,calIds:null,calNames:{}};
const gOn=ds=>{const own=new Set(S.bookings.map(b=>b.gcal&&b.gcal.eventId).filter(Boolean));return (G.byDate[ds]||[]).filter(e=>!own.has(e.id)&&!own.has(String(e.id).split("_")[0]))};
const gEvening=ds=>gOn(ds).filter(e=>e.allDay||e.endH>=17||e.startH>=17);
const isBusy=ds=>onDay(ds).some(b=>["confirmed","pitched","played","paid"].includes(K(b.status)))||blocksOn(ds).length>0||gEvening(ds).length>0;
const gTime=e=>e.allDay?"All day":`${fmtT(e.start)}–${fmtT(e.end)}`;
function fmtT(iso){const d=new Date(iso);return isNaN(d)?"":d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}
function addDays(ds,n){const d=parseD(ds);d.setDate(d.getDate()+n);return ymd(d)}
function gWindow(){const s=new Date(calM.getFullYear(),calM.getMonth(),1),now=new Date();const a=s<now?s:new Date(now.getFullYear(),now.getMonth(),1);
  const s2=new Date(a);s2.setDate(s2.getDate()-7);const e=new Date(Math.max(calM.getTime(),now.getTime()));const e2=new Date(e.getFullYear(),e.getMonth()+3,7);let end=ymd(e2);try{const ar=availRange()[1];if(ar>end)end=addDays(ar,1)}catch(_){}return [ymd(s2),end]}
function gIngest(evts,calName,map){evts.forEach(ev=>{
  if(!ev||ev.status==="cancelled"||ev.transparency==="transparent"||ev.eventType==="WORKING_LOCATION")return;
  const allDay=!!(ev.start&&ev.start.date);const s=allDay?ev.start.date:(ev.start&&ev.start.dateTime||"").slice(0,10);if(!s)return;
  let e=allDay?addDays(ev.end&&ev.end.date||s,-1):(ev.end&&ev.end.dateTime||"").slice(0,10)||s;if(e<s)e=s;
  const sd=allDay?null:new Date(ev.start.dateTime),ed=allDay?null:new Date(ev.end&&ev.end.dateTime);
  for(let ds=s,i=0;ds<=e&&i<60;ds=addDays(ds,1),i++){
    const multi=s!==e;const item={id:ev.id,title:ev.summary||"Busy",allDay:allDay||(multi&&ds!==s&&ds!==e),start:ev.start.dateTime,end:ev.end&&ev.end.dateTime,
      startH:sd&&ds===s?sd.getHours():0,endH:ed&&ds===e?(ed.getHours()||24):24,cal:calName,link:ev.htmlLink||"",where:ev.location||""};
    (map[ds]=map[ds]||[]).push(item)}})}
async function gFetchCal(id,from,to){let out=[],tok;for(let p=0;p<4;p++){
  const input={calendarId:id,startTime:from+"T00:00:00",endTime:to+"T23:59:59",pageSize:250,orderBy:"startTime"};if(tok)input.pageToken=tok;
  const r=await G.mcp.callTool(GC,"list_events",input,{cache:{staleTime:60000}});const pl=r.payload||{};
  out=out.concat(Array.isArray(pl.events)?pl.events:[]);tok=pl.nextPageToken;if(!tok)break}return out}
async function gSync(force){if(!G.mcp)return;const ids=G.calIds&&G.calIds.length?G.calIds:["primary"];
  const [from,to]=gWindow();G.state="loading";renderSync();
  if(force){try{await G.mcp.invalidate(GC,"list_events")}catch(e){}}
  const map={};let fail=null,ok=0;
  for(const id of ids){try{gIngest(await gFetchCal(id,from,to),G.calNames[id]||id,map);ok++}catch(e){fail=fail||e;
    if(e&&e.retryable&&!force){await new Promise(r=>setTimeout(r,(e.retryAfterMs||800)+Math.random()*600));try{gIngest(await gFetchCal(id,from,to),G.calNames[id]||id,map);ok++;fail=null}catch(e2){fail=e2}}}}
  if(fail&&!ok&&["needs_reauth","server_not_connected","not_in_manifest","blocked_by_policy","approval_required","selection_required"].includes(fail.code))G.byDate={};
  else{Object.values(map).forEach(l=>l.sort((a,b)=>(a.allDay?-1:0)-(b.allDay?-1:0)||String(a.start).localeCompare(String(b.start))));G.byDate=map}
  G.from=from;G.to=to;G.at=Date.now();G.err=fail;G.state=fail?(ok?"partial":"error"):"ok";G.okCount=ok;G.total=ids.length;renderCalendar();renderSync()}
function renderSync(){const el=$("#syncbar");if(!el)return;
  if(!G.mcp&&G.state!=="loading"){el.innerHTML=`<span class="dot"></span><span>Google Calendar isn't connected yet. Connect Google Calendar in Settings → Google account to see your outside events.</span>`;return}
  if(G.state==="loading"){el.innerHTML=`<span class="dot"></span><span>Checking Google Calendar…</span>`;return}
  const n=G.total||1,when=new Date(G.at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
  const actions=`<button class="btn small" id="gRefresh">Refresh</button><button class="btn small" id="gPick">Choose calendars</button>`;
  if(G.state==="ok"){el.innerHTML=`<span class="dot ok"></span><span>Synced ${n} Google calendar${n>1?"s":""} · ${when}</span>${actions}`}
  else{const c=G.err&&G.err.code;const msg=
    c==="server_not_connected"?"Google Calendar isn't connected. Add it in Settings → Google account, then tap Refresh.":
    c==="needs_reauth"?"Google Calendar needs to be reconnected in Settings → Google account.":
    c==="selection_required"?"You have more than one Google Calendar connector. Pick one in the prompt, then tap Refresh.":
    c==="approval_required"||c==="not_in_manifest"?"This page needs your OK to read Google Calendar. Tap Allow.":
    c==="blocked_by_policy"?"Your organization blocks Google Calendar for this page.":
    c==="tool_error"?"Google Calendar couldn't read one of your calendars. Check the selection under Choose calendars.":
    "Couldn't reach Google Calendar just now. Tap Refresh to try again.";
    el.innerHTML=`<span class="dot err"></span><span>${G.state==="partial"?`Synced ${G.okCount} of ${n} calendars. `:""}${msg}</span>${c==="approval_required"||c==="not_in_manifest"?`<button class="btn small primary" id="gRefresh">Allow</button>`:actions.replace(/<button class="btn small" id="gPick">Choose calendars<\/button>/,c==="tool_error"||G.state==="partial"?'<button class="btn small" id="gPick">Choose calendars</button>':"")}`}
  const r=$("#gRefresh");if(r)r.onclick=()=>gSync(true);const p=$("#gPick");if(p)p.onclick=gPicker}
async function gPicker(){sheet(`<h3>Calendars to check</h3><p class="note" style="margin:0">Events on these calendars count against your availability. They're read live and never saved in the app.</p><div id="gpl" class="checks"><div class="empty">Loading your calendars…</div></div>
  <div class="f" style="margin-top:10px"><label for="gpw">Add booked sets to</label><select id="gpw"><option value="">Main calendar</option></select><span class="note">Each booking with a set time is placed on this calendar.</span></div>
  <div class="actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`,async root=>{
    root.querySelector("[data-cancel]").onclick=close;
    let cals=[];try{const r=await G.mcp.callTool(GC,"list_calendars",{pageSize:250});cals=((r.payload||{}).calendars||[]).filter(c=>c&&c.id)}
    catch(e){$("#gpl").innerHTML=`<div class="empty">Couldn't load your calendars (${esc(e.code||"error")}). Try Refresh on the calendar first.</div>`;return}
    const sel=new Set(G.calIds&&G.calIds.length?G.calIds:[]);
    $("#gpl").innerHTML=cals.map((c,i)=>`<label class="check"><input type="checkbox" value="${esc(c.id)}" data-name="${esc(c.summary||c.id)}" ${sel.has(c.id)?"checked":""}> <span style="min-width:0;overflow-wrap:anywhere">${esc(c.summary||c.id)}${c.primary?' <span class="note">(main)</span>':""}</span></label>`).join("")||`<div class="empty">No calendars found.</div>`;
    const w=root.querySelector("#gpw");w.innerHTML=`<option value="">Main calendar</option>`+cals.filter(c=>!/holiday|#contacts|#weeknum/i.test(c.id)).map(c=>`<option value="${esc(c.id)}" data-name="${esc(c.summary||c.id)}" ${c.id===G.writeTo?"selected":""}>${esc(c.summary||c.id)}</option>`).join("");
    root.querySelector("[data-save]").onclick=async()=>{const picked=[...root.querySelectorAll("#gpl input:checked")];
      const cl=picked.map(i=>({id:i.value,name:i.dataset.name}));const wo=w.selectedOptions[0];
      if(await save("settings","calendar",{calendars:cl,writeTo:w.value,writeName:w.value?(wo.dataset.name||w.value):""})){close();toast("Calendars saved")}}})}
function renderCalendar(){
  $("#calTitle").textContent=calM.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const start=new Date(calM);start.setDate(1-calM.getDay());
  let h="SMTWTFS".split("").map(d=>`<div class="dow">${d}</div>`).join("");
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);
    if(i>=35&&d.getMonth()!==calM.getMonth())break;
    const ds=ymd(d),bs=onDay(ds),ks=blocksOn(ds),wk=d.getDay()===5||d.getDay()===6;
    const lbl=[...bs.map(b=>`<span class="ev ${K(b.status)}">${esc(b.title||contactName(b.venueId)||"Show")}</span>`),...ks.map(k=>`<span class="ev block">${esc(k.label||"Blocked")}</span>`),...gOn(ds).map(e=>`<span class="ev gc">${esc(e.title)}</span>`)];
    h+=`<button class="day${d.getMonth()!==calM.getMonth()?" out":""}${wk?" wknd":""}${ds===today()?" today":""}${ks.length?" blocked":""}" data-day="${ds}" aria-label="${esc(fmtD(ds))}${bs.length?", "+bs.length+" booking":""}${ks.length?", blocked":""}"><span class="n">${d.getDate()}</span>${lbl.slice(0,2).join("")}${lbl.length>2?`<span class="note" style="font-size:10px">+${lbl.length-2}</span>`:""}</button>`}
  $("#cal").innerHTML=h;
  const open=openNights();
  const clashes=sortedBookings().filter(b=>b.date>=today()&&["confirmed","pitched"].includes(K(b.status))&&gEvening(b.date).length);
  $("#clashCard").hidden=!clashes.length;
  $("#clashList").innerHTML=clashes.map(b=>`<button class="row clash" data-open-booking="${b.id}"><span class="main"><span class="t" style="display:block">${esc(b.title||contactName(b.venueId)||"Show")} · ${esc(fmtD(b.date))}</span><span class="sub" style="display:block">${gEvening(b.date).map(e=>esc(e.title)+" ("+esc(gTime(e))+")").join(", ")}</span></span><span class="pill s-${K(b.status)}">${esc(b.status)}</span></button>`).join("");
  if(G.mcp&&G.state!=="loading"&&G.from){const [f,t]=gWindow();if(f<G.from||t>G.to)gSync()}
  renderAvail(open);
}
/* availability: filters saved in settings/availability */
const AV_DEF={days:[5,6],range:"2m",from:"",to:"",busy:{confirmed:true,pitched:true,lead:false,played:true,blocked:true},google:"evening"};
const AV=()=>{const a=S.avail||{};return {...AV_DEF,...a,busy:{...AV_DEF.busy,...(a.busy||{})}}};
const AV_RANGES=[["2w","Next 2 weeks"],["30d","Next 30 days"],["1m","Rest of this month"],["2m","This month and next"],["3m","Next 3 months"],["6m","Next 6 months"],["custom","Custom dates…"]];
function availRange(a=AV()){const n=new Date(),t=today(),Y=n.getFullYear(),M=n.getMonth(),plus=d=>{const x=new Date(n);x.setDate(x.getDate()+d);return ymd(x)};
  switch(a.range){case"2w":return[t,plus(13)];case"30d":return[t,plus(29)];case"1m":return[t,ymd(new Date(Y,M+1,0))];case"3m":return[t,ymd(new Date(Y,M+3,0))];case"6m":return[t,ymd(new Date(Y,M+6,0))];
    case"custom":{let f=a.from||t,e=a.to||plus(60);if(e<f)[f,e]=[e,f];if(f<t)f=t;return[f,e]}default:return[t,ymd(new Date(Y,M+2,0))]}}
function availBusy(ds,a=AV()){const st=a.busy;
  if(onDay(ds).some(b=>(st[K(b.status)]??(K(b.status)==="paid"?st.played:false))))return true;
  if(st.blocked&&blocksOn(ds).length)return true;
  if(a.google==="evening"&&gEvening(ds).length)return true;
  if(a.google==="any"&&gOn(ds).length)return true;
  return false}
function availText(){const o=openNights();return o.length?o.map(ds=>"• "+parseD(ds).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})).join("\n"):"(no open dates right now)"}
function openNights(){const a=AV(),[f,e]=availRange(a),out=[];if(!a.days.length)return out;
  for(let ds=f,i=0;ds<=e&&i<400;ds=addDays(ds,1),i++){if(a.days.includes(parseD(ds).getDay())&&!availBusy(ds,a))out.push(ds)}return out}
const DOWN=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function availSummaryText(a){const [f,e]=availRange(a),rl=a.range==="custom"?`${parseD(f).toLocaleDateString("en-US",{month:"short",day:"numeric"})} – ${parseD(e).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`:(AV_RANGES.find(r=>r[0]===a.range)||AV_RANGES[3])[1].toLowerCase();
  const days=a.days.length===7?"Any day":a.days.length===2&&a.days.includes(5)&&a.days.includes(6)?"Fridays and Saturdays":a.days.length?[...a.days].sort().map(d=>DOWN[d]+"s").join(", "):"No days picked";
  const busy=["confirmed","pitched","lead","played"].filter(k=>a.busy[k]).map(k=>kindName(k).toLowerCase());
  const parts=[busy.length?busy.join(", ")+" shows":"",a.busy.blocked?"blocked dates":"",a.google==="evening"?"evening Google plans":a.google==="any"?"any Google event":""].filter(Boolean);
  return `${days}, ${rl}${parts.length?", skipping days with "+parts.join(", ").replace(/, ([^,]*)$/," or $1"):", counting every day as open"}.`}
let availOpen=false;
function renderAvail(open){const a=AV();
  $("#availSummary").textContent=availSummaryText(a)+` ${open.length} open ${open.length===1?"date":"dates"}.`;
  const by={};open.forEach(ds=>{const k=ds.slice(0,7);(by[k]=by[k]||[]).push(ds)});
  $("#openDates").innerHTML=open.length?Object.entries(by).map(([m,l])=>`<div class="amonth"><span class="eyebrow">${esc(parseD(m+"-01").toLocaleDateString("en-US",{month:"long",year:"numeric"}))} · ${l.length}</span><div class="chips">${l.map(ds=>`<button class="chip" data-day="${ds}">${esc(parseD(ds).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}))}</button>`).join("")}</div></div>`).join("")
    :`<div class="note">${a.days.length?"Nothing open with these filters. Try a longer date range or more days.":"Pick at least one day of the week under Filters."}</div>`;
  const p=$("#availPanel");p.hidden=!availOpen;$("#availEdit").setAttribute("aria-expanded",availOpen);$("#availEdit").textContent=availOpen?"Done":"Filters";
  if(!availOpen)return;
  const [f,e]=availRange(a);
  p.innerHTML=`<div class="grp"><span class="eyebrow">Date range</span><div class="period"><select id="av-range" aria-label="Date range">${AV_RANGES.map(([k,l])=>`<option value="${k}" ${a.range===k?"selected":""}>${l}</option>`).join("")}</select>
      ${a.range==="custom"?`<input type="date" id="av-from" value="${f}" min="${today()}" aria-label="From"><span class="to">to</span><input type="date" id="av-to" value="${e}" min="${today()}" aria-label="To">`:""}</div></div>
    <div class="grp"><div class="head"><span class="eyebrow">Days of the week</span><span class="chips"><button class="btn small" data-avdays="56">Fri &amp; Sat</button><button class="btn small" data-avdays="all">All</button></span></div>
      <div class="dow7">${DOWN.map((d,i)=>`<button data-avday="${i}" aria-pressed="${a.days.includes(i)}">${d}</button>`).join("")}</div></div>
    <div class="grp"><span class="eyebrow">Not available if the day has</span><div class="cbs">
      ${[["confirmed",`A ${kindName("confirmed")} show`],["pitched",`A ${kindName("pitched")} show (on hold)`],["lead",`A ${kindName("lead")}`],["played",`A show already ${kindName("played")} or ${kindName("paid")}`],["blocked","Blocked dates"]].map(([k,l])=>`<label><input type="checkbox" data-avbusy="${k}" ${(k==="blocked"?a.busy.blocked:a.busy[k])?"checked":""}> ${l}</label>`).join("")}</div></div>
    <div class="grp"><span class="eyebrow">Google Calendar events</span><div class="seg" id="av-g">${[["evening","Evening & all-day"],["any","Any event"],["ignore","Ignore"]].map(([k,l])=>`<button data-avg="${k}" aria-pressed="${a.google===k}">${l}</button>`).join("")}</div></div>
    <div class="actions" style="justify-content:flex-start"><button class="btn small" data-avreset>Reset to Fridays &amp; Saturdays</button></div>`;
  const put=async patch=>{const next={...AV(),...patch};S.avail=next;renderCalendar();if(db){try{await db.doc("settings/availability").set(next)}catch(e){toast("Couldn't save your filters")}}};
  p.querySelector("#av-range").onchange=ev=>{const r=ev.target.value;const patch={range:r};if(r==="custom"&&!a.from){const[x,y]=availRange(a);patch.from=x;patch.to=y}put(patch)};
  ["from","to"].forEach(k=>{const i=p.querySelector("#av-"+k);if(i)i.onchange=()=>{if(i.value)put({[k]:i.value})}});
  p.querySelectorAll("[data-avday]").forEach(b=>b.onclick=()=>{const d=+b.dataset.avday,set=new Set(a.days);set.has(d)?set.delete(d):set.add(d);put({days:[...set].sort()})});
  p.querySelectorAll("[data-avdays]").forEach(b=>b.onclick=()=>put({days:b.dataset.avdays==="all"?[0,1,2,3,4,5,6]:[5,6]}));
  p.querySelectorAll("[data-avbusy]").forEach(c=>c.onchange=()=>put({busy:{...a.busy,[c.dataset.avbusy]:c.checked}}));
  p.querySelectorAll("[data-avg]").forEach(b=>b.onclick=()=>put({google:b.dataset.avg}));
  p.querySelector("[data-avreset]").onclick=()=>put({...AV_DEF,busy:{...AV_DEF.busy}});
}
$("#availEdit").onclick=()=>{availOpen=!availOpen;renderCalendar()};
$("#calPrev").onclick=()=>{calM=new Date(calM.getFullYear(),calM.getMonth()-1,1);renderCalendar()};
$("#calNext").onclick=()=>{calM=new Date(calM.getFullYear(),calM.getMonth()+1,1);renderCalendar()};
$("#blockBtn").onclick=()=>blockForm({date:today()});
$("#copyAvail").onclick=()=>{const o=openNights();if(!o.length){toast("No open dates to copy");return}
  copy(`Here are my open dates:\n${availText()}\n\nHappy to hold one while you check.`)};
function daySheet(ds){navSheet("d:"+ds,()=>daySheet(ds));const bs=onDay(ds),ks=blocksOn(ds);
  sheet(`<div><div class="eyebrow">${availBusy(ds)?"Not available":"Open"}</div><h3>${esc(fmtD(ds))}</h3></div>
  <div class="list">${bs.map(bookingRow).join("")}${ks.map(k=>`<button class="row" data-open-block="${k.id}"><span class="main"><span class="t" style="display:block">${esc(k.label||"Blocked")}</span><span class="sub" style="display:block">Blocked${k.endDate&&k.endDate!==k.date?` · ${esc(fmtD(k.date))} – ${esc(fmtD(k.endDate))}`:""}</span></span><span class="pill" style="color:var(--muted)">Blocked</span></button>`).join("")}
  ${gOn(ds).map(e=>`<div class="row" style="cursor:default"><span class="main"><span class="t" style="display:block">${esc(e.title)}</span><span class="sub" style="display:block">${esc(gTime(e))} · ${esc(e.cal)}${e.where?" · "+esc(e.where):""}</span></span>${e.link?`<a class="btn small" href="${esc(e.link)}" target="_blank" rel="noopener">Open</a>`:""}</div>`).join("")}
  ${!bs.length&&!ks.length&&!gOn(ds).length?`<div class="empty">Nothing on this day.</div>`:""}</div>
  <div class="actions"><button class="btn" data-close>Close</button>${ks.length?"":`<button class="btn" data-block>Block this day</button>`}<button class="btn primary" data-add>+ Booking on this date</button></div>`,root=>{
    root.querySelector("[data-close]").onclick=close;
    root.querySelector("[data-add]").onclick=()=>bookingForm({date:ds});
    const bb=root.querySelector("[data-block]");if(bb)bb.onclick=()=>blockForm({date:ds});
  });
}
function blockForm(k={}){const isNew=!k.id;
  sheet(`<h3>${isNew?"Block dates":"Edit blocked dates"}</h3><p class="note" style="margin:0">For trips, day-job conflicts or nights off. Blocked days drop out of your open dates.</p>
  ${field("k-label","Reason",k.label,"text",'data-k="label" placeholder="e.g. Family trip"')}
  <div class="frow">${field("k-start","From",k.date,"date",'data-k="date"')}${field("k-end","Through (optional)",k.endDate,"date",'data-k="endDate"')}</div>
  <div class="actions">${isNew?"":delBtn()}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;armDelete(root,async()=>{await remove("blocks",k.id);close()});
    root.querySelector("[data-save]").onclick=async()=>{const v=formVals(root);if(!v.date){toast("Pick a start date");return}
      if(v.endDate&&v.endDate<v.date){toast("End date is before the start date");return}
      if(await save("blocks",k.id,{...strip(k),...v})){close();toast("Dates blocked")}}});
}

/* ---------- set times: pickers, overlap checks, Google Calendar events ---------- */
const toMin=t=>{const m=String(t||"").match(/^(\d{1,2}):(\d{2})$/);return m?+m[1]*60+ +m[2]:null};
const fromMin=n=>{n=((n%1440)+1440)%1440;return String(Math.floor(n/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0")};
const addMin=(t,n)=>fromMin(toMin(t)+n);
const fmtHM=t=>{const n=toMin(t);if(n==null)return"";const h=Math.floor(n/60),m=n%60;return `${h%12||12}:${String(m).padStart(2,"0")} ${h<12?"AM":"PM"}`};
const fmtRange=(a,b)=>a?fmtHM(a)+(b?" – "+fmtHM(b):""):"";
function parseLegacy(t){const re=/(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?/gi;const out=[];let m;const s2=String(t||"");while((m=re.exec(s2))&&out.length<2){let h=+m[1],mi=+(m[2]||0);const ap=(m[3]||"").toLowerCase();if(h>23||mi>59)continue;out.push({h,mi,ap})}
  if(!out.length)return [];const lastAp=(out.find(x=>x.ap)||{}).ap||"p";
  return out.map(x=>{let h=x.h;const ap=x.ap||lastAp;if(h<=12){if(ap[0]==="p"&&h<12)h+=12;if(ap[0]==="a"&&h===12)h=0}return fromMin(h*60+x.mi)})}
const setStartOf=b=>b.setStart||parseLegacy(b.setTime)[0]||"";
const setEndOf=b=>b.setEnd||parseLegacy(b.setTime)[1]||"";
function timeSel(id,val){const n=toMin(val),h=n==null?null:Math.floor(n/60),mi=n==null?null:n%60;const h12=h==null?"":(h%12||12),ap=h==null?"PM":(h<12?"AM":"PM");
  const mins=[0,5,10,15,20,25,30,35,40,45,50,55];if(mi!=null&&!mins.includes(mi))mins.push(mi);mins.sort((a,b)=>a-b);
  const st='style="border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:8px 6px;min-width:0;color:inherit;font:inherit"';
  return `<div style="display:flex;gap:4px" id="${id}"><select data-tsel="${id}" data-part="h" aria-label="Hour" ${st}><option value="">--</option>${[12,1,2,3,4,5,6,7,8,9,10,11].map(x=>`<option ${x===h12?"selected":""}>${x}</option>`).join("")}</select>
    <select data-tsel="${id}" data-part="m" aria-label="Minute" ${st}>${mins.map(x=>`<option value="${x}" ${x===mi?"selected":""}>${String(x).padStart(2,"0")}</option>`).join("")}</select>
    <select data-tsel="${id}" data-part="ap" aria-label="AM or PM" ${st}><option ${ap==="AM"?"selected":""}>AM</option><option ${ap==="PM"?"selected":""}>PM</option></select></div>`}
function readTime(root,id){const g=p=>root.querySelector(`[data-tsel="${id}"][data-part="${p}"]`);const h=g("h"),m=g("m"),ap=g("ap");if(!h||!h.value)return"";let hh=+h.value%12;if(ap.value==="PM")hh+=12;return fromMin(hh*60+(+m.value||0))}
function setTimeSel(root,id,t){const n=toMin(t);if(n==null)return;const h=Math.floor(n/60),mi=n%60;const g=p=>root.querySelector(`[data-tsel="${id}"][data-part="${p}"]`);
  g("h").value=String(h%12||12);const ms=g("m");if(![...ms.options].some(o=>+o.value===mi))ms.add(new Option(String(mi).padStart(2,"0"),mi));ms.value=String(mi);g("ap").value=h<12?"AM":"PM"}
// minutes from midnight of `ds`; an end at or before the start runs past midnight
function span(ds,a,b){let s1=toMin(a);if(s1==null)return null;if(s1<360)s1+=1440;let e1=toMin(b);if(e1==null)e1=s1+60;while(e1<=s1)e1+=1440;return [s1,e1]}
function gSpan(e,ds){if(e.allDay||!e.start)return null;const base=parseD(ds);base.setHours(0,0,0,0);const s1=(new Date(e.start)-base)/6e4,e1=(new Date(e.end||e.start)-base)/6e4;return [s1,e1]}
const overlap=(x,y)=>x&&y&&x[0]<y[1]&&y[0]<x[1];
function conflictMsg(ds,selfId,ts,te){if(!ds)return"";const mine=span(ds,ts,te);const hard=[],soft=[];
  const prev=addDays(ds,-1),next=addDays(ds,1);
  S.bookings.filter(b=>b.id!==selfId&&K(b.status)!=="lost"&&[prev,ds,next].includes(b.date)).forEach(b=>{const nm=`${esc(showName(b))} (${esc(STAGE_L[b.status]||b.status)})`;
    const sp=span(b.date,setStartOf(b),setEndOf(b));const off=b.date===prev?-1440:b.date===next?1440:0;const sp2=sp&&[sp[0]+off,sp[1]+off];
    if(mine&&sp2){if(overlap(mine,sp2))hard.push(`${nm}, ${esc(b.setTime||fmtRange(setStartOf(b),setEndOf(b)))}`);else if(b.date===ds)soft.push(nm+", "+esc(b.setTime))}
    else if(b.date===ds)soft.push(nm)});
  blocksOn(ds).forEach(k=>hard.push(`blocked: ${esc(k.label||"no reason")}`));
  [ds,next].forEach(d=>gOn(d).forEach(e=>{const sp=gSpan(e,ds);const label=`${esc(e.title)} on Google Calendar (${esc(gTime(e))}${d!==ds?", next day":""})`;
    if(e.allDay){if(d===ds)soft.push(label)}else if(mine&&sp){if(overlap(mine,sp))hard.push(label)}else if(d===ds)soft.push(label)}));
  let h="";if(hard.length)h+=`<div class="warn"><b>Time conflict${mine?" with "+esc(fmtRange(ts,te)):""}:</b> ${hard.join("; ")}.</div>`;
  if(soft.length)h+=`<div class="warn" style="opacity:.85">Same day: ${soft.join("; ")}.</div>`;return h}
function renderWriteTo(){const n=$("#writeToNote");if(n)n.innerHTML=`Booked sets are added to <b>${esc(G.writeName||"your main calendar")}</b>.`}
function evPayload(b){const s1=setStartOf(b),e1=setEndOf(b)||addMin(s1,60);const sd=toMin(s1)<360?addDays(b.date,1):b.date;const end=toMin(e1)<=toMin(s1)?addDays(sd,1):sd;const v=contact(b.venueId),pr=contact(b.promoterId);
  const hold=!["confirmed","played","paid"].includes(K(b.status));
  return {summary:`${hold?"HOLD · ":""}DJ set: ${showName(b)}`,startTime:`${sd}T${s1}:00`,endTime:`${end}T${e1}:00`,location:bAddr(b)||"",
    description:[`Stage: ${STAGE_L[b.status]||b.status}`,v?`Venue: ${cName(v)}`:"",pr?`Promoter: ${cName(pr)}`:"",b.fee?`Fee: ${money(b.fee)}`:"","Added from your booking app."].filter(Boolean).join("\n"),notificationLevel:"NONE"}}
async function dropEvent(ge){const mcp=G.mcp||await claude.use("mcp");if(!mcp||!ge||!ge.eventId)return;try{await mcp.callTool(GC,"delete_event",{eventId:ge.eventId,...(ge.calendarId?{calendarId:ge.calendarId}:{}),notificationLevel:"NONE"})}catch(e){}}
async function syncBookingEvent(id,given){const b=given?{...given,id}:S.bookings.find(x=>x.id===id);if(!b)return;const ge=b.gcal;
  const want=!b.gcalOff&&b.date&&setStartOf(b)&&K(b.status)!=="lost";const mcp=G.mcp||await claude.use("mcp");if(!mcp)return;
  try{if(!want){if(ge&&ge.eventId){await dropEvent(ge);await patch("bookings",id,{gcal:{__gone:true,eventId:"",calendarId:"",link:""}});toast("Removed from Google Calendar")}return}
    const body=evPayload(b),cal=G.writeTo||"";
    if(ge&&ge.eventId&&(ge.calendarId||"")===cal){await mcp.callTool(GC,"update_event",{eventId:ge.eventId,...(cal?{calendarId:cal}:{}),...body});toast("Google Calendar updated")}
    else{if(ge&&ge.eventId)await dropEvent(ge);const r=await mcp.callTool(GC,"create_event",{...(cal?{calendarId:cal}:{}),...body});const p=r.payload||{},ev=p.event||p;
      if(ev.id){await patch("bookings",id,{gcal:{eventId:ev.id,calendarId:cal,link:ev.htmlLink||""}});toast("Added to Google Calendar"+(G.writeName?" ("+G.writeName+")":""))}}
    gSync(true)}
  catch(e){const c=e&&e.code;toast(c==="server_not_connected"?"Connect Google Calendar in Settings → Google account to add sets to your calendar":c==="approval_required"||c==="not_in_manifest"||c==="not_granted"?"Allow Google Calendar for this page to add your set":c==="tool_error"?"Google Calendar wouldn't add the set. Check you can edit "+(G.writeName||"that calendar")+" under Choose calendars.":"Couldn't update Google Calendar. Save again to retry.")}}
/* ---------- color palettes + light/dark mode flag ---------- */
const PALETTES=[["sage","Sage",["#55782B","#E1ECD2","#B4683F"]],["lavender","Lavender",["#6F5BA7","#E6DCF6","#B85A82"]],["sky","Sky",["#3F72A0","#D8E7F5","#B07428"]],["blush","Blush",["#A35767","#F4DCE0","#4F8770"]],["apricot","Apricot",["#A15C30","#F5DFC8","#4A78A0"]],
  ["pride","Rainbow",["#E40303","#FF8C00","#FFED00","#008026","#004CFF","#732982"]],["trans","Cotton Candy",["#5BCEFA","#F5A9B8","#FFFFFF","#F5A9B8","#5BCEFA"]],["gay","Lagoon",["#078D70","#26CEAA","#98E8C1","#FFFFFF","#7BADE2","#5049CC","#3D1A78"]],
  ["lesbian","Sunset",["#D52D00","#EF7627","#FF9A56","#FFFFFF","#D162A4","#B55690","#A30262"]],["bi","Twilight",["#D60270","#D60270","#9B4F96","#0038A8","#0038A8"]]];
function curMode(){const r=document.documentElement,a=r.getAttribute("data-app-theme"),t=r.getAttribute("data-theme");if(a==="light"||a==="dark")return a;if(t==="light"||t==="dark")return t;return matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}
function applyMode(){const r=document.documentElement,m=curMode();if(r.getAttribute("data-mode")!==m)r.setAttribute("data-mode",m)}
function applyPalette(k){if(!PALETTES.some(p=>p[0]===k))k="sage";const r=document.documentElement;if(!k||k==="sage")r.removeAttribute("data-palette");else r.setAttribute("data-palette",k);applyMode();renderPalPick()}
function renderPalPick(){const el=document.getElementById("palPick");if(!el)return;const cur=document.documentElement.getAttribute("data-palette")||"sage";
  el.innerHTML=PALETTES.map(([k,n,c])=>`<button type="button" data-pal="${k}" aria-pressed="${k===cur}"><span class="sw" aria-hidden="true">${c.map(x=>`<i style="background:${x};width:${Math.max(6,Math.round(42/c.length))}px"></i>`).join("")}</span>${n}</button>`).join("")}
new MutationObserver(applyMode).observe(document.documentElement,{attributes:true,attributeFilter:["data-theme","data-app-theme"]});
try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",applyMode)}catch(e){}
try{applyPalette(localStorage.getItem("palette")||"sage")}catch(e){applyPalette("sage")}
document.addEventListener("click",async e=>{const b=e.target.closest("[data-pal]");if(!b)return;const k=b.dataset.pal;applyPalette(k);try{localStorage.setItem("palette",k)}catch(x){}
  const n=(PALETTES.find(p=>p[0]===k)||[])[1];if(db){try{await db.doc("settings/look").set({palette:k})}catch(x){}}toast(n+" palette on")});
document.addEventListener("pointerdown",e=>{const b=e.target.closest(".btn");if(!b||b.disabled)return;const r=b.getBoundingClientRect(),d=Math.max(r.width,r.height)*2.2,s2=document.createElement("span");s2.className="rp";s2.style.cssText=`width:${d}px;height:${d}px;left:${e.clientX-r.left-d/2}px;top:${e.clientY-r.top-d/2}px`;b.appendChild(s2);setTimeout(()=>s2.remove(),600)});
async function shareMediaLater(id,url,m){const fid=(String(url).match(/folders\/([A-Za-z0-9_-]{2,})/)||[])[1];if(!fid){toast("Couldn't share: that isn't a Drive folder link");return}
  const mcp=await driveReady();if(!mcp)return;try{await mcp.callTool(GD,"share_file",{fileId:fid,emailAddress:m.email,role:"writer"});await patch("bookings",id,{mediaSharedWith:m.email});toast("Media folder shared with "+cName(m))}catch(e){toast("Couldn't share with "+cName(m)+". Share it from Drive.")}}
function notice({title,body,link,linkText,extra}){document.querySelector(".notice-bg")?.remove();
  const bg=document.createElement("div");bg.className="notice-bg";bg.innerHTML=`<div class="notice" role="alertdialog" aria-modal="true" aria-labelledby="nt-t"><button class="x nx" data-nclose aria-label="Close">×</button>
    <div class="ic" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16v16H4z" opacity="0"/><path d="m3 7 9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg></div>
    <h4 id="nt-t">${esc(title)}</h4><p>${body}</p><div class="actions">${link?`<a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener" data-nopen>${esc(linkText||"Open")}</a>`:""}${extra||""}<button class="btn" data-nclose>Done</button></div></div>`;
  document.body.appendChild(bg);const shut=()=>{bg.remove();document.removeEventListener("keydown",esc2,true)};const esc2=e=>{if(e.key==="Escape"){e.stopPropagation();shut()}};
  bg.addEventListener("click",e=>{if(e.target===bg||e.target.closest("[data-nclose]"))shut()});document.addEventListener("keydown",esc2,true);
  setTimeout(()=>{(bg.querySelector("[data-nopen]")||bg.querySelector("[data-nclose]")).focus()},50);return bg}
function tplOptions(b){const T=S.templates||[],sug=T.find(t=>t.stage&&t.stage===b.status);const o=t=>`<option value="${t.id}" ${sug&&t.id===sug.id?"selected":""}>${t.stage===b.status?"★ ":""}${esc(t.name)}</option>`;
  const groups=STATUSES.map(([k,l])=>{const ts=T.filter(t=>t.stage===k).sort((a,c)=>String(a.name).localeCompare(String(c.name)));return ts.length?`<optgroup label="${esc(l)}">${ts.map(o).join("")}</optgroup>`:""}).join("");
  const any=T.filter(t=>!t.stage||!STATUSES.some(([k])=>k===t.stage));
  return `<option value="__blank" ${sug?"":"selected"}>Blank email</option>${groups}${any.length?`<optgroup label="Any stage">${any.map(o).join("")}</optgroup>`:""}`}
function loadBookingMail(bid,el){if(!el)return;const xs=sentFor({bookingId:bid});
  el.innerHTML=xs.length?xs.slice(0,6).map(sentRow).join("")+(xs.length>6?`<button class="btn small" data-bmore style="margin-top:6px">See all ${xs.length}</button>`:""):`<div class="empty">Emails you send about this booking show up here. Replies land in your Gmail inbox.</div>`;
  const more=el.querySelector("[data-bmore]");if(more)more.onclick=()=>sentSheet({bookingId:bid})}
/* ---------- sheets / forms ---------- */
let SH_CUR=null,SH_STACK=[],SH_NEXT=null,SH_BACKING=false;
function navSheet(key,reopen){SH_NEXT={key,reopen}}
function sheetBack(){const p=SH_STACK.pop();if(!p)return;SH_BACKING=true;p.reopen();SH_BACKING=false}
function sheet(html,onMount){const root=$("#sheetRoot"),wasOpen=!!root.innerHTML,nx=SH_NEXT;SH_NEXT=null;
  if(!SH_BACKING){if(wasOpen&&SH_CUR&&(!nx||nx.key!==SH_CUR.key)){SH_STACK.push(SH_CUR);if(SH_STACK.length>15)SH_STACK.shift()}if(!wasOpen)SH_STACK=[]}
  SH_CUR=nx;if(!nx)SH_STACK=wasOpen?SH_STACK:[];
  const backBtn=SH_STACK.length?`<button type="button" class="sheet-back" data-shback><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>Back</button>`:"";
  root.innerHTML=`<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true">${backBtn}${html}</div></div>`;
  const sb=root.querySelector("[data-shback]");if(sb)sb.onclick=sheetBack;
  const bg=root.firstChild;bg.addEventListener("click",e=>{if(e.target===bg)close()});onMount&&onMount(root.querySelector(".sheet"));const f=root.querySelector("input,select,textarea,button");f&&f.focus()}
function close(){$("#sheetRoot").innerHTML="";SH_CUR=null;SH_STACK=[]}
document.addEventListener("keydown",e=>{if(e.key==="Escape")close()});
const opt=(list,v)=>list.map(([k,l])=>`<option value="${esc(k)}" ${k===v?"selected":""}>${esc(l)}</option>`).join("");
const contactOpts=(type,v,none="None",addNew)=>`<option value="">${none}</option>`+(addNew?`<option value="__new__">＋ ${addNew}</option>`:"")+S.contacts.filter(c=>!type||c.type===type||c.id===v).map(c=>`<option value="${c.id}" ${c.id===v?"selected":""}>${esc(cName(c))}</option>`).join("");
const field=(id,label,val,type="text",extra="")=>`<div class="f"><label for="${id}">${label}</label><input id="${id}" type="${type}" value="${esc(val??"")}" ${extra}></div>`;
const formVals=root=>{const o={};root.querySelectorAll("[data-k]").forEach(el=>o[el.dataset.k]=el.type==="number"?(el.value===""?"":Number(el.value)):el.value.trim());return o};
function delBtn(){return `<button class="btn danger" data-del>Delete</button><span class="spacer"></span>`}
function armDelete(root,fn){const b=root.querySelector("[data-del]");if(!b)return;b.onclick=()=>{if(b.dataset.armed){fn()}else{b.dataset.armed=1;b.textContent="Tap again to delete";setTimeout(()=>{if(b.isConnected){delete b.dataset.armed;b.textContent="Delete"}},3000)}}}

async function patch(col,id,data){if(!db){toast("Can't save right now. Check your connection and try again.");return null}
  data=scrubFin(data);try{await db.collection(col).doc(id).update(data);finSavedNote();return id}catch(e){toast(e.code==="invalid_argument"?"Couldn't save that change. Try again.":"Couldn't save. Try again.");return null}}
async function save(col,id,data){
  if(!db){toast("Can't save right now. Check your connection and try again.");return null}
  data=scrubFin(data);try{if(id){await db.collection(col).doc(id).set(data);finSavedNote();return id}const r=await db.collection(col).add(data);finSavedNote();return r.id}
  catch(e){toast(e.code==="invalid_argument"?"You don't have edit access to this page":"Couldn't save. Try again.");return null}}
async function remove(col,id){if(!db)return;try{await db.collection(col).doc(id).delete();toast("Deleted")}catch(e){toast("Couldn't delete. Try again.")}}

/* ---------- Google Drive media folders ---------- */
const GD="Google Drive",FOLDER="application/vnd.google-apps.folder";
function mediaFolderName(b){const m=contact(b.mediaId);const d=parseD(b.date);
  return [b.title||contactName(b.venueId),d?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):"",m?cName(m):""].filter(Boolean).join(" – ").replace(/[\\/]/g,"-")}
function driveErr(e){const c=e&&e.code;toast(c==="server_not_connected"?"Connect Google Drive in Settings → Google account first":c==="needs_reauth"?"Reconnect Google Drive in Settings → Google account":c==="approval_required"||c==="not_in_manifest"?"Allow Google Drive for this page to create folders":c==="blocked_by_policy"?"Your organization blocks Google Drive here":"Couldn't reach Google Drive. Try again.")}
const fileOf=p=>p&&(p.id?p:p.file&&p.file.id?p.file:Array.isArray(p.files)?null:null);
async function driveWho(mcp){try{const r=await mcp.callTool(GD,"search_files",{query:"owner = 'me'",pageSize:1,excludeContentSnippets:true},{cache:{staleTime:60000}});const f=((r.payload||{}).files||[])[0];return f&&f.owner?String(f.owner).toLowerCase():""}catch(e){if(e&&e.code==="tool_error")return"";throw e}}
const wantAcct=()=>String((S.drive||{}).account||"").trim().toLowerCase();
function wrongAcctSheet(who){const want=wantAcct();sheet(`<h3>Wrong Google account</h3>
  <p style="margin:0">Google Drive is connected as <b>${esc(who)}</b>, but media folders should go in <b>${esc(want)}</b>. No folder was created.</p>
  <div class="ktext">To fix it:
1. Open Settings → Google account and tap Disconnect.
2. Connect Google Drive again and sign in as ${esc(want)}.
3. Come back and tap Create folder again.</div>
  <div class="actions"><button class="btn" data-close>Got it</button></div>`,root=>{root.querySelector("[data-close]").onclick=close})}
async function driveRoot(mcp){const d=S.drive||{};if(d.rootId&&(!wantAcct()||!d.owner||d.owner.toLowerCase()===wantAcct()))return d.rootId;
  let found=null;try{const r=await mcp.callTool(GD,"search_files",{query:"title = 'Set & Settled Media' and mimeType = '"+FOLDER+"' and owner = 'me'",pageSize:1,excludeContentSnippets:true},{cache:false});found=((r.payload||{}).files||[])[0]||null}catch(e){if(e&&e.code!=="tool_error")throw e}
  if(!found){const r=await mcp.callTool(GD,"create_file",{title:"Set & Settled Media",contentMimeType:FOLDER});found=fileOf(r.payload)}
  if(!found||!found.id)throw {code:"tool_error"};
  const nd={...(S.drive||{}),rootId:found.id,rootTitle:found.title||"Set & Settled Media",rootUrl:found.viewUrl||"https://drive.google.com/drive/folders/"+found.id,owner:found.owner||""};
  S.drive=nd;await save("settings","drive",nd);return found.id}
async function makeMediaFolder(b,share){const mcp=await driveReady();if(!mcp)return null;
  try{const ev=await ensureEvent(mcp,b,"mkt");if(!ev)return null;const id=ev.subs.media;const url="https://drive.google.com/drive/folders/"+id;let shared=false;
    const m=contact(b.mediaId);if(share&&m&&m.email){try{await mcp.callTool(GD,"share_file",{fileId:id,emailAddress:m.email,role:"writer"});shared=true}catch(e){toast("Folder created, but sharing with "+cName(m)+" failed. Share it from Drive.")}}
    return {id,url,shared}}
  catch(e){if(!e||e.code!=="quiet")driveErr(e);return null}}
$("#driveCheck").onclick=async()=>{const st=$("#driveStatus"),mcp=await claude.use("mcp");if(!mcp){st.innerHTML=`<p class="note">Google Drive isn't connected yet.</p>`;return}
  st.innerHTML=`<p class="note">Checking…</p>`;try{const who=await driveWho(mcp),want=wantAcct();
    st.innerHTML=!who?`<p class="note">Connected, but couldn't tell which account (the Drive may be empty). Folders go to whichever account is connected.</p>`
      :want&&who!==want?`<div class="warn" style="margin-top:8px">Connected as <b>${esc(who)}</b>, not ${esc(want)}. Folders are blocked until you connect Google Drive as ${esc(want)} in Settings → Google account.</div>`
      :`<p class="note" style="color:var(--ok)">Connected as ${esc(who)}. Folders will be created there.</p>`}
  catch(e){st.innerHTML="";driveErr(e)}};
const ROOTS={biz:{name:"Business",subs:[["contracts","Contracts"],["invoices","Invoices"]]},mkt:{name:"Marketing",subs:[["media","Media"],["flyers","Flyers"]]}};
const rootOf=k=>{const d=S.drive||{};return d[k+"Id"]?{id:d[k+"Id"],title:d[k+"Title"]||ROOTS[k].name,url:d[k+"Url"]||"https://drive.google.com/drive/folders/"+d[k+"Id"]}:null};
function renderDriveInfo(){const el=$("#driveRoots");if(el)el.innerHTML=["biz","mkt"].map(k=>{const r=rootOf(k);return `<div class="row" style="cursor:default;gap:10px"><span class="main"><span class="t" style="display:block">${ROOTS[k].name} folder</span><span class="sub" style="display:block">${r?`<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>`:"Not chosen yet"}</span></span><button class="btn small${r?"":" primary"}" data-pickroot="${k}">${r?"Change":"Choose"}</button></div>`}).join("");
  const d=S.drive||{},info=$("#driveInfo");if(info)info.innerHTML=d.account?`Only <b>${esc(d.account)}</b> is allowed for Drive and Gmail.`:""}
document.addEventListener("click",e=>{const x=e.target.closest("[data-pickroot]");if(x)rootPicker(x.dataset.pickroot)});
/* First time: say what the folder is for and let them create one or pick their own. Later (Change): straight to the picker. */
const ROOT_WHY={biz:{what:"contracts and invoices",subs:"Contracts and Invoices",why:"Every booking's paperwork lands in the same place, sorted by year and show, so it's easy to find at tax time or when a venue asks for a copy."},
  mkt:{what:"flyers, photos and videos",subs:"Media and Flyers",why:"Your media person gets one folder per show to upload to, and your flyers stay with the show they're for."}};
async function saveRoot(k,f,after){const R=ROOTS[k];if(wantAcct()&&f.owner&&String(f.owner).toLowerCase()!==wantAcct()){toast("That folder belongs to "+f.owner+", not "+wantAcct());return false}
  const nd={...(S.drive||{}),[k+"Id"]:f.id,[k+"Title"]:f.title,[k+"Url"]:f.viewUrl||"https://drive.google.com/drive/folders/"+f.id,["years_"+k]:{}};if(f.owner)nd.owner=f.owner;
  if(await save("settings","drive",nd)){S.drive=nd;close();toast(R.name+" files will go in "+f.title);renderDriveInfo();if(after)after();return true}return false}
function rootPicker(k,after,onCancel){if(rootOf(k))return rootSearch(k,after,onCancel);const R=ROOTS[k],W=ROOT_WHY[k];const ex=yearOf({})+" / Your show – date / "+W.subs.replace(" and "," & ");
  sheet(`<div><span class="eyebrow">Google Drive · one-time setup</span><h3 style="margin-top:4px">Set up your ${R.name} folder</h3></div>
  <p style="margin:0">The app keeps your ${W.what} in one ${R.name} folder in your Google Drive. Each show gets its own folder inside it, made for you.</p>
  <div class="card" style="margin:0;font-family:var(--mono,monospace);font-size:13px;overflow-wrap:anywhere">${esc(R.name)} / ${esc(ex)}</div>
  <p class="note" style="margin:0">${W.why} The app only works inside this folder and the folders it makes. It doesn't look at, change or delete anything else in your Drive.</p>
  <div class="actions" style="flex-wrap:wrap;justify-content:flex-start"><button class="btn primary" data-rpmake>Create a “${esc(R.name)}” folder for me</button><button class="btn" data-rppick>Use a folder I already have</button></div>
  <div class="actions"><button class="btn" data-close>Not now</button></div>`,root=>{
    root.querySelector("[data-close]").onclick=()=>{close();if(onCancel)onCancel()};
    root.querySelector("[data-rppick]").onclick=()=>rootSearch(k,after,onCancel);
    root.querySelector("[data-rpmake]").onclick=async e=>{const btn=e.currentTarget;const mcp=await driveReady();if(!mcp)return;btn.disabled=true;btn.textContent="Creating…";
      try{const r=await mcp.callTool(GD,"create_file",{title:R.name,contentMimeType:FOLDER});const f=fileOf(r.payload);if(!f||!f.id)throw {code:"tool_error"};
        if(await saveRoot(k,f,after))notice({title:R.name+" folder is ready",body:`It's in My Drive as “${esc(f.title||R.name)}”. Year and show folders get added inside it as you go.`,link:folderUrl(f),linkText:"Open in Drive"})}
      catch(err){driveErr(err);if(btn.isConnected){btn.disabled=false;btn.textContent=`Create a “${R.name}” folder for me`}}}})}
function rootSearch(k,after,onCancel){const R=ROOTS[k];sheet(`<h3>Choose your ${R.name} folder</h3><p class="note" style="margin:0">Pick the folder in your Google Drive to use. ${k==="biz"?"Each event gets Contracts and Invoices folders":"Each event gets Media and Flyers folders"} inside it, sorted by year. The app only gets access to the folder you pick.</p>
  <div class="actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn primary" data-gpick>Choose from Google Drive…</button><button class="btn" data-gmake>Make a new “${esc(R.name)}” folder</button></div>
  <div class="actions"><button class="btn" data-close>Cancel</button></div>`,root=>{
    root.querySelector("[data-close]").onclick=()=>{close();if(onCancel)onCancel()};
    root.querySelector("[data-gpick]").onclick=async()=>{const f=await SS.pickFolder(`Choose your ${R.name} folder`);if(f)saveRoot(k,f,after)};
    root.querySelector("[data-gmake]").onclick=async e=>{const btn=e.currentTarget;const mcp=await driveReady();if(!mcp)return;btn.disabled=true;btn.textContent="Creating…";
      try{const r=await mcp.callTool(GD,"create_file",{title:R.name,contentMimeType:FOLDER});const f=fileOf(r.payload);if(f&&f.id)saveRoot(k,f,after)}catch(err){driveErr(err);if(btn.isConnected){btn.disabled=false;btn.textContent=`Make a new “${R.name}” folder`}}}})}
/* ---------- filing: Business|Marketing → Year → Event → subfolders ---------- */
const yearOf=b=>String((b&&b.date)||today()).slice(0,4);
const showName=b=>b.title||contactName(b.venueId)||"Show";
const safeName=x=>String(x||"").replace(/[\\/:*?"<>|]/g,"-").replace(/\s+/g," ").trim();
const eventLabel=b=>{const d=parseD(b.date);return safeName([showName(b),d?d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}):""].filter(Boolean).join(" – "))};
const folderUrl=f=>f.viewUrl||"https://drive.google.com/drive/folders/"+f.id;
const fileUrl=f=>f.viewUrl||"https://drive.google.com/file/d/"+f.id+"/view";
async function driveReady(){const mcp=await claude.use("mcp");if(!mcp){toast("Google Drive isn't connected yet");return null}
  try{if(wantAcct()){const who=await driveWho(mcp);if(who&&who!==wantAcct()){wrongAcctSheet(who);return null}}}catch(e){driveErr(e);return null}
  return mcp}
async function findOrMakeFolder(mcp,title,parentId){const t=title.replace(/\\/g,"\\\\").replace(/'/g,"\\'");let f=null;
  try{const r=await mcp.callTool(GD,"search_files",{query:`title = '${t}' and mimeType = '${FOLDER}' and parentId = '${parentId}'`,pageSize:1,excludeContentSnippets:true},{cache:false});f=((r.payload||{}).files||[])[0]||null}
  catch(e){if(e&&e.code!=="tool_error")throw e}
  if(!f){const r=await mcp.callTool(GD,"create_file",{title,contentMimeType:FOLDER,parentId});f=fileOf(r.payload)}
  if(!f||!f.id)throw {code:"tool_error"};return f}
/* ---------- deleted-folder recovery ----------
   A folder counts as gone when Drive can't find it, or it's in the Trash (Drive search leaves trashed items out).
   Only folders the app made or the user picked are checked, which drive.file allows: no extra Google access. */
const DRIVE_ALIVE={};
async function folderAlive(mcp,id){if(!id)return false;const c=DRIVE_ALIVE[id];if(c&&Date.now()-c.at<60000)return c.ok;let ok=true;
  try{const r=await mcp.callTool(GD,"get_file_metadata",{fileId:id,excludeContentSnippets:true},{cache:false});const m=fileOf(r.payload)||r.payload||{};
    if(m.trashed===true||m.explicitlyTrashed===true)ok=false;
    else if(m.parentId&&m.title){const t=String(m.title).replace(/\\/g,"\\\\").replace(/'/g,"\\'");
      try{const sr=await mcp.callTool(GD,"search_files",{query:`title = '${t}' and parentId = '${m.parentId}'`,pageSize:25,excludeContentSnippets:true},{cache:false});ok=((sr.payload||{}).files||[]).some(x=>x.id===id)}catch(e){ok=true}}}
  catch(e){if(e&&e.code==="tool_error")ok=false;else throw e}
  DRIVE_ALIVE[id]={ok,at:Date.now()};return ok}
const forgetAlive=()=>{for(const k in DRIVE_ALIVE)delete DRIVE_ALIVE[k]};
function askRecreate(k,gone,b){const R=ROOTS[k],r=rootOf(k);
  const what=gone==="root"?`Your “${esc(r?r.title:R.name)}” folder`:gone==="year"?`Your ${esc(yearOf(b))} ${R.name} folder`:gone==="event"?`The ${R.name} folder for ${esc(showName(b))}`:`Some of the ${R.name} folders for ${esc(showName(b))}`;
  return askGone(what)}
function askGone(what){
  return new Promise(res=>{document.querySelector(".rc-bg")?.remove();const bg=document.createElement("div");bg.className="notice-bg cs-bg rc-bg";
    bg.innerHTML=`<div class="notice" role="alertdialog" aria-modal="true" aria-labelledby="rc-t"><button class="x nx" data-no aria-label="Close">×</button>
      <h4 id="rc-t">That folder was deleted</h4>
      <p style="margin:0">${what} isn't in your Google Drive anymore. It may be in your Drive Trash. Create a new one?</p>
      <p class="note" style="margin:0">Want the old one back instead? Restore it from Drive's Trash, then try again. Nothing else in your Drive is touched either way.</p>
      <div class="actions" style="flex-wrap:wrap"><a class="btn" href="https://drive.google.com/drive/trash" target="_blank" rel="noopener">Open Drive Trash</a><button class="btn" data-no>Not now</button><button class="btn primary" data-yes>Create a new one</button></div></div>`;
    document.body.appendChild(bg);const done=v=>{bg.remove();document.removeEventListener("keydown",kd,true);res(v)};const kd=e=>{if(e.key==="Escape"){e.stopPropagation();done(false)}};
    bg.addEventListener("click",e=>{if(e.target===bg||e.target.closest("[data-no]"))done(false);else if(e.target.closest("[data-yes]"))done(true)});document.addEventListener("keydown",kd,true);
    setTimeout(()=>{const y=bg.querySelector("[data-yes]");y&&y.focus()},50)})}
/* Marketing root that still exists (asks before replacing a deleted one). */
async function ensureMktRoot(mcp){let root=rootOf("mkt");
  if(!root){const back=SH_CUR&&SH_CUR.reopen;await new Promise(res=>rootPicker("mkt",res,res));if(back)back();root=rootOf("mkt");if(!root)throw {code:"quiet"};return root}
  if(await folderAlive(mcp,root.id))return root;if(!(await askRecreate("mkt","root",{})))throw {code:"quiet"};return await replaceRoot(mcp,"mkt")}
async function replaceRoot(mcp,k){const R=ROOTS[k],old=rootOf(k),title=(old&&old.title)||R.name;
  const r=await mcp.callTool(GD,"create_file",{title,contentMimeType:FOLDER});const f=fileOf(r.payload);if(!f||!f.id)throw {code:"tool_error"};
  const nd={...(S.drive||{}),[k+"Id"]:f.id,[k+"Title"]:f.title||title,[k+"Url"]:folderUrl(f),["years_"+k]:{}};
  if(!(await save("settings","drive",nd)))throw {code:"quiet"};S.drive=nd;renderDriveInfo();toast(`New “${title}” folder created in My Drive`);return rootOf(k)}
// Make sure Root/Year/Event and its subfolders exist for a booking; remembers ids on the booking.
async function ensureEvent(mcp,b,k,opts={}){const R=ROOTS[k];let root=rootOf(k);
  if(!root){const back=SH_CUR&&SH_CUR.reopen;await new Promise(res=>rootPicker(k,res,res));if(back)back();root=rootOf(k);if(!root)throw {code:"quiet"}}
  const cur=(S.bookings.find(x=>x.id===b.id)||b);let have=(cur.folders||{})[k];if(have&&have.root!==root.id)have=null;
  const d=S.drive||{},yc={...(d["years_"+k]||{})},yr=yearOf(b);let yid=yc[yr];
  // what's still there?
  const rootOk=await folderAlive(mcp,root.id);
  const evOk=rootOk&&!!(have&&have.id)&&await folderAlive(mcp,have.id);
  const subsOk=evOk&&!!have.subs&&(await Promise.all(R.subs.map(([sk])=>have.subs[sk]?folderAlive(mcp,have.subs[sk]):false))).every(Boolean);
  const yearOk=!rootOk||!yid||evOk||await folderAlive(mcp,yid);
  const gone=!rootOk?"root":have&&have.id&&!evOk?"event":!yearOk?"year":evOk&&!subsOk&&have.subs&&R.subs.some(([sk])=>have.subs[sk])?"sub":"";
  if(gone&&!opts.confirmed&&!(await askRecreate(k,gone,b)))throw {code:"quiet"};
  if(evOk&&subsOk)return have;
  if(!rootOk){root=await replaceRoot(mcp,k);have=null;yid=null;for(const y in yc)delete yc[y]}
  if(have&&!evOk)have=null;
  if(yid&&!yearOk){yid=null;delete yc[yr]}
  if(!yid){yid=(await findOrMakeFolder(mcp,yr,root.id)).id;yc[yr]=yid;S.drive={...S.drive,["years_"+k]:yc};await save("settings","drive",S.drive)}
  const ev=have?{id:have.id,viewUrl:have.url}:await findOrMakeFolder(mcp,eventLabel(b),yid);
  const subs={};for(const [sk,sn] of R.subs){const old=have&&have.subs&&have.subs[sk];subs[sk]=old&&await folderAlive(mcp,old)?old:(await findOrMakeFolder(mcp,sn,ev.id)).id}
  forgetAlive();
  const rec={id:ev.id,url:folderUrl(ev),root:root.id,year:yr,subs};
  const extra=k==="mkt"?{driveUrl:"https://drive.google.com/drive/folders/"+subs.media,driveId:subs.media,...(cur.driveId&&cur.driveId!==subs.media?{mediaSharedWith:""}:{})}:{};
  await patch("bookings",b.id,{folders:{[k]:rec},...extra});return rec}
async function driveUpload(mcp,parentId,title,mime,b64){const r=await mcp.callTool(GD,"create_file",{title,parentId,contentMimeType:mime,base64Content:b64,disableConversionToGoogleType:true});
  const f=fileOf(r.payload);if(!f||!f.id)throw {code:"tool_error"};return f}
async function makeEventFolder(b,k,opts){const mcp=await driveReady();if(!mcp)return null;
  try{return await ensureEvent(mcp,b,k,opts)}catch(e){if(!e||e.code!=="quiet")driveErr(e);return null}}
function pickFile(accept){return new Promise(res=>{const i=document.createElement("input");i.type="file";i.accept=accept;i.style.display="none";document.body.appendChild(i);
  i.onchange=()=>{res(i.files[0]||null);i.remove()};i.click()})}
const b64of=file=>new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(",")[1]||"");r.onerror=rej;r.readAsDataURL(file)});
async function uploadToDrive(b,what,btn){const isC=what==="contract";
  const file=await pickFile(isC?".pdf,.doc,.docx,.png,.jpg,.jpeg":"image/*,video/*,.pdf,.psd,.ai,.svg,.zip");if(!file)return;
  if(file.size>15e6){toast("That file is over 15 MB. Drop it into the Drive folder directly.");return}
  const mcp=await driveReady();if(!mcp)return;const label=btn.textContent;btn.disabled=true;btn.textContent="Uploading…";
  try{const ext=(file.name.match(/\.[a-z0-9]+$/i)||[""])[0];const data=await b64of(file);
    const ev=await ensureEvent(mcp,b,isC?"biz":"mkt");
    if(isC){const title=safeName(`${b.date||today()} ${showName(b)} – Contract`)+ext;
      const f=await driveUpload(mcp,ev.subs.contracts,title,file.type||"application/octet-stream",data);
      if(await patch("bookings",b.id,{contract:{id:f.id,url:fileUrl(f),name:title,at:today()}})){toast(`Contract filed in Business / ${ev.year} / ${eventLabel(b)} / Contracts`);bookingView(b.id)}}
    else{await driveUpload(mcp,ev.subs.flyers,safeName(file.name),file.type||"application/octet-stream",data);toast("Added to Flyers");bookingView(b.id)}}
  catch(e){if(!e||e.code!=="quiet")driveErr(e)}
  finally{if(btn.isConnected){btn.disabled=false;btn.textContent=label}}}
const subUrl=(b,k,sk)=>{const f=(b.folders||{})[k];return f&&f.subs&&f.subs[sk]?"https://drive.google.com/drive/folders/"+f.subs[sk]:""};

/* ---------- invoices ---------- */
const money2=n=>"$"+(Number(n)||0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
const isInvStep=(it,st)=>K(st)==="played"&&(it.key==="pl_invoice"||/invoice/i.test(it.label||""));
const INVSET=()=>{const p=S.profile||{},k=S.invset||{};return {biz:k.biz??(p.djName||""),name:k.name??(p.myName||""),email:k.email||"",phone:k.phone??(p.phone||""),address:k.address||"",website:k.website??(p.website||""),pay:k.pay||"",terms:k.terms??15,hourly:k.hourly||"",prefix:cleanPrefix(k.prefix),next:Number(k.next)||1,note:k.note??"Thank you for having me!"}};
function invTotals(inv){const sub=(inv.lines||[]).reduce((t,l)=>t+(Number(l.qty)||0)*(Number(l.rate)||0),0),dep=Number(inv.deposit)||0;return {sub,dep,due:Math.max(0,sub-dep)}}
function defaultBillTo(b){const v=contact(b.venueId);return b.contactPersonId||b.promoterId||(v&&v.bookingContactId)||b.venueId||""}
function invPayText(inv,k){const parts=[handlesText(inv.payMethods||[]),inv.payInfo].filter(x=>String(x||"").trim());return parts.length?parts.join("\n"):((k&&k.pay)||"")}
function newInvoice(b){const k=INVSET();return {payInfo:b.payInfo||"",payMethods:b.payPrefs||[],issueDate:today(),dueDate:b.payDue&&b.payDue>=today()?b.payDue:addDays(today(),Number(k.terms)||0),billToId:defaultBillTo(b),
  lines:[{desc:`DJ performance – ${showName(b)}`,qty:1,unit:"flat",rate:Number(b.fee)||0,kind:"service"}],deposit:"",notes:k.note}}
const UNITS=[["flat","Flat fee"],["hours","Hours"],["each","Each"]];
function billInfo(inv){const c=contact(inv.billToId);return {name:inv.billName||(c?cName(c):""),org:c&&c.org&&c.org!==cName(c)?c.org:"",email:inv.billEmail??(c&&c.email||""),address:inv.billAddr??(c&&c.address||"")}}
let JSPDF=null;
function loadJsPDF(){if(window.jspdf&&window.jspdf.jsPDF)return Promise.resolve(window.jspdf.jsPDF);if(JSPDF)return JSPDF;
  JSPDF=new Promise((res,rej)=>{const sc=document.createElement("script");sc.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";sc.onload=()=>window.jspdf?res(window.jspdf.jsPDF):rej(new Error("load"));sc.onerror=()=>{JSPDF=null;rej(new Error("load"))};document.head.appendChild(sc)});return JSPDF}
async function invoicePdf(b,inv){const jsPDF=await loadJsPDF(),k=INVSET(),bi=billInfo(inv),T=invTotals(inv);
  const PC=pdfColors(),doc=new jsPDF({unit:"pt",format:"letter"}),W=612,H=792,M=54,R=W-M;
  /* readability: all details in near-black; the palette only colors headings, the table header, rules and tints */
  const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(c[0])+.7152*f(c[1])+.0722*f(c[2])};
  const mix=(c,t)=>c.map(v=>Math.round(v+(255-v)*t)),dark=(c,f2)=>c.map(v=>Math.round(v*f2));
  let acc=PC.accent;for(let i=0;i<8&&lum(acc)>.16;i++)acc=dark(acc,.85);
  const ink=[17,17,17],sub=[64,64,64],tint=mix(PC.soft,.25),band=mix(PC.soft,.62),rule=mix(acc,.6),onAcc=lum(acc)<.4?[255,255,255]:ink;
  const tx=(t,x,yy,o={})=>{doc.setFont("helvetica",o.bold?"bold":"normal");doc.setFontSize(o.size||10.5);doc.setTextColor(...(o.color||ink));
    const op={};if(o.align)op.align=o.align;if(o.cs)op.charSpace=o.cs;doc.text(String(t),x,yy,op)};
  const label=(t,x,yy,o={})=>tx(String(t).toUpperCase(),x,yy,{bold:1,size:8.5,color:acc,cs:.6,...o});
  const lines=(arr,x,yy,o={})=>{arr.forEach((t,i)=>{tx(t,x,yy,{...o,bold:o.boldFirst&&i===0?1:o.bold});yy+=(o.size||10.5)*1.5});return yy};
  const frame=()=>{doc.setFillColor(...acc);doc.rect(0,0,W,6,"F");
    tx([k.biz||k.name||"",inv.number?"Invoice "+inv.number:""].filter(Boolean).join("   ·   "),M,H-30,{size:8.5,color:sub})};
  frame();let y=74;
  tx(k.biz||k.name||"Invoice",M,y,{bold:1,size:22});tx("INVOICE",R,y,{bold:1,size:22,color:acc,align:"right"});
  const from=[k.biz&&k.name&&k.name!==k.biz?k.name:"",...String(k.address||"").split("\n"),k.email,k.phone,k.website].map(x=>String(x||"").trim()).filter(Boolean);
  const yL=lines(from,M,y+24,{});
  const meta=[["Invoice #",inv.number||"Draft"],["Issued",fmtD(inv.issueDate)],["Due",fmtD(inv.dueDate)]],mx=R-210;
  doc.setFillColor(...tint);doc.roundedRect(mx,y+12,R-mx,meta.length*19+14,4,4,"F");let yR=y+30;
  meta.forEach(([l2,v2])=>{tx(l2,mx+12,yR,{size:10,color:sub});tx(v2,R-12,yR,{bold:1,size:10.5,align:"right"});yR+=19});
  y=Math.max(yL,yR+10)+14;doc.setDrawColor(...rule);doc.setLineWidth(1);doc.line(M,y,R,y);y+=28;
  label("Bill to",M,y);label("Event",W/2,y);y+=17;
  const billL=[bi.name,bi.org,...String(bi.address||"").split("\n"),bi.email].map(x=>String(x||"").trim()).filter(Boolean);
  const v=contact(b.venueId);const evL=[showName(b),[v?cName(v):"",b.city].filter(Boolean).join(", "),[fmtD(b.date),b.setTime].filter(Boolean).join(" · ")].filter(Boolean);
  const yb=lines(billL.length?billL:["—"],M,y,{boldFirst:1}),ye=lines(evL,W/2,y,{boldFirst:1});y=Math.max(yb,ye)+16;
  const cQ=R-205,cR=R-105;
  const head=()=>{doc.setFillColor(...acc);doc.rect(M,y,R-M,26,"F");
    [["Description",M+12,""],["Qty",cQ,"right"],["Rate",cR,"right"],["Amount",R-12,"right"]].forEach(([t,x,al])=>tx(t.toUpperCase(),x,y+17,{bold:1,size:8.5,color:onAcc,cs:.6,align:al||undefined}));y+=26};
  head();
  (inv.lines||[]).forEach((l,i)=>{doc.setFont("helvetica","normal");doc.setFontSize(10.5);const d=doc.splitTextToSize(String(l.desc||"")+(l.kind==="expense"?" (expense)":""),cQ-M-80);const rh=Math.max(1,d.length)*15+14;
    if(y+rh>H-120){doc.addPage();frame();y=64;head()}
    if(i%2===1){doc.setFillColor(...band);doc.rect(M,y,R-M,rh,"F")}
    const by=y+19;d.forEach((t,j)=>tx(t,M+12,by+j*15,{}));const q=Number(l.qty)||0;
    tx(l.unit==="hours"?q+" hr"+(q===1?"":"s"):String(q),cQ,by,{align:"right"});tx(money2(l.rate),cR,by,{align:"right"});tx(money2(q*(Number(l.rate)||0)),R-12,by,{bold:1,align:"right"});
    y+=rh;doc.setDrawColor(...rule);doc.setLineWidth(.6);doc.line(M,y,R,y)});
  y+=22;if(y>H-170){doc.addPage();frame();y=74}
  const tot=[["Subtotal",money2(T.sub)]];if(T.dep)tot.push(["Deposit received","-"+money2(T.dep)]);
  tot.forEach(([l2,v2])=>{tx(l2,cR,y,{color:sub,align:"right"});tx(v2,R-12,y,{align:"right"});y+=19});
  y+=4;const bx=cQ-60;doc.setFillColor(...tint);doc.rect(bx,y,R-bx,38,"F");doc.setFillColor(...acc);doc.rect(bx,y,5,38,"F");
  label("Balance due",bx+18,y+23,{size:9.5});tx(money2(T.due),R-12,y+25,{bold:1,size:16,align:"right"});y+=66;
  const block=(h,t)=>{if(!String(t||"").trim())return;doc.setFont("helvetica","normal");doc.setFontSize(10.5);const d=doc.splitTextToSize(String(t),R-M);if(y+d.length*15+30>H-50){doc.addPage();frame();y=74}
    label(h,M,y);y+=17;d.forEach(x=>{tx(x,M,y,{});y+=15});y+=16};
  block("Payment",[(inv.payMethods||[]).length?"Accepted: "+inv.payMethods.map(pmName).join(", "):"",invPayText(inv,k),inv.dueDate?`Please pay by ${fmtD(inv.dueDate)}. Reference ${inv.number||"this invoice"} with your payment.`:""].filter(x=>String(x).trim()).join("\n"));
  block("Notes",inv.notes);
  return doc}
function pdfColors(){const r=document.documentElement,prev=r.getAttribute("data-mode");if(prev!=="light")r.setAttribute("data-mode","light");
  const cs=getComputedStyle(r),probe=document.createElement("span");document.body.appendChild(probe);
  const rgb=v=>{v=String(v||"").trim();const hex=v.match(/#[0-9a-f]{3,8}/i);if(/gradient/i.test(v)&&hex)v=hex[0];probe.style.color="";probe.style.color=v;const m=getComputedStyle(probe).color.match(/[\d.]+/g)||[0,0,0];return m.slice(0,3).map(Number)};
  const out={accent:rgb(cs.getPropertyValue("--accent")),soft:rgb(cs.getPropertyValue("--soft")),hero:rgb(cs.getPropertyValue("--hero")),line:rgb(cs.getPropertyValue("--line")),ink:rgb(cs.getPropertyValue("--ink")),muted:rgb(cs.getPropertyValue("--muted"))};
  probe.remove();if(prev!=="light")prev?r.setAttribute("data-mode",prev):r.removeAttribute("data-mode");return out}
const invFileName=(b,inv)=>safeName(`${inv.number||"Invoice"} ${showName(b)}`)+".pdf";
const b64Pdf=doc=>doc.output("datauristring").split(",")[1];

function invoiceSheet(bid){navSheet("inv:"+bid,()=>invoiceSheet(bid));const b0=S.bookings.find(x=>x.id===bid);if(!b0)return;
  const k=INVSET();let inv=JSON.parse(JSON.stringify(b0.invoice||newInvoice(b0)));let me={...k};
  const exps=S.expenses.filter(e=>e.bookingId===bid);
  const lineHtml=(l,i)=>`<div class="inv-line" data-li="${i}"><div class="d"><input data-lf="desc" value="${esc(l.desc)}" placeholder="${l.kind==="expense"?"What was the expense?":"Description"}" aria-label="Line ${i+1} description">${l.kind==="expense"?`<span class="pill" style="color:var(--muted);flex:none">Expense</span>`:""}</div>
    <select data-lf="unit" aria-label="Line ${i+1} type">${UNITS.map(([u,n])=>`<option value="${u}" ${l.unit===u?"selected":""}>${n}</option>`).join("")}</select>
    <input data-lf="qty" type="number" inputmode="decimal" step="0.25" min="0" value="${esc(l.qty)}" aria-label="Line ${i+1} ${l.unit==="hours"?"hours":"quantity"}" title="${l.unit==="hours"?"Hours":"Quantity"}">
    <input data-lf="rate" type="number" inputmode="decimal" step="0.01" min="0" value="${esc(l.rate)}" aria-label="Line ${i+1} ${l.unit==="hours"?"rate per hour":"amount"}" title="${l.unit==="hours"?"Rate per hour":"Rate"}">
    <span class="amt" data-amt>${money2((Number(l.qty)||0)*(Number(l.rate)||0))}</span><button type="button" class="x" data-ldel="${i}" aria-label="Remove line ${i+1}">×</button>
</div>`;
  const totHtml=()=>{const T=invTotals(inv);return `<span class="note">Subtotal</span><span class="num">${money2(T.sub)}</span>${T.dep?`<span class="note">Deposit received</span><span class="num">−${money2(T.dep)}</span>`:""}<span class="big">Balance due</span><span class="big num">${money2(T.due)}</span>`};
  const bi=billInfo(inv),feeDiff=()=>Math.abs(invTotals(inv).sub-(Number(b0.fee)||0))>0.004;
  sheet(`<div class="head"><div><span class="eyebrow">Invoice${inv.number?" · "+esc(inv.number):" · new"}</span><h3 style="margin-top:4px">${esc(showName(b0))}</h3></div></div>
  <div class="f"><label for="iv-num">Invoice number</label><div style="display:flex;gap:8px;align-items:center"><input id="iv-num" value="${esc(inv.number||invSuggest(k.prefix,(inv.issueDate||today()).slice(0,4),bid).num)}" style="flex:1;border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:9px 11px;font-variant-numeric:tabular-nums"><button type="button" class="btn small" id="iv-sug" hidden>Use suggested</button></div><span class="note" id="iv-numnote"></span></div>
  <div class="frow"><div class="f"><label for="iv-to">Bill to</label><select id="iv-to" class="srch"><option value="">Someone not in People</option>${contactOpts(null,inv.billToId).replace(/^<option value="">[^<]*<\/option>/,"")}</select></div>
    ${field("iv-email","Their email",bi.email,"email")}</div>
  <div class="frow">${field("iv-name","Name on invoice",bi.name,"text",'placeholder="Person or company"')}${field("iv-addr","Their address (optional)",bi.address)}</div>
  <div class="frow">${field("iv-issue","Invoice date",inv.issueDate,"date")}${field("iv-due","Due on",inv.dueDate,"date")}</div>
  <div class="f"><label>Charges</label><div class="inv-line inv-head" aria-hidden="true"><span>Type</span><span>Qty / hrs</span><span>Rate</span><span class="amt">Amount</span><span></span></div><div id="iv-lines">${inv.lines.map(lineHtml).join("")}</div>
    <div class="chips" style="margin-top:8px"><button type="button" class="btn small" data-addl="hours">＋ Hourly fee</button><button type="button" class="btn small" data-addl="flat">＋ Flat fee</button><button type="button" class="btn small" data-addl="travel">＋ Travel</button><button type="button" class="btn small" data-addl="expense">＋ Other expense</button>${exps.length?`<button type="button" class="btn small" data-addl="logged">＋ Logged expenses (${exps.length})</button>`:""}</div></div>
  <div class="frow">${field("iv-dep","Deposit already received ($)",inv.deposit,"number",'inputmode="decimal" min="0" step="0.01"')}<div class="f"><label>&nbsp;</label><div class="inv-tot" id="iv-tot">${totHtml()}</div></div></div>
  <div class="f"><label>How they can pay you</label><div class="chips" id="iv-pm">${PAYM.filter(([m])=>m!=="other").map(([m,l])=>{const h=PH()[m];return `<button type="button" class="chip" data-ivpm="${m}" aria-pressed="${(inv.payMethods||[]).includes(m)}">${esc(l)}${h?` <span style="opacity:.7;font-weight:500">${esc(h)}</span>`:""}</button>`}).join("")}</div>
    <span class="note" id="iv-pmnote"></span></div>
  <div class="f"><label for="iv-pay">Extra payment details (optional)</label><textarea id="iv-pay" data-fincheck style="min-height:52px" placeholder="e.g. Checks payable to … or bank transfer details for this invoice">${esc(inv.payInfo||"")}</textarea><span class="note">Bank or card numbers go on this invoice but aren't saved in the app.</span></div>
  <div class="f"><label for="iv-notes">Note on the invoice</label><textarea id="iv-notes" style="min-height:56px">${esc(inv.notes)}</textarea></div>
  <label class="note" id="iv-feew" style="display:${feeDiff()?"flex":"none"};gap:8px;align-items:center"><input type="checkbox" id="iv-fee" checked> Update this booking's fee to the invoice total so Financials match</label>
  <details ${k.pay&&k.email?"":"open"}><summary style="cursor:pointer;font-weight:600;padding:6px 0">Your details on every invoice</summary>
    <div class="frow">${field("ivs-biz","Business or DJ name",me.biz)}${field("ivs-name","Your legal name",me.name)}</div>
    <div class="frow">${field("ivs-email","Email",me.email,"email")}${field("ivs-phone","Phone",me.phone,"tel")}</div>
    <div class="f"><label for="ivs-addr">Mailing address</label><textarea id="ivs-addr" style="min-height:52px" placeholder="Street, city, state ZIP">${esc(me.address)}</textarea></div>
    ${field("ivs-web","Website",me.website)}
    <div class="f"><label for="ivs-pay">How to pay you</label><textarea id="ivs-pay" data-fincheck style="min-height:62px" placeholder="e.g. Zelle: you@email.com · Venmo: @yourname · Checks payable to …">${esc(me.pay)}</textarea></div>
    <div class="frow">${field("ivs-hourly","Default hourly rate ($)",me.hourly,"number",'min="0" step="0.01"')}${field("ivs-prefix","Number prefix",me.prefix,"text",'placeholder="INV-" maxlength="8"')}</div>
</details>
  <p class="note" id="iv-drivenote" style="margin:0"></p>
  <div id="iv-status" class="note">${inv.fileUrl?`Saved in Drive: <a href="${esc(inv.fileUrl)}" target="_blank" rel="noopener">${esc(inv.fileName||"invoice PDF")}</a>`:""}${inv.draftUrl?`${inv.fileUrl?" · ":""}<a href="${esc(inv.draftUrl)}" target="_blank" rel="noopener">Sent${inv.sentAt?" "+esc(fmtD(inv.sentAt)):""} · open in Gmail</a>`:""}</div>
  <div class="actions" style="flex-wrap:wrap"><button class="btn" data-cancel>Close</button><button class="btn save" data-ivsave>Save draft</button><button class="btn" data-ivpdf>Download PDF</button><a class="btn" data-ivopen target="_blank" rel="noopener" href="${esc(inv.fileUrl||"#")}" ${inv.fileUrl?"":"hidden"}>Open PDF in Drive</a><button class="btn" data-ivdrive>${inv.fileUrl?"Update PDF in Drive":"Save PDF to Drive"}</button><button class="btn primary" data-ivmail>Email it</button></div>`,root=>{
    const q=s=>root.querySelector(s);
    const read=()=>{inv.billToId=q("#iv-to").value;inv.billEmail=q("#iv-email").value.trim();inv.billName=q("#iv-name").value.trim();inv.billAddr=q("#iv-addr").value.trim();
      inv.issueDate=q("#iv-issue").value||today();inv.dueDate=q("#iv-due").value;inv.deposit=q("#iv-dep").value;inv.notes=q("#iv-notes").value;inv.payInfo=q("#iv-pay").value.trim();inv.payMethods=[...root.querySelectorAll("[data-ivpm]")].filter(x=>x.getAttribute("aria-pressed")==="true").map(x=>x.dataset.ivpm);
      root.querySelectorAll("[data-li]").forEach(r=>{const l=inv.lines[+r.dataset.li];if(!l)return;r.querySelectorAll("[data-lf]").forEach(el=>{const f=el.dataset.lf;l[f]=f==="qty"||f==="rate"?(el.value===""?"":Number(el.value)):el.value})});
      me={...me,biz:q("#ivs-biz").value.trim(),name:q("#ivs-name").value.trim(),email:q("#ivs-email").value.trim(),phone:q("#ivs-phone").value.trim(),address:q("#ivs-addr").value.trim(),website:q("#ivs-web").value.trim(),pay:q("#ivs-pay").value.trim(),terms:(()=>{const a=parseD(q("#iv-issue").value),d=parseD(q("#iv-due").value);return a&&d?Math.max(0,Math.round((d-a)/864e5)):me.terms})(),hourly:q("#ivs-hourly").value,prefix:cleanPrefix(q("#ivs-prefix").value)}};
    const retot=()=>{read();q("#iv-tot").innerHTML=totHtml();root.querySelectorAll("[data-li]").forEach(r=>{const l=inv.lines[+r.dataset.li];r.querySelector("[data-amt]").textContent=money2((Number(l.qty)||0)*(Number(l.rate)||0))});q("#iv-feew").style.display=feeDiff()?"flex":"none";numNote()};
    const numNote=()=>{const yr=(q("#iv-issue").value||today()).slice(0,4),sg=invSuggest(cleanPrefix(q("#ivs-prefix").value),yr,bid),cur=q("#iv-num").value.trim(),dup=invDup(cur,bid);
      q("#iv-numnote").innerHTML=dup?`<span style="color:var(--bad)">${esc(cur)} is already used on another booking.</span> Suggested: <b>${esc(sg.num)}</b>`:`${sg.count?`${sg.count} invoice${sg.count>1?"s":""} in the app so far${sg.inYear!==sg.count?` (${sg.inYear} in ${yr})`:""}. `:"This is your first invoice in the app. "}${cur===sg.num?"This is the next number in order.":`Next in order: <b>${esc(sg.num)}</b>`}`;
      const sb=q("#iv-sug");const std=new RegExp("^"+escRe(cleanPrefix(q("#ivs-prefix").value))+"\\d{4}-\\d{3,}$","i").test(cur);sb.hidden=cur===sg.num||(!!inv.number&&cur===inv.number&&!dup&&std);sb.onclick=()=>{q("#iv-num").value=sg.num;numNote()}};
    q("#iv-num").oninput=numNote;q("#iv-issue").addEventListener("change",()=>{if(!inv.number)q("#iv-num").value=invSuggest(cleanPrefix(q("#ivs-prefix").value),(q("#iv-issue").value||today()).slice(0,4),bid).num;numNote()});numNote();
    const redraw=()=>{read();q("#iv-lines").innerHTML=inv.lines.map(lineHtml).join("");wireLines();retot()};
    const wireLines=()=>{root.querySelectorAll("#iv-lines input").forEach(i=>i.oninput=retot);root.querySelectorAll("#iv-lines select").forEach(sl=>sl.onchange=redraw);
      root.querySelectorAll("[data-ldel]").forEach(x=>x.onclick=()=>{read();inv.lines.splice(+x.dataset.ldel,1);q("#iv-lines").innerHTML=inv.lines.map(lineHtml).join("");wireLines();retot()})};
    wireLines();root.querySelectorAll("#iv-dep,#ivs-prefix").forEach(i=>i.oninput=retot);q("#ivs-prefix").addEventListener("input",()=>{if(!inv.number){const sg=invSuggest(cleanPrefix(q("#ivs-prefix").value),(q("#iv-issue").value||today()).slice(0,4),bid);q("#iv-num").value=sg.num;numNote()}});
    q("#iv-to").onchange=()=>{const c=contact(q("#iv-to").value);if(c){q("#iv-email").value=c.email||"";q("#iv-name").value=cName(c);q("#iv-addr").value=c.address||""}};
    let lastIssue=q("#iv-issue").value;q("#iv-issue").onchange=()=>{const a=parseD(lastIssue),d=parseD(q("#iv-due").value),gap=a&&d?Math.round((d-a)/864e5):(Number(me.terms)||15);if(q("#iv-issue").value)q("#iv-due").value=addDays(q("#iv-issue").value,Math.max(0,gap));lastIssue=q("#iv-issue").value};
    root.querySelectorAll("[data-addl]").forEach(x=>x.onclick=()=>{read();const a=x.dataset.addl;
      if(a==="logged"){const have=new Set(inv.lines.map(l=>l.expId).filter(Boolean));const add=exps.filter(e=>!have.has(e.id));if(!add.length){toast("Those expenses are already on it");return}
        add.forEach(e=>inv.lines.push({desc:e.desc||e.category||"Expense",qty:1,unit:"flat",rate:Number(e.amount)||0,kind:"expense",expId:e.id}))}
      else inv.lines.push(a==="hours"?{desc:"DJ performance (hourly)",qty:4,unit:"hours",rate:Number(me.hourly)||"",kind:"service"}:a==="flat"?{desc:"",qty:1,unit:"flat",rate:"",kind:"service"}:a==="travel"?{desc:"Travel (mileage, gas, parking)",qty:1,unit:"flat",rate:"",kind:"expense"}:{desc:"",qty:1,unit:"flat",rate:"",kind:"expense"});
      q("#iv-lines").innerHTML=inv.lines.map(lineHtml).join("");wireLines();retot();const ins=root.querySelectorAll("#iv-lines [data-lf=desc]");const last=ins[ins.length-1];last&&last.focus()});
    q("[data-cancel]").onclick=close;
    const persist=async()=>{read();if(!inv.lines.length||!(invTotals(inv).sub>0)){toast("Add at least one charge");return null}
      const bi2=billInfo(inv);if(!bi2.name){toast("Add who you're billing");q("#iv-name").focus();return null}
      const setDoc={biz:me.biz,name:me.name,email:me.email,phone:me.phone,address:me.address,website:me.website,pay:me.pay,terms:me.terms,hourly:me.hourly,prefix:me.prefix,note:(S.invset||{}).note??INVSET().note,next:me.next};
      const num=q("#iv-num").value.trim()||invSuggest(me.prefix,(inv.issueDate||today()).slice(0,4),bid).num;
      if(invDup(num,bid)){toast(num+" is already used on another booking. Use the suggested number.");q("#iv-num").focus();return null}
      inv.number=num;q("#iv-num").value=num;
      if(!(await save("settings","invoice",setDoc)))return null;S.invset=setDoc;
      inv.updatedAt=new Date().toISOString();const upd={invoice:inv};if(feeDiff()&&q("#iv-fee").checked)upd.fee=Math.round(invTotals(inv).sub*100)/100;
      if(!(await patch("bookings",bid,upd)))return null;const bb=S.bookings.find(x=>x.id===bid)||b0;return {b:{...bb,...upd},inv}};
    const status=()=>{q("#iv-status").innerHTML=`${inv.fileUrl?`Saved in Drive: <a href="${esc(inv.fileUrl)}" target="_blank" rel="noopener">${esc(inv.fileName||"invoice PDF")}</a>`:""}${inv.draftUrl?`${inv.fileUrl?" · ":""}<a href="${esc(inv.draftUrl)}" target="_blank" rel="noopener">Sent${inv.sentAt?" "+esc(fmtD(inv.sentAt)):""} · open in Gmail</a>`:""}`};
    const busy=(btn,on,txt)=>{btn.disabled=on;if(txt)btn.textContent=txt};
    q("[data-ivsave]").onclick=async()=>{if(await persist()){toast("Draft of "+inv.number+" saved");status()}};
    q("[data-ivpdf]").onclick=async e=>{const btn=e.currentTarget;busy(btn,true,"Saving…");const r=await persist();if(!r){busy(btn,false,"Download PDF");return}busy(btn,true,"Making PDF…");
      try{const doc=await invoicePdf(r.b,inv);await dl(invFileName(r.b,inv),doc.output("arraybuffer"))}catch(err){console.error(err);toast("Couldn't make the PDF: "+(err&&err.message||"try again"))}finally{busy(btn,false,"Download PDF")}};
    /* One PDF per invoice in Drive. After edits, "Update" replaces it: the new PDF goes in and the old one goes to Drive's Trash, so there are never duplicates. */
    let fileGone=false;
    const hashStr=t=>{let h=5381;for(let i=0;i<t.length;i++)h=((h<<5)+h+t.charCodeAt(i))|0;return (h>>>0).toString(36)};
    const sigNow=()=>{read();return hashStr(JSON.stringify(scrubFin([q("#iv-num").value.trim(),inv.issueDate,inv.dueDate,q("#iv-to").value,q("#iv-name").value.trim(),q("#iv-email").value.trim(),q("#iv-addr").value.trim(),(inv.lines||[]).map(l=>[String(l.desc||""),String(l.unit||""),Number(l.qty)||0,Number(l.rate)||0]),Number(inv.deposit)||0,String(inv.notes||""),String(inv.payInfo||""),[...(inv.payMethods||[])].sort(),handlesText(inv.payMethods||[]),[me.biz,me.name,me.email,me.phone,me.address,me.website,me.pay].map(x=>String(x||""))])))};
    const driveBtns=()=>{const op=q("[data-ivopen]"),dv=q("[data-ivdrive]"),nt=q("#iv-drivenote");if(!op||!dv||dv.dataset.busy)return;
      if(!inv.fileUrl||fileGone){op.hidden=true;dv.disabled=false;dv.textContent="Save PDF to Drive";if(nt)nt.innerHTML=fileGone?"The saved PDF was deleted from Drive. Save it again to make a new one.":"";return}
      op.hidden=false;op.href=inv.fileUrl;const dirty=sigNow()!==inv.fileSig;dv.disabled=!dirty;dv.textContent="Update PDF in Drive";
      if(nt)nt.innerHTML=dirty?"<b>You have changes that aren't in the Drive PDF yet.</b> Tap Update PDF in Drive to replace it.":"The PDF in Drive is up to date. Edit the invoice and Update PDF in Drive turns on.";};
    const toDrive=async b=>{const sig=sigNow();const doc=await invoicePdf(b,inv);const mcp=await driveReady();if(!mcp)return null;
      const title=safeName(`${b.date||inv.issueDate} ${showName(b)} – Invoice ${inv.number}`)+".pdf";const sv=((S.bookings.find(x=>x.id===bid)||{}).invoice)||{},old=!fileGone&&(inv.fileId||sv.fileId)||"";
      const ev=await ensureEvent(mcp,b,"biz");const f=await driveUpload(mcp,ev.subs.invoices,title,"application/pdf",b64Pdf(doc));
      if(old&&old!==f.id){try{await mcp.callTool(GD,"trash_file",{fileId:old})}catch(e){}}
      inv.fileId=f.id;inv.fileUrl=fileUrl(f);inv.fileName=title;inv.fileSig=sig;fileGone=false;forgetAlive();
      await patch("bookings",bid,{invoice:{fileId:f.id,fileUrl:inv.fileUrl,fileName:title,fileSig:sig}});return {doc,f,updated:!!old}};
    if(inv.fileUrl&&!inv.fileSig)setTimeout(()=>{inv.fileSig=sigNow();driveBtns()},0);else setTimeout(driveBtns,0);
    root.addEventListener("input",()=>driveBtns());root.addEventListener("change",()=>driveBtns());root.addEventListener("click",e=>{if(e.target.closest("[data-ivpm],[data-ldel],[data-addl]"))setTimeout(driveBtns,0)});
    if(inv.fileId)(async()=>{const mcp=await claude.use("mcp");if(!mcp)return;try{if(!(await folderAlive(mcp,inv.fileId))){fileGone=true;driveBtns()}}catch(e){}})();
    const pmNote=()=>{const sel=[...root.querySelectorAll("[data-ivpm]")].filter(x=>x.getAttribute("aria-pressed")==="true").map(x=>x.dataset.ivpm),h=PH(),miss=sel.filter(m=>PH_DEF.some(([k2])=>k2===m)&&!h[m]);
      const t=handlesText(sel," · ");q("#iv-pmnote").innerHTML=(t?"On the invoice: "+esc(t):"Pick how they can pay you. Your saved usernames are added to the invoice.")+(miss.length?`<br>No ${esc(miss.map(pmName).join(", "))} username saved yet. Add it in Settings → How you get paid.`:"")};
    root.querySelectorAll("[data-ivpm]").forEach(x=>x.onclick=()=>{x.setAttribute("aria-pressed",x.getAttribute("aria-pressed")!=="true");pmNote()});pmNote();
    q("[data-ivdrive]").onclick=async e=>{const btn=e.currentTarget;btn.dataset.busy=1;busy(btn,true,"Saving…");const r=await persist();if(!r){busy(btn,false,"Save PDF to Drive");delete btn.dataset.busy;driveBtns();return}
      try{const d=await toDrive(r.b);if(d){toast(d.updated?"PDF in Drive updated":`Filed in Business / ${yearOf(r.b)} / ${eventLabel(r.b)} / Invoices`);status();if(!root.isConnected&&SH_CUR&&SH_CUR.key==="inv:"+bid)invoiceSheet(bid)}}catch(err){console.error(err);err&&err.code?(err.code!=="quiet"&&driveErr(err)):toast("Couldn't make the PDF: "+(err&&err.message||"try again"))}finally{busy(btn,false,"Save PDF to Drive");delete btn.dataset.busy;driveBtns()}};
    q("[data-ivmail]").onclick=async e=>{const btn=e.currentTarget;busy(btn,true,"Saving…");const r=await persist();if(!r){busy(btn,false,"Email it");return}const bi2=billInfo(inv);if(!bi2.email){busy(btn,false,"Email it");toast("Add their email first");q("#iv-email").focus();return}
      busy(btn,true,"Preparing…");
      try{let doc,link="";if(!inv.fileUrl||fileGone||sigNow()!==inv.fileSig){const d=await toDrive(r.b);if(d){doc=d.doc;link=inv.fileUrl;driveBtns()}}else link=inv.fileUrl;if(!doc)doc=await invoicePdf(r.b,inv);
        const T=invTotals(inv),pc=S.contacts.find(c=>String(c.email||"").toLowerCase()===bi2.email.toLowerCase()&&!isColl(c)&&c.type!=="venue"),first=pc?(cName(pc).split(" ")[0]||"there"):"there";
        const body=`Hi ${first},\n\nThanks again for having me at ${showName(r.b)}${r.b.date?" on "+fmtD(r.b.date):""}. Attached is invoice ${inv.number} for ${money2(T.due)}, due ${fmtD(inv.dueDate)}.\n\n${invPayText(inv,me)?"How to pay:\n"+invPayText(inv,me)+"\n\n":""}Let me know if you need anything else from me.\n\nThanks,\n${me.name||me.biz}`;
        const subject=`Invoice ${inv.number} – ${showName(r.b)}`,fname=invFileName(r.b,inv);
        busy(btn,true,"Review…");if(!(await confirmSend({to:[bi2.email],subject,body,attachName:fname})))return;busy(btn,true,"Sending…");
        const res=await gmailSend({to:[bi2.email],subject,body,attachments:[{filename:fname,mimeType:"application/pdf",content:b64Pdf(doc)}],bookingId:bid,contactId:((S.contacts.find(c=>String(c.email||"").toLowerCase()===bi2.email.toLowerCase())||{}).id)||inv.billToId||"",kind:"invoice"});
        inv.draftUrl=gmLink(res);inv.sentAt=today();await patch("bookings",bid,{invoice:{draftUrl:inv.draftUrl,sentAt:inv.sentAt}});status();
        notice({title:"Invoice sent",body:`${esc(inv.number)} for ${esc(money2(invTotals(inv).due))} went to ${esc(bi2.email)} with the PDF attached. Tick “Send invoice” on the booking when you're ready.`,link:inv.draftUrl,linkText:"Open in Gmail",extra:inv.fileUrl?`<a class="btn" href="${esc(inv.fileUrl)}" target="_blank" rel="noopener">View PDF in Drive</a>`:""})}
      catch(err){console.error(err);sendErr(err,"the invoice")}finally{if(btn.isConnected)busy(btn,false,"Email it")}};
  })}
const cleanPrefix=p=>{let x=String(p||"").trim().replace(/[\s\d\-_/]+$/,"");return x?x+"-":"INV-"};
const escRe=x=>String(x).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
function invSuggest(prefix,yr,bid){prefix=cleanPrefix(prefix);const re=new RegExp("^"+escRe(prefix)+escRe(yr)+"-(\\d+)$","i");let max=0,count=0,inYear=0;
  S.bookings.forEach(b=>{if(b.id===bid)return;const n=String((b.invoice||{}).number||"").trim();if(!n)return;count++;const m=n.match(re);if(m){inYear++;max=Math.max(max,+m[1])}});
  return {num:`${prefix}${yr}-${String(max+1).padStart(3,"0")}`,count,inYear}}
const invDup=(num,bid)=>{const n=String(num||"").trim().toLowerCase();return !!n&&S.bookings.some(b=>b.id!==bid&&String((b.invoice||{}).number||"").trim().toLowerCase()===n)};
const invNum=k=>invSuggest(k.prefix,String(new Date().getFullYear()),"").num;

/* ---------- reach out to a contact: email first, Instagram suggested ---------- */
const igHandle=v=>{const t=String(v||"").trim();if(!t)return"";const m=t.match(/instagram\.com\/([A-Za-z0-9._]+)/i);return (m?m[1]:t).replace(/^@/,"").replace(/[\/?#].*$/,"")};
const bookingsWith=c=>sortedBookings().filter(b=>[b.venueId,b.promoterId,b.contactPersonId,b.mediaId].includes(c.id)||(contact(b.venueId)||{}).bookingContactId===c.id||(isColl(c)&&membersOf(c).some(m=>m.id===b.contactPersonId)));
function nextBookingWith(c){const bs=bookingsWith(c),t=today();return bs.find(b=>b.date&&b.date>=t&&K(b.status)!=="lost")||bs[bs.length-1]||null}
function dmText(c){const p=S.profile||{},k=S.kit||{},first=(c.type==="venue"||isColl(c))?"":(cName(c).split(" ")[0]||"");
  const mix=(sortedLinks().find(l=>/mix|soundcloud|mixcloud|youtube/i.test((l.label||"")+" "+(l.url||"")))||{}).url||p.epk||p.website||"";
  const me=`I'm ${p.djName||p.myName||"a DJ"}${p.city?", a DJ based in "+p.city:", a DJ"}${k.genres?" playing "+k.genres:""}.`;
  const hi=`Hey${first?" "+first:""}! `,mx=mix?` Here's a recent mix: ${mix}`:"";
  if(c.type==="media")return `${hi}${me} I love your work and have a show coming up. Would you be open to shooting it? Happy to send details and talk rates.${mx}`;
  if(c.type==="venue")return `${hi}${me} I'd love to play at ${cName(c)} sometime.${mx} Who's the best person to talk to about bookings?`;
  if(c.type==="promoter")return `${hi}${me} Big fan of what ${isColl(c)?cName(c)+" is":"you're"} doing and I'd love to play one of your events.${mx} Let me know if you're booking!`;
  return `${hi}${me}${mx} Would love to connect!`}
function reachSheet(cid){navSheet("r:"+cid,()=>reachSheet(cid));const c=contact(cid);if(!c)return;
  const email=String(c.email||"").trim(),ig=igHandle(c.instagram),phone=String(c.phone||"").replace(/[^\d+]/g,"");
  // a collective without its own email: offer its people's emails
  const ppl=isColl(c)?membersOf(c).filter(m=>m.email):[];
  const nb=nextBookingWith(c),aud=c.type==="media"?"media":"venue";
  const tpls=S.templates.filter(t=>(t.audience||"venue")===aud).sort((a,b)=>(nb&&b.stage===nb.status)-(nb&&a.stage===nb.status)||String(a.name).localeCompare(String(b.name)));
  const igBlock=ig?`<div class="card" style="margin:0"><div class="head"><h3>${email?"Or send a DM":"Send a DM on Instagram"}</h3><span class="note">@${esc(ig)}</span></div>
      ${email?"":`<p class="note" style="margin:4px 0 0">No email on file, so Instagram is the best way in.</p>`}
      <div class="f" style="margin-top:8px"><label for="rc-dm">Message to paste</label><textarea id="rc-dm" style="min-height:110px">${esc(dmText(c))}</textarea></div>
      <div class="actions" style="justify-content:flex-start;flex-wrap:wrap"><button class="btn${email?"":" primary"}" data-dm>Copy &amp; open DM</button><a class="btn" href="https://instagram.com/${encodeURIComponent(ig)}" target="_blank" rel="noopener">View profile</a></div></div>`:"";
  sheet(`<div class="head"><div><span class="eyebrow">Contact</span><h3 style="margin-top:4px">${esc(cName(c))}</h3></div><button class="btn small" data-editc>Edit</button></div>
  ${nb?`<p class="note" style="margin:0">Linked booking: <b>${esc(showName(nb))}</b>${nb.date?" · "+esc(fmtD(nb.date)):""}. Templates fill in its details.</p>`:""}
  ${email?`<div class="card" style="margin:0"><div class="head"><h3>Email</h3><span class="note">${esc(email)}</span></div>
      <div class="actions" style="justify-content:flex-start;flex-wrap:wrap;margin-top:8px"><button class="btn primary" data-wr>Write an email</button><button class="btn" data-past>Sent emails</button></div>
      ${tpls.length?`<div class="f" style="margin-top:8px"><label>Or start from a template</label><div class="chips">${tpls.map(t=>`<button class="btn small${nb&&t.stage===nb.status?" primary":""}" data-rtpl="${t.id}">${nb&&t.stage===nb.status?"★ ":""}${esc(t.name)}</button>`).join("")}</div></div>`:""}</div>`
    :ppl.length?`<div class="card" style="margin:0"><div class="head"><h3>Email someone at ${esc(cName(c))}</h3></div><div class="chips" style="margin-top:8px">${ppl.map(m=>`<button class="btn small" data-reachp="${m.id}">${esc(cName(m))}</button>`).join("")}</div></div>`:""}
  ${igBlock}
  ${!email&&!ig&&!ppl.length?`<div class="empty">No email or Instagram for ${esc(cName(c))} yet. Add one to reach out from here.</div>`:""}
  ${phone?`<p class="note" style="margin:0">Or <a href="sms:${esc(phone)}">text</a> or <a href="tel:${esc(phone)}">call</a> ${esc(c.phone)}.</p>`:""}
  <div class="actions">${!email&&!ig?`<button class="btn primary" data-editc2>Add email or Instagram</button>`:""}<button class="btn" data-close>Close</button></div>`,root=>{
    const q=x=>root.querySelector(x);q("[data-close]").onclick=close;q("[data-editc]").onclick=()=>contactForm(c);const e2=q("[data-editc2]");if(e2)e2.onclick=()=>contactForm(c);
    const wr=q("[data-wr]");if(wr)wr.onclick=()=>composeSheet({to:c.id,email,booking:nb?nb.id:""});
    const past=q("[data-past]");if(past)past.onclick=()=>sentSheet({contactId:c.id});
    root.querySelectorAll("[data-rtpl]").forEach(x=>x.onclick=()=>{useTemplate(x.dataset.rtpl,nb?nb.id:"");setTimeout(()=>{const s2=document.getElementById("u-to");if(s2){s2.value=c.id;s2.dispatchEvent(new Event("change"))}},30)});
    root.querySelectorAll("[data-reachp]").forEach(x=>x.onclick=()=>reachSheet(x.dataset.reachp));
    const dm=q("[data-dm]");if(dm)dm.onclick=async()=>{await copy(q("#rc-dm").value);window.open("https://ig.me/m/"+encodeURIComponent(ig),"_blank","noopener")}})}
/* ---------- Gmail: booking threads + replies as drafts ---------- */
const GM="Gmail";let GM_WHO=null;
const decodeHtml=x=>{const t=document.createElement("textarea");t.innerHTML=String(x||"");return t.value};
const authUser=u=>{const m=String(u||"").match(/authuser=([^&#]+)/);return m?decodeURIComponent(m[1]).toLowerCase():""};
function mailErr(e){const c=e&&e.code;toast(c==="server_not_connected"?"Connect Gmail in Settings → Google account first":c==="needs_reauth"?"Reconnect Gmail in Settings → Google account":c==="approval_required"||c==="not_in_manifest"||c==="not_granted"?"Allow Gmail for this page to send emails":c==="rate_limited"?"Gmail is busy. Try again in a minute.":c==="quiet"?"":"Gmail didn't respond. Try again.")}
async function gmailReady(){const mcp=await claude.use("mcp");if(!mcp){toast("Gmail isn't connected yet");return null}return mcp}
/* Send-only: gmail.send. No drafts, no inbox or thread reading. */
const gmLink=p=>p&&p.threadId?"https://mail.google.com/mail/#all/"+p.threadId:"https://mail.google.com/mail/#sent";
const splitMails=v=>String(v||"").split(/[,;\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
const isMail=x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x);
async function gmailSend(o){const mcp=await gmailReady();if(!mcp)throw {code:"quiet"};
  const to=[].concat(o.to||[]).map(x=>String(x).trim()).filter(Boolean),cc=[].concat(o.cc||[]).map(x=>String(x).trim()).filter(Boolean);
  const r=await mcp.callTool(GM,"send_message",{to,...(cc.length?{cc}:{}),subject:o.subject||"",body:o.body||"",includeSignature:true,...(o.attachments?{attachments:o.attachments}:{})});
  const p=r.payload||{};
  // metadata only: never the subject, message or attachment
  if(db){try{await db.collection("sentLog").add({at:new Date().toISOString(),bookingId:o.bookingId||"",contactId:o.contactId||"",kind:o.kind||"email",n:to.length+cc.length,messageId:p.id||"",threadId:p.threadId||"",attachment:!!(o.attachments&&o.attachments.length)})}catch(e){}}
  return p}
function confirmSend(o){return new Promise(res=>{document.querySelector(".cs-bg")?.remove();
  const to=[].concat(o.to||[]).filter(Boolean),cc=[].concat(o.cc||[]).filter(Boolean);
  const bg=document.createElement("div");bg.className="notice-bg cs-bg";
  bg.innerHTML=`<div class="notice" role="alertdialog" aria-modal="true" aria-labelledby="cs-t"><button class="x nx" data-no aria-label="Close">×</button>
    <h4 id="cs-t">Send this email now?</h4>
    <div class="cs"><div><span class="eyebrow">To</span>${esc(to.join(", "))}</div>${cc.length?`<div><span class="eyebrow">Cc</span>${esc(cc.join(", "))}</div>`:""}<div><span class="eyebrow">Subject</span>${esc(o.subject||"(no subject)")}</div>${o.attachName?`<div><span class="eyebrow">Attached</span>${esc(o.attachName)}</div>`:""}<div class="preview" style="max-height:200px;overflow:auto">${esc(o.body||"")}</div></div>
    <p class="note" style="margin:0">Sends right away from your connected Gmail with your Gmail signature. Replies come back to your inbox.</p>
    <div class="actions"><button class="btn" data-no>Keep editing</button><button class="btn primary" data-yes>Send now</button></div></div>`;
  document.body.appendChild(bg);const done=v=>{bg.remove();document.removeEventListener("keydown",k,true);res(v)};const k=e=>{if(e.key==="Escape"){e.stopPropagation();done(false)}};
  bg.addEventListener("click",e=>{if(e.target===bg||e.target.closest("[data-no]"))done(false);else if(e.target.closest("[data-yes]"))done(true)});document.addEventListener("keydown",k,true);
  setTimeout(()=>{const y=bg.querySelector("[data-yes]");y&&y.focus()},50)})}
function sentNotice(p,to,extra){notice({title:"Email sent",body:`Sent to ${esc(to.join(", "))}. Replies land in your Gmail inbox.`,link:gmLink(p),linkText:"Open in Gmail",extra})}
function sendErr(err,what){if(err&&err.code){if(err.code!=="quiet")mailErr(err)}else toast("Couldn't send "+(what||"the email")+": "+(err&&err.message||"try again"))}
const C_TYPES=[["venue","Venues & festivals"],["promoter","Promoters & collectives"],["media","Media"],["other","Other people"]];
/* People grouped by type, with the most likely type first (e.g. Media for a media template). */
function contactOptsG(v,none,first){const order=[...C_TYPES].sort((a,b)=>(b[0]===first)-(a[0]===first));
  return `<option value="">${none||"None"}</option>`+order.map(([k,l])=>{const cs=S.contacts.filter(c=>(c.type||"other")===k).sort((a,b)=>cName(a).localeCompare(cName(b)));
    return cs.length?`<optgroup label="${esc(l)}">${cs.map(c=>`<option value="${c.id}" ${c.id===v?"selected":""}>${esc(cName(c))}${c.email?"":" (no email)"}</option>`).join("")}</optgroup>`:""}).join("")}
function sentFor(f){const ce=f.contactId?String((contact(f.contactId)||{}).email||"").toLowerCase():"";
  return (S.sentLog||[]).filter(x=>(!f.bookingId||x.bookingId===f.bookingId)&&(!f.contactId||x.contactId===f.contactId)).sort((a,b)=>String(b.at).localeCompare(String(a.at)))}
const sentRow=x=>{const bk=x.bookingId&&S.bookings.find(b=>b.id===x.bookingId),c=x.contactId&&contact(x.contactId);
  const who=c?cName(c):(x.n>1?x.n+" recipients":"1 recipient");
  return `<div class="mrw"><a class="mailrow" href="${esc(gmLink(x))}" target="_blank" rel="noopener"><span class="t">${x.kind==="invoice"?"Invoice":"Email"} to ${esc(who)}${x.attachment?" · 📎":""}</span><span class="sub">${esc(mailDate(x.at))}${bk?`<span class="tag">${esc(showName(bk))}</span>`:""}</span></a></div>`};
function sentSheet(f){navSheet("sent:"+(f.bookingId||"")+(f.contactId||""),()=>sentSheet(f));const b=f.bookingId&&S.bookings.find(x=>x.id===f.bookingId),c=f.contactId&&contact(f.contactId);const xs=sentFor(f);
  sheet(`<div class="head"><div><span class="eyebrow">Sent emails</span><h3 style="margin-top:4px">${esc(c?cName(c):b?showName(b):"All")}</h3></div></div>
  <p class="note" style="margin:0">Emails sent from the app. Tap one to open it in Gmail, where you'll also see replies.</p>
  <div class="list">${xs.length?xs.map(sentRow).join(""):`<div class="empty">Nothing sent from the app yet.</div>`}</div>
  <div class="actions"><a class="btn" href="https://mail.google.com/mail/#sent" target="_blank" rel="noopener">Gmail Sent folder</a><button class="btn" data-close>Close</button></div>`,root=>{root.querySelector("[data-close]").onclick=close})}
const FREE_MAIL=/@(gmail|googlemail|yahoo|icloud|me|mac|outlook|hotmail|live|aol|proton|protonmail)\./i;
function myEmails(){const out=new Set([GM_WHO,(S.drive||{}).account].map(x=>String(x||"").trim().toLowerCase()).filter(x=>/@/.test(x)));return {has:e=>out.has(e)}}
function bookingEmails(b){const v=contact(b.venueId),me=myEmails();return [...new Set([b.contactPersonId,b.promoterId,b.venueId,b.mediaId,v&&v.bookingContactId].map(contact).filter(Boolean).map(c=>String(c.email||"").trim().toLowerCase()).filter(e=>/@/.test(e)&&!me.has(e)))]}
const gDate=ds=>ds.replace(/-/g,"/");
function mailWindow(b){if(!b.date)return {from:addDays(today(),-180),to:addDays(today(),60)};return {from:addDays(b.date,-120),to:addDays(b.date,60)}}
const inWindow=(t,b)=>{const w=mailWindow(b),ms=t.messages||[],d=String((ms[ms.length-1]||{}).date||"").slice(0,10);return !d||(d>=w.from&&d<=addDays(w.to,1))};
const hiddenFor=b=>new Set((b&&b.mailHidden)||[]);
async function hideThread(bid,tid,after){const b=S.bookings.find(x=>x.id===bid);if(!b)return;const prev=[...(b.mailHidden||[])];if(await patch("bookings",bid,{mailHidden:[...new Set([...prev,tid])]})){toast("Removed from "+showName(b),async()=>{await patch("bookings",bid,{mailHidden:prev});if(after)after()});if(after)after()}}
function mailQuery(b){const parts=bookingEmails(b).flatMap(e=>[`from:${e}`,`to:${e}`]);if(!parts.length)return"";const w=mailWindow(b);return `{${parts.join(" ")}} after:${gDate(w.from)} before:${gDate(addDays(w.to,1))} -in:chats`}
const shortWho=x=>{const m=String(x||"").match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>/);return m?m[1]:String(x||"")};
const mailDate=d=>{const t=new Date(d);if(isNaN(t))return"";const n=new Date();return t.toDateString()===n.toDateString()?t.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):t.toLocaleDateString("en-US",{month:"short",day:"numeric",...(t.getFullYear()!==n.getFullYear()?{year:"numeric"}:{})})};
let CMODE=(()=>{try{return localStorage.getItem("cmode")==="tpl"?"tpl":"conv"}catch(e){return "conv"}})();
const CONV={bk:""};
function renderMailPick(){const sec=document.querySelector('section[data-view="comms"]');if(!sec)return;sec.dataset.cmode=CMODE;
  document.querySelectorAll("#commSeg [data-cmode]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.cmode===CMODE));
  if(CMODE!=="conv")return;const pick=$("#convPick");
  if(!pick.contains(document.activeElement)){const t=today(),bs=sortedBookings(),up=bs.filter(b=>!b.date||b.date>=t),past=bs.filter(b=>b.date&&b.date<t).reverse();const o=b=>`<option value="${b.id}" ${CONV.bk===b.id?"selected":""}>${esc(showName(b)+(b.date?" · "+fmtD(b.date):""))}</option>`;
    pick.innerHTML=`<option value="" ${!CONV.bk?"selected":""}>All bookings</option>${up.length?`<optgroup label="Upcoming">${up.map(o).join("")}</optgroup>`:""}${past.length?`<optgroup label="Past">${past.map(o).join("")}</optgroup>`:""}`}
  paintConv()}
function paintConv(){const list=$("#convList");if(!list)return;const xs=sentFor({bookingId:CONV.bk});
  list.innerHTML=xs.length?xs.slice(0,80).map(sentRow).join(""):`<div class="empty">${CONV.bk?"Nothing sent for this booking from the app yet.":"Emails you send from the app show up here."}</div>`}
document.getElementById("commSeg").addEventListener("click",e=>{const b=e.target.closest("[data-cmode]");if(!b)return;CMODE=b.dataset.cmode;try{localStorage.setItem("cmode",CMODE)}catch(x){}renderMailPick()});
document.getElementById("convPick").addEventListener("change",e=>{CONV.bk=e.target.value;paintConv()});
/* stage editor: simple names + order, edited as a draft and saved together */
function inferKinds(P){let last="lead";return P.map(p=>{let like;if(KINDS.includes(p.key)){like=p.key;if(like!=="lost")last=like}else like=last;return {key:p.key,name:(p.name||"").trim()||"Stage",like,base:defBase(like)}})}
let PLD=null;
function renderStageEditor(){const stn=$("#stNames");if(!stn||stn.contains(document.activeElement))return;const P=PLD||pipeline();
  stn.innerHTML=P.map((p,i)=>{const n=S.bookings.filter(b=>b.status===p.key).length;return `<div class="pl-row">
    <div class="pl-mv"><button class="x" data-plup="${i}" ${i===0?"disabled":""} aria-label="Move ${esc(p.name)} up">↑</button><button class="x" data-pldn="${i}" ${i===P.length-1?"disabled":""} aria-label="Move ${esc(p.name)} down">↓</button></div>
    <span class="pl-i num">${i+1}</span><input data-plname="${i}" value="${esc(p.name)}" maxlength="24" aria-label="Stage ${i+1} name">
    ${n?`<span class="note pl-n">${n} booking${n>1?"s":""}</span>`:""}<button class="x" data-pldel="${i}" aria-label="Remove ${esc(p.name)}">×</button></div>`}).join("");
  const dirty=!!PLD;$("#stSave").disabled=!dirty;$("#stDiscard").hidden=!dirty;$("#stDirty").textContent=dirty?"Unsaved changes":"";
  const draft=()=>{if(!PLD)PLD=pipeline().map(p=>({...p}));return PLD};
  const redraw=()=>{stn.innerHTML="";renderStageEditor()};
  stn.querySelectorAll("[data-plname]").forEach(i=>i.oninput=()=>{draft()[+i.dataset.plname].name=i.value;$("#stSave").disabled=false;$("#stDiscard").hidden=false;$("#stDirty").textContent="Unsaved changes"});
  stn.querySelectorAll("[data-plup],[data-pldn]").forEach(x=>x.onclick=()=>{const P=draft(),i=+(x.dataset.plup??x.dataset.pldn),j=x.dataset.plup!==undefined?i-1:i+1;[P[i],P[j]]=[P[j],P[i]];redraw()});
  stn.querySelectorAll("[data-pldel]").forEach(x=>x.onclick=()=>{const P=draft(),i=+x.dataset.pldel,p=P[i],n=S.bookings.filter(b=>b.status===p.key).length;
    if(P.length<=1){toast("Keep at least one stage");return}
    if(n){toast(`Move the ${n} booking${n>1?"s":""} in ${p.name.trim()||"this stage"} to another stage first`);return}
    P.splice(i,1);redraw()})}
async function savePipeline(P,msg,undo){const clean=inferKinds(P);if(clean.some(p=>!p.name.trim())){toast("Every stage needs a name");return false}
  if(await save("settings","pipeline",{stages:clean})){S.pipeline={stages:clean};PLD=null;applyStageNames();$("#stNames").innerHTML="";render();if(msg)toast(msg,undo);return true}return false}
$("#stAdd").onclick=()=>{if(!PLD)PLD=pipeline().map(p=>({...p}));const li=PLD.map(p=>p.key).lastIndexOf("lost"),at=li>=0&&li===PLD.length-1?li:PLD.length;
  PLD.splice(at,0,{key:"s_"+newKey(),name:"New stage"});$("#stNames").innerHTML="";renderStageEditor();setTimeout(()=>{const i=document.querySelector(`[data-plname="${at}"]`);if(i){i.focus();i.select()}},50)};
$("#stSave").onclick=async()=>{if(!PLD)return;const prev=pipeline();for(const p of PLD)if(!(p.name||"").trim()){toast("Every stage needs a name");return}
  await savePipeline(PLD,"Stages saved",()=>savePipeline(prev,"Stages restored"))};
$("#stDiscard").onclick=()=>{PLD=null;$("#stNames").innerHTML="";renderStageEditor();toast("Changes discarded")};
$("#stReset").onclick=()=>{$("#stConfirm").hidden=false;$("#stConfirm").scrollIntoView({block:"nearest"})};
$("#stNo").onclick=()=>{$("#stConfirm").hidden=true};
$("#stYes").onclick=async()=>{const stuck=S.bookings.filter(b=>!KINDS.includes(b.status));if(stuck.length){$("#stConfirm").hidden=true;toast(`Move ${stuck.length} booking${stuck.length>1?"s":""} out of the stages you added first`);return}
  const prev=pipeline();if(await save("settings","pipeline",{stages:[]})&&await save("settings","stageNames",{})){S.pipeline={stages:[]};S.stageNames={};PLD=null;$("#stConfirm").hidden=true;applyStageNames();$("#stNames").innerHTML="";render();toast("Stages reset to defaults",()=>savePipeline(prev,"Stages restored"))}};
function bookingForm(b={}){
  const isNew=!b.id;
  sheet(`<h3>${isNew?"New booking":"Edit booking"}</h3>
  <div class="f"><label for="b-title">Show / event name</label><input id="b-title" data-k="title" value="${esc(b.title)}" placeholder="e.g. Friday Night Social at The Lounge"></div>
  <div class="frow"><div class="f"><label for="b-status">Status</label><select id="b-status" data-k="status">${opt(STATUSES,b.status||(STATUSES[0]||[])[0])}</select></div>
  ${field("b-date","Date",b.date,"date",'data-k="date"')}</div>
  <div class="frow"><div class="f"><label>Set starts</label>${timeSel("b-ts",setStartOf(b))}</div><div class="f"><label>Set ends</label>${timeSel("b-te",setEndOf(b))}</div></div>
  <label class="note" style="display:flex;gap:8px;align-items:center;margin-top:-4px"><input type="checkbox" id="b-gcal" checked> Put this set on my Google Calendar <span id="b-gcalto">${G.writeName?"("+esc(G.writeName)+")":""}</span></label>
  <p class="note" style="margin:-6px 0 0">Start times before 6 AM count as after midnight of the show night.</p>
  <div id="b-warn">${conflictMsg(b.date,b.id,setStartOf(b),setEndOf(b))}</div>
  <div class="frow"><div class="f"><label for="b-venue">Venue / festival</label><select id="b-venue" class="srch" data-k="venueId">${contactOpts("venue",b.venueId,"No venue yet","Add new venue or festival…")}</select></div>
  <div class="f"><label for="b-promo">Promoter / collective</label><select id="b-promo" class="srch" data-k="promoterId">${contactOpts("promoter",b.promoterId,"No promoter / booked direct","Add new promoter or collective…")}</select></div></div>
  <div class="f" id="b-talkWrap" hidden><label for="b-talk">Who you're talking to</label><select id="b-talk" class="srch" data-k="contactPersonId"></select><span class="note" id="b-talkNote"></span></div>
  ${S.contacts.some(c=>c.type==="venue")&&S.contacts.some(c=>c.type==="promoter")?"":`<p class="note" style="margin:0">Venues and promoters come from People. Add them as Venue / festival or Promoter / collective there to see them here.</p>`}
  ${field("b-city","City",b.city,"text",'data-k="city"')}
  ${field("b-addr","Event address",b.address,"text",'data-k="address" autocomplete="street-address" placeholder="Leave blank to use the venue’s address"')}
  <div class="frow">${field("b-fee","Fee ($)",b.fee,"number",'data-k="fee" inputmode="decimal"')}${field("b-due","Payment due on",b.payDue,"date",'data-k="payDue"')}</div>
  <div class="f"><label for="b-inctype">Income type <button type="button" class="linkbtn" data-edittypes>Edit types</button></label><select id="b-inctype" class="srch" data-k="incomeType">${ICATS.map(x=>`<option value="${esc(x[0])}" ${x[0]===bookingIncType(b)?"selected":""}>${esc(x[1])}</option>`).join("")}</select><span class="note">How this fee shows up in Financials and your tax report.</span></div>
  <div class="f"><label>How you'd like to be paid</label><div class="chips" id="b-pp">${PAYM.filter(([k])=>k!=="other").map(([k,l])=>`<button type="button" class="chip" data-pp="${k}" aria-pressed="${(b.payPrefs||[]).includes(k)}">${l}</button>`).join("")}</div>
    <textarea id="b-pinfo" data-k="payInfo" data-fincheck style="min-height:56px;margin-top:6px" placeholder="${esc((S.invset||{}).pay||"e.g. Zelle: you@email.com · Venmo: @yourname")}">${esc(b.payInfo)}</textarea>
    <span class="note" id="b-ppNote"></span>
    <span class="note">Goes on this booking's invoice. Leave blank to use your payment usernames from Settings. Bank or card numbers you type here go on the invoice you make now but aren't saved.</span></div>
  <div id="b-paidBlock" ${K(b.status||"")==="paid"?"":"hidden"}><div class="frow">${field("b-paid","Paid on",b.paidDate,"date",'data-k="paidDate"')}<div class="f"></div></div>
  ${payHtml("b","How you were paid",b.payMethod,b.payRef)}</div>
  <div class="frow"><div class="f"><label for="b-media">Media person</label><select id="b-media" class="srch" data-k="mediaId">${contactOpts("media",b.mediaId,"No media booked","Add new media person…")}</select></div>
  ${field("b-tix","Ticket / event link",b.ticketUrl,"url",'data-k="ticketUrl"')}</div>
  <div class="f"><label for="b-drive">Media folder (Google Drive)</label>
    <div style="display:flex;gap:8px;align-items:stretch"><input id="b-drive" type="url" data-k="driveUrl" value="${esc(b.driveUrl)}" placeholder="Create one, or paste a folder link" style="flex:1;min-width:0;border:1px solid var(--line);background:var(--bg);border-radius:10px;padding:9px 11px">
    <button type="button" class="btn" id="b-mkdrive" style="white-space:nowrap">Create folder</button><a class="btn" id="b-opdrive" target="_blank" rel="noopener" hidden style="white-space:nowrap">Open</a></div>
    <span class="note" id="b-driveNote"></span>
    <label id="b-shareWrap" hidden style="display:flex;align-items:center;gap:8px;padding:2px 0;font-size:14px;font-family:var(--body);text-transform:none;letter-spacing:0;color:var(--ink);cursor:pointer"><input type="checkbox" id="b-share" checked style="width:18px;height:18px;accent-color:var(--accent);flex:none"> <span id="b-shareLbl"></span></label></div>
  <div class="f"><label for="b-notes">Notes</label><textarea id="b-notes" data-k="notes" style="min-height:80px">${esc(b.notes)}</textarea></div>
  <div class="actions">${isNew?"":delBtn()}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>${isNew?"Add booking":"Save"}</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;
    let endAuto=!setEndOf(b);const reWarn=()=>{$("#b-warn").innerHTML=conflictMsg(root.querySelector("#b-date").value,b.id,readTime(root,"b-ts"),readTime(root,"b-te"))};root.querySelector("#b-date").addEventListener("change",reWarn);root.querySelectorAll("[data-tsel]").forEach(x=>x.addEventListener("change",()=>{const k=x.dataset.tsel;if(k==="b-te")endAuto=false;if(k==="b-ts"&&readTime(root,"b-ts")&&(endAuto||!readTime(root,"b-te"))){setTimeSel(root,"b-te",addMin(readTime(root,"b-ts"),60));endAuto=true}reWarn()}));
    {const cb=root.querySelector("#b-gcal");if(cb)cb.checked=b.gcalOff!==true}
    const snap=extra=>{const cb=root.querySelector("#b-gcal");return {...b,...formVals(root),payPrefs:[...root.querySelectorAll("[data-pp]")].filter(x=>x.getAttribute("aria-pressed")==="true").map(x=>x.dataset.pp),setStart:readTime(root,"b-ts"),setEnd:readTime(root,"b-te"),...(cb?{gcalOff:!cb.checked}:{}),...extra}};
    [["#b-venue","venueId","venue"],["#b-promo","promoterId","promoter"],["#b-media","mediaId","media"]].forEach(([sel,key,type])=>{const el=root.querySelector(sel);let prev=el.value;
      el.addEventListener("change",()=>{if(el.value!=="__new__"){prev=el.value;return}
        const draft=snap({[key]:prev});const pre={type};if(type==="promoter"&&draft.venueId)pre.venueIds=[draft.venueId];if(type==="venue"&&draft.promoterId){pre.promoterIds=[draft.promoterId];pre.runBy=draft.promoterId;if(draft.contactPersonId)pre.bookingContactId=draft.contactPersonId}if(type==="venue"&&draft.city)pre.city=draft.city;
        contactForm(pre,{onSaved:id=>{bookingForm({...draft,[key]:id});toast("Added and picked")},onCancel:()=>bookingForm(draft),back:"Back to booking"})})});
    wirePay(root,"b");
    const ppNote=()=>{const on=[...root.querySelectorAll("[data-pp]")].filter(x=>x.getAttribute("aria-pressed")==="true").map(x=>x.dataset.pp);const t=handlesText(on," · ");const el=root.querySelector("#b-ppNote");
      if(el)el.innerHTML=t?"Your usernames: "+esc(t):on.length?`No username saved for ${esc(on.map(pmName).join(", "))} yet. <button type="button" class="linkbtn" data-phgo>Add it in Settings</button>`:"";const g=el&&el.querySelector("[data-phgo]");if(g)g.onclick=()=>payForm()};
    root.querySelector("#b-pp").addEventListener("click",()=>setTimeout(ppNote,0));ppNote();
    const pp=new Set(b.payPrefs||[]);root.querySelectorAll("[data-pp]").forEach(x=>x.onclick=()=>{const k=x.dataset.pp;pp.has(k)?pp.delete(k):pp.add(k);x.setAttribute("aria-pressed",pp.has(k))});
    const stSel=root.querySelector("#b-status"),pb=root.querySelector("#b-paidBlock");stSel.addEventListener("change",()=>{const paid=K(stSel.value)==="paid";pb.hidden=!paid;const pd=root.querySelector("#b-paid");if(paid&&!pd.value){pd.value=today();pd.dispatchEvent(new Event("change",{bubbles:true}))}});
    const cityIn=root.querySelector("#b-city");let cityTouched=!!(b.city||"").trim();cityIn.addEventListener("input",()=>{cityTouched=!!cityIn.value.trim()});
    const autoCity=id=>{const c=contact(id);if(!c||cityTouched)return;const city=c.city||(isColl(c)?"":((collectivesOf(c)[0]||{}).city||""));if(city)cityIn.value=city};
    ["#b-venue","#b-promo","#b-talk"].forEach(sel=>root.querySelector(sel).addEventListener("change",e=>{if(e.target.value&&e.target.value!=="__new__")autoCity(e.target.value)}));
    root.querySelector("[data-edittypes]").onclick=()=>{const d=snap();typesSheet(()=>bookingForm(d))};
    const talk=root.querySelector("#b-talk"),talkWrap=root.querySelector("#b-talkWrap");let talkPrev=b.contactPersonId||"";
    const fillTalk=()=>{const p=contact(root.querySelector("#b-promo").value);if(!isColl(p)){talkWrap.hidden=true;talk.innerHTML='<option value=""></option>';return}
      const m=membersOf(p).sort((a,b)=>(b.id===p.mainContactId)-(a.id===p.mainContactId)||cName(a).localeCompare(cName(b)));
      const cur=m.some(x=>x.id===talkPrev)?talkPrev:(p.mainContactId&&m.some(x=>x.id===p.mainContactId)?p.mainContactId:"");
      talk.innerHTML=`<option value="">${m.length?"Anyone at "+esc(cName(p)):"No one picked"}</option><option value="__new__">＋ Add new person to ${esc(cName(p))}…</option>${m.map(x=>`<option value="${x.id}" ${x.id===cur?"selected":""}>${esc(cName(x))}${x.id===p.mainContactId?" (main contact)":""}</option>`).join("")}`;
      talkPrev=cur;talkWrap.hidden=false;root.querySelector("#b-talkNote").textContent=m.length?"Emails about this booking go to them.":"Add the people at this collective so you can pick who you're talking to."};
    talk.addEventListener("change",()=>{if(talk.value!=="__new__"){talkPrev=talk.value;return}
      const pid=root.querySelector("#b-promo").value,draft=snap({contactPersonId:talkPrev});
      contactForm({type:"promoter",pkind:"person",collectiveIds:[pid],city:draft.city||""},{onSaved:id=>{bookingForm({...draft,contactPersonId:id});toast("Added and picked")},onCancel:()=>bookingForm(draft),back:"Back to booking"})});
    fillTalk();
    const drv=root.querySelector("#b-drive"),mk=root.querySelector("#b-mkdrive"),dn=root.querySelector("#b-driveNote"),shW=root.querySelector("#b-shareWrap");
    const driveSync=()=>{const v=formVals(root),has=!!drv.value.trim(),m=contact(v.mediaId);mk.hidden=has;const op=root.querySelector("#b-opdrive");op.hidden=!has;if(has)op.href=drv.value.trim();
      dn.textContent=has?"Your media person uploads here. It's added to emails with the media folder fill-in.":(v.title||v.venueId)&&v.date?"Will be named: "+mediaFolderName(v):"Add a show name (or venue) and a date first.";
      const shared=m&&m.email&&b.mediaSharedWith===m.email;shW.hidden=!(m&&m.email)||shared;if(m&&m.email)root.querySelector("#b-shareLbl").textContent=has?`Share the folder with ${cName(m)} (${m.email}) when I save`:`Share it with ${cName(m)} (${m.email}) so they can upload`;
      if(shared)dn.textContent+=` Shared with ${cName(m)}.`};
    root.addEventListener("input",driveSync);root.addEventListener("change",driveSync);driveSync();
    mk.onclick=async()=>{if(drv.value.trim())return;
      const v=formVals(root);if(!(v.title||v.venueId)||!v.date){toast("Add a show name or venue and a date first");return}
      if(!rootOf("mkt")){const draft=snap();rootPicker("mkt",()=>{bookingForm(draft);toast("Marketing folder set. Tap Create folder again.")},()=>bookingForm(draft));return}
      mk.disabled=true;mk.textContent="Creating…";const r=await makeMediaFolder(v,root.querySelector("#b-share").checked&&!shW.hidden);mk.disabled=false;mk.textContent="Create folder";
      if(r){drv.value=r.url;b.driveId=r.id;if(r.shared){const m=contact(v.mediaId);b.mediaSharedWith=m&&m.email}driveSync();toast(r.shared?"Folder created and shared":"Folder created")}else driveSync()};
    root.querySelector("#b-promo").addEventListener("change",()=>{if(root.querySelector("#b-promo").value!=="__new__")fillTalk()});
    root.querySelector("#b-promo").addEventListener("change",e=>{const p=contact(e.target.value);if(!p)return;const vs=venuesFor(p);const vsel=root.querySelector("#b-venue");if(!vsel.value&&vs.length===1)vsel.value=vs[0].id});
    root.querySelector("#b-venue").addEventListener("change",e=>{const v=contact(e.target.value);if(!v)return;const ps=relPromoters(v);const psel=root.querySelector("#b-promo");if(!psel.value&&ps.length===1)psel.value=ps[0].id});
    armDelete(root,async()=>{const ge=(S.bookings.find(x=>x.id===b.id)||b).gcal;await remove("bookings",b.id);close();if(ge)dropEvent(ge)});
    root.querySelector("[data-save]").onclick=async()=>{const v=formVals(root);v.setStart=readTime(root,"b-ts");v.setEnd=readTime(root,"b-te");if(v.setStart&&!v.setEnd)v.setEnd=addMin(v.setStart,60);v.setTime=v.setStart?fmtRange(v.setStart,v.setEnd):"";v.gcalOff=!root.querySelector("#b-gcal").checked;v.payPrefs=[...pp];if(b.mediaSharedWith)v.mediaSharedWith=b.mediaSharedWith;if(b.driveId)v.driveId=b.driveId;
      const shareNow=(()=>{const m=contact(v.mediaId);return !root.querySelector("#b-shareWrap").hidden&&root.querySelector("#b-share").checked&&v.driveUrl&&m&&m.email&&b.mediaSharedWith!==m.email?m:null})();
      if(!v.title&&!v.venueId){toast("Add a show name or pick a venue");return}
      const fresh=b.id?(S.bookings.find(x=>x.id===b.id)||{}):{};const data={...b,...fresh,...v,tasks:fresh.tasks||b.tasks||{},updatedAt:new Date().toISOString()};delete data.id;
      if(fresh.checklists)data.checklists=fresh.checklists;if(fresh.stageAt)data.stageAt=fresh.stageAt;
      if(isNew||(fresh.status||b.status)!==data.status)data.stageAt=withStage(data,data.status);
      if(K(data.status)==="paid"&&!data.paidDate)data.paidDate=today();
      if(!data.createdAt)data.createdAt=data.updatedAt;
      const id=await save("bookings",b.id,data);if(id){close();toast(isNew?"Booking added":"Saved");if(!isNew)bookingView(id);syncBookingEvent(id,data);if(shareNow)shareMediaLater(id,data.driveUrl,shareNow)}};
  });
}
function bookingView(id){navSheet("b:"+id,()=>bookingView(id));
  const b=S.bookings.find(x=>x.id===id);if(!b)return;
  const v=contact(b.venueId), pr=contact(b.promoterId), m=contact(b.mediaId);
  sheet(`<div class="head"><div style="min-width:0"><span class="pill s-${K(b.status)}">${esc((STATUSES.find(s=>s[0]===b.status)||[])[1])}</span><h3 style="margin-top:6px">${esc(b.title||contactName(b.venueId)||"Untitled")}</h3></div><button class="btn small" data-edit>Edit</button></div>
  <div class="chips">${STATUSES.map(([k,l])=>`<button class="chip" aria-pressed="${b.status===k}" data-status="${k}">${l}</button>`).join("")}</div>
  <dl class="kv">
    <dt>Date</dt><dd>${esc(fmtD(b.date))}${b.setTime?" · "+esc(b.setTime):""}${b.gcal&&b.gcal.link?` · <a href="${esc(b.gcal.link)}" target="_blank" rel="noopener">On Google Calendar</a>`:""}</dd>
    <dt>Venue</dt><dd>${v?esc(cName(v))+(v.vkind==="festival"?' <span class="pill" style="color:var(--muted)">Festival</span>':"")+((cName(contact(v.bookingContactId))||v.name)?` <span class="note">· ${esc(cName(contact(v.bookingContactId))||v.name)}</span>`:"")+(v.email?`<br><span class="note">${esc(v.email)}</span>`:""):"—"}</dd>
    ${contact(b.contactPersonId)?`<dt>Talking to</dt><dd>${esc(cName(contact(b.contactPersonId)))}${contact(b.contactPersonId).email?`<br><span class="note">${esc(contact(b.contactPersonId).email)}</span>`:""}</dd>`:""}
    <dt>Promoter</dt><dd>${pr?esc(cName(pr))+((orgFirst(pr)?pr.name:pr.org)?` <span class="note">· ${esc(orgFirst(pr)?pr.name:pr.org)}</span>`:"")+(pr.email?`<br><span class="note">${esc(pr.email)}</span>`:""):"—"}</dd>
    <dt>City</dt><dd>${esc(b.city||"—")}</dd>
    <dt>Address</dt><dd>${bAddr(b)?addrLink(bAddr(b))+"<br>"+navAlts(bAddr(b)):"—"}</dd>
    <dt>Fee</dt><dd class="num">${b.fee?money(b.fee):"—"}</dd>${b.payDue&&K(b.status)!=="paid"?`<dt>Payment due</dt><dd>${esc(fmtD(b.payDue))}</dd>`:""}${(b.payPrefs||[]).length?`<dt>Pay by</dt><dd>${esc(b.payPrefs.map(pmName).join(", "))}</dd>`:""}
    ${b.paidDate||b.payMethod||b.payRef?`<dt>Paid</dt><dd>${b.paidDate?esc(fmtD(b.paidDate)):""} ${pmTag(b.payMethod,b.payRef)}</dd>`:""}
    <dt>Media</dt><dd>${m?esc(m.name)+(m.rate?` · ${esc(m.rate)}`:"")+(m.email?`<br><span class="note">${esc(m.email)}</span>`:""):"—"}</dd>
    ${b.ticketUrl?`<dt>Tickets</dt><dd><a href="${esc(b.ticketUrl)}" target="_blank" rel="noopener">${esc(b.ticketUrl)}</a></dd>`:""}
    <dt>Business</dt><dd><div data-fold="biz" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${(b.folders||{}).biz?`<a href="${esc(b.folders.biz.url)}" target="_blank" rel="noopener">Event folder</a> · <a href="${esc(subUrl(b,"biz","contracts"))}" target="_blank" rel="noopener">Contracts</a> · <a href="${esc(subUrl(b,"biz","invoices"))}" target="_blank" rel="noopener">Invoices</a>`:`<button class="btn small" data-mkf="biz">Create folders</button>`}</div></dd>
    <dt>Contract</dt><dd><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${b.contract&&b.contract.url?`<a href="${esc(b.contract.url)}" target="_blank" rel="noopener">Open contract</a><button class="btn small" data-contract>Replace</button>`:`<button class="btn small" data-contract>Upload contract</button>`}</div></dd>
    <dt>Marketing</dt><dd><div data-fold="mkt" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${(b.folders||{}).mkt?`<a href="${esc(b.folders.mkt.url)}" target="_blank" rel="noopener">Event folder</a> · <a href="${esc(subUrl(b,"mkt","media"))}" target="_blank" rel="noopener">Media</a> · <a href="${esc(subUrl(b,"mkt","flyers"))}" target="_blank" rel="noopener">Flyers</a><button class="btn small" data-mkup>Add flyer</button>`:`<button class="btn small" data-mkf="mkt">Create folders</button>`}${b.driveUrl&&!(b.folders||{}).mkt?`<a href="${esc(b.driveUrl)}" target="_blank" rel="noopener">Earlier media folder</a>`:""}${m&&m.email&&(b.folders||{}).mkt&&b.mediaSharedWith!==m.email?`<button class="btn small" data-mkdrive>Share Media with ${esc(cName(m).split(" ")[0])}</button>`:""}</div></dd>
    ${["played","paid"].includes(K(b.status))||(b.invoice&&b.invoice.number)?`<dt>Invoice</dt><dd>${b.invoice&&b.invoice.number?`<b>${esc(b.invoice.number)}</b> · <span class="num">${money2(invTotals(b.invoice).due)}</span> due${b.invoice.fileUrl?` · <a href="${esc(b.invoice.fileUrl)}" target="_blank" rel="noopener">PDF</a>`:""}<br>`:""}<button class="btn small" data-inv>${b.invoice&&b.invoice.number?"Open invoice":"Create invoice"}</button></dd>`:""}
    ${b.notes?`<dt>Notes</dt><dd style="white-space:pre-wrap">${esc(b.notes)}</dd>`:""}
  </dl>
  <div><div class="eyebrow" style="margin-bottom:4px">Checklist</div>${stagesFor(b).length?stagesFor(b).slice().reverse().map(st=>{const list=clFor(b,st),open=list.filter(it=>!(b.tasks||{})[it.key]).length,isOpen=stgOpen(b,st);
      return `<div class="stg${isOpen?" open":""}"><button type="button" class="stg-h" data-stgtog="${st}" aria-expanded="${isOpen}"><svg class="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg><span class="pill s-${K(st)}">${STAGE_L[st]}</span>${st===b.status?'<span class="note">current</span>':""}<span class="note" style="margin-left:auto">${list.length?(open?open+" to do":"All done ✓"):"No steps"}</span></button><div class="stg-b"${isOpen?"":" hidden"}>${list.map(it=>{const k=it.key,l=it.label,sk=st+":"+k;return `<div class="cl-row"><input type="checkbox" class="tcb" data-btask="${esc(k)}" ${(b.tasks||{})[k]?"checked":""} aria-label="${esc(l)}"><button type="button" class="cl-t tmain" data-topen="${esc(sk)}" style="overflow-wrap:anywhere;${(b.tasks||{})[k]?"text-decoration:line-through;color:var(--muted)":""}">${esc(l)}</button>${isInvStep(it,st)?`<button class="btn small" data-inv>${b.invoice&&b.invoice.number?"Invoice":"Create invoice"}</button>`:""}<input type="date" class="duein" data-bdue="${esc(sk)}" data-state="${dueState(dueOf(b,it,st),(b.tasks||{})[k])}" value="${esc(dueOf(b,it,st))}" aria-label="Due date for ${esc(l)}"><button class="x" data-bren="${esc(sk)}" aria-label="Rename ${esc(l)}"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg></button><button class="x" data-bdel="${esc(sk)}" aria-label="Remove ${esc(l)}">×</button></div>`}).join("")}<div class="addline"><input data-baddin="${st}" placeholder="Add a step to ${STAGE_L[st]}" aria-label="New ${STAGE_L[st]} step"><button class="btn small" data-badd="${st}">Add</button></div></div></div>`}).join(""):`<div class="note">${K(b.status)==="lost"?"No tasks for lost bookings.":"No steps on this booking."}</div>`}
</div>
  <div><div class="eyebrow" style="margin-bottom:6px">Send an email</div>
    <div style="display:flex;gap:8px;align-items:stretch"><select id="bk-tpl" class="srch" style="flex:1;min-width:0">${tplOptions(b)}</select><button class="btn primary" data-sendtpl style="white-space:nowrap;flex:none">Write it</button></div>
    <span class="note">Templates fill in this booking's details. Suggested for ${esc(STAGE_L[b.status]||"this stage")} is marked ★.</span></div>
  <div><div class="head" style="margin-bottom:4px"><span class="eyebrow">Sent emails</span><span class="chips"><button class="btn small" data-mails>See all</button></span></div>
    <div class="list" id="bk-mail"><div class="empty">Loading emails…</div></div></div>
  <div class="actions"><button class="btn" data-close>Done</button></div>`,root=>{
    root.querySelector("[data-close]").onclick=close;
    root.querySelector("[data-edit]").onclick=()=>bookingForm(b);
    const mkd=root.querySelector("[data-mkdrive]");if(mkd)mkd.onclick=async()=>{if(!(b.title||b.venueId)||!b.date){toast("Add a show name or venue and a date first");return}
      const m=contact(b.mediaId);mkd.disabled=true;mkd.textContent="Sharing…";const r=await makeMediaFolder(b,!!(m&&m.email));
      if(r){await patch("bookings",b.id,{driveUrl:r.url,driveId:r.id,...(r.shared?{mediaSharedWith:m.email}:{})});toast(r.shared?"Media folder shared with "+cName(m):"Media folder ready");bookingView(b.id)}else if(mkd.isConnected){mkd.disabled=false;mkd.textContent="Share Media"}};
    root.querySelectorAll("[data-status]").forEach(c=>c.onclick=async()=>{const st=c.dataset.status,f=S.bookings.find(x=>x.id===b.id)||b;const upd={status:st,stageAt:{[st]:(f.stageAt||{})[st]||today()},updatedAt:new Date().toISOString()};if(K(st)==="paid"&&!f.paidDate)upd.paidDate=today();if(await patch("bookings",b.id,upd)){bookingView(b.id);syncBookingEvent(b.id,{...f,...upd})}});
    root.dataset.booking=b.id;const cur=()=>S.bookings.find(x=>x.id===b.id)||b;
    root.querySelectorAll("[data-btask]").forEach(c=>c.onchange=()=>toggleTask(b.id,c.dataset.btask,c.checked));
    root.querySelectorAll("[data-topen]").forEach(x=>x.onclick=()=>{const [st,k]=sk(x.dataset.topen);taskSheet(b.id,st,k,()=>bookingView(b.id))});
    const sk=v=>{const i=v.indexOf(":");return [v.slice(0,i),v.slice(i+1)]};
    root.querySelectorAll("[data-bdue]").forEach(inp=>inp.addEventListener("change",async()=>{const [st,k]=sk(inp.dataset.bdue);
      const list=clFor(cur(),st).map(t=>t.key===k?{...t,due:inp.value||"none"}:t);if(await patch("bookings",b.id,{...clPatch(b,st,list)})){toast(inp.value?"Due "+dueShort(inp.value):"Due date removed");bookingView(b.id)}}));
    root.querySelectorAll("[data-bren]").forEach(x=>x.onclick=()=>{const [st,k]=sk(x.dataset.bren),row=x.closest(".cl-row");
      inlineRename(row,row.querySelector(".cl-t"),(clFor(cur(),st).find(t=>t.key===k)||{}).label||"",async v=>{if(await patch("bookings",b.id,{...clPatch(b,st,clFor(cur(),st).map(t=>t.key===k?{...t,label:v}:t))}))bookingView(b.id)})});
    root.querySelectorAll("[data-bdel]").forEach(x=>x.onclick=async()=>{const [st,k]=sk(x.dataset.bdel);const wasDone=!!(cur().tasks||{})[k];const list=clFor(cur(),st),idx=list.findIndex(t=>t.key===k),removed=list[idx];
      if(await patch("bookings",b.id,{...clPatch(b,st,list.filter(t=>t.key!==k)),tasks:{[k]:false}})){bookingView(b.id);
        toast("Step removed",async()=>{const c2=S.bookings.find(x=>x.id===b.id)||b,l2=[...clFor(c2,st)];l2.splice(Math.min(idx,l2.length),0,removed);if(await patch("bookings",c2.id,{...clPatch(c2,st,l2),tasks:{[k]:!!wasDone}})){toast("Step restored");if(document.querySelector(`.sheet[data-booking="${b.id}"]`))bookingView(b.id)}})}});
    const addB=async st=>{const inp=root.querySelector(`[data-baddin="${st}"]`),l=inp.value.trim();if(!l)return;
      if(await patch("bookings",b.id,{...clPatch(b,st,[...clFor(cur(),st),{key:newKey(),label:l}])})){bookingView(b.id);setTimeout(()=>{const n=document.querySelector(`.sheet [data-baddin="${st}"]`);n&&n.focus()},50)}};
    root.querySelectorAll("[data-badd]").forEach(x=>x.onclick=()=>addB(x.dataset.badd));
    root.querySelectorAll("[data-baddin]").forEach(x=>x.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();addB(x.dataset.baddin)}});
    root.querySelectorAll("[data-stgtog]").forEach(h=>h.onclick=()=>{const st=h.dataset.stgtog,box=h.closest(".stg"),open=!box.classList.contains("open");box.classList.toggle("open",open);h.setAttribute("aria-expanded",open);box.querySelector(".stg-b").hidden=!open;setStgOpen(b,st,open)});
    root.querySelector("[data-sendtpl]").onclick=()=>{const v=root.querySelector("#bk-tpl").value;if(v==="__blank")composeSheet({booking:b.id,to:b.contactPersonId||b.promoterId||b.venueId||""});else useTemplate(v,b.id)};
    loadBookingMail(b.id,root.querySelector("#bk-mail"));
    root.querySelector("[data-mails]").onclick=()=>sentSheet({bookingId:b.id});
    root.querySelectorAll("[data-inv]").forEach(x=>x.onclick=()=>invoiceSheet(b.id));
    (async()=>{const mcp=await claude.use("mcp");if(!mcp)return;for(const k of ["biz","mkt"]){const f=(b.folders||{})[k];if(!f||!f.id)continue;let ok=true;try{ok=await folderAlive(mcp,f.id)}catch(e){continue}
      const dd=root.querySelector(`[data-fold="${k}"]`);if(ok||!dd||!dd.isConnected)continue;
      dd.innerHTML=`<span class="note">These folders were deleted from your Drive.</span><button class="btn small" data-mkf2="${k}">Create new folders</button>`;
      const x=dd.querySelector("[data-mkf2]");x.onclick=async()=>{x.disabled=true;x.textContent="Creating…";const r=await makeEventFolder(b,k,{confirmed:true});if(r){toast(`New ${ROOTS[k].name} folders are ready`);bookingView(b.id)}else if(x.isConnected){x.disabled=false;x.textContent="Create new folders"}}}})();
    const ct=root.querySelector("[data-contract]");if(ct)ct.onclick=()=>uploadToDrive(b,"contract",ct);
    const mu=root.querySelector("[data-mkup]");if(mu)mu.onclick=()=>uploadToDrive(b,"marketing",mu);
    root.querySelectorAll("[data-mkf]").forEach(x=>x.onclick=async()=>{if(!(b.title||b.venueId)){toast("Add a show name or venue first");return}const k=x.dataset.mkf;x.disabled=true;x.textContent="Creating…";
      const r=await makeEventFolder(b,k);if(r){toast(`${ROOTS[k].name} / ${r.year} / ${eventLabel(b)} is ready`);bookingView(b.id)}else if(x.isConnected){x.disabled=false;x.textContent="Create folders"}});
  });
}
const strip=o=>{const c={...o};delete c.id;return c};
function syncChecks(bid,k,val){document.querySelectorAll(`[data-task="${bid}:${k}"]`).forEach(c=>c.checked=val);const sh=document.querySelector(`.sheet[data-booking="${bid}"]`);if(sh)sh.querySelectorAll(`[data-btask="${k}"]`).forEach(c=>c.checked=val)}
async function toggleTask(bid,k,val){const b=S.bookings.find(x=>x.id===bid);const label=(tasksOf(b||{}).find(t=>t.key===k)||{}).label||"Task";
  await setTask(bid,k,val);toast(`${val?"Done":"Not done"}: ${label}`,async()=>{syncChecks(bid,k,!val);await setTask(bid,k,!val);toast("Undone")})}
async function setTask(bid,k,val){if(!S.bookings.some(x=>x.id===bid))return;await patch("bookings",bid,{tasks:{[k]:!!val},updatedAt:new Date().toISOString()})}

function contactForm(c={},opts={}){const isNew=!c.id;if(c.id&&!opts.keep&&!opts._prevRun){const ps=relPromoters(c);opts={...opts,_prevRun:(ps.find(isColl)||ps[0]||{}).id||""}}let st={...c,type:c.type||"",pkind:c.pkind||"person",venueIds:c.id&&!opts.keep?relVenues(c).map(v=>v.id):[...(c.venueIds||[])],promoterIds:c.id&&!opts.keep?relPromoters(c).map(p=>p.id):[...(c.promoterIds||[])],
    runBy:c.runBy!==undefined?c.runBy:(()=>{const ps=c.id?relPromoters(c):(c.promoterIds||[]).map(contact).filter(Boolean);return(ps.find(isColl)||ps[0]||{}).id||""})(),
    collectiveIds:c.id&&!opts.keep?collectivesOf(c).map(x=>x.id):collIds(c),memberIds:c.id&&!opts.keep?membersOf(c).map(x=>x.id):[...(c.memberIds||[])]};
  const segOf=(id,list,val)=>`<div class="seg" id="${id}" style="flex-wrap:wrap">${list.map(([k,l])=>`<button type="button" data-v="${k}" aria-pressed="${val===k}">${l}</button>`).join("")}</div>`;
  const common=(o={})=>`<div class="frow">${field("c-email","Email",st.email,"email",'data-k="email"')}${field("c-phone","Phone",st.phone,"tel",'data-k="phone"')}</div>
    <div class="frow">${field("c-ig","Instagram",st.instagram,"text",'data-k="instagram" placeholder="@handle"')}${o.noCity?"":field("c-city","City",st.city,"text",'data-k="city"')}</div>`;
  const notes=`<div class="f"><label for="c-notes">Notes</label><textarea id="c-notes" data-k="notes" style="min-height:70px">${esc(st.notes)}</textarea></div>`;
  const venues=S.contacts.filter(x=>x.type==="venue"&&x.id!==c.id),promoters=S.contacts.filter(x=>x.type==="promoter"&&x.id!==c.id);
  let showAllBc=false,showAllRun=false;
  function venueLinkHtml(){const run=contact(st.runBy),bcP=contact(st.bookingContactId);
    // booking contact: if run by a collective, only its people
    let bcList,bcNew="＋ Add new booking contact…",bcNote="The person you talk to about bookings here. Templates for this venue go to them.";
    if(isColl(run)&&!showAllBc){bcList=`<optgroup label="${esc(cName(run))}">${personOpts(membersOf(run).sort((a,b)=>cName(a).localeCompare(cName(b))),st.bookingContactId)}</optgroup><option value="__all__">Show all promoters…</option>`;bcNew="＋ Add new person to "+esc(cName(run))+"…";bcNote=`Showing people in ${esc(cName(run))}.`}
    else{const ppl=S.contacts.filter(x=>x.type==="promoter"&&!isColl(x)).sort((a,b)=>cName(a).localeCompare(cName(b)));bcList=ppl.length?`<optgroup label="Promoters">${personOpts(ppl,st.bookingContactId)}</optgroup>`:""}
    // run by: if contact belongs to collectives, only those (plus the person)
    const cols=bcP?collectivesOf(bcP):[];let runList;
    if(bcP&&cols.length&&!showAllRun){runList=`<optgroup label="${esc(cName(bcP))}'s collectives">${cols.map(x=>`<option value="${x.id}" ${x.id===st.runBy?"selected":""}>${esc(cName(x))}</option>`).join("")}</optgroup><optgroup label="Independent"><option value="${bcP.id}" ${bcP.id===st.runBy?"selected":""}>${esc(cName(bcP))} (promoter)</option></optgroup><option value="__all__">Show all collectives and promoters…</option>`}
    else{const cl=S.contacts.filter(isColl).sort((a,b)=>cName(a).localeCompare(cName(b))),pl=S.contacts.filter(x=>x.type==="promoter"&&!isColl(x)).sort((a,b)=>cName(a).localeCompare(cName(b)));
      runList=(cl.length?`<optgroup label="Collectives">${cl.map(x=>`<option value="${x.id}" ${x.id===st.runBy?"selected":""}>${esc(cName(x))}</option>`).join("")}</optgroup>`:"")+(pl.length?`<optgroup label="Promoters">${personOpts(pl,st.runBy)}</optgroup>`:"")}
    const fest=st.vkind==="festival";
    return `<div class="f"><label for="c-bc">Booking contact (optional)</label><select id="c-bc" class="srch"><option value="">None yet</option><option value="__new__">${bcNew}</option>${bcList}</select>
        ${st.name&&!st.bookingContactId?`<span class="note">Saved earlier as text: ${esc(st.name)}. Pick or add them above to link them.</span>`:`<span class="note">${bcNote}</span>`}</div>
      <div class="f"><label for="c-run">${fest?"Run by (collective or promoter)":"Booked through (collective or promoter)"}</label><select id="c-run" class="srch"><option value="">None</option><option value="__newcol__">＋ Add new collective…</option><option value="__newpro__">＋ Add new promoter…</option>${runList}</select>
        <span class="note">${bcP&&cols.length&&!showAllRun?`Showing ${esc(cName(bcP))}'s collectives.`:`Picking this ${fest?"festival":"venue"} on a booking fills this in.`}</span></div>`}
  function bodyHtml(){const t=st.type;
    if(!t)return `<p class="note" style="margin:0">Pick what kind of contact this is to see the right fields.</p>`;
    if(t==="venue")return `<div class="f"><label>Kind of place</label>${segOf("c-vkind",VKINDS,st.vkind||"club")}</div>
      ${field("c-org",st.vkind==="festival"?"Festival name":"Venue name",st.org,"text",'data-k="org" placeholder="'+(st.vkind==="festival"?"e.g. Summer Sound Fest":"e.g. The Lounge")+'"')}
      ${venueLinkHtml()}
      ${common()}
      ${field("c-addr","Address",st.address,"text",'data-k="address" autocomplete="street-address" placeholder="Street, city, state"')}
      ${st.address?`<div>${addrLink(st.address)}<br>${navAlts(st.address)}</div>`:""}
      ${field("c-site","Website",st.website,"url",'data-k="website"')}${notes}`;
    if(t==="promoter")return `<div class="f"><label>This is a</label>${segOf("c-pkind",[["person","Person"],["collective","Collective or company"]],st.pkind)}</div>
      ${st.pkind==="collective"?field("c-org","Collective name",st.org,"text",'data-k="org" placeholder="e.g. Sunset Collective"')+
          (()=>{const ppl=S.contacts.filter(p=>p.type==="promoter"&&!isColl(p)).sort((a,b)=>cName(a).localeCompare(cName(b))),inC=ppl.filter(p=>st.memberIds.includes(p.id)),outC=ppl.filter(p=>!st.memberIds.includes(p.id));
          return `<div class="f"><label>People in this collective</label><div class="chips">${ppl.map(p=>`<button type="button" class="chip" data-mid="${p.id}" aria-pressed="${st.memberIds.includes(p.id)}">${esc(cName(p))}</button>`).join("")}<button type="button" class="chip" data-addnew="person">＋ New person</button></div>
            <span class="note">Everyone you talk to here. They show up first when you pick who you're speaking to on a booking or venue.</span></div>
          <div class="f"><label for="c-main">Main contact (optional)</label><select id="c-main" class="srch"><option value="">None yet</option><option value="__new__">＋ Add new person…</option>${inC.length?`<optgroup label="In this collective">${personOpts(inC,st.mainContactId)}</optgroup>`:""}${outC.length?`<optgroup label="Other promoters">${personOpts(outC,st.mainContactId)}</optgroup>`:""}</select>
          ${st.name&&!st.mainContactId?`<span class="note">Saved earlier as text: ${esc(st.name)}. Pick or add them above to link them.</span>`:`<span class="note">Who emails go to by default.</span>`}</div>`})()
        :field("c-name","Name",st.name,"text",'data-k="name"')+
          `<div class="f"><label>Collectives or companies (optional)</label><div class="chips">${S.contacts.filter(isColl).sort((a,b)=>cName(a).localeCompare(cName(b))).map(p=>`<button type="button" class="chip" data-cid="${p.id}" aria-pressed="${st.collectiveIds.includes(p.id)}">${esc(cName(p))}</button>`).join("")}<button type="button" class="chip" data-addnew="collective">＋ New collective</button></div>
          ${st.org&&!st.collectiveIds.length?`<span class="note">Saved earlier as text: ${esc(st.org)}. Pick or add the collective above to link it.</span>`:`<span class="note">Pick every collective they work with. Their venues are added here too.</span>`}</div>`}
      <div class="f"><label>Venues they book</label>${venues.length?`<div class="chips" id="c-venues">${venues.map(v=>`<button type="button" class="chip" data-vid="${v.id}" aria-pressed="${st.venueIds.includes(v.id)}">${esc(cName(v))}</button>`).join("")}<button type="button" class="chip" data-addnew="venue">＋ New</button></div>
        <span class="note">Picking this promoter on a booking fills in the venue when there's only one.</span>`:`<div class="chips"><button type="button" class="chip" data-addnew="venue">＋ Add a venue or festival</button></div>`}</div>
      ${common()}${st.pkind==="collective"?field("c-site","Website",st.website,"url",'data-k="website" placeholder="https://"'):""}${notes}`;
    if(t==="media")return `${field("c-name","Name",st.name,"text",'data-k="name"')}
      <div class="f"><label>Shoots</label>${segOf("c-mkind",MKINDS,st.mkind||"photo")}</div>
      ${field("c-rate","Rate / terms",st.rate,"text",'data-k="rate" placeholder="e.g. $150 per event, 48h turnaround"')}
      ${field("c-port","Portfolio link",st.portfolio,"url",'data-k="portfolio"')}
      ${common()}${notes}`;
    return `${field("c-name","Name",st.name,"text",'data-k="name"')}${field("c-org","Company (optional)",st.org,"text",'data-k="org"')}${common()}${notes}`}
  sheet(`<h3>${isNew?"New contact":"Edit contact"}</h3>
  <div class="f"><label>Type</label>${segOf("c-type",CTYPES,st.type)}</div>
  <div id="c-body" style="display:flex;flex-direction:column;gap:14px"></div>
  <div class="actions">${isNew?"":delBtn()}<button class="btn" data-cancel>${opts.back||"Cancel"}</button><button class="btn primary" data-save>${isNew?(opts.onSaved?"Add and use":"Add contact"):"Save"}</button></div>`,root=>{
    const body=root.querySelector("#c-body");
    const capture=()=>{Object.assign(st,formVals(body))};
    const nestNew=(type,pre,apply)=>{capture();const snap={...st,venueIds:[...st.venueIds],promoterIds:[...st.promoterIds],collectiveIds:[...st.collectiveIds],memberIds:[...st.memberIds]};
      const label=cName(snap)||(snap.type==="venue"?"venue":snap.type==="promoter"?"promoter":"contact");
      contactForm({type,...pre},{onSaved:id=>{apply(snap,id);contactForm(snap,{...opts,keep:true});toast("Added and linked")},onCancel:()=>contactForm(snap,{...opts,keep:true}),back:"Back to "+label})};
    const draw=()=>{body.innerHTML=bodyHtml();
      const bindSeg=(id,key)=>{const el=body.querySelector("#"+id);if(el)el.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{capture();st[key]=b.dataset.v;draw()})};
      bindSeg("c-vkind","vkind");bindSeg("c-pkind","pkind");bindSeg("c-mkind","mkind");
      body.querySelectorAll("[data-vid]").forEach(b=>b.onclick=()=>{const id=b.dataset.vid,i=st.venueIds.indexOf(id);i<0?st.venueIds.push(id):st.venueIds.splice(i,1);b.setAttribute("aria-pressed",i<0)});
      const bc=body.querySelector("#c-bc");if(bc)bc.onchange=()=>{capture();const v=bc.value;
        if(v==="__all__"){showAllBc=true;draw();return}
        if(v==="__new__"){bc.value=st.bookingContactId||"";const run=contact(st.runBy);nestNew("promoter",{pkind:"person",collectiveIds:isColl(run)?[run.id]:[],city:st.city||""},(snap,id)=>{snap.bookingContactId=id});return}
        st.bookingContactId=v;showAllRun=false;const p=contact(v);
        if(p){const cols=collectivesOf(p);if(cols.length){if(!cols.some(x=>x.id===st.runBy)&&st.runBy!==p.id)st.runBy=cols.length===1?cols[0].id:st.runBy&&cols.some(x=>x.id===st.runBy)?st.runBy:""}
          else if(!st.runBy)st.runBy=p.id}
        draw()};
      const run=body.querySelector("#c-run");if(run)run.onchange=()=>{capture();const v=run.value;
        if(v==="__all__"){showAllRun=true;draw();return}
        if(v==="__newcol__"||v==="__newpro__"){run.value=st.runBy||"";const bp=contact(st.bookingContactId);
          nestNew("promoter",v==="__newcol__"?{pkind:"collective",venueIds:c.id?[c.id]:[]}:{pkind:"person",venueIds:c.id?[c.id]:[]},(snap,id)=>{snap.runBy=id});return}
        st.runBy=v;showAllBc=false;const r=contact(v);
        if(isColl(r)){const m=membersOf(r);if(!m.some(x=>x.id===st.bookingContactId))st.bookingContactId=(r.mainContactId&&m.some(x=>x.id===r.mainContactId))?r.mainContactId:(m.length===1?m[0].id:"")}
        else if(r)st.bookingContactId=r.id;
        draw()};
      const linkColl=id=>{const col=contact(id);if(!col)return;let added=0;relVenues(col).forEach(v=>{if(!st.venueIds.includes(v.id)){st.venueIds.push(v.id);added++}});const cityFill=!st.city&&col.city;if(cityFill)st.city=col.city;return {added,cityFill,col}};
      body.querySelectorAll("[data-cid]").forEach(b=>b.onclick=()=>{capture();const id=b.dataset.cid,i=st.collectiveIds.indexOf(id);
        if(i>=0){st.collectiveIds.splice(i,1);b.setAttribute("aria-pressed","false");return}
        st.collectiveIds.push(id);const r=linkColl(id);if(r&&(r.added||r.cityFill)){draw();if(r.added)toast(`Added ${r.added} venue${r.added>1?"s":""} from ${cName(r.col)}`)}else b.setAttribute("aria-pressed","true")});
      body.querySelectorAll("[data-mid]").forEach(b=>b.onclick=()=>{const id=b.dataset.mid,i=st.memberIds.indexOf(id);i<0?st.memberIds.push(id):st.memberIds.splice(i,1);capture();draw()});
      const main=body.querySelector("#c-main");if(main)main.onchange=()=>{
        if(main.value==="__new__"){main.value=st.mainContactId||"";nestNew("promoter",{pkind:"person",collectiveIds:c.id?[c.id]:[],city:st.city||""},(snap,id)=>{snap.mainContactId=id;if(!snap.memberIds.includes(id))snap.memberIds.push(id)});return}
        st.mainContactId=main.value;if(main.value&&!st.memberIds.includes(main.value)){capture();st.memberIds.push(main.value);draw()}const p=contact(main.value);if(p){if(!body.querySelector("#c-email").value&&p.email)body.querySelector("#c-email").value=p.email;if(!body.querySelector("#c-phone").value&&p.phone)body.querySelector("#c-phone").value=p.phone}};
      body.querySelectorAll("[data-addnew]").forEach(b=>b.onclick=()=>{const t=b.dataset.addnew;
        if(t==="person")nestNew("promoter",{pkind:"person",collectiveIds:c.id?[c.id]:[],city:st.city||""},(snap,id)=>{if(!snap.memberIds.includes(id))snap.memberIds.push(id)});
        else if(t==="collective")nestNew("promoter",{pkind:"collective",venueIds:[...st.venueIds]},(snap,id)=>{if(!snap.collectiveIds.includes(id))snap.collectiveIds.push(id)});
        else if(t==="promoter")nestNew("promoter",{pkind:st.vkind==="festival"?"collective":"person"},(snap,id)=>{if(!snap.promoterIds.includes(id))snap.promoterIds.push(id)});
        else nestNew("venue",{},(snap,id)=>{if(!snap.venueIds.includes(id))snap.venueIds.push(id)})});
      body.querySelectorAll("[data-pid]").forEach(b=>b.onclick=()=>{capture();const id=b.dataset.pid,i=st.promoterIds.indexOf(id);i<0?st.promoterIds.push(id):st.promoterIds.splice(i,1);draw()});
      const first=body.querySelector("input");if(first&&!first.value)first.focus()};
    root.querySelectorAll("#c-type [data-v]").forEach(b=>b.onclick=()=>{capture();st.type=b.dataset.v;root.querySelectorAll("#c-type [data-v]").forEach(x=>x.setAttribute("aria-pressed",x===b));draw()});
    draw();
    root.querySelector("[data-cancel]").onclick=()=>{if(opts.onCancel)opts.onCancel();else close()};armDelete(root,async()=>{await remove("contacts",c.id);close()});
    root.querySelector("[data-save]").onclick=async()=>{capture();
      if(!st.type){toast("Pick a type first");return}
      const need=orgFirst(st)?"org":"name";if(!st[need]){toast(st.type==="venue"?"Add the venue name":st.type==="promoter"&&st.pkind==="collective"?"Add the collective name":"Add a name");const el=root.querySelector(need==="org"?"#c-org":"#c-name");el&&el.focus();return}
      if(st.type==="venue"&&!st.vkind)st.vkind="club";if(st.type==="media"&&!st.mkind)st.mkind="photo";
      if(st.type==="venue")st.promoterIds=[...new Set([st.runBy,st.bookingContactId].filter(Boolean))];
      const data={...st};delete data.id;if(data.type!=="promoter"){delete data.venueIds;delete data.pkind;delete data.collectiveId;delete data.mainContactId}if(data.type!=="venue")delete data.promoterIds;
      delete data.collectiveId;delete data.memberIds;delete data.runBy;if(isColl(data)||data.type!=="promoter"){delete data.collectiveIds}else delete data.mainContactId;
      const id=await save("contacts",c.id,data);
      if(id&&c.id){ // keep links consistent from the other side when one is removed
        if(data.type==="venue"&&opts._prevRun&&opts._prevRun!==st.runBy){const p=contact(opts._prevRun);if(p&&(p.venueIds||[]).includes(c.id))await save("contacts",p.id,{...strip(p),venueIds:p.venueIds.filter(x=>x!==c.id)})}
        if(data.type==="promoter"){for(const v of S.contacts.filter(v=>v.type==="venue"&&(v.promoterIds||[]).includes(c.id)&&!st.venueIds.includes(v.id)))await save("contacts",v.id,{...strip(v),promoterIds:v.promoterIds.filter(x=>x!==c.id)})}}if(id){ // fill in the other side of a person ↔ collective link when it's empty
        if(isColl(data)){ // membership lives on each person
          const want=new Set(st.memberIds);if(data.mainContactId)want.add(data.mainContactId);
          for(const p of S.contacts.filter(p=>p.type==="promoter"&&!isColl(p))){const has=collIds(p).includes(id),should=want.has(p.id);
            if(has!==should){const ids=collIds(p).filter(x=>x!==id);if(should)ids.push(id);const nd={...strip(p),collectiveIds:ids};delete nd.collectiveId;await save("contacts",p.id,nd)}}}
        if(data.type==="promoter"&&!isColl(data)){
          for(const cid of data.collectiveIds||[]){const col=contact(cid);if(col&&!col.mainContactId)await save("contacts",col.id,{...strip(col),mainContactId:id})}
          for(const col of S.contacts.filter(x=>isColl(x)&&x.mainContactId===id&&!(data.collectiveIds||[]).includes(x.id)))await save("contacts",col.id,{...strip(col),mainContactId:""})}}
      if(id){if(opts.onSaved){S.contacts.some(x=>x.id===id)||S.contacts.push({id,...data});opts.onSaved(id)}else{close();toast(isNew?"Contact added":"Saved")}}}});
}
function expenseForm(e={}){const isNew=!e.id;
  sheet(`<h3>${isNew?"Log expense":"Edit expense"}</h3>
  ${field("e-desc","What was it",e.desc,"text",'data-k="desc" placeholder="e.g. Rekordbox subscription"')}
  <div class="frow">${field("e-amt","Amount ($)",e.amount,"number",'data-k="amount" inputmode="decimal"')}${field("e-date","Date",e.date||today(),"date",'data-k="date"')}</div>
  <div class="frow"><div class="f"><label for="e-cat">Type <button type="button" class="linkbtn" data-edittypes>Edit types</button></label>${typeSelect("e-cat","expense",e.category||(ECATS[0]||[])[0])}${newTypeRow("e-cat")}</div>
  <div class="f"><label for="e-b">For booking (optional)</label><select id="e-b" class="srch" data-k="bookingId"><option value="">None</option>${sortedBookings().map(b=>`<option value="${b.id}" ${b.id===e.bookingId?"selected":""}>${esc((b.title||contactName(b.venueId)||"Show")+" · "+(b.date||"TBD"))}</option>`).join("")}</select></div></div>
  <div id="e-otherWrap" ${e.category==="Other"?"":"hidden"}>${field("e-other","What was it for?",e.otherLabel,"text",'data-k="otherLabel" placeholder="Describe this kind of expense"')}</div>
  ${payHtml("e","Paid with",e.payMethod,e.payRef)}
  <div class="f"><label for="e-purpose">Business purpose (for taxes)</label><textarea id="e-purpose" data-k="purpose" style="min-height:60px" placeholder="e.g. New headphones for gigs; cables for the weekend shows">${esc(e.purpose)}</textarea></div>
  <p class="note" style="margin:0" id="e-line">${esc(catOf(ECATS,e.category||(ECATS[0]||[])[0])[2])}</p>
  <div class="actions">${isNew?"":delBtn()}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>${isNew?"Log it":"Save"}</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;armDelete(root,async()=>{await remove("expenses",e.id);close()});
    wirePay(root,"e");
    wireTypeSelect(root,"e-cat","expense",v=>{root.querySelector("#e-otherWrap").hidden=v!=="Other";root.querySelector("#e-line").textContent=catOf(ECATS,v)[2]});
    root.querySelector("[data-edittypes]").onclick=()=>{const d={...e,...formVals(root)};typesSheet(()=>expenseForm(d))};
    root.querySelector("[data-save]").onclick=async()=>{const v=formVals(root);if(!(v.amount>0)){toast("Enter an amount");return}
      if(v.category==="Other"&&!v.otherLabel){toast("Say what it was for");root.querySelector("#e-other").focus();return}
      if(v.category!=="Other")v.otherLabel="";
      if(await save("expenses",e.id,{...strip(e),...v})){close();toast(isNew?"Expense logged":"Saved")}}});
}
function linkForm(l={}){const isNew=!l.id;
  sheet(`<h3>${isNew?"Add link":"Edit link"}</h3>${field("l-label","Label",l.label,"text",'data-k="label" placeholder="e.g. SoundCloud, Boiler Room set, Press photos (Drive)"')}${field("l-url","Link",l.url,"url",'data-k="url"')}
  <div class="f"><label for="l-group">Group</label><select id="l-group" data-k="group">${opt(LGROUPS,l.group||"links")}</select></div>
  <div class="actions">${isNew?"":delBtn()}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;armDelete(root,async()=>{await remove("links",l.id);close()});
    root.querySelector("[data-save]").onclick=async()=>{const v=formVals(root);if(!v.label||!v.url){toast("Add a label and a link");return}
      if(await save("links",l.id,{...strip(l),...v})){close();toast("Saved")}}});
}
const FILLINS=[["Contact & show",[["contact_first","Contact's first name"],["venue","Venue name"],["promoter","Promoter name"],["media_name","Media person's name"],["show","Show name"]]],
  ["Date & place",[["date","Show date"],["set_time","Set time"],["city","City"],["address","Address"],["availability","My open dates (from Availability)"]]],
  ["Money & links",[["fee","Fee"],["ticket_link","Ticket link"],["media_folder","Media upload folder"]]],
  ["About you",[["pay_handles","Payment usernames"],["my_name","Your name"],["dj_name","DJ name"],["website","Website"],["epk","EPK link"],["instagram","Instagram"],["phone","Phone"]]],
  ["From your Kit",[["bio_short","Short bio"],["bio_long","Long bio"],["links","All your links"],["files","Promo file share links"],["promo_folder","Promo content folder"],["rider","Tech rider"],["hospitality","Hospitality rider"],["press_kit","Full press kit"]]]];
const fillSelect=id=>`<select id="${id}"><option value="">Choose one to add where your cursor is…</option>${FILLINS.map(([g,items])=>`<optgroup label="${g}">${items.map(([k,l])=>`<option value="${k}">${l}  ·  {{${k}}}</option>`).join("")}</optgroup>`).join("")}</select>`;
function wireFill(root,subj,body,sel,note,after){let target=body;
  [subj,body].forEach(el=>el.addEventListener("focus",()=>{target=el;if(note)note.textContent=el===subj?"Goes into the subject at your cursor.":"Goes into the body at your cursor."}));
  sel.onchange=()=>{const k=sel.value;if(!k)return;const tok="{{"+k+"}}",el=target;
    const a=el.selectionStart??el.value.length,z=el.selectionEnd??a;el.value=el.value.slice(0,a)+tok+el.value.slice(z);
    sel.value="";el.focus();el.setSelectionRange(a+tok.length,a+tok.length);after&&after()}}
/* compose lives in its own layer so it survives other sheets and can be minimized */
let draftOpen=false;
function composeShow(){$("#composeRoot").hidden=false;$("#composeDock").hidden=true}
function composeMin(){if(!draftOpen)return;$("#composeRoot").hidden=true;const sj=$("#cm-subj");$("#dockLabel").textContent=sj&&sj.value.trim()?"Draft: "+sj.value.trim():"Draft email";$("#composeDock").hidden=false}
function composeEnd(){draftOpen=false;$("#composeRoot").innerHTML="";$("#composeRoot").hidden=true;$("#composeDock").hidden=true}
$("#composeDock").onclick=composeShow;
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&draftOpen&&!$("#composeRoot").hidden&&!$("#sheetRoot").innerHTML)composeMin()});
function composeSheet(pre={}){
  if(draftOpen){const sj=$("#cm-subj"),bd=$("#cm-body");if((sj&&sj.value.trim())||(bd&&bd.value.trim())){composeShow();toast("Your draft is still open. Discard it to start a new one.");return}}
  const root=$("#composeRoot");draftOpen=true;
  root.innerHTML=`<div class="sheet-bg"><div class="sheet" role="dialog" aria-modal="true" aria-label="New email"><div class="head"><h3>${pre.title?esc(pre.title):"New email"}</h3><button class="btn small" data-min title="Minimize to copy things from the app">Minimize</button></div>
  <div class="frow"><div class="f"><label for="cm-to">To</label><select id="cm-to" class="srch">${contactOptsG(pre.to||"","Pick from People, or type below",pre.aud||(contact(pre.to)||{}).type)}</select></div>
  <div class="f"><label for="cm-b">About a booking (optional)</label><select id="cm-b" class="srch"><option value="">None</option>${sortedBookings().map(x=>`<option value="${x.id}" ${x.id===pre.booking?"selected":""}>${esc((x.title||contactName(x.venueId)||"Show")+" · "+(x.date||"TBD"))}</option>`).join("")}</select></div></div>
  ${field("cm-email","Email address",pre.email||"","email",'placeholder="name@example.com"')}
  <div class="frow"><div class="f"><label for="cm-cc">Cc (optional)</label><select id="cm-cc" class="srch">${contactOptsG("","Add someone from People",pre.aud)}</select></div>
  ${field("cm-ccemail","Cc addresses",pre.cc||"","text",'placeholder="Comma-separated"')}</div>
  ${field("cm-subj","Subject",pre.subject||"","text")}
  <div class="f"><label for="cm-body">Message</label><textarea id="cm-body" style="min-height:200px">${esc(pre.body||"")}</textarea></div>
  <div class="f"><label for="cm-fill">Insert a fill-in</label>${fillSelect("cm-fill")}<span class="note" id="cm-fillTo">Goes into the message. Click into the subject first to add it there.</span></div>
  <p class="note" style="margin:0">Fill-ins are swapped for the real details when you send. Tap Minimize to grab a link from Kit or anywhere in the app, then tap the draft button to come back and paste it.</p>
  <div class="actions"><button class="btn danger" data-discard>Discard</button><span class="spacer"></span><button class="btn save" data-tpl>Save as template</button><button class="btn" data-cp>Copy text</button><a class="btn" id="cm-go" target="_blank" rel="noopener" href="#">Open in Gmail</a><button class="btn primary" data-send>Send…</button></div>
  <p class="note" style="margin:0;text-align:right">Send… shows you the final email first, then sends it from your Gmail with your signature.</p></div></div>`;
  composeShow();
  const $r=q=>root.querySelector(q),to=$r("#cm-to"),em=$r("#cm-email"),bk=$r("#cm-b"),subj=$r("#cm-subj"),body=$r("#cm-body"),go=$r("#cm-go");
  root.firstChild.addEventListener("click",e=>{if(e.target===root.firstChild)composeMin()});
  const syncTo=()=>{const c=contact(to.value);if(c)em.value=c.email||"";em.placeholder=c&&!c.email?"No email saved for "+cName(c):"name@example.com";update()};
  const built=()=>{const b=S.bookings.find(x=>x.id===bk.value)||null,c=contact(to.value)||(em.value?{name:"",email:em.value}:null);
    return {to:em.value.trim(),subj:fill(subj.value,b,c),body:fill(body.value,b,c)}};
  const update=()=>{const m=built();go.href=`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(m.to)}&su=${encodeURIComponent(m.subj)}&body=${encodeURIComponent(m.body)}`};
  to.onchange=syncTo;bk.onchange=()=>{const b=S.bookings.find(x=>x.id===bk.value);if(b&&!to.value){const d=b.contactPersonId||b.promoterId||b.venueId;if(d){to.value=d;syncTo()}}update()};
  [em,subj,body].forEach(el=>el.addEventListener("input",update));
  wireFill(root,subj,body,$r("#cm-fill"),$r("#cm-fillTo"),update);
  go.addEventListener("click",e=>{if(!subj.value.trim()&&!body.value.trim()){e.preventDefault();toast("Write a subject or message first");return}update()});
  $r("[data-cp]").onclick=()=>{const m=built();copy(`${m.to?"To: "+m.to+"\n":""}Subject: ${m.subj}\n\n${m.body}`)};
  $r("[data-min]").onclick=composeMin;
  const ccSel=$r("#cm-cc"),ccEm=$r("#cm-ccemail");ccSel.onchange=()=>{const c=contact(ccSel.value);ccSel.value="";if(!c)return;if(!c.email){toast("No email saved for "+cName(c));return}const cur=splitMails(ccEm.value);if(!cur.includes(c.email.toLowerCase()))ccEm.value=[...cur,c.email.toLowerCase()].join(", ")};
  $r("[data-send]").onclick=async e=>{const btn=e.currentTarget,m=built(),rcpt=splitMails(m.to),cc=splitMails(ccEm.value);
    if(!rcpt.length){toast("Add who it's going to");em.focus();return}const bad=[...rcpt,...cc].find(x=>!isMail(x));if(bad){toast(bad+" isn't a valid email address");return}
    if(!m.subj.trim()){toast("Add a subject");subj.focus();return}if(!m.body.trim()){toast("Write a message first");body.focus();return}
    if(!(await confirmSend({to:rcpt,cc,subject:m.subj,body:m.body})))return;btn.disabled=true;btn.textContent="Sending…";
    try{const p=await gmailSend({to:rcpt,cc,subject:m.subj,body:m.body,bookingId:bk.value,contactId:to.value||""});composeEnd();sentNotice(p,rcpt)}
    catch(err){if(btn.isConnected){btn.disabled=false;btn.textContent="Send…"}sendErr(err)}};
  const dis=$r("[data-discard]");dis.onclick=()=>{if(!subj.value.trim()&&!body.value.trim()){composeEnd();return}
    if(dis.dataset.armed){composeEnd();toast("Draft discarded")}else{dis.dataset.armed=1;dis.textContent="Tap again to discard";setTimeout(()=>{if(dis.isConnected){delete dis.dataset.armed;dis.textContent="Discard"}},3000)}};
  $r("[data-tpl]").onclick=()=>{if(!subj.value.trim()&&!body.value.trim()){toast("Write something to save first");return}
    composeMin();templateForm({name:"",subject:subj.value,body:body.value,audience:"venue"})};
  if(pre.email)em.value=pre.email;else syncTo();update();
  setTimeout(()=>(pre.subject?body:subj).focus(),30);
}
$("#composeBtn").onclick=()=>composeSheet();
function templateForm(t={}){const isNew=!t.id;
  sheet(`<h3>${isNew?"New template":"Edit template"}</h3>${field("t-name","Template name",t.name,"text",'data-k="name"')}
  <div class="f"><label for="t-stage">Suggest for stage</label><select id="t-stage" data-k="stage"><option value="">Any stage</option>${STATUSES.map(([k,l])=>`<option value="${k}" ${t.stage===k?"selected":""}>${esc(l)}</option>`).join("")}</select></div>
  ${field("t-subj","Subject",t.subject,"text",'data-k="subject"')}
  <div class="f"><label for="t-body">Body</label><textarea id="t-body" data-k="body" style="min-height:220px">${esc(t.body)}</textarea></div>
  <div class="f"><label for="t-fill">Insert a fill-in</label><select id="t-fill"><option value="">Choose one to add where your cursor is…</option>${FILLINS.map(([g,items])=>`<optgroup label="${g}">${items.map(([k,l])=>`<option value="${k}">${l}  ·  {{${k}}}</option>`).join("")}</optgroup>`).join("")}</select>
  <span class="note" id="t-fillTo">Goes into the body. Click into the subject first to add it there.</span></div>
  <div class="actions">${isNew?"":delBtn()}<button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;armDelete(root,async()=>{await remove("templates",t.id);close()});
    const subj=root.querySelector("#t-subj"),body=root.querySelector("#t-body"),fillSel=root.querySelector("#t-fill");let target=body;
    [subj,body].forEach(el=>el.addEventListener("focus",()=>{target=el;root.querySelector("#t-fillTo").textContent=el===subj?"Goes into the subject at your cursor.":"Goes into the body at your cursor."}));
    fillSel.onchange=()=>{const k=fillSel.value;if(!k)return;const tok="{{"+k+"}}",el=target;
      const a=el.selectionStart??el.value.length,z=el.selectionEnd??a;el.value=el.value.slice(0,a)+tok+el.value.slice(z);
      fillSel.value="";el.focus();el.setSelectionRange(a+tok.length,a+tok.length)};
    root.querySelector("[data-save]").onclick=async()=>{const v=formVals(root);if(!v.name){toast("Name the template");return}
      if(await save("templates",t.id,{...strip(t),...v})){close();toast("Saved")}}});
}
function fill(str,b,to){const v=b?contact(b.venueId):null,p=S.profile;
  const pr=b?contact(b.promoterId):null,md=b?contact(b.mediaId):null;
  const K=S.kit||{};
  const map={availability:availText(),bio_short:K.bioShort||"",bio_long:K.bioLong||"",rider:K.rider||"",hospitality:K.hospitality||"",promo_folder:(K.promoFolder&&K.promoFolder.url)||"",links:linksText(),files:filesText(),press_kit:pressKitText(),promoter:(pr&&(pr.name||pr.org))||"",media_name:(md&&md.name)||"",contact_first:(to&&to.name||"").split(" ")[0]||"there",venue:(v&&(v.org||v.name))||"",date:b&&b.date?fmtD(b.date):"",city:b&&b.city||"",address:bAddr(b),fee:b&&b.fee?money(b.fee):"",set_time:b&&b.setTime||"",show:b&&(b.title||"")||"",ticket_link:b&&b.ticketUrl||"",media_folder:b&&b.driveUrl||"",
    pay_handles:handlesText(),my_name:p.myName||"",dj_name:p.djName||"",website:p.website||"",epk:p.epk||"",instagram:p.instagram||"",phone:p.phone||""};
  return String(str||"").replace(/\{\{(\w+)\}\}/g,(m,k)=>k in map?map[k]:m)}
const defRecipient=(t,b)=>{if(!b)return"";if(t.audience==="media")return b.mediaId;if(b.contactPersonId&&contact(b.contactPersonId))return b.contactPersonId;const p=contact(b.promoterId);
  if(p)return isColl(p)&&!p.email&&p.mainContactId?p.mainContactId:p.id;return((contact(b.venueId)||{}).bookingContactId)||b.venueId};
function useTemplate(tid,bid){const t=S.templates.find(x=>x.id===tid);if(!t)return;
  let b=bid?S.bookings.find(x=>x.id===bid):null;
  const draw=()=>{const toId=$("#u-to")?.value;const to=contact(toId)||contact(defRecipient(t,b));
    const subj=fill(t.subject,b,to), body=fill(t.body,b,to), email=to&&to.email||"";
    $("#u-out").innerHTML=`<div class="f"><label>To</label><div class="num">${esc(email||"No email on file")}</div></div><div class="f"><label>Subject</label><div>${esc(subj)}</div></div><div class="preview">${esc(body)}</div>
    <div class="actions"><button class="btn" data-cp>Copy text</button><button class="btn" data-tweak>Edit before sending</button><a class="btn" target="_blank" rel="noopener" href="https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}&su=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}">Open in Gmail</a><button class="btn primary" data-usend>Send…</button></div>`;
    $("#u-out [data-usend]").onclick=async e=>{const btn=e.currentTarget;if(!isMail(String(email).toLowerCase())){toast(to?"No email saved for "+cName(to)+". Tap Edit before sending to type one.":"Pick who it's going to");return}
      if(!(await confirmSend({to:[email],subject:subj,body})))return;btn.disabled=true;btn.textContent="Sending…";
      try{const p=await gmailSend({to:[email],subject:subj,body,bookingId:b&&b.id||"",contactId:to&&to.id||""});close();sentNotice(p,[email])}catch(err){if(btn.isConnected){btn.disabled=false;btn.textContent="Send…"}sendErr(err)}};
    $("#u-out [data-cp]").onclick=()=>copy(`Subject: ${subj}\n\n${body}`);
    $("#u-out [data-tweak]").onclick=()=>{close();composeSheet({title:t.name,to:to&&to.id||"",email:email,booking:b&&b.id||"",subject:subj,body,aud:t.audience==="media"?"media":""})}};
  const defTo=defRecipient(t,b);
  sheet(`<div class="head"><h3>${esc(t.name)}</h3><button class="btn small" data-edit>Edit template</button></div>
  <div class="frow"><div class="f"><label for="u-b">Booking</label><select id="u-b" class="srch"><option value="">None</option>${sortedBookings().map(x=>`<option value="${x.id}" ${x.id===bid?"selected":""}>${esc((x.title||contactName(x.venueId)||"Show")+" · "+(x.date||"TBD"))}</option>`).join("")}</select></div>
  <div class="f"><label for="u-to">Send to</label><select id="u-to" class="srch">${contactOptsG(defTo,"Pick from People",t.audience==="media"?"media":(contact(defTo)||{}).type)}</select></div></div>
  <div id="u-out" style="display:flex;flex-direction:column;gap:10px"></div>
  <p class="note">Send… shows you the final email, then sends it from your Gmail with your signature. Or open it in Gmail to send it there.</p>
  <div class="actions"><button class="btn" data-close>Close</button></div>`,root=>{
    root.querySelector("[data-close]").onclick=close;root.querySelector("[data-edit]").onclick=()=>templateForm(t);
    $("#u-b").onchange=e=>{b=S.bookings.find(x=>x.id===e.target.value)||null;const d=defRecipient(t,b);if(d)$("#u-to").value=d;draw()};
    $("#u-to").onchange=draw;draw()});
}
function profileForm(){const p=S.profile;
  sheet(`<h3>Profile &amp; goals</h3><p class="note" style="margin:0">Used to fill in your email templates and track goals.</p>
  <div class="frow">${field("p-dj","DJ name",p.djName,"text",'data-k="djName"')}${field("p-me","Your name",p.myName,"text",'data-k="myName"')}</div>
  <div class="frow">${field("p-email","Booking email",p.email,"email",'data-k="email"')}${field("p-phone","Phone",p.phone,"tel",'data-k="phone"')}</div>
  <div class="frow">${field("p-web","Website",p.website,"url",'data-k="website"')}${field("p-epk","EPK link",p.epk,"url",'data-k="epk"')}</div>
  <div class="frow">${field("p-ig","Instagram",p.instagram,"text",'data-k="instagram"')}<div class="f"><label for="p-nav">Directions open in</label><select id="p-nav" data-k="navApp">${opt(NAV,p.navApp||"google")}</select></div></div>
  <div class="eyebrow" style="margin-top:4px">Goals</div>
  <div class="frow">${field("p-y","Year",p.goalYear||new Date().getFullYear(),"number",'data-k="goalYear"')}${field("p-gs","Shows",p.goalShows,"number",'data-k="goalShows"')}${field("p-gi","Income ($)",p.goalIncome,"number",'data-k="goalIncome"')}</div>
  <div class="actions"><button class="btn" data-cancel>Cancel</button><button class="btn primary" data-save>Save</button></div>`,root=>{
    root.querySelector("[data-cancel]").onclick=close;
    root.querySelector("[data-save]").onclick=async()=>{if(await save("settings","profile",{...p,...formVals(root)})){close();toast("Saved")}}});
}
async function copy(t){try{await navigator.clipboard.writeText(t);toast("Copied")}catch(e){toast("Copy blocked — select the text instead")}}

/* ---------- global clicks ---------- */
document.addEventListener("click",e=>{const el=e.target.closest("[data-new],[data-open-booking],[data-open-contact],[data-open-expense],[data-open-link],[data-open-template],[data-bf],[data-cf],[data-copy],[data-edit-profile],[data-filter-go],[data-day],[data-goto],[data-open-task],[data-open-income],[data-tx],[data-open-block]");if(!el)return;
  const d=el.dataset;
  if(d.new){({booking:bookingForm,contact:contactForm,expense:expenseForm,income:incomeForm,link:linkForm,template:templateForm})[d.new]();}
  else if(d.openIncome){incomeForm(S.income.find(c=>c.id===d.openIncome))}
  else if(d.tx){const tile=el.classList.contains('stat-tile');txFilter=(tile&&txFilter===d.tx)?'all':d.tx;renderMoney();if(tile)$('#txCard').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'})}
  else if(d.openBooking){bookingView(d.openBooking)}
  else if(d.openContact){contactForm(S.contacts.find(c=>c.id===d.openContact))}
  else if(d.openExpense){expenseForm(S.expenses.find(c=>c.id===d.openExpense))}
  else if(d.openLink){linkForm(S.links.find(c=>c.id===d.openLink))}
  else if(d.openTemplate){useTemplate(d.openTemplate)}
  else if(d.bf){bFilter=d.bf;renderBookings()}
  else if(d.cf){cFilter=d.cf;renderContacts()}
  else if(d.copy){copy(d.copy)}
  else if("editProfile" in d){profileForm()}
  else if(d.day){daySheet(d.day)}
  else if(d.goto){goTab(d.goto)}
  else if(d.openTask){const [bid,st,k]=d.openTask.split("|");taskSheet(bid,st,k)}
  else if(d.openBlock){blockForm(S.blocks.find(k=>k.id===d.openBlock))}
  else if(d.filterGo){bFilter=d.filterGo;goTab("bookings");renderBookings()}
});
document.addEventListener("change",e=>{const t=e.target.dataset.task;if(t){const i=t.indexOf(":");toggleTask(t.slice(0,i),t.slice(i+1),e.target.checked)}});
const LEGAL_TXT={"privacy": "<section id=\"who\"><h2>1. Who we are</h2> <p>{{COMPANY}} (\"we\", \"us\") operates Set & Settled (the \"Service\") at {{DOMAIN}}. Set & Settled is a business-management tool for independent performing artists: bookings, contacts, templates, invoices and records. Contact: {{CONTACT_EMAIL}}, {{ADDRESS}}.</p></section> <section id=\"collect\"><h2>2. Information we collect</h2> <ul><li><b>Account information:</b> name, email address, and a securely hashed password or Google sign-in identifier.</li> <li><b>Content you enter:</b> bookings, contacts, email templates, invoices, income and expense records, kit text, and settings.</li> <li><b>Google user data you authorize:</b> described in section 4.</li> <li><b>Payment usernames you choose to share</b> (for example a Venmo or Cash App username, a PayPal link or a Zelle email) so they can appear on your invoices. The Service never stores bank account, routing or card numbers. You can type them into an invoice or email you are sending, and they are used only for that message; before anything is saved, they are removed except for the last four digits. Copies you send, or choose to save to your own Google Drive, are yours and stay in your accounts.</li> <li><b>Technical data:</b> IP address, device and browser type, and security logs, kept for security and troubleshooting.</li></ul> <p>We do not collect precise location and we do not use advertising cookies or advertising trackers.</p></section> <section id=\"use\"><h2>3. How we use information</h2> <p>We use your information only to provide and secure the Service: to authenticate you, run the features you use, generate invoices you request, send the emails you explicitly choose to send, prevent abuse, and comply with law. We do not sell personal information.</p></section> <section id=\"google\"><h2>4. Google user data: access, use, storage and deletion</h2> <p><b>The application strictly requests access to 'gmail.send' and 'gmail.labels' to send and categorize automated emails at the explicit direction of the user. We do not store, scan, read, or share user email content, and no user data is transferred to third-party tools or used for advertising/marketing models.</b></p> <p>You connect each Google feature separately, when you first need it, and can disconnect at any time.</p> <table><thead><tr><th>Permission</th><th>What it lets us do</th><th>What we do not do</th></tr></thead><tbody> <tr><td>Gmail: send (<code>gmail.send</code>)</td><td>Send an email from your own account <b>only after you review the recipients, subject and message and press \"Send now.\"</b> This includes invoices with a PDF attachment.</td><td>We never send without that click. We cannot read your inbox, sent folder, threads or drafts.</td></tr> <tr><td>Gmail: labels (<code>gmail.labels</code>)</td><td>Create or look up a label (for example \"Set &amp; Settled\") so you can organize mail in Gmail.</td><td>We do not read any message.</td></tr> <tr><td>Google Drive: per-file (<code>drive.file</code>)</td><td>Create and organize the folders and files this app creates (contracts, invoices, flyers).</td><td>We cannot see any other file in your Drive.</td></tr> <tr><td>Google Calendar (<code>calendar.events</code>, <code>calendar.calendarlist.readonly</code>)</td><td>List your calendars, check for scheduling conflicts, and create, update or delete the one event we make for each booking.</td><td>We do not store your other calendar events.</td></tr> <tr><td>Basic profile</td><td>Sign you in and show which Google account is connected.</td><td></td></tr></tbody></table> <p><b>What we store.</b> We do not store the content of your emails: not subjects, bodies, recipients' replies or attachments. When you send an email we keep only a record that a message was sent (Gmail's message identifier, the time, the booking it relates to, and whether it had an attachment) so you can see your send history. Invoice PDFs and message text pass through our servers in memory only for the moment of sending.</p> <p><b>Tokens.</b> Your Google refresh token is stored encrypted (AES-256-GCM) on our servers and is never sent to your browser. Short-lived access tokens are created for each request and are not stored.</p> <p><b>Humans do not read your data.</b> Our staff do not view your Google data except with your affirmative agreement for a specific support request, where necessary for security or abuse investigation, or where required by law.</p></section> <section id=\"limited\"><h2>5. Google API Services User Data Policy: Limited Use</h2> <p>Set & Settled's use and transfer to any other app of information received from Google APIs will adhere to the <a class=\"underline\" href=\"https://developers.google.com/terms/api-services-user-data-policy\" target=\"_blank\" rel=\"noreferrer\">Google API Services User Data Policy</a>, including the Limited Use requirements.</p> <ul><li>We use Google user data only to provide and improve the user-facing features described in this policy.</li> <li>We do not transfer Google user data to others except as necessary to provide those features, to comply with applicable law, or as part of a merger, acquisition or sale of assets after notice to you.</li> <li>We do not use or transfer Google user data for serving advertisements, including retargeting, personalized or interest-based advertising.</li> <li>We do not allow humans to read Google user data except as described in section 4.</li> <li>We do not use Google user data to develop, improve or train generalized artificial-intelligence or machine-learning models.</li></ul></section> <section id=\"sharing\"><h2>6. Service providers</h2> <p>We do not sell or share your data for marketing. To run the Service we rely on infrastructure providers (database, hosting and error monitoring) that process data on our behalf under contract and confidentiality. We may disclose information if required by law or to protect rights and safety. [LEGAL REVIEW: list providers by name.]</p></section> <section id=\"security\"><h2>7. Security</h2> <p>We use encryption in transit and at rest, per-user data isolation (row-level security), least-privilege Google permissions, multi-factor authentication, access logging, and an independent annual review of our Google integration where required. No system is perfectly secure; we will notify affected users and regulators of a breach as required by law.</p></section> <section id=\"rights\"><h2>8. Your choices and rights</h2> <p>You can access, correct, export and delete your information in Settings or by contacting {{CONTACT_EMAIL}}. Depending on where you live (for example California, the EEA or the UK) you may have additional rights to know, port, restrict, object and appeal. We do not discriminate against you for exercising them and will respond within the time required by law. You can also revoke access at any time at <a class=\"underline\" href=\"https://myaccount.google.com/permissions\" target=\"_blank\" rel=\"noreferrer\">myaccount.google.com/permissions</a>.</p></section> <section id=\"retention\"><h2>9. Retention and deletion</h2> <p>We keep account data while your account is active. When you disconnect Google, we revoke the token with Google and delete our stored copy immediately. When you delete your account, we delete your data from active systems immediately and from encrypted backups within 30 days. We may keep minimal security and billing records for up to 12 months where required by law.</p></section> <section id=\"kids\"><h2>10. Children</h2><p>The Service is not directed to children under 16 and we do not knowingly collect their information.</p></section> <section id=\"changes\"><h2>11. Changes</h2><p>We will post updates here and notify you in the app or by email before material changes take effect.</p></section> <section id=\"contact\"><h2>12. Contact</h2><p>{{CONTACT_EMAIL}} · {{ADDRESS}}</p></section>", "terms": "<section id=\"agree\"><h2>1. Agreement</h2><p>By creating an account or using Set & Settled (the \"Service\") from {{COMPANY}}, you agree to these Terms and our Privacy Policy. You must be at least 18 and able to form a binding contract.</p></section> <section id=\"service\"><h2>2. The Service</h2><p>Set & Settled helps performing artists manage bookings, contacts, email templates, files, invoices and records. It is a productivity tool and is <b>not</b> legal, tax or accounting advice. You are responsible for the accuracy of your invoices, tax categories and filings. We are not a party to any agreement between you and a venue, promoter or other person.</p></section> <section id=\"account\"><h2>3. Your account</h2><p>Keep your credentials secure and enable multi-factor authentication. You are responsible for activity under your account and must tell us promptly about unauthorized use.</p></section> <section id=\"google\"><h2>4. Connecting Google and sending email</h2> <p>The Service connects to your Google account only with your permission, solely to provide the features you enable, as described in the Privacy Policy. When you use email features, <b>you</b> direct Set & Settled to send each message from your Gmail account; nothing is sent until you review the message and press \"Send now.\" You are the sender and are solely responsible for the content, recipients and lawfulness of every message, including compliance with anti-spam and marketing laws (such as CAN-SPAM and equivalents). Sent email cannot be recalled. We may limit daily sending volume to protect your account and ours. You may disconnect Google at any time. Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.</p></section> <section id=\"content\"><h2>5. Your content</h2><p>You own your content. You grant us a limited license to host, process and display it solely to operate the Service for you. You are responsible for having the right to enter the information you put in, including your contacts' details.</p></section> <section id=\"use\"><h2>6. Acceptable use</h2><p>You will not: break the law; infringe others' rights; send spam, bulk, deceptive or harassing email; use the Service to send unsolicited commercial email to purchased lists; probe, scan or attack the Service; bypass limits or security; reverse engineer the Service except as permitted by law; or build a competing product from it.</p></section> <section id=\"fees\"><h2>7. Fees</h2><p>[LEGAL REVIEW] Pricing, trials, billing cycle, taxes and refunds are described at {{DOMAIN}}/pricing and incorporated here. We may change prices on 30 days' notice.</p></section> <section id=\"third\"><h2>8. Third-party services</h2><p>The Service relies on third parties such as Google and our infrastructure providers. We are not responsible for their availability or changes, which may affect features.</p></section> <section id=\"ip\"><h2>9. Intellectual property</h2><p>The Service, its software, design and branding belong to {{COMPANY}} and its licensors. We grant you a limited, revocable, non-transferable license to use the Service under these Terms.</p></section> <section id=\"end\"><h2>10. Termination</h2><p>You can stop using the Service and delete your account at any time. We may suspend or terminate access for violations, non-payment, security risk or legal requirement. On termination we handle your data as described in the Privacy Policy.</p></section> <section id=\"disc\"><h2>11. Disclaimers</h2><p>The Service is provided \"as is\" and \"as available\" without warranties of any kind, including merchantability, fitness for a particular purpose and non-infringement. We do not guarantee uninterrupted operation or that email, calendar or file operations will always succeed or be delivered.</p></section> <section id=\"liab\"><h2>12. Limitation of liability</h2><p>To the maximum extent permitted by law, {{COMPANY}} is not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, bookings or data. Our total liability for any claim is limited to the greater of the amount you paid us in the prior 12 months or US$100. You will defend and indemnify us against claims arising from your content, your messages, or your violation of these Terms or the law.</p></section> <section id=\"law\"><h2>13. Governing law</h2><p>These Terms are governed by the laws of {{GOVERNING_STATE}}. [LEGAL REVIEW] Venue and any arbitration clause.</p></section> <section id=\"changes\"><h2>14. Changes</h2><p>We may update these Terms and will give notice of material changes. Continuing to use the Service after the effective date accepts them.</p></section> <section id=\"contact\"><h2>15. Contact</h2><p>{{CONTACT_EMAIL}} · {{ADDRESS}}</p></section>"};
function legalSheet(k){const t=k==="terms"?"Terms of Service":"Privacy Policy";
  sheet(`<div class="head"><div><span class="eyebrow">Set &amp; Settled</span><h3 style="margin-top:4px">${t}</h3></div></div><p class="note" style="margin:0">Draft for legal review. Placeholders in {{double braces}} get filled before launch.</p><div class="legal">${LEGAL_TXT[k==="terms"?"terms":"privacy"]}</div><div class="actions"><button class="btn" data-close>Close</button></div>`,root=>{root.querySelector("[data-close]").onclick=()=>{try{if(/^#\/(privacy-policy|terms-of-service)/.test(location.hash))history.replaceState(null,"",location.pathname+location.search)}catch(e){}close()}})}
document.addEventListener("click",e=>{const a=e.target.closest("[data-legal]");if(!a)return;e.preventDefault();legalSheet(a.dataset.legal)});
const legalHash=()=>{const h=location.hash;if(h.startsWith("#/privacy-policy"))legalSheet("privacy");else if(h.startsWith("#/terms-of-service"))legalSheet("terms")};
window.addEventListener("hashchange",legalHash);setTimeout(legalHash,0);
$("#payEdit").onclick=payForm;renderPay();
$("#quickAdd").onclick=()=>bookingForm();
$("#editProfile").onclick=profileForm;
render();

/* ---------- data ---------- */
(async()=>{
  db=await claude.use("db");
  if(!db){$("#offline").hidden=false;return}
  ["bookings","contacts","expenses","income","links","templates","blocks","kitFiles","sentLog"].forEach(col=>{
    db.collection(col).onSnapshot(s=>{S[col]=s.docs.map(d=>({id:d.id,...d.data()}));render();
      const open=$("#sheetRoot .sheet");if(!open)return;},err=>{$("#offline").hidden=false});
  });
  db.doc("settings/profile").onSnapshot(s=>{S.profile=s.exists?{...s.data()}:{};render()},()=>{});
  db.doc("settings/fincats").onSnapshot(s=>{S.fincats=s.exists?{...s.data()}:null;applyFinCats();render()},()=>{});
  db.doc("settings/pipeline").onSnapshot(s=>{S.pipeline=s.exists?{...s.data()}:null;applyStageNames();render()},()=>{});
  db.doc("settings/stageNames").onSnapshot(s=>{S.stageNames=s.exists?{...s.data()}:{};applyStageNames();render()},()=>{});
  db.doc("settings/stages").onSnapshot(s=>{S.stages=s.exists?{...s.data()}:null;render()},()=>{});
  db.doc("settings/drive").onSnapshot(s=>{S.drive=s.exists?{...s.data()}:{};renderDriveInfo()},()=>{});
  db.doc("settings/availability").onSnapshot(s=>{S.avail=s.exists?{...s.data()}:null;render()},()=>{});
  db.doc("settings/invoice").onSnapshot(s=>{S.invset=s.exists?{...s.data()}:{}},()=>{});
  db.doc("settings/look").onSnapshot(s=>{const k=s.exists&&s.data().palette;if(k&&k!==(document.documentElement.getAttribute("data-palette")||"sage")){applyPalette(k);try{localStorage.setItem("palette",k)}catch(e){}}},()=>{});
  db.doc("settings/payhandles").onSnapshot(s=>{S.payh=s.exists?{...s.data()}:{};renderPay()},()=>{});
  db.doc("settings/kit").onSnapshot(s=>{S.kit=s.exists?{...s.data()}:{};render()},()=>{});
  db.doc("settings/checklist").onSnapshot(s=>{const d=s.exists?s.data():null;S.checklist=d&&Array.isArray(d.items)?d.items:null;render()},()=>{});
  let gStarted=false;
  db.doc("settings/calendar").onSnapshot(s=>{const d=s.exists?s.data():{};G.writeTo=d.writeTo||"";G.writeName=d.writeName||"";renderWriteTo();const cl=Array.isArray(d.calendars)?d.calendars:[];
    G.calIds=cl.map(c=>c.id);G.calNames={};cl.forEach(c=>G.calNames[c.id]=c.name);
    if(G.mcp){gStarted=true;gSync()}},()=>{});
})();
(async()=>{G.mcp=await claude.use("mcp");if(!G.mcp){G.state="none";renderSync();return}
  setTimeout(()=>{if(G.state==="loading"&&!G.at)gSync()},1500)})();
