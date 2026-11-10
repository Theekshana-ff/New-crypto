// Evaluation harness: false alarms on random walks, recall on planted patterns, and setup sanity. Run: node tests/eval.js
const SMC=require('../smc-core.js'),FIB=require('../fib-core.js'),PAT=require('../pat-core.js');
let seed=12345;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647,gauss=()=>Math.sqrt(-2*Math.log(rnd()+1e-12))*Math.cos(2*Math.PI*rnd());
function noise(n,vol=0.004,p0=100,drift=0){const c=[];let p=p0;for(let i=0;i<n;i++){const o=p;p=o*Math.exp(drift+vol*gauss());c.push({time:i,open:o,close:p,high:Math.max(o,p)*(1+Math.abs(gauss())*vol*0.4),low:Math.min(o,p)*(1-Math.abs(gauss())*vol*0.4),vol:100+rnd()*50})}return c}
// planted: price path (bar, price%) with candle noise, preceded by random walk and followed by a tail
function planted(path,vol=0.003,pre=200,post=0){const c=noise(pre,0.004);let p=c[c.length-1].close;const base=p;let prev=p;
 for(let k=0;k+1<path.length;k++){const[a,pa]=path[k],[b,pb]=path[k+1];for(let i=a;i<b;i++){const v=base*(pa+(pb-pa)*(i-a+1)/(b-a))/100,o=prev,cl=v*Math.exp(vol*gauss());
  c.push({time:c.length,open:o,close:cl,high:Math.max(o,cl)*(1+Math.abs(gauss())*vol*0.4),low:Math.min(o,cl)*(1-Math.abs(gauss())*vol*0.4),vol:100+rnd()*50});prev=cl}}
 return c}
const P={ // percent-of-base paths, ~ 6-10% pattern heights
 'Double Top':[[0,100],[15,108],[30,102],[45,108],[60,101],[66,99]],
 'Double Bottom':[[0,100],[15,92],[30,98],[45,92],[60,99],[66,101]],
 'Triple Top':[[0,100],[12,108],[24,102],[36,108],[48,102],[60,108],[72,101],[78,99]],
 'Head and Shoulders':[[0,100],[14,106],[28,101],[44,112],[60,101],[74,106],[88,100],[94,98]],
 'Inverse Head and Shoulders':[[0,100],[14,94],[28,99],[44,88],[60,99],[74,94],[88,100],[94,102]],
 'Ascending Triangle':[[0,100],[12,108],[24,102],[36,108],[48,105],[60,108],[70,106.5],[76,107.8]],
 'Descending Triangle':[[0,108],[12,100],[24,106],[36,100],[48,103],[60,100],[70,101.5],[76,100.2]],
 'Symmetrical Triangle':[[0,100],[12,110],[24,102],[36,108],[48,104],[60,106.5],[70,105],[76,105.8]],
 'Rising Wedge':[[0,100],[12,108],[24,104],[36,111],[48,108],[60,113],[70,111.5],[76,112.5]],
 'Falling Wedge':[[0,113],[12,106],[24,110],[36,103],[48,107],[60,101],[70,104],[76,102.5]],
 'Bull Flag':[[0,100],[10,100.5],[22,116],[28,113],[34,114.5],[40,111.5],[46,113]],
 'Bear Flag':[[0,100],[10,99.5],[22,84],[28,87],[34,85.5],[40,88.5],[46,87]],
 'Rounding Bottom':Array.from({length:81},(_,i)=>[i,100+0.0085*(i-40)**2*(1)]),
 '1-2-3 Reversal Pattern':[[0,110],[20,100],[36,106],[48,102],[64,108]],
 'Bullish Gartley':[[0,100],[16,120],[32,107.64],[44,113.82],[58,104.28],[66,108]],
 'ABCD Pattern':[[0,100],[14,112],[26,105],[40,117],[52,111]],
 'Three Drives Pattern':[[0,100],[10,108],[18,103],[30,112],[38,106],[52,117],[58,114]]};
const run=(c,L=6)=>{const A=SMC.analyze(c,L),out=new Set(),n=c.length;PAT.detect(c,A).forEach(p=>p.names.forEach(x=>out.add(x)));const T=SMC.setup(c,A);const F=FIB.fib(c,A,FIB.DEF);return{names:out,T,F,A,n}};
module.exports={noise,planted,P,run};
if(require.main===module){
const N=+process.env.N||150;let tot=0,any=0,byName={},smcSetups=0,fibSetups=0,smcEv=0,obCount=0;
for(let k=0;k<N;k++){const r=run(noise(500));tot+=r.names.size;if(r.names.size)any++;r.names.forEach(x=>byName[x]=(byName[x]||0)+1);if(r.T&&!r.T.none)smcSetups++;if(r.F)fibSetups++;smcEv+=r.A.ev.length;obCount+=r.A.obs.filter(o=>!o.mit).length}
console.log(`NOISE (${N} random walks x500): patterns/chart ${(tot/N).toFixed(2)}, charts with >=1 pattern ${(any/N*100).toFixed(0)}%, SMC events/chart ${(smcEv/N).toFixed(1)}, open OB/chart ${(obCount/N).toFixed(1)}, SMC setup ${(smcSetups/N*100).toFixed(0)}%, fib leg ${(fibSetups/N*100).toFixed(0)}%`);
console.log('  most frequent false alarms:',Object.entries(byName).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>k+' '+(v/N*100).toFixed(0)+'%').join(', '));
let hit=0,total=0;const M=+process.env.M||30,res=[];
for(const[name,path]of Object.entries(P)){let h=0;for(let k=0;k<M;k++){const r=run(planted(path));if(r.names.has(name)||(name==='Bullish Gartley'&&r.names.has('Gartley Pattern')))h++}res.push(`${name} ${(h/M*100).toFixed(0)}%`);hit+=h;total+=M}
console.log(`PLANTED recall ${(hit/total*100).toFixed(0)}% :`,res.join(' | '));

}
