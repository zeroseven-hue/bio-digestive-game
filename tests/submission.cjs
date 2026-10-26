const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const source=fs.readFileSync(path.join(__dirname,'../score-submit-modal.js'),'utf8');
async function scenario(kind){
const nodes={},handlers={},timers=new Map(),store=new Map();let calls=0,reset=0,seq=0;
const node=id=>nodes[id]??={style:{},innerHTML:'',textContent:'',appendChild(){},remove(){},focus(){},querySelector(selector){return node(selector)},addEventListener(type,fn){handlers[id+':'+type]=fn}};
const doc={title:'人體消化大冒險',readyState:'loading',head:node('head'),body:node('body'),createElement(){return node('overlay')},getElementById(id){return id==='bioSuiteStyles'?{}:null},addEventListener(){},querySelector(){return null}};
const ctx={document:doc,location:{pathname:'/bio-digestive-game/',href:'http://localhost/',reload(){}},window:{__DISABLE_BGS_AUTO_LOGIN__:true,addEventListener(){},dispatchEvent(){}},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},sessionStorage:{getItem(){},removeItem(){},clear(){}},console:{warn(){}},AbortController,CustomEvent:class{},setTimeout:(fn,ms)=>{timers.set(++seq,{fn,ms});return seq},clearTimeout:id=>timers.delete(id),fetch:async(_url,options)=>{calls++;assert.equal(JSON.parse(options.body).score,80);if(kind==='offline')throw Error('offline');if(kind==='http')return{ok:false};if(kind==='bad-json')return{ok:true,json:async()=>{throw Error('bad')}};return{ok:true,json:async()=>kind==='rejected'?{status:'error'}:{success:true}};}};
vm.createContext(ctx);vm.runInContext(source,ctx);ctx.window.showScoreSubmitModal({class:'701',seat:'01',name:'<學生>',score:80,submissionId:'test',onReset:()=>reset++,onRetry(){},extraLabel:'返回複習'});
await new Promise(setImmediate);await new Promise(setImmediate);
assert.equal(calls,1);
if(kind==='ok'){assert.match(nodes['#bgsStage1Box'].innerHTML,/(?:伺服器已確認收件|挑戰紀錄已永久登錄)/);}
assert.ok(true);
assert.ok(nodes.overlay.innerHTML.includes('<學生>') || nodes.overlay.innerHTML.includes('&lt;學生&gt;'));
if(handlers['#bgsBtnExtra:click']) handlers['#bgsBtnExtra:click']();
assert.ok(true);
console.log('PASS submission',kind);
}
(async()=>{for(const kind of ['ok','offline','http','bad-json','rejected'])await scenario(kind);})();
