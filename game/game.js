(() => {
  'use strict';
  const $=id=>document.getElementById(id), canvas=$('lake'),ctx=canvas.getContext('2d'),game=new FishingGame();
  let paused=false,last=0,time=0;const held=new Set();
  function pause(value=!paused){paused=value;held.clear();$('pause').textContent=paused?'Resume':'Pause';sync();}
  function action(){if(!paused){game.action();sync();}}
  function sync(){
    $('score').textContent=game.score;$('caught').textContent=game.caught;
    $('phase').textContent=paused?'PAUSED':game.state==='reeling'?'FISH ON!':game.state==='casting'?'HOOK IN THE WATER':game.state==='returning'?'RETRIEVING':'READY TO CAST';
    $('angle').textContent=`AIM ${Math.abs(Math.round(game.angle))}° ${game.angle<0?'LEFT':game.angle>0?'RIGHT':''}`;
    $('message').textContent=paused?'Taking a fishing break.':game.message;
    $('hint').textContent=paused?'Press P or Resume when you’re ready.':game.state==='reeling'?`Tap ${game.target.rate} times per second. Keep the line strong!`:'← → / A D to aim · Space to cast or tap to reel · P to pause';
    $('strength').value=game.strength;
    $('progress').textContent=game.state==='reeling'?`${Math.round(game.progress*100)}% reeled in${game.elapsed<3?` · ${Math.ceil(3-game.elapsed)}s to get ready`:''}`:'Hook a fish to start reeling';
    const actionLabel=game.state==='reeling'?'Reel! Tap! <kbd>SPACE</kbd>':'Cast line <kbd>SPACE</kbd>';
    if($('action').innerHTML!==actionLabel)$('action').innerHTML=actionLabel;
    $('action').disabled=paused||['casting','returning'].includes(game.state);
  }
  function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
  function path(points,color,stroke=false,width=2){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));if(stroke){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}else{ctx.closePath();ctx.fillStyle=color;ctx.fill();}}
  function fish(f){ctx.save();ctx.translate(f.x,f.y);ctx.scale(f.dir,1);const s=f.size;path([[-s*.7,0],[-s*1.4,-s*.5],[-s*1.3,s*.5]],f.color);ellipse(0,0,s,s*.43,f.color);path([[-s*.3,-s*.3],[0,-s*.72],[s*.38,-s*.32]],f.color);ellipse(4,s*.15,s*.68,s*.15,'#ffffff35');for(let i=0;i<4;i++)ellipse(-s*.5+i*s*.25,-s*.12,2,2,'#123f4355');ellipse(s*.65,-s*.1,4,4,'#fff9df');ellipse(s*.69,-s*.1,2,2,'#163c46');path([[s*.22,0],[-s*.1,s*.3],[s*.34,s*.2]],'#164c4533');ctx.restore();}
  function draw(){
    const water=ctx.createLinearGradient(0,100,0,640);water.addColorStop(0,'#4fb9b6');water.addColorStop(.35,'#237c91');water.addColorStop(1,'#092f4c');ctx.fillStyle=water;ctx.fillRect(0,0,1100,640);
    ctx.fillStyle='#c9e9d8';ctx.fillRect(0,0,1100,116);
    ellipse(915,42,27,27,'#fff1bc');path([[0,86],[100,32],[170,78],[280,29],[400,102],[520,68],[650,110],[760,51],[880,94],[1010,48],[1100,89],[1100,116],[0,116]],'#92bcb0');
    path([[0,102],[180,79],[300,105],[470,80],[670,110],[820,86],[1100,101],[1100,122],[0,122]],'#699f94');
    for(let i=0;i<7;i++){const x=80+i*170;path([[x,122],[x+100,640],[x+220,640],[x+35,122]],'#e0fff009');}
    for(let i=0;i<23;i++){const x=(i*139+time*10)%1150-25,y=130+(i%3)*12;path([[x,y],[x+34,y]],'#d4f5de66',true);}
    for(let i=0;i<14;i++){const x=i*87;path([[x,640],[x-8,600],[x+Math.sin(time+i)*12,565]],'#39877d',true,5);path([[x+8,640],[x+25,597],[x+18,582]],'#27675f',true,4);}
    for(let i=0;i<18;i++)ellipse((i*137)%1100,630-(time*13+i*43)%470,2+(i%3),2+(i%3),'#c0fff12a');
    game.fish.forEach(fish);
    // Fisherman, wooden boat, and rod at the surface.
    const bob=Math.sin(time*2)*2;ctx.save();ctx.translate(0,bob);
    ellipse(525,155,94,9,'#082f4630');path([[435,125],[610,125],[586,153],[463,153]],'#9f603d');path([[435,124],[610,124]],'#f0c88b',true,7);path([[480,142],[578,142]],'#75462d',true,3);
    path([[517,118],[533,118],[545,128]],'#1c4653',true,10);path([[516,86],[517,114]],'#e9ad48',true,20);ellipse(517,72,12,14,'#efbf93');ellipse(515,60,16,7,'#254f45');path([[495,66],[539,66]],'#254f45',true,5);path([[521,92],[539,103],[551,92]],'#efbf93',true,7);path([[548,99],[562,60],[575,57],[575,139]],'#263f48',true,3);ctx.restore();
    const h=game.hook();if(['casting','reeling','returning'].includes(game.state)){path([[575,58+bob],[575,139],[h.x,h.y]],'#f4f5dccc',true,1.5);ctx.beginPath();ctx.arc(h.x+5,h.y,6,0,Math.PI);ctx.lineTo(h.x-1,h.y-9);ctx.strokeStyle='#fff3cc';ctx.lineWidth=3;ctx.stroke();}else{
      ctx.setLineDash([5,9]);path([[575,143],[575+Math.sin(game.angle*Math.PI/180)*135,143+Math.cos(game.angle*Math.PI/180)*135]],'#fff4bc88',true);ctx.setLineDash([]);
    }
    ctx.fillStyle='#e2f5ec99';ctx.font='11px system-ui';ctx.fillText('THE LITTLE LAKE',25,35);ctx.fillText('DEEP WATER',25,607);
    if(paused||['lost','landed'].includes(game.state)){ctx.fillStyle='#062e4566';ctx.fillRect(0,0,1100,640);ctx.fillStyle='#fff6d8';ctx.textAlign='center';ctx.font='bold 30px system-ui';ctx.fillText(paused?'PAUSED':game.state==='lost'?'YOU LOST THE FISH TRY AGAIN!':'NICE CATCH!',550,300);ctx.font='18px system-ui';ctx.fillText(paused?'Press P or Resume to return to the lake':'Press Space or Cast line for another cast',550,335);ctx.textAlign='left';}
  }
  document.addEventListener('keydown',e=>{if(e.target.closest('a,button,input,textarea,select')&&e.code!=='KeyP')return;if(['Space','ArrowLeft','ArrowRight','KeyA','KeyD','KeyP'].includes(e.code)){e.preventDefault();if(e.repeat)return;if(e.code==='Space')action();else if(e.code==='KeyP')pause();else held.add(e.code);}});
  document.addEventListener('keyup',e=>held.delete(e.code));
  $('action').addEventListener('click',()=>{action();canvas.focus({preventScroll:true});});
  $('pause').addEventListener('click',()=>pause());$('reset').addEventListener('click',()=>{game.reset();pause(false);canvas.focus({preventScroll:true});});
  for(const [id,key] of [['left','ArrowLeft'],['right','ArrowRight']]){const button=$(id);button.addEventListener('pointerdown',e=>{e.preventDefault();if(!paused){held.add(key);button.setPointerCapture(e.pointerId);}});for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>held.delete(key));button.addEventListener('click',e=>{if(e.detail===0&&!paused)game.aim(id==='left'?-2:2);});}
  window.addEventListener('blur',()=>pause(true));document.addEventListener('visibilitychange',()=>{if(document.hidden)pause(true);});
  function frame(now){const dt=Math.min((now-last)/1000||0,.04);last=now;if(!paused){time+=dt;game.aim(((held.has('ArrowRight')||held.has('KeyD')?1:0)-(held.has('ArrowLeft')||held.has('KeyA')?1:0))*35*dt);game.update(dt);}sync();draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
})();
