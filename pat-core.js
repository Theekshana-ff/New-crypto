// File: pat-core.js
(function(root){
const NAMES=['Ascending Triangle','Descending Triangle','Symmetrical Triangle','Double Top','Double Bottom','Triple Top','Triple Bottom','Head and Shoulders','Inverse Head and Shoulders','Rising Wedge','Falling Wedge','Bull Flag','Bear Flag','Bull Pennant','Bear Pennant','Cup and Handle','Inverted Cup and Handle','Rectangle Pattern','Rounding Bottom','Rounding Top','Diamond Top','Diamond Bottom','Broadening Formation','Ascending Channel','Descending Channel','Horizontal Channel','Bullish Channel','Bearish Channel','Megaphone Pattern','Bullish Megaphone','Bearish Megaphone','Quasimodo Pattern','1-2-3 Reversal Pattern','ABCD Pattern','Gartley Pattern','Bat Pattern','Butterfly Pattern','Crab Pattern','Deep Crab Pattern','Shark Pattern','Cypher Pattern','Three Drives Pattern','Wolfe Wave','Elliott Wave Pattern','Harmonic AB=CD','Bullish 5-0 Pattern','Bearish 5-0 Pattern','Bullish Butterfly','Bearish Butterfly','Bullish Gartley','Bearish Gartley','Bullish Bat','Bearish Bat','Bullish Crab','Bearish Crab','Bullish Cypher','Bearish Cypher','Bullish Shark','Bearish Shark','Bullish Wolfe Wave','Bearish Wolfe Wave','Three Peaks Pattern','Three Valleys Pattern','Island Reversal','Pipe Top','Pipe Bottom','V-Shaped Reversal','Inverted V-Shaped Reversal','Bump and Run Reversal','Dead Cat Bounce'];
const zigzag=A=>{const z=[];for(const p of A.piv){const l=z[z.length-1];if(l&&l.t===p.t){if(p.t==='H'?p.p>l.p:p.p<l.p)z[z.length-1]=p}else z.push(p)}return z};
function fit(pts){const n=pts.length;let sx=0,sy=0,sxx=0,sxy=0;pts.forEach(q=>{sx+=q.i;sy+=q.p;sxx+=q.i*q.i;sxy+=q.i*q.p});
 const d=n*sxx-sx*sx,m=d?(n*sxy-sx*sy)/d:0,b=(sy-m*sx)/n;return{m,b,res:Math.max(...pts.map(q=>Math.abs(q.p-(m*q.i+b))))}}
function quad(y){const m=y.length;let S=[0,0,0,0,0],T=[0,0,0];for(let k=0;k<m;k++){const t=k/(m-1);let p=1;for(let j=0;j<5;j++){S[j]+=p;if(j<3)T[j]+=p*y[k];p*=t}}
 const M=[[S[0],S[1],S[2],T[0]],[S[1],S[2],S[3],T[1]],[S[2],S[3],S[4],T[2]]];
 for(let i=0;i<3;i++){let mx=i;for(let r=i+1;r<3;r++)if(Math.abs(M[r][i])>Math.abs(M[mx][i]))mx=r;[M[i],M[mx]]=[M[mx],M[i]];if(!M[i][i])return null;
  for(let r=0;r<3;r++)if(r!==i){const f=M[r][i]/M[i][i];for(let k=i;k<4;k++)M[r][k]-=f*M[i][k]}}
 const c0=M[0][3]/M[0][0],c1=M[1][3]/M[1][1],c2=M[2][3]/M[2][2],f=t=>c0+c1*t+c2*t*t,mean=y.reduce((a,b)=>a+b)/m;
 let ssr=0,sst=0;for(let k=0;k<m;k++){ssr+=(y[k]-f(k/(m-1)))**2;sst+=(y[k]-mean)**2}return{a:c2,b:c1,f,r2:sst?1-ssr/sst:0}}
const COL={bull:'#2ecc9a',bear:'#ff5d6c',neutral:'#f0b429'};
const inr=(v,r)=>v>=r[0]&&v<=r[1];

function detect(c,A){
 if(!Array.isArray(c)||c.length<30||!A||!A.piv)return[];
 const z=zigzag(A),n=c.length-1,atr=A.atr,last=c[n].close,tol=atr*0.6,out=[];
 const add=o=>{
  o.names=o.names||[o.name];o.name=o.names[0];o.col=COL[o.bias];
  // Map sub-families ('rnd','rev','har','wav') to 'adv' so toolbar filter buttons display all 70 patterns properly
  if(['rnd','rev','har','wav'].includes(o.fam)){o.subFam=o.fam;o.fam='adv'}
  o.id=o.name+'_'+o.start;o.end=o.end??n;
  if(o.brk===undefined)o.brk=!['har','wav'].includes(o.subFam)&&o.name!=='Quasimodo Pattern';
  if(o.dir&&o.entry!=null){
   const risk=Math.abs(o.entry-o.sl)||atr;
   o.tps=(o.ks||[0.5,1,1.618]).map(k=>{const p=o.entry+o.dir*o.H*k;return{p,rr:Math.abs(p-o.entry)/risk}});
  }else o.dir=0;
  out.push(o);
 };
 const first=(len,fn)=>{for(let k=z.length-1;k>=len-1;k--){const r=fn(z.slice(k-len+1,k+1));if(r)return r}return null};
 const sig=(pt,top)=>{const lo=Math.max(0,pt.i-40),w=c.slice(lo,pt.i+1);return top?pt.p>=Math.max(...w.map(x=>x.high))-0.5*atr:pt.p<=Math.min(...w.map(x=>x.low))+0.5*atr};
 const poly=p=>p.map(x=>({i:x.i,p:x.p}));

 // 1. Double / Triple Tops & Bottoms
 for(const top of[true,false]){const T=top?'H':'L',dir=top?-1:1,bias=top?'bear':'bull';
  for(const cnt of[3,2]){const f=first(2*cnt-1,p=>{if(p[0].t!==T||n-p[p.length-1].i>50)return;const ext=p.filter((_,j)=>j%2===0),mid=p.filter((_,j)=>j%2===1),avg=ext.reduce((a,x)=>a+x.p,0)/cnt;
    const neck=mid.reduce((a,x)=>a+x.p,0)/mid.length,H=Math.abs(avg-neck);if(H<4*atr||!ext.every(e=>Math.abs(e.p-avg)<=Math.max(0.12*H,0.25*atr))||!mid.every(m=>Math.abs(m.p-neck)<=Math.max(0.2*H,0.3*atr)))return;
    if(ext[cnt-1].i-ext[0].i<8*(cnt-1)||!sig(ext[0],top))return;
    const ex=top?Math.max(...ext.map(x=>x.p)):Math.min(...ext.map(x=>x.p));if(top?last>ex+tol:last<ex-tol)return;
    return{p,neck,H,ex,brk:top?last<neck:last>neck}});
   if(!f)continue;const nm=(cnt===3?'Triple ':'Double ')+(top?'Top':'Bottom');
   add({name:nm,names:cnt===3?[nm,top?'Three Peaks Pattern':'Three Valleys Pattern']:[nm],fam:'dbl',bias,status:f.brk?'breakout':'forming',dir,brk:true,entry:f.neck,sl:f.ex+(top?1:-1)*atr*0.5,H:f.H,start:f.p[0].i,
    lines:[{pts:poly(f.p),role:'main'},{pts:[{i:f.p[1].i,p:f.neck},{i:n,p:f.neck}],role:'neck'}],mid:{i:f.p[0].i,text:nm},level:f.neck})}}

 // 2. Head and Shoulders
 for(const top of[true,false]){const T=top?'H':'L',dir=top?-1:1,bias=top?'bear':'bull';
  const f=first(5,p=>{const[ls,n1,hd,n2,rs]=p;if(ls.t!==T||n-rs.i>60)return;const s=top?1:-1;
   if(!(s*(hd.p-ls.p)>1.5*atr&&s*(hd.p-rs.p)>1.5*atr))return;const m=(n2.p-n1.p)/(n2.i-n1.i),nl=i=>n1.p+m*(i-n1.i),Hh=Math.abs(hd.p-nl(hd.i));
   if(Hh<4*atr||!sig(hd,top)||Math.abs(ls.p-rs.p)>0.3*Hh||Math.abs(ls.p-nl(ls.i))<0.2*Hh||Math.abs(rs.p-nl(rs.i))<0.2*Hh)return;
   if(top?last>hd.p:last<hd.p)return;return{p,nl,Hh,brk:top?last<nl(n):last>nl(n)}});
  if(f){const nm=top?'Head and Shoulders':'Inverse Head and Shoulders',[ls,n1,hd,n2,rs]=f.p;
   add({name:nm,fam:'hs',bias,status:f.brk?'breakout':'forming',dir,brk:true,entry:f.nl(n),sl:rs.p+(top?1:-1)*atr*0.5,H:f.Hh,start:ls.i,
    lines:[{pts:poly(f.p),role:'main'},{pts:[{i:n1.i,p:n1.p},{i:n,p:f.nl(n)}],role:'neck'}],mid:{i:hd.i,text:nm},level:f.nl(n)})}}

 // 3. Triangles, Wedges (fam:'wdg'), Channels, Megaphone, Rectangle
 const win=z.filter(p=>p.i>=n-120),best=ps=>{let f=fit(ps),u=ps;if(f.res>tol&&ps.length===3){u=ps.slice(1);f=fit(u)}return{pts:u,f}};
 const Hs=win.filter(p=>p.t==='H').slice(-3),Ls=win.filter(p=>p.t==='L').slice(-3);
 if(Hs.length>=2&&Ls.length>=2){const u=best(Hs),l=best(Ls),fu=u.f,fl=l.f,start=Math.min(u.pts[0].i,l.pts[0].i);
  if(fu.res<=tol&&fl.res<=tol&&n-start>=15&&n-start<=150&&n-u.pts[u.pts.length-1].i<=40&&n-l.pts[l.pts.length-1].i<=40){
   const uS=fu.m*start+fu.b,lS=fl.m*start+fl.b,uE=fu.m*n+fu.b,lE=fl.m*n+fl.b,h0=uS-lS,h1=uE-lE;
   if(h0>3*atr&&h1>0){const th=0.2*h0,cls=x=>x>th?1:x<-th?-1:0,U=cls(uE-uS),Lc=cls(lE-lS),conv=h1<h0*0.8,par=Math.abs(h1-h0)<0.2*h0,exp=h1>h0*1.25;
    let names=null,bias='neutral',fam='tri',up=last>uE,dn=last<lE;
    if(conv){
     if(U===0&&Lc===1){names=['Ascending Triangle'];bias='bull';fam='tri'}
     else if(U===-1&&Lc===0){names=['Descending Triangle'];bias='bear';fam='tri'}
     else if(U===-1&&Lc===1){names=['Symmetrical Triangle'];fam='tri'}
     else if(U===1&&Lc===1){names=['Rising Wedge'];bias='bear';fam='wdg'}
     else if(U===-1&&Lc===-1){names=['Falling Wedge'];bias='bull';fam='wdg'}
    }
    else if(par){fam='chn';if(U===1&&Lc===1){names=['Ascending Channel','Bullish Channel'];bias='bull'}else if(U===-1&&Lc===-1){names=['Descending Channel','Bearish Channel'];bias='bear'}else if(U===0&&Lc===0)names=['Rectangle Pattern','Horizontal Channel'];
     if(names&&up&&!names.includes('Bullish Channel'))names.push('Bullish Channel');if(names&&dn&&!names.includes('Bearish Channel'))names.push('Bearish Channel')}
    else if(exp&&U===1&&Lc===-1){fam='chn';names=['Broadening Formation','Megaphone Pattern'];if(up)names.push('Bullish Megaphone');if(dn)names.push('Bearish Megaphone')}
    if(names){let dir=0;if(fam==='tri'||fam==='wdg')dir=bias==='bull'?1:bias==='bear'?-1:(up?1:dn?-1:A.trend);if(names[0]==='Rectangle Pattern')dir=up?1:dn?-1:0;
     const o={names,fam,bias,status:up?'breakout ↑':dn?'breakdown ↓':'forming',dir,brk:true,start,H:h0,lines:[{pts:[{i:start,p:uS},{i:n,p:uE}],role:'main'},{pts:[{i:start,p:lS},{i:n,p:lE}],role:'main'}],mid:{i:Math.round((start+n)/2),text:names[0]},level:uE};
     if(dir){o.entry=dir>0?uE:lE;o.sl=dir>0?lE-atr*0.5:uE+atr*0.5}add(o)}}}}

 // 4. Flags & Pennants
 for(let m=6;m<=25;m++){const s=n-m;if(s<16)break;const cons=c.slice(s,n+1),hi=Math.max(...cons.map(x=>x.high)),lo=Math.min(...cons.map(x=>x.low)),pw=c.slice(s-15,s+1),drift=last-c[s].close;let f=null;
  const pl=Math.min(...pw.map(x=>x.low)),ph=Math.max(...pw.map(x=>x.high)),pil=s-15+pw.findIndex(x=>x.low===pl),pih=s-15+pw.findIndex(x=>x.high===ph);
  if(pih>pil&&ph-pl>=6*atr&&s-pih<=3&&hi<=ph+tol*0.5&&lo>=ph-(ph-pl)*0.5&&hi-lo<=0.6*(ph-pl)&&drift<=tol)f={d:1,a:{i:pil,p:pl},b:{i:pih,p:ph},P:ph-pl};
  else if(pil>pih&&ph-pl>=6*atr&&s-pil<=3&&lo>=pl-tol*0.5&&hi<=pl+(ph-pl)*0.5&&hi-lo<=0.6*(ph-pl)&&drift>=-tol)f={d:-1,a:{i:pih,p:ph},b:{i:pil,p:pl},P:ph-pl};
  if(f){const bull=f.d>0,brk=bull?last>hi:last<lo,t3=Math.max(2,Math.floor(cons.length/3)),r1=Math.max(...cons.slice(0,t3).map(x=>x.high))-Math.min(...cons.slice(0,t3).map(x=>x.low)),r2=Math.max(...cons.slice(-t3).map(x=>x.high))-Math.min(...cons.slice(-t3).map(x=>x.low)),pen=r2<r1*0.6;
   const nm=(bull?'Bull ':'Bear ')+(pen?'Pennant':'Flag');
   add({name:nm,fam:'flg',bias:bull?'bull':'bear',status:brk?(bull?'breakout ↑':'breakdown ↓'):'forming',dir:f.d,brk:true,entry:bull?hi:lo,sl:bull?lo-atr*0.5:hi+atr*0.5,H:f.P,start:f.a.i,
    lines:[{pts:[f.a,f.b],role:'aux'},{pts:[{i:s,p:hi},{i:n,p:hi}],role:'main'},{pts:[{i:s,p:lo},{i:n,p:lo}],role:'main'}],mid:{i:s+Math.floor(m/2),text:nm},level:bull?hi:lo});break}}

 // 5. Rounding Bottom / Top and Cup & Handle
 const curve=(s,e,q)=>{const pts=[];for(let k=0;k<=12;k++){const i=Math.round(s+(e-s)*k/12);pts.push({i,p:q.f(k/12)})}return pts};
 for(const bot of[true,false]){let done=false;
  for(const W of[30,40,50,60,70,80,90,100,120,150]){if(done||n-W<0)continue;const y=c.slice(n-W,n+1).map(x=>x.close),q=quad(y);if(!q||(bot?q.a<=0:q.a>=0)||q.r2<0.75)continue;
   const tv=-q.b/(2*q.a);if(tv<0.3||tv>0.7)continue;const rim=(y[0]+y[W])/2,vp=q.f(tv),depth=Math.abs(rim-vp);if(depth<4*atr||Math.abs(y[0]-y[W])>0.65*depth)continue;
   const lvl=bot?Math.max(...c.slice(n-W,n-W+4).map(x=>x.high)):Math.min(...c.slice(n-W,n-W+4).map(x=>x.low)),ext=bot?Math.min(...c.slice(n-W,n+1).map(x=>x.low)):Math.max(...c.slice(n-W,n+1).map(x=>x.high)),nm=bot?'Rounding Bottom':'Rounding Top';
   add({name:nm,fam:'rnd',bias:bot?'bull':'bear',status:(bot?last>lvl:last<lvl)?'breakout':'forming',dir:bot?1:-1,brk:true,entry:lvl,sl:ext+(bot?-1:1)*atr*0.5,H:depth,start:n-W,lines:[{pts:curve(n-W,n,q),role:'main'},{pts:[{i:n-W,p:lvl},{i:n,p:lvl}],role:'neck'}],mid:{i:n-Math.round(W*0.5),text:nm},level:lvl});done=true}}
 for(const bot of[true,false]){let done=false;
  for(const h of[4,8,12,16]){for(const W of[40,60,90]){if(done||n-h-W<0)continue;const e=n-h,s=e-W,y=c.slice(s,e+1).map(x=>x.close),q=quad(y);if(!q||(bot?q.a<=0:q.a>=0)||q.r2<0.75)continue;
   const tv=-q.b/(2*q.a);if(tv<0.3||tv>0.7)continue;const rim0=(y[0]+y[W])/2,depth=Math.abs(rim0-q.f(tv));if(depth<4*atr||Math.abs(y[0]-y[W])>0.3*depth)continue;
   const rim=bot?Math.max(...c.slice(e-4,e+1).map(x=>x.high)):Math.min(...c.slice(e-4,e+1).map(x=>x.low)),hp=c.slice(e,n+1),hx=bot?Math.min(...hp.map(x=>x.low)):Math.max(...hp.map(x=>x.high)),pull=Math.abs(rim-hx);
   if(pull>0.5*depth||pull<0.1*depth||(bot?last<hx:last>hx))continue;const hi=hp.findIndex(x=>(bot?x.low:x.high)===hx)+e,nm=bot?'Cup and Handle':'Inverted Cup and Handle';
   add({name:nm,fam:'rnd',bias:bot?'bull':'bear',status:(bot?last>rim:last<rim)?'breakout':'forming',dir:bot?1:-1,brk:true,entry:rim,sl:hx+(bot?-1:1)*atr*0.5,H:depth,start:s,lines:[{pts:curve(s,e,q),role:'main'},{pts:[{i:e,p:rim},{i:hi,p:hx},{i:n,p:last}],role:'main'},{pts:[{i:s,p:rim},{i:n,p:rim}],role:'neck'}],mid:{i:s+Math.round(W/2),text:nm},level:rim});done=true}}}

 // 6. Diamond Top / Bottom
 {const w=z.filter(p=>p.i>=n-130);if(w.length>=7&&n-w[w.length-1].i<=30){const mid=Math.floor(w.length/2),a=w.slice(0,mid+1),b=w.slice(mid),sl=(arr,t)=>{const x=arr.filter(p=>p.t===t);return x.length>=2?fit(x):null};
   const au=sl(a,'H'),al=sl(a,'L'),bu=sl(b,'H'),bl=sl(b,'L');
   if(au&&al&&bu&&bl&&au.m>0&&al.m<0&&bu.m<0&&bl.m>0&&Math.max(au.res,al.res,bu.res,bl.res)<=tol*1.3){const start=w[0].i,top=c[start].close<c[w[mid].i].close,nm=top?'Diamond Top':'Diamond Bottom',hi=Math.max(...w.map(p=>p.p)),lo=Math.min(...w.map(p=>p.p));
    add({name:nm,fam:'adv',bias:top?'bear':'bull',status:'forming',dir:top?-1:1,brk:true,entry:top?lo:hi,sl:top?hi+atr*0.5:lo-atr*0.5,H:hi-lo,start,lines:[{pts:poly(w),role:'main'}],mid:{i:w[mid].i,text:nm},level:top?lo:hi})}}}

 // 7. Quasimodo & 1-2-3 Reversal
 for(const bear of[true,false]){const s=bear?1:-1;
  const q=first(5,p=>{const[p0,p1,p2,p3,p4]=p;if(p0.t!==(bear?'L':'H')||n-p4.i>50)return;if(!(s*(p3.p-p1.p)>=atr&&s*(p2.p-p4.p)>=atr&&s*(p1.p-p4.p)>0)||Math.abs(p3.p-p4.p)<4*atr||n-p4.i>30||Math.abs(last-p1.p)>5*atr)return;if(bear?last>p3.p:last<p3.p)return;return p});
  if(q){const nm='Quasimodo Pattern',en=q[1].p;add({names:[nm],fam:'rev',bias:bear?'bear':'bull',status:Math.abs(last-en)<=atr*0.6?'at zone':'forming',dir:bear?-1:1,brk:false,entry:en,sl:q[3].p+s*atr*0.5,H:Math.abs(en-q[4].p),start:q[0].i,lines:[{pts:poly(q),role:'main'},{pts:[{i:q[1].i,p:en},{i:n,p:en}],role:'neck'}],mid:{i:q[2].i,text:'QM '+(bear?'(bear)':'(bull)')},level:en})}
  const t=first(3,p=>{const[a,b,d]=p;if(a.t!==(bear?'H':'L')||n-d.i>40)return;const leg=Math.abs(b.p-a.p),ret=Math.abs(b.p-d.p)/(leg||1);
   if(leg<4*atr||!sig(a,bear)||!(bear?d.p<a.p&&d.p>b.p:d.p>a.p&&d.p<b.p)||ret<0.3||ret>0.9)return;let bi=-1;for(let j=d.i+1;j<=n;j++)if(bear?c[j].close<b.p:c[j].close>b.p){bi=j;break}if(bi<0?Math.abs(last-b.p)>1.5*atr:n-bi>15)return;return p});
  if(t){const[a,b,d]=t,brk=bear?last<b.p:last>b.p;add({names:['1-2-3 Reversal Pattern'],fam:'rev',bias:bear?'bear':'bull',status:brk?'breakout':'forming',dir:bear?-1:1,brk:true,entry:b.p,sl:d.p+s*atr*0.5,H:Math.abs(b.p-a.p),start:a.i,lines:[{pts:poly(t),role:'main'},{pts:[{i:b.i,p:b.p},{i:n,p:b.p}],role:'neck'}],mid:{i:b.i,text:'1-2-3'},level:b.p})}}

 // 8. ABCD and Harmonic AB=CD
 {const f=first(4,p=>{const[a,b,cc,d]=p;if(n-d.i>25)return;const bull=d.t==='L';
   if(bull?!(a.p>b.p&&cc.p>b.p&&cc.p<a.p&&d.p<b.p):!(a.p<b.p&&cc.p<b.p&&cc.p>a.p&&d.p>b.p))return;
   const ab=Math.abs(b.p-a.p),bc=Math.abs(cc.p-b.p),cd=Math.abs(d.p-cc.p);if(ab<4*atr)return;
   if(inr(bc/ab,[0.5,0.886])&&inr(cd/ab,[0.9,1.15]))return{p,ab,bc,cd,bull}});
  if(f){const[a,b,cc,d]=f.p,bull=f.bull,names=['ABCD Pattern'];if((inr(f.bc/f.ab,[0.58,0.65])||inr(f.bc/f.ab,[0.76,0.81]))&&inr(f.cd/f.ab,[0.9,1.1]))names.push('Harmonic AB=CD');
   add({names,fam:'har',bias:bull?'bull':'bear',status:'at D',dir:bull?1:-1,brk:false,entry:d.p,sl:d.p+(bull?-1:1)*atr*0.6,H:f.cd,ks:[0.382,0.618,1],start:a.i,lines:[{pts:poly(f.p),role:'main'}],mid:{i:cc.i,text:'ABCD'},level:d.p})}}

 // 9. Harmonic XABCD (with proper directional & swing structure validation)
 const SP=[['Deep Crab',r=>inr(r.B,[.84,.93])&&inr(r.dA,[1.55,1.7])],['Crab',r=>inr(r.B,[.35,.65])&&inr(r.dA,[1.55,1.7])],['Butterfly',r=>inr(r.B,[.72,.84])&&inr(r.dA,[1.2,1.65])],
  ['Bat',r=>inr(r.B,[.35,.52])&&inr(r.dA,[.83,.94])&&inr(r.BC,[.382,.886])],['Gartley',r=>inr(r.B,[.55,.68])&&inr(r.dA,[.72,.85])&&inr(r.BC,[.382,.886])],
  ['Cypher',r=>inr(r.B,[.35,.65])&&inr(r.xc,[1.2,1.45])&&inr(r.dx,[.74,.83])],['Shark',r=>inr(r.B,[.38,.65])&&inr(r.BC,[1.1,1.65])&&inr(r.dx,[.85,1.15])],
  ['5-0',r=>inr(r.B,[1.1,1.65])&&inr(r.BC,[1.55,2.3])&&inr(r.CD,[.45,.55])]];
 {const f=first(5,p=>{const[x,a,b,cc,d]=p;if(n-d.i>35)return;
   const bull=d.t==='L';
   // Verify valid X-A-B-C-D directional geometry
   if(bull?!(x.p<a.p&&b.p<a.p&&cc.p>b.p&&d.p<cc.p):!(x.p>a.p&&b.p>a.p&&cc.p<b.p&&d.p>cc.p))return;
   const xa=Math.abs(a.p-x.p),ab=Math.abs(b.p-a.p),bc=Math.abs(cc.p-b.p),cd=Math.abs(d.p-cc.p);if(xa<4*atr||!ab||!bc)return;
   const r={B:ab/xa,BC:bc/ab,CD:cd/bc,dA:Math.abs(d.p-a.p)/xa,xc:Math.abs(cc.p-x.p)/xa,dx:cd/Math.abs(cc.p-x.p)},sp=SP.find(s=>s[1](r));if(!sp)return;
   if(bull?last<d.p-atr*1.5:last>d.p+atr*1.5)return;return{p,sp:sp[0],bull,cd}});
  if(f){const[x,a,b,cc,d]=f.p,pre=f.bull?'Bullish ':'Bearish ',base=f.sp==='5-0'?'5-0 Pattern':f.sp==='Deep Crab'?'Deep Crab Pattern':f.sp+' Pattern',names=f.sp==='Deep Crab'?[base]:[base,pre+(f.sp==='5-0'?'5-0 Pattern':f.sp)];
   if(f.sp==='Crab')names.push(pre+'Crab');
   add({names:[...new Set(names)],fam:'har',bias:f.bull?'bull':'bear',status:'at D',dir:f.bull?1:-1,brk:false,entry:d.p,sl:d.p+(f.bull?-1:1)*atr*0.6,H:f.cd,ks:[0.382,0.618,1],start:x.i,lines:[{pts:poly(f.p),role:'main'}],mid:{i:b.i,text:pre+f.sp},level:d.p})}}

 // 10. Three Drives
 for(const bear of[true,false]){const s=bear?1:-1;
  const f=first(6,p=>{const[o,h1,l1,h2,l2,h3]=p;if(o.t!==(bear?'L':'H')||n-h3.i>50)return;const d1=s*(h1.p-o.p),d2=s*(h2.p-l1.p),d3=s*(h3.p-l2.p),c1=s*(h1.p-l1.p)/d1,c2=s*(h2.p-l2.p)/d2;
   if(d1<4*atr||!(s*h2.p>s*h1.p&&s*h3.p>s*h2.p)||!inr(d2/d1,[1,1.8])||!inr(d3/d2,[1,1.8])||!inr(c1,[0.4,0.85])||!inr(c2,[0.4,0.85]))return;return p});
  if(f)add({names:['Three Drives Pattern'],fam:'wav',bias:bear?'bear':'bull',status:'at 3rd drive',dir:bear?-1:1,brk:false,entry:f[5].p,sl:f[5].p+s*atr*0.6,H:Math.abs(f[5].p-f[4].p),ks:[0.382,0.618,1],start:f[0].i,lines:[{pts:poly(f),role:'main'}],mid:{i:f[3].i,text:'3 Drives'},level:f[5].p})}

 // 11. Wolfe Wave
 for(const bull of[true,false]){const s=bull?1:-1;
  const f=first(5,p=>{const[p1,p2,p3,p4,p5]=p;if(p1.t!==(bull?'L':'H')||n-p5.i>40)return;
   if(!(s*p3.p<s*p1.p&&s*p4.p<s*p2.p&&s*p5.p<s*p3.p&&s*p4.p>s*p3.p))return;
   const l13=i=>p1.p+(p3.p-p1.p)*(i-p1.i)/(p3.i-p1.i),l24=i=>p2.p+(p4.p-p2.p)*(i-p2.i)/(p4.i-p2.i);
   if(!(Math.abs(l24(p4.i)-l13(p4.i))<0.7*Math.abs(l24(p2.i)-l13(p2.i)))||Math.abs(p2.p-p1.p)<4*atr||n-p5.i>25)return;if(s*p5.p>s*l13(p5.i)-0.2*atr)return;
   const l14=i=>p1.p+(p4.p-p1.p)*(i-p1.i)/(p4.i-p1.i);return{p,tgt:l14(n)}});
  if(f&&(bull?f.tgt>f.p[4].p:f.tgt<f.p[4].p)){const p5=f.p[4],nm=(bull?'Bullish':'Bearish')+' Wolfe Wave';
   add({names:['Wolfe Wave',nm],fam:'wav',bias:bull?'bull':'bear',status:'at point 5',dir:bull?1:-1,brk:false,entry:p5.p,sl:p5.p-s*atr*0.6,H:Math.abs(f.tgt-p5.p),start:f.p[0].i,lines:[{pts:poly(f.p),role:'main'},{pts:[{i:f.p[0].i,p:f.p[0].p},{i:n,p:f.tgt}],role:'aux'}],mid:{i:f.p[2].i,text:nm},level:f.tgt})}}

 // 12. Elliott 5-Wave Impulse
 for(const bull of[true,false]){const s=bull?1:-1;
  const f=first(6,p=>{const[o,w1,w2,w3,w4,w5]=p;if(o.t!==(bull?'L':'H')||n-w5.i>50)return;const L1=s*(w1.p-o.p),L3=s*(w3.p-w2.p),L5=s*(w5.p-w4.p);
   if(L1<4*atr||!(s*w2.p>s*o.p)||!(s*w3.p>s*w1.p)||!(s*w4.p>s*w1.p)||!(s*w5.p>s*w3.p)||L3<Math.min(L1,L5))return;return p});
  if(f)add({names:['Elliott Wave Pattern'],fam:'wav',bias:'neutral',status:'5 waves done',start:f[0].i,lines:[{pts:poly(f),role:'main'}],mid:{i:f[3].i,text:'Elliott 1-5 '+(bull?'↑':'↓')},level:f[5].p})}

 // 13. V Reversals & Dead Cat Bounce
 for(const bull of[true,false]){
  const f=first(3,p=>{const[a,b,d]=p;if(a.t!==(bull?'H':'L')||n-d.i>40)return;const l1=Math.abs(a.p-b.p),l2=Math.abs(d.p-b.p);if(l1<6*atr||b.i-a.i>15||d.i-b.i>15||l2<0.7*l1)return;return p});
  if(f)add({names:[bull?'V-Shaped Reversal':'Inverted V-Shaped Reversal'],fam:'rev',bias:bull?'bull':'bear',status:'completed',start:f[0].i,lines:[{pts:poly(f),role:'main'}],mid:{i:f[1].i,text:bull?'V':'Λ'},level:f[1].p})}
 {const f=first(3,p=>{const[a,b,d]=p;if(a.t!=='H'||n-d.i>40)return;const drop=a.p-b.p,bn=d.p-b.p;if(drop<6*atr||b.i-a.i>25||bn<0.1*drop||bn>0.5*drop||last>d.p+tol)return;return p});
  if(f){const[a,b,d]=f,drop=a.p-b.p;add({names:['Dead Cat Bounce'],fam:'rev',bias:'bear',status:last<b.p?'breakdown ↓':'bouncing',dir:-1,brk:true,entry:b.p,sl:d.p+atr*0.5,H:drop,start:a.i,lines:[{pts:poly(f),role:'main'},{pts:[{i:b.i,p:b.p},{i:n,p:b.p}],role:'neck'}],mid:{i:d.i,text:'Dead Cat Bounce'},level:b.p})}}

 // 14. Pipe Top / Bottom
 for(let i=Math.max(6,n-40);i<n;i++){const a=c[i],b=c[i+1];
  if(a.close>a.open&&b.close<b.open&&a.high-a.low>=2.5*atr&&b.high-b.low>=2.5*atr&&Math.abs(a.high-b.high)<=0.4*atr&&Math.max(a.high,b.high)>=Math.max(...c.slice(i-5,i).map(x=>x.high))){add({names:['Pipe Top'],fam:'rev',bias:'bear',status:'completed',start:i,lines:[{pts:[{i,p:a.high},{i:i+1,p:b.high}],role:'main'}],mid:{i,text:'Pipe Top'},level:Math.min(a.low,b.low)});break}}
 for(let i=Math.max(6,n-40);i<n;i++){const a=c[i],b=c[i+1];
  if(a.close<a.open&&b.close>b.open&&a.high-a.low>=2.5*atr&&b.high-b.low>=2.5*atr&&Math.abs(a.low-b.low)<=0.4*atr&&Math.min(a.low,b.low)<=Math.min(...c.slice(i-5,i).map(x=>x.low))){add({names:['Pipe Bottom'],fam:'rev',bias:'bull',status:'completed',start:i,lines:[{pts:[{i,p:a.low},{i:i+1,p:b.low}],role:'main'}],mid:{i,text:'Pipe Bottom'},level:Math.max(a.high,b.high)});break}}

 // 15. Island Reversal
 {const up=(A.fvg||[]).filter(f=>f.d===1),dn=(A.fvg||[]).filter(f=>f.d===-1);
  for(const[g1,g2,bias]of[[up,dn,'bear'],[dn,up,'bull']]){let hit=null;for(const a of g1)for(const b of g2)if(b.i>a.i&&b.i-a.i<=12&&n-b.i<=30){const isl=c.slice(a.i+1,b.i);
    if(isl.length>=2&&isl.length<=8&&(a.top-a.bot)>=atr*0.8&&(b.top-b.bot)>=atr*0.8&&Math.abs(a.top-b.top)<=atr*0.8&&Math.abs(a.bot-b.bot)<=atr*0.8&&(bias==='bear'?Math.min(...isl.map(x=>x.low))>Math.max(a.bot,b.bot):Math.max(...isl.map(x=>x.high))<Math.min(a.top,b.top)))hit=[a,b]}
   if(hit)add({names:['Island Reversal'],fam:'rev',bias,status:'completed',start:hit[0].i,lines:[{pts:[{i:hit[0].i,p:(hit[0].top+hit[0].bot)/2},{i:hit[1].i,p:(hit[1].top+hit[1].bot)/2}],role:'aux'}],mid:{i:hit[0].i,text:'Island'},level:hit[1].bot})}}

 // 16. Bump and Run Reversal
 for(const top of[true,false]){const T=top?'H':'L',O=top?'L':'H',s=top?1:-1;
  const f=first(5,p=>{const[a,x,b,pk,e]=p;if(a.t!==O||pk.t!==T||n-pk.i>40)return;const m=(b.p-a.p)/(b.i-a.i);if(!(s*m>0))return;const ln=i=>a.p+m*(i-a.i),bump=s*(pk.p-ln(pk.i));
   if(bump<3*atr||s*(x.p-ln(x.i))>bump*0.5||!(top?last<ln(n):last>ln(n)))return;return{p,ln,bump}});
  if(f)add({names:['Bump and Run Reversal'],fam:'rev',bias:top?'bear':'bull',status:top?'breakdown ↓':'breakout ↑',dir:top?-1:1,brk:true,entry:f.ln(n),sl:f.p[3].p+s*atr*0.5,H:f.bump,start:f.p[0].i,lines:[{pts:[{i:f.p[0].i,p:f.ln(f.p[0].i)},{i:n,p:f.ln(n)}],role:'neck'},{pts:poly(f.p),role:'main'}],mid:{i:f.p[3].i,text:'Bump & Run'},level:f.ln(n)})}

 out.sort((a,b)=>b.end-a.end||b.start-a.start);return out.slice(0,40);
}
root.PAT={detect,COL,NAMES};if(typeof module!=='undefined')module.exports=root.PAT;
})(typeof window!=='undefined'?window:globalThis);
