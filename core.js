(function(root){
'use strict';
const organs=[
  ['oral','口腔',3,'咀嚼與初步消化澱粉'],
  ['esoph','食道',8,'肌肉蠕動推送食物'],
  ['stomach','胃',14,'胃酸殺菌與初步消化蛋白質'],
  ['si','小腸',34,'消化與吸收的主要場所'],
  ['li','大腸',51,'吸收剩餘水分、形成糞便'],
  ['anus','肛門與排遺',54,'未消化殘渣形成糞便排出體外']
];
const events={
 2:{title:'牙齒與舌頭',text:'咀嚼增加食物表面積，舌頭協助混合唾液。前進 1 格。',bonus:10,step:1},
 6:{title:'食道蠕動',text:'管壁肌肉收縮推進食物，滑到第 8 格。',bonus:10,target:8},
 17:{title:'膽汁助攻',text:'膽汁乳化脂質，增加與脂酶接觸的表面積。',bonus:15,extra:true},
 23:{title:'小腸吸收站',text:'絨毛與微絨毛增加吸收表面積。',bonus:20},
 27:{title:'醣類消化',text:'澱粉經消化形成可吸收的單醣，例如葡萄糖。',bonus:20},
 28:{title:'蛋白質消化',text:'蛋白質分解後形成可吸收的胺基酸等小分子。',bonus:20},
 29:{title:'脂質消化',text:'脂質經乳化及酵素分解後，其消化產物可被小腸吸收。',bonus:20},
 40:{title:'大腸慢行站',text:'大腸繼續吸收水分，使殘渣逐漸成形。',bonus:0,pause:true},
 43:{title:'腸內共生菌',text:'部分腸內細菌可製造維生素 K 及部分 B 群維生素。',bonus:15},
 52:{title:'回收剩餘水分',text:'大腸吸收殘渣中剩餘的水分。',bonus:10},
 54:{title:'準備排遺',text:'未吸收的殘渣形成糞便，經直腸與肛門排出。',bonus:10}
};
const clone=x=>JSON.parse(JSON.stringify(x));
const organAt=pos=>organs.find(o=>pos<=o[2])||organs[5];
function validateBank(bank){return Array.isArray(bank)&&bank.length>=5&&organs.every(o=>bank.some(q=>q.organ===o[0]))&&new Set(bank.map(q=>q.id)).size===bank.length&&bank.every(q=>q&&typeof q.id==='string'&&organs.some(o=>o[0]===q.organ)&&typeof q.q==='string'&&typeof q.exp==='string'&&Array.isArray(q.opts)&&q.opts.length>=2&&q.opts.every(x=>typeof x==='string')&&Number.isInteger(q.ans)&&q.ans>=0&&q.ans<q.opts.length);}
function shuffle(a,rng=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function create(config,bank){
 if(!validateBank(bank))throw Error('題庫格式不完整');
 const mode=config.mode==='team'?'team':'single';
 const names=config.names.map(n=>String(n).trim().slice(0,32)||'冒險者');
 if((mode==='single'&&names.length!==1)||(mode==='team'&&(names.length<2||names.length>4)))throw Error('玩家人數不正確');
 return {version:2,config:{mode,rule:config.rule==='race'?'race':'rounds',rounds:[8,12,16].includes(+config.rounds)?+config.rounds:8,seconds:[0,20,40].includes(+config.seconds)?+config.seconds:0,pace:config.pace==='quick'?'quick':'full'},bank:clone(bank),globalAnswered:{},players:names.map((name,id)=>({id,name,pos:1,learning:0,bonus:0,correct:0,total:0,fails:0,turns:0,skip:false,finished:false,used:[],records:[],checks:[],review:[],mastery:{}})),current:0,round:1,turn:0,phase:'ready',queue:[],question:null,event:null,extra:false,lastDice:[],lastMessage:'準備出發',paused:false,createdAt:new Date().toISOString(),completedAt:null,finishRound:null};
}
function choose(s,p,organ){
 const globalUnused=s.bank.filter(q=>q.organ===organ&&!s.players.some(pl=>pl.used.includes(q.id)));
 let pool=globalUnused.length?globalUnused:s.bank.filter(q=>q.organ===organ&&!p.used.includes(q.id));
 if(!pool.length){p.used=p.used.filter(id=>!s.bank.some(q=>q.id===id&&q.organ===organ));pool=s.bank.filter(q=>q.organ===organ);}
 if(s.config.mode==='single'&&p.fails>=2){const easy=pool.filter(q=>q.diff==='易');if(easy.length)pool=easy;}
 const q=pool[Math.floor(Math.random()*pool.length)];p.used.push(q.id);return q;
}
function activate(s){
 if(s.queue.length){const task=s.queue.shift(),p=s.players[s.current];const q=task.id?s.bank.find(q=>q.id===task.id):choose(s,p,task.organ);s.question={id:q.id,kind:task.kind,order:shuffle(q.opts.map((_,i)=>i)),attempt:0,remaining:s.config.seconds,choice:null,correct:false};s.phase='question';}
 else if(s.extra){s.phase='ready';s.lastMessage='膽汁助攻：同隊再擲一次（只移動，不增加答題次數）';}
 else endTurn(s);
}
function roll(s,dice=Math.floor(Math.random()*4)+1){
 if(s.phase!=='ready'||s.paused)return false;
 if(!Number.isInteger(dice)||dice<1||dice>4)throw Error('骰子需為 1–4');
 const p=s.players[s.current];s.lastDice=[dice];
 if(s.extra){p.pos=Math.min(55,p.pos+dice);s.extra=false;s.lastMessage=`加擲 ${dice} 點，前進至 ${p.pos} 格`;endTurn(s);return true;}
 s.turn++;s.event=null;s.queue=[];
 const skipped=p.skip;p.skip=false;
 const steps=s.config.mode==='single'&&s.config.pace==='quick'?dice*2:dice;
 if(!skipped&&!p.finished)p.pos=Math.min(55,p.pos+steps);
 s.lastMessage=skipped?'慢行回合：本次不移動，仍可回答一題。':p.finished?'已抵達，完成本輪學習題。':`擲出 ${dice} 點${steps!==dice?'，短程前進 '+steps+' 格':''} → 第 ${Math.min(p.pos,55)} 格`;
 const spec=!skipped&&!p.finished&&p.pos<55?events[p.pos]:null;
 if(spec){s.event=clone(spec);p.bonus+=spec.bonus;if(spec.step)p.pos=Math.min(55,p.pos+spec.step);if(spec.target)p.pos=spec.target;
  if(spec.extra){if(s.config.mode==='single'){p.pos=Math.min(55,p.pos+2);s.event.text+=' 個人獎勵：前進 2 格。';}else{s.extra=true;s.event.text+=' 完成此題後，同隊加擲一次，只移動、不連鎖觸發事件。';}}
  if(spec.pause){if(s.config.mode==='team'){p.skip=true;s.event.text+=' 下回合停留原地，但保留一次答題機會。';}else{s.event.text+=' 個人觀察任務：複習水分吸收，不扣分、不等待。';}}
 }
 if(s.config.mode==='single'){
  for(const [id,,end]of organs){if(p.pos>=end&&!p.checks.includes(id)){s.queue.push({kind:'checkpoint',organ:id});}}
  if(!s.queue.length)s.queue.push({kind:'normal',organ:organAt(p.pos)[0]});
  const review=p.review.find(r=>r.due<=s.turn);if(review)s.queue.push({kind:'review',id:review.id});
 }else s.queue.push({kind:'normal',organ:organAt(p.pos)[0]});
 if(s.event)s.phase='event';else activate(s);return true;
}
function answer(s,choice){
 if(s.phase!=='question'||s.paused)return false;
 const p=s.players[s.current],a=s.question,q=s.bank.find(q=>q.id===a.id);
 if(!Number.isInteger(choice)||choice< -1||choice>=q.opts.length)return false;
 a.choice=choice;a.correct=choice===q.ans;
 if(a.attempt===0&&a.kind!=='review'){
  p.total++;
  if(a.correct){
   p.correct++;
   s.globalAnswered??={};
   const times=s.globalAnswered[q.id]||0;
   const earned=s.config.mode==='single'?20:(times===0?20:times===1?15:times===2?10:5);
   s.globalAnswered[q.id]=times+1;
   p.learning+=earned;
   a.earned=earned;
   a.solveTimes=times+1;
   p.fails=0;
  }else p.fails++;
  p.records.push({id:q.id,organ:q.organ,choice,correct:a.correct,turn:s.turn});
  const m=p.mastery[q.organ]??={total:0,correct:0,corrected:0};m.total++;if(a.correct)m.correct++;
 }
 if(a.correct){
  if(a.attempt>0||a.kind==='review'){(p.mastery[q.organ]??={total:0,correct:0,corrected:0}).corrected++;p.fails=0;}
  p.review=p.review.filter(r=>r.id!==q.id);
 }else if(!p.review.some(r=>r.id===q.id))p.review.push({id:q.id,due:s.turn+2});
 if(a.kind==='checkpoint'&&!p.checks.includes(q.organ))p.checks.push(q.organ);
 s.phase='feedback';return true;
}
function proceed(s){
 if(s.paused)return false;
 if(s.phase==='event'){activate(s);return true;}
 if(s.phase!=='feedback')return false;
 const a=s.question;
 if(s.config.mode==='single'&&!a.correct&&a.attempt===0){a.attempt=1;a.remaining=s.config.seconds;s.phase='question';return true;}
 activate(s);return true;
}
function endTurn(s){
 if(s.reviewOnly){s.reviewOnly=false;s.phase='ended';return;}
 const p=s.players[s.current];p.turns++;
 if(p.pos>=55&&!p.finished){p.finished=true;p.bonus+=50;if(!s.finishRound)s.finishRound=s.round;}
 if(s.config.mode==='single'&&p.finished){s.phase='ended';s.completedAt=new Date().toISOString();return;}
 s.current=(s.current+1)%s.players.length;
 if(s.current===0){if(s.config.mode==='team'&&((s.config.rule==='rounds'&&s.round>=s.config.rounds)||(s.config.rule==='race'&&s.finishRound))){s.phase='ended';s.completedAt=new Date().toISOString();return;}s.round++;}
 s.phase='ready';s.question=null;s.event=null;
}
function reviewSession(s,playerId){const p=s.players[playerId];if(!p||!p.review.length)return false;s.current=playerId;s.reviewOnly=true;s.queue=p.review.map(r=>({kind:'review',id:r.id}));s.extra=false;s.phase='ready';activate(s);return true;}
function restore(raw){const s=JSON.parse(raw);if(s.version!==2||!validateBank(s.bank)||!s.config||!['single','team'].includes(s.config.mode)||!Array.isArray(s.players)||s.players.length<1||s.players.length>4||!Number.isInteger(s.current)||s.current<0||s.current>=s.players.length||!['ready','question','feedback','event','ended'].includes(s.phase)||!Array.isArray(s.queue)||!s.players.every(p=>typeof p.name==='string'&&Number.isInteger(p.pos)&&p.pos>=1&&p.pos<=55&&Array.isArray(p.review)&&Array.isArray(p.records)&&Array.isArray(p.used)&&Array.isArray(p.checks)&&p.mastery&&Number.isFinite(p.total)&&Number.isFinite(p.learning))||(s.question&&!s.bank.some(q=>q.id===s.question.id))||(['question','feedback'].includes(s.phase)&&!s.question))throw Error('存檔不相容或已損壞');s.paused=false;return s;}
const api={organs,events,organAt,validateBank,shuffle,create,roll,answer,proceed,restore,reviewSession};if(typeof module!=='undefined')module.exports=api;root.DigestiveCore=api;
})(typeof window!=='undefined'?window:globalThis);
