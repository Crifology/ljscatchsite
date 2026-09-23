/* Original synthesized cartoon effects. No samples, recordings or third-party music. */
(function(root){
  'use strict';
  class FishingAudio {
    constructor(){this.muted=false;this.voices=new Set();this.lastReel=-Infinity;try{this.muted=localStorage.getItem('lj-fishing-muted')==='true';}catch{}}
    unlock(){
      if(this.muted)return;
      try{
        const Audio=root.AudioContext||root.webkitAudioContext;
        if(!Audio)return;
        if(!this.ctx){this.ctx=new Audio();this.master=this.ctx.createGain();this.master.gain.value=.18;this.master.connect(this.ctx.destination);}
        if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
      }catch{/* Sound is optional; gameplay remains available. */}
    }
    toggle(){this.muted=!this.muted;this.stop();try{localStorage.setItem('lj-fishing-muted',String(this.muted));}catch{}if(!this.muted)this.unlock();return this.muted;}
    stop(){for(const voice of this.voices){try{voice.stop();}catch{}}this.voices.clear();this.lastReel=-Infinity;}
    tone(start,end,duration,delay=0,type='sine',volume=.4){
      if(this.muted||!this.ctx||this.ctx.state==='closed')return;
      const at=this.ctx.currentTime+delay,osc=this.ctx.createOscillator(),gain=this.ctx.createGain();
      osc.type=type;osc.frequency.setValueAtTime(start,at);osc.frequency.exponentialRampToValueAtTime(end,at+duration);
      gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(volume,at+.008);gain.gain.exponentialRampToValueAtTime(.001,at+duration);
      osc.connect(gain);gain.connect(this.master);this.voices.add(osc);
      osc.onended=()=>{osc.disconnect();gain.disconnect();this.voices.delete(osc);};osc.start(at);osc.stop(at+duration+.02);
    }
    play(effect,tension=0){
      if(this.muted||!this.ctx||this.ctx.state==='closed')return;
      if(effect==='cast'){ // Slide whistle followed by a bubbly plop.
        this.tone(260,1200,.22);this.tone(480,90,.18,.23);this.tone(280,70,.12,.31);
      }else if(effect==='bite'){ // An indignant rubber-duck double honk.
        this.tone(650,220,.16,0,'triangle',.55);this.tone(850,330,.22,.13,'triangle',.5);
      }else if(effect==='reel'){
        if(this.ctx.currentTime-this.lastReel<.12)return;
        this.lastReel=this.ctx.currentTime;
        this.tone(160+tension*3,95,.065,0,'triangle',.3);this.tone(450+tension*5,260,.08,.045,'sine',.2);
      }else if(effect==='caught'){ // A short original "ta-da!" major-chord flourish.
        this.stop();
        [392,523.25,659.25].forEach((note,i)=>this.tone(note,note,.13,i*.1,'triangle',.35));
        [523.25,659.25,783.99].forEach(note=>this.tone(note,note,.65,.33,'triangle',.28));
      }
    }
  }
  root.FishingAudio=FishingAudio;
})(typeof globalThis!=='undefined'?globalThis:this);
