const {test}=require('node:test');
const assert=require('node:assert/strict');
const {FishingGame,species}=require('../game/engine.js');
function hooked(type=0){const g=new FishingGame(()=>.5);g.fish=[{...species[type],x:575,y:260,dir:1,speed:0}];g.action();for(let i=0;i<100&&g.state==='casting';i++)g.update(.02);assert.equal(g.state,'reeling');return g;}
test('aim is limited to 45 degrees on both sides and changes hook position',()=>{const g=new FishingGame();g.aim(100);assert.equal(g.angle,45);g.depth=200;assert.ok(g.hook().x>575);g.aim(-200);assert.equal(g.angle,-45);assert.ok(g.hook().x<575);});
test('every new cast can be aimed before release and keeps its selected trajectory',()=>{
  for(const state of ['ready','lost','landed','missed']){
    const g=new FishingGame();g.state=state;g.fish=[];
    g.aim(-30);assert.equal(g.angle,-30);
    g.action();g.aim(60);g.update(.5);
    assert.equal(g.state,'casting');assert.equal(g.angle,-30);
    assert.ok(Math.abs(g.hook().x-(575-Math.sin(Math.PI/6)*75))<1e-9);
  }
});
test('holding reels continuously and tension accelerates until the line snaps',()=>{
  const g=hooked();g.press();g.update(.5);const first=g.tension;
  g.update(.5);assert.ok(g.tension-first>first-14);assert.ok(g.progress>0);
  for(let i=0;i<100&&g.state==='reeling';i++)g.update(.05);
  assert.equal(g.state,'lost');assert.equal(g.tension,100);assert.match(g.message,/LINE SNAPPED/);assert.equal(g.score,0);assert.equal(g.reelHeld,false);
});
test('release cools tension without losing reel progress or the fish',()=>{
  const g=hooked();g.press();g.update(1);g.release();const progress=g.progress,heat=g.tension;
  g.update(.25);assert.ok(g.tension<heat);assert.equal(g.progress,progress);g.update(5);
  assert.equal(g.tension,0);assert.equal(g.state,'reeling');assert.equal(g.holdTime,0);
});
test('rapid taps without enough cooling still snap the line before awarding a catch',()=>{
  for(let type=0;type<4;type++){const g=hooked(type);for(let i=0;i<30&&g.state==='reeling';i++){g.press();g.release();g.update(.01);}assert.equal(g.state,'lost');assert.equal(g.score,0);assert.equal(g.caught,0);}
});
test('tap and hold tension builds at half the original rate for every species',()=>{
  for(let type=0;type<4;type++){const g=hooked(type),heat=12+species[type].rate;g.press();assert.equal(g.tension,heat/2);g.update(.5);assert.equal(g.tension,(heat+heat*.5+9*.25)/2);}
});
test('hooked fish struggles smoothly on both sides and stays attached to the hook',()=>{
  const g=hooked();let left=false,right=false,previous=g.hook().x;
  for(let i=0;i<150;i++){g.update(.02);const h=g.hook();assert.equal(g.target.x,h.x);assert.equal(g.target.y,h.y);assert.ok(Math.abs(h.x-575)<=36);assert.ok(Math.abs(h.x-previous)<6);left ||= h.x<575;right ||= h.x>575;previous=h.x;}
  assert.ok(left&&right);assert.equal(g.progress,0);assert.equal(g.tension,0);
  g.depth=0;assert.equal(g.hook().x,575);
  g.reset();assert.equal(g.hook().x,575);
});
test('paced taps can land every fish and award points once',()=>{
  for(let type=0;type<4;type++){const g=hooked(type);for(let i=0;i<100&&g.state==='reeling';i++){g.press();g.release();g.update(.6);}assert.equal(g.state,'landed');assert.equal(g.score,species[type].points);assert.equal(g.caught,1);g.action();assert.equal(g.score,species[type].points);assert.equal(g.tension,0);}
});
test('short holds with cooling breaks can land every fish',()=>{
  for(let type=0;type<4;type++){const g=hooked(type);for(let i=0;i<80&&g.state==='reeling';i++){g.press();for(let j=0;j<10&&g.state==='reeling';j++)g.update(.05);g.release();g.update(1);}assert.equal(g.state,'landed');assert.equal(g.caught,1);}
});
test('repeated press events do not add taps while held; larger fish build more tension',()=>{
  const small=hooked(0),large=hooked(3);for(const g of [small,large]){g.press();const p=g.progress,t=g.tension;g.press();assert.equal(g.progress,p);assert.equal(g.tension,t);g.update(.5);}assert.ok(large.tension>small.tension);assert.ok(large.progress<small.progress);
});
test('empty cast retrieves hook and allows another cast',()=>{const g=new FishingGame();g.fish=[];g.action();for(let i=0;i<600;i++)g.update(.02);assert.equal(g.state,'missed');assert.equal(g.depth,0);g.action();assert.equal(g.state,'casting');});
test('host serves game entry points and assets but not arbitrary game files',async t=>{const {createServer}=require('../server.cjs');const s=createServer({fishService:async()=>({status:200,data:{}})});await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));const base=`http://127.0.0.1:${s.address().port}`;for(const path of ['/game','/game/','/game/index.html','/game/game.css','/game/game.js','/game/engine.js','/game/audio.js'])assert.equal((await fetch(base+path)).status,200,path);assert.equal((await fetch(base+'/game/private.json')).status,404);});
