(() => {
  "use strict";

  // -------- Theme colors from CSS --------
  const css = getComputedStyle(document.documentElement);
  const BLUE = css.getPropertyValue("--accent-blue").trim() || "#00d8ff";
  const PINK = css.getPropertyValue("--accent-pink").trim() || "#ff78b6";

  // -------- Canvas + HiDPI --------
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const DESIGN_W = 480;
  const DESIGN_H = 720;
  const GROUND_H = 92;

  function setupHiDPI(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    const cssW = rect.width || DESIGN_W;
    const cssH = rect.height || DESIGN_H;
    canvas.width  = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  setupHiDPI();
  window.addEventListener("resize", setupHiDPI);

  // -------- Utils --------
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const randRange = (a,b)=>a + Math.random()*(b-a);
  const rectsOverlap = (a,b)=>
    !(a.x+a.w<b.x || a.x>b.x+b.w || a.y+a.h<b.y || a.y>b.y+b.h);

  // -------- Bird (robot SemuBot) --------
  class Bird{
    constructor(x,y){
      this.x=x; this.y=y;
      this.vy=0;
      this.r=18;
      this.w=36; this.h=26;
      this.flapImpulse=-380; // easier
      this.gravity=900;
      this.maxFall=720;
      this.idleTime=0;
    }
    reset(x,y){
      this.x=x; this.y=y; this.vy=0; this.idleTime=0;
    }
    flap(){ this.vy=this.flapImpulse; }
    update(dt,state,groundY){
      if (state==="ready"){
        this.idleTime += dt;
        this.y += Math.sin(this.idleTime*3) * 12 * dt;
        return;
      }
      this.vy += this.gravity * dt;
      this.vy = clamp(this.vy,-600,this.maxFall);
      this.y  += this.vy * dt;
      if (this.y-this.r < 0) this.y = this.r;
      if (this.y+this.r > groundY) this.y = groundY-this.r;
    }
    getBounds(){
      // slightly smaller than drawing for forgiveness
      const w = this.w*0.8, h=this.h*0.75;
      return { x:this.x-w/2, y:this.y-h/2, w, h };
    }
    draw(ctx, tMs){
      ctx.save();
      ctx.translate(this.x, this.y);
      const tilt = clamp(this.vy/500, -0.5, 0.6);
      ctx.rotate(tilt);

      // BODY (rounded robot torso)
      const bodyW=38, bodyH=26, radius=12;
      const grad=ctx.createLinearGradient(-bodyW/2,-bodyH/2, bodyW/2, bodyH/2);
      grad.addColorStop(0,"#bcc5cf");
      grad.addColorStop(0.5,"#aab4c0");
      grad.addColorStop(1,"#d5dbe2");
      ctx.fillStyle=grad;
      ctx.strokeStyle=BLUE;
      ctx.lineWidth=2;
      ctx.shadowColor=BLUE;
      ctx.shadowBlur=8;

      roundedRectPath(ctx,-bodyW/2,-bodyH/2,bodyW,bodyH,radius);
      ctx.fill();
      ctx.stroke();

      // neck ring
      ctx.beginPath();
      ctx.rect(-10,-bodyH/2-6,20,6);
      ctx.fillStyle="#2e3c52";
      ctx.fill();
      ctx.strokeStyle=BLUE;
      ctx.stroke();

      // head (helmet) based on your robot drawing :contentReference[oaicite:1]{index=1}
      ctx.save();
      ctx.translate(10,-bodyH/2-14);
      const headR=13;
      const headGrad=ctx.createRadialGradient(0,-3,3,0,0,headR);
      headGrad.addColorStop(0,"#dbe3ea");
      headGrad.addColorStop(1,"#aeb9c5");
      ctx.fillStyle=headGrad;
      ctx.beginPath();
      ctx.arc(0,0,headR,0,Math.PI*2);
      ctx.fill();
      ctx.strokeStyle=BLUE;
      ctx.stroke();

      // visor
      ctx.beginPath();
      roundedRectPath(ctx,-10,-6,20,12,6);
      const visorGrad=ctx.createLinearGradient(-10,-6,10,6);
      visorGrad.addColorStop(0, BLUE);
      visorGrad.addColorStop(1, "rgba(160,255,255,.6)");
      ctx.fillStyle=visorGrad;
      ctx.fill();
      ctx.restore();

      // thruster "wings" – blue + pink pulses
      const pulse = 1 + Math.sin(tMs*0.015)*0.3;
      ctx.save();
      ctx.translate(-bodyW*0.52,0);
      ctx.shadowBlur=16;
      const thruster = (y,color)=>{
        ctx.fillStyle=color;
        ctx.shadowColor=color;
        ctx.beginPath();
        ctx.ellipse(-6,y,6*pulse,3*pulse,0,0,Math.PI*2);
        ctx.fill();
      };
      thruster(-8, BLUE);
      thruster( 8, PINK);
      ctx.restore();

      ctx.restore();
    }
  }

  function roundedRectPath(ctx,x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);
    ctx.lineTo(x+w-rr,y);
    ctx.quadraticCurveTo(x+w,y,x+w,y+rr);
    ctx.lineTo(x+w,y+h-rr);
    ctx.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
    ctx.lineTo(x+rr,y+h);
    ctx.quadraticCurveTo(x,y+h,x,y+h-rr);
    ctx.lineTo(x,y+rr);
    ctx.quadraticCurveTo(x,y,x+rr,y);
  }

  // -------- Pipes --------
  class PipePair{
    constructor(x,gapY,gapH,speed){
      this.x=x;
      this.w=72;
      this.gapY=gapY;
      this.gapH=gapH;
      this.speed=speed;
      this.passed=false;
    }
    update(dt){ this.x -= this.speed * dt; }
    offscreen(){ return this.x + this.w < -10; }
    collide(birdBounds, groundY){
      const topH = this.gapY - this.gapH/2;
      const bottomY = this.gapY + this.gapH/2;
      const topRect = {x:this.x,y:0,w:this.w,h:topH};
      const botRect = {x:this.x,y:bottomY,w:this.w,h:groundY-bottomY};
      return rectsOverlap(birdBounds,topRect) || rectsOverlap(birdBounds,botRect);
    }
    draw(ctx,groundY,scrollT){
      const topH = this.gapY - this.gapH/2;
      const bottomY = this.gapY + this.gapH/2;

      const drawPipeRect = (x,y,w,h,flip=false)=>{
        ctx.save();
        ctx.translate(x,y);

        const g=ctx.createLinearGradient(0,0,0,h);
        g.addColorStop(0,"#6c7684");
        g.addColorStop(0.5,"#818b99");
        g.addColorStop(1,"#6a7482");
        ctx.fillStyle=g;

        const edge=ctx.createLinearGradient(0,0,w,0);
        edge.addColorStop(0,PINK);
        edge.addColorStop(1,BLUE);
        ctx.strokeStyle=edge;
        ctx.lineWidth=3;
        ctx.shadowColor=BLUE;
        ctx.shadowBlur=8;

        ctx.beginPath();
        ctx.rect(0,0,w,h);
        ctx.fill();
        ctx.stroke();

        // ribs
        ctx.save();
        ctx.globalAlpha=.22;
        ctx.lineWidth=1;
        ctx.shadowBlur=0;
        const ribGap=10;
        const offset=(scrollT*0.06)%ribGap;
        ctx.beginPath();
        for(let yy=offset;yy<h;yy+=ribGap){
          ctx.moveTo(4,yy);
          ctx.lineTo(w-4,yy);
        }
        ctx.strokeStyle="#05131e";
        ctx.stroke();
        ctx.restore();

        // bolts
        ctx.fillStyle=PINK;
        for(let i=0;i<4;i++){
          const bx=10+i*((w-20)/3);
          ctx.beginPath();
          ctx.arc(bx,8,2.2,0,Math.PI*2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(bx,h-8,2.2,0,Math.PI*2);
          ctx.fill();
        }

        // cap
        ctx.globalAlpha=.9;
        ctx.fillStyle="#2e3c52";
        ctx.shadowBlur=0;
        const capH=10;
        if(!flip) ctx.fillRect(-2,h-capH,w+4,capH);
        else      ctx.fillRect(-2,0,w+4,capH);

        ctx.restore();
      };

      drawPipeRect(this.x,0,this.w,topH,false);
      drawPipeRect(this.x,bottomY,this.w,groundY-bottomY,true);
    }
  }

  class PipeSystem{
    constructor(speed,gapH){
      this.speed=speed;
      this.gapH=gapH;
      this.spawnSpacing=280;
      this.spawnTimer=1.3;  // warm-up before first pipe
      this.list=[];
    }
    setDifficulty(speed,gapH){
      this.speed=speed;
      this.gapH=gapH;
    }
    reset(){
      this.list.length=0;
      this.spawnTimer=1.3;
    }
    update(dt,groundY,bird,scoreRef,tMs){
      this.spawnTimer -= dt;
      if(this.spawnTimer <= 0){
        const minY=130;
        const maxY=groundY-130;
        const gapY=randRange(minY,maxY);
        const x=DESIGN_W+40;
        this.list.push(new PipePair(x,gapY,this.gapH,this.speed));
        this.spawnTimer = this.spawnSpacing / this.speed;
      }

      for(let i=this.list.length-1;i>=0;i--){
        const p=this.list[i];
        p.speed=this.speed;
        p.update(dt);

        if(!p.passed && p.x + p.w < bird.x){
          p.passed=true;
          scoreRef.value++;
        }

        if(p.offscreen()) this.list.splice(i,1);
      }
    }
    draw(ctx,groundY,tMs){
      for(const p of this.list) p.draw(ctx,groundY,tMs);
    }
  }

  // -------- Game object --------
  const Game = {
    state:"ready",
    t:0,
    score:0,
    best:parseInt(localStorage.getItem("roboFlapBest") || "0",10),

    bird:new Bird(140,DESIGN_H*0.45),
    pipes:new PipeSystem(160,210),
    groundX:0,
    groundSpeed:160,

    groundY(){ return DESIGN_H - GROUND_H; },

    start(){
      this.score=0;
      this.bird.reset(140,DESIGN_H*0.45);
      this.pipes.reset();
      this.applyDifficulty();
      this.state="playing";
    },

    gameOver(){
      this.state="gameover";
      if(this.score>this.best){
        this.best=this.score;
        localStorage.setItem("roboFlapBest",String(this.best));
      }
    },

    // difficulty ramp – includes speed up around 20
    applyDifficulty(){
      let speed=160, gap=210;      // easiest
      if(this.score>=5){  speed=170; gap=200; }
      if(this.score>=12){ speed=180; gap=190; }
      if(this.score>=20){ speed=190; gap=185; } // <- slightly faster here
      if(this.score>=30){ speed=200; gap=175; }
      if(this.score>=45){ speed=215; gap=165; }

      this.groundSpeed=speed;
      this.pipes.setDifficulty(speed,gap);
    },

    update(dt){
      this.t += dt*1000;
      const groundY=this.groundY();

      if(this.state!=="gameover"){
        this.groundX = (this.groundX - this.groundSpeed*dt) % 48;
      }

      this.bird.update(dt,this.state,groundY);

      if(this.state==="playing"){
        const scoreRef={ value:this.score };
        this.pipes.update(dt,groundY,this.bird,scoreRef,this.t);

        if(scoreRef.value !== this.score){
          this.score=scoreRef.value;
          this.applyDifficulty();
        }

        const bb=this.bird.getBounds();
        for(const p of this.pipes.list){
          if(p.collide(bb,groundY)){
            this.gameOver();
            break;
          }
        }
        if(this.bird.y-this.bird.r <= 0 || this.bird.y+this.bird.r >= groundY){
          this.gameOver();
        }
      }
    },

    draw(){
      const groundY=this.groundY();

      // sky
      const g=ctx.createLinearGradient(0,0,0,DESIGN_H);
      g.addColorStop(0,"#071320");
      g.addColorStop(0.5,"#0c2039");
      g.addColorStop(1,"#0a1a2e");
      ctx.fillStyle=g;
      ctx.fillRect(0,0,DESIGN_W,DESIGN_H);

      // simple grid background
      drawCircuitGrid(ctx,this.t);

      // pipes + ground
      this.pipes.draw(ctx,groundY,this.t);
      drawGround(ctx,groundY,this.groundX);

      // bird
      this.bird.draw(ctx,this.t);

      // HUD
      drawHUD(ctx,this.state,this.score,this.best);
    }
  };

  function drawCircuitGrid(ctx,tMs){
    ctx.save();
    ctx.globalAlpha=.28;
    ctx.strokeStyle="rgba(0,216,255,.25)";
    ctx.lineWidth=1;
    const spacing=32;
    const offset=-((tMs*0.06)%spacing);

    ctx.beginPath();
    for(let x=offset;x<DESIGN_W+spacing;x+=spacing){
      ctx.moveTo(x,0);
      ctx.lineTo(x,DESIGN_H);
    }
    ctx.stroke();

    ctx.beginPath();
    for(let y=spacing/2; y<DESIGN_H-GROUND_H; y+=spacing){
      ctx.moveTo(0,y);
      ctx.lineTo(DESIGN_W,y);
    }
    ctx.stroke();

    ctx.globalAlpha=.22;
    for(let y=spacing/2; y<DESIGN_H-GROUND_H; y+=spacing){
      for(let x=offset; x<DESIGN_W+spacing; x+=spacing*4){
        ctx.beginPath();
        ctx.arc(x+(y%64),y,2,0,Math.PI*2);
        ctx.fillStyle=(Math.floor((x+y)/spacing)%2===0)?BLUE:PINK;
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawGround(ctx,groundY,groundX){
    ctx.fillStyle="#1a2430";
    ctx.fillRect(0,groundY,DESIGN_W,GROUND_H);

    ctx.save();
    ctx.translate(groundX,0);
    ctx.fillStyle="#0f161f";
    ctx.strokeStyle="rgba(0,216,255,.35)";
    ctx.lineWidth=2;

    const slatW=48, slatH=22;
    for(let x=-slatW; x<DESIGN_W+slatW; x+=slatW){
      ctx.fillRect(x+4,groundY+14,slatW-8,slatH);
      ctx.strokeRect(x+4,groundY+14,slatW-8,slatH);
    }

    const neon=ctx.createLinearGradient(0,0,DESIGN_W,0);
    neon.addColorStop(0,PINK);
    neon.addColorStop(1,BLUE);
    ctx.beginPath();
    ctx.moveTo(-1000,groundY);
    ctx.lineTo(DESIGN_W+1000,groundY);
    ctx.strokeStyle=neon;
    ctx.shadowColor=BLUE;
    ctx.shadowBlur=12;
    ctx.stroke();

    ctx.restore();
  }

  function drawHUD(ctx,state,score,best){
    ctx.save();
    ctx.font="bold 42px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
    ctx.textAlign="center";
    ctx.fillStyle="rgba(235,252,255,.96)";
    ctx.strokeStyle="rgba(0,0,0,.45)";
    ctx.lineWidth=6;
    ctx.strokeText(String(score),DESIGN_W/2,64);
    ctx.fillText(String(score),DESIGN_W/2,64);

    ctx.font="bold 28px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

    if(state==="ready"){
      subTitle("ROBO FLAPPY",DESIGN_W/2,200);
      subText("Click or press Space to start",DESIGN_W/2,260);
      subText("Click / Space to flap",DESIGN_W/2,300,.86);
    }else if(state==="gameover"){
      subTitle("GAME OVER",DESIGN_W/2,220);
      subText(`Score: ${score}  |  Best: ${best}`,DESIGN_W/2,268);
      subText("Click or Space to play again",DESIGN_W/2,312,.9);
    }

    ctx.restore();

    function subTitle(txt,x,y){
      ctx.save();
      ctx.font="800 44px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
      ctx.textAlign="center";
      ctx.shadowBlur=18;
      ctx.shadowColor=BLUE;
      ctx.lineWidth=10;
      ctx.strokeStyle="rgba(0,0,0,.6)";
      ctx.fillStyle="rgba(235,252,255,.98)";
      ctx.strokeText(txt,x,y);
      ctx.fillText(txt,x,y);
      ctx.restore();
    }
    function subText(txt,x,y,a=1){
      ctx.save();
      ctx.globalAlpha=a;
      ctx.font="600 20px system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";
      ctx.textAlign="center";
      ctx.fillStyle="rgba(217,246,255,.96)";
      ctx.fillText(txt,x,y);
      ctx.restore();
    }
  }

  // -------- Input & overlay --------
  const loadingScreen = document.getElementById("loading-screen");
  const playBtn       = document.getElementById("playBtn");
  const progressBar   = document.getElementById("progressBar");
  let uiLocked = true;

  function triggerFlap(){
    if(uiLocked) return;
    if(Game.state==="ready"){ Game.start(); Game.bird.flap(); }
    else if(Game.state==="playing"){ Game.bird.flap(); }
    else if(Game.state==="gameover"){ Game.start(); }
  }

  canvas.addEventListener("pointerdown",e=>{
    e.preventDefault();
    triggerFlap();
  });

  window.addEventListener("keydown",e=>{
    if(!loadingScreen.classList.contains("hidden")){
      if(e.code==="Space" || e.code==="Enter"){
        e.preventDefault();
        if(!playBtn.disabled) playBtn.click();
      }
      return;
    }
    if(["Space","ArrowUp","KeyW"].includes(e.code)){
      e.preventDefault();
      triggerFlap();
    }
  });

  // fake loading bar
  let loadStart=null;
  function animateLoader(ts){
    if(loadStart==null) loadStart=ts;
    const dur=900;
    const p=Math.min(1,(ts-loadStart)/dur);
    progressBar.style.width = `${Math.round(p*100)}%`;
    if(p<1) requestAnimationFrame(animateLoader);
    else{
      playBtn.disabled=false;
      playBtn.removeAttribute("aria-disabled");
      playBtn.focus();
    }
  }
  requestAnimationFrame(animateLoader);

  playBtn.addEventListener("click",()=>{
    loadingScreen.classList.add("hidden");
    uiLocked=false;
    Game.start();
    Game.bird.flap();
  });

  // -------- Game loop --------
  let last=performance.now();
  function loop(now){
    const dt=Math.min(1/30,(now-last)/1000);
    last=now;
    Game.update(dt);
    Game.draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

})();
