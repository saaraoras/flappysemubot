(() => {
  "use strict";

  // ====== THEME COLORS (read from CSS) ======
  const css = getComputedStyle(document.documentElement);
  const BLUE = css.getPropertyValue("--accent-blue").trim();
  const PINK = css.getPropertyValue("--accent-pink").trim();

  // ====== CANVAS ======
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const overlay = document.getElementById("overlay");
  const btnPlay = document.getElementById("btnPlay");
  const loadingText = document.getElementById("loadingText");

  const DESIGN_W = 480;
  const DESIGN_H = 720;
  const GROUND_H = 92;

  function setupHiDPI(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();

    canvas.width  = rect.width  * dpr;
    canvas.height = rect.height * dpr;

    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  setupHiDPI();
  window.addEventListener("resize", setupHiDPI);

  // ====== UTIL ======
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rand = (a,b)=>a + Math.random()*(b-a);
  const rectHit = (a,b)=>!(a.x+a.w<b.x||a.x>b.x+b.w||a.y+a.h<b.y||a.y>b.y+b.h);

  // ====== BIRD ======
  class Bird {
    constructor(){
      this.reset();
    }
    reset(){
      this.x = 140;
      this.y = DESIGN_H*0.45;
      this.vy = 0;
      this.r = 18;

      this.w = 36 * 0.75; // easier hitbox
      this.h = 26 * 0.70;

      this.flapImpulse = -380; // easier
      this.gravity = 900;
    }
    flap(){ this.vy = this.flapImpulse; }
    update(dt,state,groundY){
      if (state === "ready"){
        this.y += Math.sin(Date.now()*0.005)*0.15;
        return;
      }
      this.vy += this.gravity * dt;
      this.vy = clamp(this.vy,-600,720);
      this.y += this.vy * dt;

      if (this.y - this.r < 0) this.y = this.r;
      if (this.y + this.r > groundY) this.y = groundY - this.r;
    }
    bounds(){ return { x:this.x-this.w/2, y:this.y-this.h/2, w:this.w, h:this.h }; }
    draw(ctx){
      ctx.save();
      ctx.translate(this.x,this.y);

      ctx.fillStyle="white";
      ctx.strokeStyle=BLUE;
      ctx.lineWidth=3;
      ctx.shadowColor=BLUE;
      ctx.shadowBlur=10;

      ctx.beginPath();
      ctx.ellipse(0,0,24,16,0,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  // ====== PIPE ======
  class PipePair{
    constructor(x,gapY,gapH,speed){
      this.x=x;
      this.w=72;
      this.gapY=gapY;
      this.gapH=gapH;
      this.speed=speed;
      this.passed=false;
    }
    update(dt){
      this.x -= this.speed * dt;
    }
    offscreen(){ return this.x+this.w < -10; }
    collide(bird,groundY){
      const topH = this.gapY - this.gapH/2;
      const bottomY = this.gapY + this.gapH/2;

      const bb = bird.bounds();
      const topRect = {x:this.x,y:0,w:this.w,h:topH};
      const botRect = {x:this.x,y:bottomY,w:this.w,h:groundY - bottomY};

      return rectHit(bb,topRect) || rectHit(bb,botRect);
    }
    draw(ctx,groundY){
      const topH = this.gapY - this.gapH/2;
      const bottomY = this.gapY + this.gapH/2;

      ctx.fillStyle="#6c7684";
      ctx.strokeStyle=PINK;
      ctx.lineWidth=3;

      // top
      ctx.beginPath();
      ctx.rect(this.x,0,this.w,topH);
      ctx.fill(); ctx.stroke();

      // bottom
      ctx.beginPath();
      ctx.rect(this.x,bottomY,this.w,groundY-bottomY);
      ctx.fill(); ctx.stroke();
    }
  }

  // ====== PIPE SYSTEM ======
  class PipeSystem{
    constructor(){
      this.reset();
    }
    reset(){
      this.list=[];
      this.speed=160;
      this.gap=210;
      this.spawnSpacing=280;
      this.spawnTimer=1.3; // warm-up runway
    }
    setDifficulty(speed,gap){
      this.speed=speed;
      this.gap=gap;
    }
    update(dt,groundY,bird,scoreRef){
      this.spawnTimer -= dt;

      if (this.spawnTimer <= 0){
        const minY = 130;
        const maxY = groundY - 130;
        const gapY = rand(minY,maxY);

        this.list.push(new PipePair(DESIGN_W+40,gapY,this.gap,this.speed));
        this.spawnTimer = this.spawnSpacing / this.speed;
      }

      for (let i=this.list.length-1;i>=0;i--){
        const p=this.list[i];
        p.update(dt);
        if (!p.passed && p.x+p.w < bird.x){
          p.passed=true;
          scoreRef.value++;
        }
        if (p.offscreen()) this.list.splice(i,1);
      }
    }
    draw(ctx,groundY){
      for(const p of this.list){
        p.draw(ctx,groundY);
      }
    }
  }

  // ====== GAME ======
  const Game = {
    state:"ready",
    t:0,
    score:0,
    best: parseInt(localStorage.getItem("roboBest") || "0",10),

    bird:new Bird(),
    pipes:new PipeSystem(),
    groundX:0,

    groundY(){ return DESIGN_H - GROUND_H; },

    start(){
      this.score=0;
      this.state="playing";
      this.bird.reset();
      this.pipes.reset();
    },

    gameOver(){
      this.state="gameover";
      if (this.score > this.best){
        this.best=this.score;
        localStorage.setItem("roboBest",this.best);
      }
    },

    // DIFFICULTY RAMP (includes speed-up at 20)
    applyDifficulty(){
      let s=160, g=210;

      if (this.score>=5){ s=170; g=200; }
      if (this.score>=12){ s=180; g=190; }

      // <== SPEED-UP YOU REQUESTED
      if (this.score>=20){ s=190; g=185; }

      if (this.score>=30){ s=200; g=175; }
      if (this.score>=45){ s=215; g=165; }

      this.pipes.setDifficulty(s,g);
    },

    update(dt){
      this.t += dt * 1000;
      const groundY = this.groundY();

      if (this.state!=="gameover"){
        this.groundX = (this.groundX - this.pipes.speed*dt) % 48;
      }

      this.bird.update(dt,this.state,groundY);

      if (this.state==="playing"){
        const scoreRef = { value:this.score };
        this.pipes.update(dt,groundY,this.bird,scoreRef);

        if (scoreRef.value!==this.score){
          this.score = scoreRef.value;
          this.applyDifficulty();
        }

        for(const p of this.pipes.list){
          if (p.collide(this.bird,groundY)) this.gameOver();
        }

        if (this.bird.y-this.bird.r <= 0 || this.bird.y+this.bird.r >= groundY){
          this.gameOver();
        }
      }
    },

    draw(){
      const groundY=this.groundY();

      // background
      const g=ctx.createLinearGradient(0,0,0,DESIGN_H);
      g.addColorStop(0,"#071320"); g.addColorStop(.5,"#0c2039");
      g.addColorStop(1,"#0a1a2e");
      ctx.fillStyle=g;
      ctx.fillRect(0,0,DESIGN_W,DESIGN_H);

      this.pipes.draw(ctx,groundY);
      ctx.fillStyle="#1a2430";
      ctx.fillRect(0,groundY,DESIGN_W,GROUND_H);

      this.bird.draw(ctx);

      ctx.fillStyle="white";
      ctx.font="bold 46px system-ui";
      ctx.textAlign="center";
      ctx.fillText(this.score,DESIGN_W/2,80);

      if (this.state==="gameover"){
        ctx.font="bold 42px system-ui";
        ctx.fillText("GAME OVER",DESIGN_W/2,200);

        ctx.font="28px system-ui";
        ctx.fillText(`Score: ${this.score} | Best: ${this.best}`,DESIGN_W/2,250);
        ctx.fillText("Click or Space to restart",DESIGN_W/2,310);
      }
    }
  };

  // ====== INPUT ======
  let uiLocked = true;

  function flap(){
    if (uiLocked) return;
    if (Game.state==="ready"){ Game.start(); Game.bird.flap(); }
    else if (Game.state==="playing"){ Game.bird.flap(); }
    else if (Game.state==="gameover"){ Game.start(); }
  }

  canvas.addEventListener("pointerdown",(e)=>{ e.preventDefault(); flap(); });
  window.addEventListener("keydown",(e)=>{
    if (overlay.classList.contains("show")){
      if (e.code==="Enter"||e.code==="Space"){
        btnPlay.click();
      }
      return;
    }
    if (["Space","ArrowUp","KeyW"].includes(e.code)){
      e.preventDefault();
      flap();
    }
  });

  // ====== OVERLAY / PLAY BUTTON ======
  setTimeout(()=>{
    loadingText.textContent="Ready!";
    btnPlay.disabled=false;
    overlay.classList.add("show");
  },300);

  btnPlay.addEventListener("click",()=>{
    overlay.classList.remove("show");
    uiLocked=false;
    Game.start();
    Game.bird.flap();
  });

  // ====== GAME LOOP ======
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
