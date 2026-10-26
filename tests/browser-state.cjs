const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),path=require('path');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'game.js'),'utf8'),C=require('../core.js'),bank=require('../questions.json');
async function run(label,fetchImpl,storageThrows=false){
 const els={};function element(){return {hidden:false,style:{},value:'2',textContent:'',innerHTML:'',querySelectorAll(){return[]},focus(){},setAttribute(){},classList:{toggle(){},contains(){return false}}};}
 const ctx={window:{DigestiveCore:C,DIGESTIVE_QUESTIONS:bank,addEventListener(){}},document:{getElementById:id=>els[id]??=element(),querySelectorAll(){return[]},addEventListener(){},documentElement:{classList:{}}},location:{protocol:'http:'},localStorage:{getItem(){if(storageThrows)throw Error('blocked');return null},setItem(){if(storageThrows)throw Error('quota');}},performance:{now(){return 0}},AbortController,setTimeout,clearTimeout,setInterval(){},console,fetch:fetchImpl};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 await vm.runInContext('refreshBank()',ctx);
 assert.equal(vm.runInContext('bank.length',ctx),60);
 if(storageThrows){vm.runInContext("state=C.create({mode:'single',names:['測試']},bank);save();",ctx);assert.match(els['save-warning'].textContent,/無法自動儲存/);}
 console.log('PASS',label,els['bank-status'].textContent);
}
(async()=>{
await run('HTTP 失敗',async()=>({ok:false}));
await run('無效 JSON 結構',async()=>({ok:true,json:async()=>[]}));
await run('JSON 解析失敗',async()=>({ok:true,json:async()=>{throw Error('bad json')}}));
await run('離線與儲存不可用',async()=>{throw Error('offline')},true);
await run('逾時回退',(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')))));
await run('成功載入完整題庫',async()=>({ok:true,json:async()=>bank}));
})();
