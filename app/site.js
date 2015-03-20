
(function(self, window, document, Math, Uint8Array, Float32Array, SHADERS){
  var canvas, gl;

  var shaderGrassGrow, shaderGrassRender, shaderHerbivoreIterate;
  var shaderHerbivoreRender, shaderWorldRender, shaderHerbivoreEat;
  var shaderGrassApplyEat, shaderHerbivoreApplyEat;

  var vbSquere;
  var texRandom, texPermutation, texGrassRandom, texTemp, texDeltas;
  var texGrassA, texHerbivoreA;
  var fbGrassA, fbHerbivoreA, fbTemp;

  var EPS = 1e-5;
  var EPS_TO_256 = 256 - EPS;
  var SIZE = 256;
  var SEED_SIZE = 128;
  
 
  
  var OPTIONS = {
    RENDER_MODE: 0,
    ITERATIONS_PER_FRAME: 50,
    GRASS_MUTATION_RATE: 6 / 255,
    GRASS_GROW_RATE: 10 / 255,
    HERBIVORE_STEP_RATE: 1.0,
    // Actual apawn rate is 10% of this constant
    HERBIVORE_SPAWN_RATE: 5 / 255,
    HERBIVORE_START_HEALTH: 50 / 255,
    HERBIVORE_INC_HEALTH: 30 / 255,
    HERBIVORE_DEC_HEALTH: 2 / 255,
    HERBIVORE_COLOR_MUTATION_RATE: 8 / 255,
    HERBIVORE_DISLIKE_RATE: 0.2,
    $meta: {
      unit: {
        RENDER_MODE: 1,
        ITERATIONS_PER_FRAME: 1,
        GRASS_MUTATION_RATE: 1 / 255,
        GRASS_GROW_RATE: 1 / 255,
        HERBIVORE_STEP_RATE: 1 / 255,
        // Actual spawn rate is 10% of this constant
        HERBIVORE_SPAWN_RATE: 1 / 255,
        HERBIVORE_START_HEALTH: 1 / 255,
        HERBIVORE_INC_HEALTH: 1 / 255,
        HERBIVORE_DEC_HEALTH: 1 / 255,
        HERBIVORE_COLOR_MUTATION_RATE: 1 / 255,
        HERBIVORE_DISLIKE_RATE: 1 / 255
      }
    }
  };


  function Shader(p, v, f) {
    this.program = p;
    this.idVertex = v;
    this.idFragment = f;
    this.srcFragment = null;
    this.srcVertex = null;
    this.loc = {};
  }

  function resizeCanvasStyle(w, h) {
    canvas.style.width = "" + w + "px";
    canvas.style.height = "" + h + "px";
  }
  function resizeCanvasBuffer(w, h) {
    canvas.width = w;
    canvas.height = h;
  }
  function resizeCanvas(w, h) {
    resizeCanvasBuffer(w, h);
    resizeCanvasStyle(w, h);
  }
  function error(e) {
    console.error(e);
  }

  function compileShader(type, content) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, content);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      error(gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  function initShaders() {
    shaderGrassGrow = makeShader(SHADERS.FSHADER_GRASS_GROW, SHADERS.VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uSeed", "uSeed2", "uSeedRatio", "uPixSize",
      "uTexGrass", "uTexRandom", "uTexHerbivore", "uTexDeltas",
      "uGrassMutationRate", "uGrassGrowRate"
    ]);
    shaderGrassRender = makeShader(SHADERS.FSHADER_GRASS_RENDER, SHADERS.VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uTexGrass"
    ]);
    shaderHerbivoreIterate = makeShader(SHADERS.FSHADER_HERBIVORE_ITERATE, SHADERS.VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uSeed", "uSeed2", "uSeedRatio", "uPixSize",
      "uTexHerbivore", "uTexRandom", "uTexPermutation", "uTexGrass",
      "uHerbivoreStepRate", "uHerbivoreSpawnRate", "uHerbivoreColorMutationRate",
      "uHerbivoreStartHealth", "uHerbivoreDecHealth"
    ]);
    shaderHerbivoreEat = makeShader(SHADERS.FSHADER_HERBIVORE_EAT, SHADERS.VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uSeed", "uSeedRatio", "uPixSize",
      "uTexHerbivore", "uTexRandom", "uTexGrass",
      "uHerbivoreDislikeRate"
    ]);
    shaderHerbivoreApplyEat = makeShader(SHADERS.FSHADER_HERBIVORE_APPLY_EAT, SHADERS.VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uTexHerbivore", "uTexTemp", "uHerbivoreIncHealth"
    ]);
    shaderGrassApplyEat = makeShader(SHADERS.FSHADER_GRASS_APPLY_EAT, SHADERS.VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uTexGrass", "uTexTemp"
    ]);
    shaderHerbivoreRender = makeShader(SHADERS.FSHADER_HERBIVORE_RENDER, SHADERS.VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uTexHerbivore"
    ]);
    shaderWorldRender = makeShader(SHADERS.FSHADER_WORLD_RENDER, SHADERS.VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uTexHerbivore", "uTexGrass", "uTexTemp", "uRenderMode"
    ]);
  }


  function makeShader(fShaderStr, vShaderStr, attrs, unis) {
    var fragmentShader = compileShader(gl.FRAGMENT_SHADER, fShaderStr);
    var vertexShader = compileShader(gl.VERTEX_SHADER, vShaderStr);

    var shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
      var infoLog = gl.getProgramInfoLog(shaderProgram);
      error("Could not initialise shaders: " + infoLog);
    } else {
      var shader = new Shader(shaderProgram, vertexShader, fragmentShader);
      shader.srcVertex = vShaderStr;
      shader.srcFragment = fShaderStr;
      if (attrs) {
        attrs.forEach(function(attr) {
          shader.loc[attr] = gl.getAttribLocation(shaderProgram, attr);
        });
      }
      if (unis) {
        unis.forEach(function(uni) {
          shader.loc[uni] = gl.getUniformLocation(shaderProgram, uni);
        });
      }
      return shader;
    }
  }

  function initGl() {
    gl = canvas.getContext("webgl", { antialias: false, alpha: true });
    gl.disable(gl.DEPTH_TEST);
  }


  function initBuffers() {
    vbSquere = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbSquere);

    var vertices = new Float32Array([0, 0, 0, 1, 1, 0, 1, 1]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  }

  function tex_to_framebuffer(tex) {
    var fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return fb;
  }
  function initFramebuffers() {
    fbTemp = tex_to_framebuffer(texTemp);
    fbGrassA = texGrassA.map(tex_to_framebuffer);
    fbHerbivoreA = texHerbivoreA.map(tex_to_framebuffer);
  }

  function obtainCanvas() {
    canvas = document.getElementById("main-canvas");
  }


  function initTextures() {
    texPermutation = createPermutation(SEED_SIZE, texPermutation);
    texRandom = createRandomTexture(SEED_SIZE, texRandom);
    texGrassRandom = createGrassRandomTexture(SEED_SIZE, 50, texGrassRandom);

    texDeltas = createDeltasTexture(texDeltas);

    if (!texGrassA) texGrassA = new Array(2);
    if (!texHerbivoreA) texHerbivoreA = new Array(2);
    texGrassA[0] = createGrassTexture(SIZE, texGrassA[0]);
    texGrassA[1] = createEmptyTexture(SIZE, texGrassA[1]);
    texHerbivoreA[0] = createHerbivoreTexture(SIZE, texHerbivoreA[0]);
    texHerbivoreA[1] = createEmptyTexture(SIZE, texHerbivoreA[1]);
    texTemp = createEmptyTexture(SIZE, texTemp);

    index_grass.reset();
    index_herbivore.reset();
  }

  function SwapIndex() {
    this.target = 1;
    this.source = 0;
  }
  SwapIndex.prototype.swap = function swap() {
    this.target = this.source;
    this.source = this.source ? 0 : 1;
  };
  SwapIndex.prototype.reset = function reset() {
    this.target = 1;
    this.source = 0;
  };


  var index_grass = new SwapIndex();
  var index_herbivore = new SwapIndex();

  function drawSquare(shader) {
    gl.bindBuffer(gl.ARRAY_BUFFER, vbSquere);
    gl.enableVertexAttribArray(shader.loc.aPosition);
    gl.vertexAttribPointer(shader.loc.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function randomPermOffset() {
    return ((Math.random() * (SEED_SIZE - EPS)) |0) / SEED_SIZE;
  }

  function growGrass() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbGrassA[index_grass.target]);

    gl.useProgram(shaderGrassGrow.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texGrassA[index_grass.source]);
    gl.uniform1i(shaderGrassGrow.loc.uTexGrass, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texGrassRandom);
    gl.uniform1i(shaderGrassGrow.loc.uTexRandom, 1);

    gl.activeTexture(gl.TEXTURE2);
    // use target buffer, which contains the last state of herbivores, thus delayed with one iteration
    gl.bindTexture(gl.TEXTURE_2D, texHerbivoreA[index_herbivore.target]);
    gl.uniform1i(shaderGrassGrow.loc.uTexHerbivore, 2);

    gl.activeTexture(gl.TEXTURE3);
    // use target buffer, which contains the last state of herbivores, thus delayed with one iteration
    gl.bindTexture(gl.TEXTURE_2D, texDeltas);
    gl.uniform1i(shaderGrassGrow.loc.uTexDeltas, 3);

    var iSIZE = 1 / SIZE;
    gl.uniform2f(shaderGrassGrow.loc.uSeed, randomPermOffset(), randomPermOffset());
    gl.uniform2f(shaderGrassGrow.loc.uSeed2, randomPermOffset(), randomPermOffset());
    gl.uniform2f(shaderGrassGrow.loc.uPixSize, iSIZE, iSIZE);
    gl.uniform1f(shaderGrassGrow.loc.uSeedRatio, SIZE / SEED_SIZE);
    gl.uniform3f(shaderGrassGrow.loc.uGrassMutationRate,
      OPTIONS.GRASS_MUTATION_RATE,
      OPTIONS.GRASS_MUTATION_RATE,
      OPTIONS.GRASS_MUTATION_RATE);
    gl.uniform1f(shaderGrassGrow.loc.uGrassGrowRate,
      OPTIONS.GRASS_GROW_RATE);

    drawSquare(shaderGrassGrow);
    index_grass.swap();
  }


  function iterateHerbivores() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbHerbivoreA[index_herbivore.target]);
    gl.useProgram(shaderHerbivoreIterate.program);

    var iSIZE = 1 / SIZE;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texHerbivoreA[index_herbivore.source]);
    gl.uniform1i(shaderHerbivoreIterate.loc.uTexHerbivore, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texRandom);
    gl.uniform1i(shaderHerbivoreIterate.loc.uTexRandom, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texPermutation);
    gl.uniform1i(shaderHerbivoreIterate.loc.uTexPermutation, 2);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texGrassA[index_grass.source]);
    gl.uniform1i(shaderHerbivoreIterate.loc.uTexGrass, 3);

    gl.uniform2f(shaderHerbivoreIterate.loc.uSeed, randomPermOffset(), randomPermOffset());
    gl.uniform2f(shaderHerbivoreIterate.loc.uSeed2, randomPermOffset(), randomPermOffset());
    gl.uniform2f(shaderHerbivoreIterate.loc.uPixSize, iSIZE, iSIZE);
    gl.uniform1f(shaderHerbivoreIterate.loc.uSeedRatio, SIZE / SEED_SIZE);
    gl.uniform1f(shaderHerbivoreIterate.loc.uHerbivoreStepRate,
      OPTIONS.HERBIVORE_STEP_RATE);
    gl.uniform1f(shaderHerbivoreIterate.loc.uHerbivoreSpawnRate,
      OPTIONS.HERBIVORE_SPAWN_RATE);
    gl.uniform1f(shaderHerbivoreIterate.loc.uHerbivoreStartHealth,
      OPTIONS.HERBIVORE_START_HEALTH);
    gl.uniform1f(shaderHerbivoreIterate.loc.uHerbivoreDecHealth,
      OPTIONS.HERBIVORE_DEC_HEALTH);
    gl.uniform3f(shaderHerbivoreIterate.loc.uHerbivoreColorMutationRate,
      OPTIONS.HERBIVORE_COLOR_MUTATION_RATE,
      OPTIONS.HERBIVORE_COLOR_MUTATION_RATE,
      OPTIONS.HERBIVORE_COLOR_MUTATION_RATE
    );

    drawSquare(shaderHerbivoreIterate);
    index_herbivore.swap();
  }

  function eatHerbivores() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbTemp);

    gl.useProgram(shaderHerbivoreEat.program);

    var iSIZE = 1 / SIZE;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texHerbivoreA[index_herbivore.source]);
    gl.uniform1i(shaderHerbivoreEat.loc.uTexHerbivore, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texRandom);
    gl.uniform1i(shaderHerbivoreEat.loc.uTexRandom, 1);

    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texGrassA[index_grass.source]);
    gl.uniform1i(shaderHerbivoreEat.loc.uTexGrass, 3);

    gl.uniform2f(shaderHerbivoreEat.loc.uSeed, randomPermOffset(), randomPermOffset());
    gl.uniform2f(shaderHerbivoreEat.loc.uPixSize, iSIZE, iSIZE);
    gl.uniform1f(shaderHerbivoreEat.loc.uSeedRatio, SIZE / SEED_SIZE);
    gl.uniform1f(shaderHerbivoreEat.loc.uHerbivoreDislikeRate,
      OPTIONS.HERBIVORE_DISLIKE_RATE);

    drawSquare(shaderHerbivoreEat);
  }
  function applyEatHerbivores() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbHerbivoreA[index_herbivore.target]);
    gl.useProgram(shaderHerbivoreApplyEat.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texHerbivoreA[index_herbivore.source]);
    gl.uniform1i(shaderHerbivoreApplyEat.loc.uTexHerbivore, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texTemp);
    gl.uniform1i(shaderHerbivoreApplyEat.loc.uTexTemp, 1);

    gl.uniform1f(shaderHerbivoreApplyEat.loc.uHerbivoreIncHealth,
      OPTIONS.HERBIVORE_INC_HEALTH);

    drawSquare(shaderHerbivoreApplyEat);
    index_herbivore.swap();
  }

  function applyEatGrass() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbGrassA[index_grass.target]);
    gl.useProgram(shaderGrassApplyEat.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texGrassA[index_grass.source]);
    gl.uniform1i(shaderGrassApplyEat.loc.uTexGrass, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texTemp);
    gl.uniform1i(shaderGrassApplyEat.loc.uTexTemp, 1);

    drawSquare(shaderGrassApplyEat);
    index_grass.swap();
  }

  function renderGrass() {
    gl.useProgram(shaderGrassRender.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texGrassA[index_grass.source]);
    gl.uniform1i(shaderGrassRender.loc.uTexGrass, 0);

    drawSquare(shaderGrassRender);
  }

  function renderHerbivores() {
    gl.useProgram(shaderHerbivoreRender.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texHerbivoreA[index_herbivore.source]);
    gl.uniform1i(shaderHerbivoreRender.loc.uTexHerbivore, 0);

    drawSquare(shaderHerbivoreRender);
  }

  function renderWorld() {
    gl.useProgram(shaderWorldRender.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texGrassA[index_grass.source]);
    gl.uniform1i(shaderWorldRender.loc.uTexGrass, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texHerbivoreA[index_herbivore.source]);
    gl.uniform1i(shaderWorldRender.loc.uTexHerbivore, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texTemp);
    gl.uniform1i(shaderWorldRender.loc.uTexTemp, 2);

    gl.uniform1i(shaderWorldRender.loc.uRenderMode, OPTIONS.RENDER_MODE);

    drawSquare(shaderWorldRender);
  }

  function cycleIteration() {
    growGrass();
    iterateHerbivores();
    eatHerbivores();
    applyEatHerbivores();
    applyEatGrass();
  }
  function cycle() {
    gl.viewport(0, 0, SIZE, SIZE);
    for (var i = 0; i < OPTIONS.ITERATIONS_PER_FRAME; i++) {
      cycleIteration();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0.2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    renderWorld();
  }


  function handleFrame() {
    cycle();
    scheduleCycle();
  }
  function scheduleCycle() {
    //self.setTimeout(handleFrame, 60);
    self.requestAnimationFrame(handleFrame);
  }



  var PAIR_CONFIG = [[1, -1], [1, 0], [1, 1], [0, 1]];
  function randomInt(maxExcl) {
    return (Math.random() * (maxExcl - EPS))|0
  }

  function makeDataTex(texture) {
    if (texture === undefined) {
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    } else {
      gl.bindTexture(gl.TEXTURE_2D, texture);
    }
    return texture;
  }

  function createRandomTexture(size, texture) {
    var bitmap = new Uint8Array(size * size * 4);
    var i;
    for (i = 0; i < bitmap.length; ++i) {
        bitmap[i] = randomInt(256);
    }

    texture = makeDataTex(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
      size, size, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, bitmap);
    return texture;
  }
  function createEmptyTexture(size, texture) {
    texture = makeDataTex(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return texture;
  }

  function createGrassRandomTexture(size, base, texture) {
    var bitmap = new Uint8Array(size * size * 4);
    var i, coeffa = base - 1, coeffb = 1 / (1 - base), coeffc = 1 / Math.log(base);

    function randomDistr() {
      var unif = Math.random();
      var dist = Math.log(coeffa * (unif - coeffb)) * coeffc;
      return Math.floor(dist * EPS_TO_256);
    }

    for (i = 0; i < bitmap.length; i += 4) {
      bitmap[i] = randomInt(256);
      bitmap[i+1] = randomInt(256);
      bitmap[i+2] = randomInt(256);
      bitmap[i+3] = randomDistr();
    }

    texture = makeDataTex(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
      size, size, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, bitmap);
    return texture;
  }

  function createDeltasTexture(texture) {
    var IDENTITY = [ 1, 0, 2, 0, 2, 1, 2, 2, 1, 2, 0, 2, 0, 1, 0, 0 ];
    var bitmap = new Uint8Array(4 * 8 * 4), i, j;
    for (i = 0; i < 8; i++) {
      for (j = 0; j < 8; j++) {
        bitmap[16 * i + 2 * j + 0] = IDENTITY[2 * ((i + j) & 7) + 0];
        bitmap[16 * i + 2 * j + 1] = IDENTITY[2 * ((i + j) & 7) + 1];
      }
    }
    for (i = 0; i < 8; i++) {
      for (j = 0; j < 8; j++) {
        bitmap[16 * 8 + 16 * i + 2 * j + 0] = IDENTITY[2 * ((i - j) & 7) + 0];
        bitmap[16 * 8 + 16 * i + 2 * j + 1] = IDENTITY[2 * ((i - j) & 7) + 1];
      }
    }

    texture = makeDataTex(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
      4, 8, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, bitmap);
    return texture;
  }

  function createGrassTexture(size, texture) {
    var i, j;
    var bitmap = new Uint8Array(size * size * 4);

    function setc(x, y, c) {
      var b = (y * size + x) * 4;
      for (var i = 0; i < 4; i++) bitmap[b + i] = c[i];
    }
    var psize = (size / 2)|0;
    var GREEN = [0, 255, 0, 255];
    for (i = 0; i < psize; i += 5) {
      for (j = 0; j < psize; j += 5) {
        setc(i, j, GREEN);
      }
    }
    setc(size-1, size-1, GREEN);

    texture = makeDataTex(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
      size, size, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, bitmap);
    return texture;
  }

  function createHerbivoreTexture(size, texture) {
    var bitmap = new Uint8Array(size * size * 4);
    var i;
    function setc(x, y, c) {
      var b = (y * size + x) * 4;
      for (var i = 0; i < 4; i++) bitmap[b + i] = c[i];
    }
    var COLOR = [0, 255, 0, (OPTIONS.HERBIVORE_START_HEALTH * 255)|0];
    for (i = 0; i < 10; i++) {
      setc(i * 3, 0, COLOR);
      setc(0, i * 3, COLOR);
    }
    setc(0, 0, COLOR);

    texture = makeDataTex(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
      size, size, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, bitmap);
    return texture;
  }

  function floatToByte(x) {
    return (x * EPS_TO_256)|0;
  }

  function mod(divident, modulus) {
    return ((divident % modulus) + modulus) % modulus;
  }

  function createPermutation(size, texture) {
    var i, j, k;
    var pcount = size * size;
    var ccount = pcount * 4;
    var array = new Array(pcount);
    var perm = new Uint32Array(ccount);

    function xget(x, y) {
      return array[mod(x, size) + mod(y, size) * size];
    }
    function xset(x, y, v) {
      return array[mod(x, size) + mod(y, size) * size] = v;
    }

    function xch(i, j) {
      var t = perm[i];
      perm[i] = perm[j];
      perm[j] = t;
    }

    for (i = 0; i < perm.length; ++i) {
      perm[i] = i;
    }
    for (i = 0; i < ccount; i++) {
      k = randomInt(ccount - i);
      xch(i, i + k);
    }

    for (i = 0; i < ccount; i++) {
      k = perm[i];
      var pi = k % 4;
      k = (k / 4) |0;
      var x0 = k % size;
      k = (k / size)|0;
      var y0 = k;

      var pr = PAIR_CONFIG[pi];

      var x1 = x0 + pr[0];
      var y1 = y0 + pr[1];
      var p1 = xget(x0, y0);
      var p2 = xget(x1, y1);
      if (!p1 && !p2) {
        var w = [Math.random(), Math.random(), Math.random()].map(floatToByte);
        xset(x0, y0, [pr[0], pr[1], w, pi, 0]);
        xset(x1, y1, [-pr[0], -pr[1], w, pi, 1]);
      }
    }


    var bitmap = new Uint8Array(size * size * 4);
    var r, g, b, a, d;
    for (i = 0, k = 0; i < size; i++) {
      for (j = 0; j < size; j++, k += 4) {
        var item = xget(j, i);
        d = 1;
        if (item) {
          r = (item[4] * 4 + item[3]);
          g = item[2][0];
          b = item[2][1];
          a = item[2][2];
        } else {
          r = g = b = a = 255;
        }
        bitmap[k + 0] = r;
        bitmap[k + 1] = g;
        bitmap[k + 2] = b;
        bitmap[k + 3] = a;
      }
    }

    texture = makeDataTex(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
      size, size, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, bitmap);
    return texture;
  }

  function doLayout() {
    if (canvas) {
      var margin = 20;
      var size = Math.min(window.innerWidth - margin, window.innerHeight - margin);
      resizeCanvas(size, size);
    }
  }

  function forEach(obj, fn) {
    if (obj) {
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          fn(obj[key], key, obj);
        }
      }
    }
  }


  function reset() {
    initTextures();
  }
  function initialize() {
    resizeCanvas(SIZE, SIZE);
    initGl();
    initBuffers();
    initShaders();
    initTextures();
    initFramebuffers();
  }
  function showOptions() {
    var elem = document.getElementById("options-area");
    forEach(OPTIONS, function(v, k, o) {
      if (k.substring(0, 1) !== '$') {
        var label = document.createElement("label");
        label.textContent = k;
        var input = document.createElement("input");
        input.type = "number";
        input.step = o.$meta && o.$meta.step && o.$meta.step[k];

        function encode(x) {
          var unit = o.$meta && o.$meta.unit && o.$meta.unit[k];
          return (unit !== undefined) ? x * unit : x;
        }
        function decode(x) {
          var unit = o.$meta && o.$meta.unit && o.$meta.unit[k];
          return (unit !== undefined) ? x / unit : x;
        }

        input.value = decode(v);
        input.onchange = function () {
          OPTIONS[k] = encode(+input.value);
        };

        elem.appendChild(label);
        elem.appendChild(document.createElement("br"));
        elem.appendChild(input);
        elem.appendChild(document.createElement("br"));
      }
    });
  }

  function start() {
    obtainCanvas();
    initialize();
    doLayout();
    showOptions();

    scheduleCycle();
  }


  window.onresize = doLayout;
  document.getElementById("btn-reset").onclick = reset;


  self.OPTIONS = OPTIONS;
  return start();
})(self, window, document, Math, Uint8Array, Float32Array, SHADERS);





