(function(root){
  'use strict';
  const species=[{name:'Bluegill',size:22,color:'#f5ba53',rate:2,points:50},{name:'Rainbow trout',size:34,color:'#e3949e',rate:3,points:100},{name:'Largemouth bass',size:46,color:'#94bb65',rate:4,points:175},{name:'Northern pike',size:62,color:'#69b7ad',rate:5,points:275}];
  class FishingGame {
    constructor(random=Math.random){this.random=random;this.reset();}
    reset(){this.state='ready';this.angle=0;this.depth=0;this.score=0;this.caught=0;this.tension=0;this.reelHeld=false;this.holdTime=0;this.target=null;this.elapsed=0;this.progress=0;this.message='Your next catch is down there.';this.fish=Array.from({length:16},(_,i)=>this.spawn(i));}
    spawn(i){const type=species[i%4];return {...type,x:70+this.random()*960,y:230+(i%4)*85+this.random()*45,dir:this.random()>.5?1:-1,speed:25+this.random()*35,seed:this.random()*6};}
    aim(delta){if(['ready','lost','landed','missed'].includes(this.state))this.angle=Math.max(-45,Math.min(45,this.angle+delta));}
    hook(){const sway=this.state==='reeling'&&this.elapsed>0?(this.struggleOffset||0)*Math.min(1,this.depth/80):0;return {x:575+Math.sin(this.angle*Math.PI/180)*this.depth+sway,y:139+Math.cos(this.angle*Math.PI/180)*this.depth};}
    struggle(dt){
      // Smoothly alternate sides, choosing a new distance and duration each time.
      this.struggleTime+=dt;
      while(this.struggleTime>=this.struggleDuration){
        this.struggleTime-=this.struggleDuration;this.struggleFrom=this.struggleTo;
        this.struggleSide=-this.struggleSide;this.struggleTo=this.struggleSide*(12+this.random()*24);
        this.struggleDuration=.25+this.random()*.4;
      }
      const t=this.struggleTime/this.struggleDuration,ease=t*t*(3-2*t);
      this.struggleOffset=this.struggleFrom+(this.struggleTo-this.struggleFrom)*ease;
    }
    release(){this.reelHeld=false;this.holdTime=0;}
    press(){if(this.reelHeld)return;this.action();if(this.state==='reeling')this.reelHeld=true;}
    pull(amount,heat){
      this.tension=Math.min(100,this.tension+heat*.5);
      if(this.tension>=100){this.state='lost';this.message='LINE SNAPPED! You lost the fish. Try again!';this.target.y=Math.max(230,this.target.y);this.target=null;this.depth=0;this.release();return;}
      this.progress=Math.min(1,this.progress+amount);
      if(this.progress>=1){this.score+=this.target.points;this.caught++;this.state='landed';this.message=this.target.name+' aboard! +'+this.target.points+' points';this.fish[this.fish.indexOf(this.target)]=this.spawn(species.findIndex(s=>s.name===this.target.name));this.target=null;this.depth=0;this.release();}
    }
    action(){if(['ready','lost','landed','missed'].includes(this.state)){this.state='casting';this.depth=0;this.target=null;this.tension=0;this.release();this.message='Hook released. Watch for a bite!';}else if(this.state==='reeling'){this.pull(1/(this.target.rate*8),12+this.target.rate);}}
    update(dt){for(const f of this.fish){if(f===this.target)continue;f.x+=f.dir*f.speed*dt;if(f.x>1180)f.x=-80;if(f.x< -80)f.x=1180;}
      if(this.state==='casting'){this.depth+=150*dt;const h=this.hook();const hit=this.fish.find(f=>((h.x-f.x)/(f.size+7))**2+((h.y-f.y)/(f.size*.46+7))**2<=1);if(hit){this.target=hit;this.state='reeling';this.elapsed=0;this.progress=0;this.tension=0;this.release();this.startDepth=this.depth;this.message=`${hit.name} hooked! Tap or hold Space; release to cool the line!`;}else if(h.y>605){this.state='returning';this.message='No bite this cast. Bringing the hook back…';}}
      else if(this.state==='returning'){this.depth=Math.max(0,this.depth-330*dt);if(!this.depth){this.state='missed';this.message='No bite. Try another angle!';}}
      else if(this.state==='reeling'){
        if(this.elapsed===0){this.struggleOffset=0;this.struggleFrom=0;this.struggleTime=0;this.struggleSide=this.random()<.5?-1:1;this.struggleTo=this.struggleSide*(12+this.random()*24);this.struggleDuration=.25+this.random()*.4;}
        this.elapsed+=dt;
        this.struggle(dt);
        if(this.reelHeld){const previous=this.holdTime;this.holdTime+=dt;this.pull(dt/(6+this.target.rate),(12+this.target.rate)*dt+9*(this.holdTime**2-previous**2));}
        else {this.holdTime=0;this.tension=Math.max(0,this.tension-32*dt);}
        if(this.state==='reeling'){this.depth=this.startDepth*(1-this.progress);const h=this.hook();this.target.x=h.x;this.target.y=h.y;}
      }
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={FishingGame,species};else root.FishingGame=FishingGame;
})(typeof globalThis!=='undefined'?globalThis:this);
