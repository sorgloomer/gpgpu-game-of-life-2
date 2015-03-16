
(function(self, window, document, Math, Uint8Array, Float32Array){
  var canvas, gl;

  var shaderGrassGrow, shaderGrassRender, shaderHerbivoreMoveSpawn;
  var shaderHerbivoreRender, shaderWorldRender;

  var vbSquere;
  var texRandom, texPermutation;
  var texGrassA, texHerbivoreA;
  var fbGrassA, fbHerbivoreA;

  var EPS = 1e-5;
  var SIZE = 128;
  var SEED_SIZE = 16;
  
 
  
  var OPTIONS = {
    ITERATIONS_PER_FRAME: 20,
    GRASS_MUTATION_RATE: 6 / 255,
    GRASS_GROW_RATE: 1 / 255,
    HERBIVORE_STEP_RATE: 0.5,
    // Actual apawn rate is 10% of this constant
    HERBIVORE_SPAWN_RATE: 0 / 255,
    HERBIVORE_START_HEALTH: 50 / 255,
    HERBIVORE_INC_HEALTH: 0 / 255,
    HERBIVORE_DEC_HEALTH: 0 / 255,
    HERBIVORE_COLOR_MUTATION_RATE: 1 / 255,
    HERBIVORE_DISLIKE_RATE: 0.2,
    $meta: {
      unit: {
        ITERATIONS_PER_FRAME: 1,
        GRASS_MUTATION_RATE: 1 / 255,
        GRASS_GROW_RATE: 1 / 255,
        HERBIVORE_STEP_RATE: 1 / 255,
        // Actual apawn rate is 10% of this constant
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

  function resizeCanvasBuffer(w, h) {
    canvas.width = w;
    canvas.height = h;
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
    shaderGrassGrow = makeShader(FSHADER_GRASS_GROW, VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uSeed", "uSeed2", "uSeedRatio", "uPixSize",
      "uTexGrass", "uTexRandom", "uTexHerbivore",
      "uGrassMutationRate", "uGrassGrowRate"
    ]);
    shaderGrassRender = makeShader(FSHADER_GRASS_RENDER, VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uTexGrass"
    ]);
    //shaderHerbivoreMoveSpawn = makeShader(FSHADER_HERBIVORE_ITERATE, VSHADER_COMPUTE, [
    shaderHerbivoreMoveSpawn = makeShader(FSHADER_HERBIVORE_MOVE, VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uSeed", "uSeed2", "uSeedRatio", "uPixSize",
      "uTexHerbivore", "uTexRandom", "uTexPermutation", "uTexGrass",
      "uHerbivoreStepRate", "uHerbivoreSpawnRate", "uHerbivoreColorMutationRate",
      "uHerbivoreStartHealth", "uHerbivoreIncHealth", "uHerbivoreDecHealth", "uHerbivoreDislikeRate"
    ]);
    shaderHerbivoreRender = makeShader(FSHADER_HERBIVORE_RENDER, VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uTexHerbivore"
    ]);
    shaderWorldRender = makeShader(FSHADER_WORLD_RENDER, VSHADER_COMPUTE, [
      "aPosition"
    ], [
      "uTexHerbivore", "uTexGrass"
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
    fbGrassA = texGrassA.map(tex_to_framebuffer);
    fbHerbivoreA = texHerbivoreA.map(tex_to_framebuffer);
  }

  function obtainCanvas() {
    canvas = document.getElementById("main-canvas");
  }


  function initTextures() {
    texPermutation = createPermutation(SEED_SIZE, texPermutation);
    texRandom = createRandomTexture(SEED_SIZE, texRandom);

    if (!texGrassA) texGrassA = new Array(2);
    if (!texHerbivoreA) texHerbivoreA = new Array(2);
    texGrassA[0] = createGrassTexture(SIZE, texGrassA[0]);
    texGrassA[1] = createGrassTexture(SIZE, texGrassA[1]);
    texHerbivoreA[0] = createHerbivoreTexture(SIZE, texHerbivoreA[0]);
    texHerbivoreA[1] = createHerbivoreTexture(SIZE, texHerbivoreA[1]);
  }

  function SwapIndex() {
    this.target = 0;
    this.source = 1;
  }
  SwapIndex.prototype.swap = function swap() {
    this.target = this.source;
    this.source = this.source ? 0 : 1;
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
    gl.bindTexture(gl.TEXTURE_2D, texRandom);
    gl.uniform1i(shaderGrassGrow.loc.uTexRandom, 1);
    gl.activeTexture(gl.TEXTURE2);
    // use target buffer, which contains the last state of herbivores, thus delayed with one iteration
    gl.bindTexture(gl.TEXTURE_2D, texHerbivoreA[index_herbivore.target]);
    gl.uniform1i(shaderGrassGrow.loc.uTexHerbivore, 2);

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

  function moveSpawnHerbivores() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbHerbivoreA[index_herbivore.target]);

    gl.useProgram(shaderHerbivoreMoveSpawn.program);

    var iSIZE = 1 / SIZE;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texHerbivoreA[index_herbivore.source]);
    gl.uniform1i(shaderHerbivoreMoveSpawn.loc.uTexHerbivore, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, texRandom);
    gl.uniform1i(shaderHerbivoreMoveSpawn.loc.uTexRandom, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texPermutation);
    gl.uniform1i(shaderHerbivoreMoveSpawn.loc.uTexPermutation, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, texGrassA[index_grass.source]);
    gl.uniform1i(shaderHerbivoreMoveSpawn.loc.uTexGrass, 3);

    gl.uniform2f(shaderHerbivoreMoveSpawn.loc.uSeed, randomPermOffset(), randomPermOffset());
    gl.uniform2f(shaderHerbivoreMoveSpawn.loc.uSeed2, randomPermOffset(), randomPermOffset());
    gl.uniform2f(shaderHerbivoreMoveSpawn.loc.uPixSize, iSIZE, iSIZE);
    gl.uniform1f(shaderHerbivoreMoveSpawn.loc.uSeedRatio, SIZE / SEED_SIZE);
    gl.uniform1f(shaderHerbivoreMoveSpawn.loc.uHerbivoreStepRate,
      OPTIONS.HERBIVORE_STEP_RATE);
    gl.uniform1f(shaderHerbivoreMoveSpawn.loc.uHerbivoreSpawnRate,
      OPTIONS.HERBIVORE_SPAWN_RATE);
    gl.uniform1f(shaderHerbivoreMoveSpawn.loc.uHerbivoreStartHealth,
      OPTIONS.HERBIVORE_START_HEALTH);
    gl.uniform1f(shaderHerbivoreMoveSpawn.loc.uHerbivoreIncHealth,
      OPTIONS.HERBIVORE_INC_HEALTH);
    gl.uniform1f(shaderHerbivoreMoveSpawn.loc.uHerbivoreDecHealth,
      OPTIONS.HERBIVORE_DEC_HEALTH);
    gl.uniform1f(shaderHerbivoreMoveSpawn.loc.uHerbivoreDislikeRate,
      OPTIONS.HERBIVORE_DISLIKE_RATE);
    gl.uniform3f(shaderHerbivoreMoveSpawn.loc.uHerbivoreColorMutationRate,
      OPTIONS.HERBIVORE_COLOR_MUTATION_RATE,
      OPTIONS.HERBIVORE_COLOR_MUTATION_RATE,
      OPTIONS.HERBIVORE_COLOR_MUTATION_RATE
    );

    drawSquare(shaderHerbivoreMoveSpawn);
    index_herbivore.swap();
  }

  var MAPARRAY = new Uint8Array(SIZE * SIZE * 4);
  function countHerbi() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbHerbivoreA[index_herbivore.source]);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, MAPARRAY);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    var count = 0;
    for (var i = 3; i < MAPARRAY.length; i += 4) {
      if (MAPARRAY[i] > 0) count++;
    }
    return count;
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

    drawSquare(shaderWorldRender);
  }

  function cycle() {
    for (var i = 0; i < OPTIONS.ITERATIONS_PER_FRAME; i++) {
      growGrass();
      moveSpawnHerbivores();
      var cnt = countHerbi();
      if (cnt !== 1) {
        console.log(cnt);
        OPTIONS.ITERATIONS_PER_FRAME = 0;
        break;
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, SIZE, SIZE);
    gl.clearColor(0, 0, 0.2, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    //renderWorld();
    renderHerbivores();
  }


  function handleFrame() {
    cycle();
    scheduleCycle();
  }
  function scheduleCycle() {
    // self.setTimeout(handleFrame, 500);
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

  function createGrassTexture(size, texture) {
    var i;
    var bitmap = new Uint8Array(size * size * 4);

    function setc(x, y, c) {
      var b = (y * size + x) * 4;
      for (var i = 0; i < 4; i++) bitmap[b + i] = c[i];
    }
    var COLOR = [0, 255, 0, 255];
    for (i = 0; i < 100; i++) {
      setc(i, 0, COLOR);
      setc(0, i, COLOR);
    }
    setc(size-1, size-1, COLOR);

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
    var hsize = (size/2)|0;
    var COLOR = [0, 255, 0, 255];

    /*
    for (i = 0; i < 20; i++) {
      setc(i * 3 + hsize, +hsize, COLOR);
      setc(hsize, i * 3 + hsize, COLOR);
    }
    */

    setc(hsize, hsize, COLOR);

    texture = makeDataTex(texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA,
      size, size, 0, gl.RGBA,
      gl.UNSIGNED_BYTE, bitmap);
    return texture;
  }

  function floatToByte(x) {
    return (x * (256 - EPS))|0;
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

    for (i = 0; i < ccount; ++i) {
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



  var VSHADER_COMPUTE = [
    "precision highp float;",
    "",
    "attribute vec2 aPosition;",
    "varying vec2 vPosition;",
    "varying vec2 vRandomCoord;",
    "varying vec2 vRandomCoord2;",
    "uniform vec2 uSeed;",
    "uniform vec2 uSeed2;",
    "uniform float uSeedRatio;",
    "",
    "void main() {",
    "  vPosition = aPosition;",
    "  vRandomCoord = aPosition * uSeedRatio + uSeed;",
    "  vRandomCoord2 = aPosition * uSeedRatio + uSeed2;",
    "  gl_Position = vec4(",
    "    aPosition.x * 2.0 - 1.0,",
    "    aPosition.y * 2.0 - 1.0,",
    "    0.0, 1.0);",
    "}"
  ].join('\n');
  var FSHADER_GRASS_RENDER = [
    "precision mediump float;",
    "varying vec2 vPosition;",
    "uniform sampler2D uTexGrass;",
    "void main() {",
    "  vec4 c = texture2D(uTexGrass, vPosition);",
    "  if (c.a * 255.0 > 254.0) {",
    "    gl_FragColor = vec4(c.rgb * 0.9, 1.0);",
    "  } else {",
    "    gl_FragColor = vec4(1.0);",
    "  }",
    "}"
  ].join('\n');

  var FSHADER_HERBIVORE_RENDER = [
    "precision mediump float;",
    "varying vec2 vPosition;",
    "uniform sampler2D uTexGrass;",
    "void main() {",
    "  vec4 c = texture2D(uTexGrass, vPosition);",
    "  if (c.a > 0.0001) {",
    "    gl_FragColor = vec4(c.rgb * 1.0, 1.0);",
    "  } else {",
    "    gl_FragColor = vec4(c.rgb * 0.3, 1.0);",
    "  }",
    "}"
  ].join('\n');
  var FSHADER_WORLD_RENDER = [
    "precision mediump float;",
    "varying vec2 vPosition;",
    "uniform sampler2D uTexGrass;",
    "uniform sampler2D uTexHerbivore;",
    "void main() {",
    "  vec4 g = texture2D(uTexGrass, vPosition);",
    "  vec4 h = texture2D(uTexHerbivore, vPosition);",
    "  if (h.a > 0.0) {",
    "    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);",
    "  } else if (g.a > 0.0) {",
    "    gl_FragColor = vec4(0.1 + g.rgb * 0.9, 1.0);",
    "  } else {",
    "    gl_FragColor = vec4(0.0);",
    "  }",
    "}"
  ].join('\n');

  var FSHADER_HERBIVORE_ITERATE = [
    "precision mediump float;",
    "",
    "varying vec2 vPosition;",
    "varying vec2 vRandomCoord;",
    "varying vec2 vRandomCoord2;",
    "uniform sampler2D uTexHerbivore;",
    "uniform sampler2D uTexGrass;",
    "uniform sampler2D uTexPermutation;",
    "uniform sampler2D uTexRandom;",
    "uniform vec2 uPixSize;",
    "uniform float uHerbivoreStepRate;",
    "uniform float uHerbivoreSpawnRate;",
    "uniform float uHerbivoreStartHealth;",
    "uniform float uHerbivoreIncHealth;",
    "uniform float uHerbivoreDecHealth;",
    "uniform float uHerbivoreDislikeRate;",
    "uniform vec3 uHerbivoreColorMutationRate;",
    "",
    "vec2 step;",
    "vec4 rnd, rnd2, loc_herbi, rem_herbi, loc_grass, perm;",
    "",
    "bool herbivore_lives(vec4 herbi) {",
    "  return herbi.a > 0.0001;",
    "}",
    "",
    "bool herbivore_spawns() {",
    "  return perm.z < 0.1 && perm.w < uHerbivoreSpawnRate - (0.5 / 255.0);",
    "}",
    "",
    "vec4 herbivore_spawn() {",
    "  vec3 col = loc_herbi.rgb + (rnd.rgb * 2.0 - 1.0) * uHerbivoreColorMutationRate;",
    "  return vec4(clamp(col, 0.0, 1.0), uHerbivoreStartHealth);",
    "}",
    "",
    "void main() {",
    "  rnd = texture2D(uTexRandom, vRandomCoord);",
    "  rnd2 = texture2D(uTexRandom, vRandomCoord2);",
    "  loc_herbi = texture2D(uTexHerbivore, vPosition);",
    "",
    "  loc_grass = texture2D(uTexGrass, vPosition);",
    "  if (herbivore_lives(loc_herbi)",
    "        && loc_grass.a > 0.0",
    "        && rnd2.x < 1.0 - uHerbivoreDislikeRate * distance(loc_herbi.rgb, loc_grass.rgb)) {",
    "    loc_herbi.a = min(1.0, loc_herbi.a + uHerbivoreIncHealth);",
    "  }",
    "  loc_herbi.a = max(0.0, loc_herbi.a - uHerbivoreDecHealth);",
    "",
    "  perm = texture2D(uTexPermutation, vRandomCoord);",
    "  gl_FragColor = loc_herbi;",
    "  float disc = perm.x * 255.0;",
    "  bool spawns = herbivore_spawns();",
    "  if (disc < 254.5 && (perm.y < uHerbivoreStepRate || spawns)) {",
    "    if (disc < 3.5) {",
    "      if (disc < 1.5) {",
    "        if (disc < 0.5) {",
    "          step = vec2( 1.0, -1.0);",
    "        } else {",
    "          step = vec2( 1.0,  0.0);",
    "        }",
    "      } else {",
    "        if (disc < 2.5) {",
    "          step = vec2( 1.0,  1.0);",
    "        } else {",
    "          step = vec2( 0.0,  1.0);",
    "        }",
    "      }",
    "    } else {",
    "      if (disc < 5.5) {",
    "        if (disc < 4.5) {",
    "          step = vec2(-1.0,  1.0);",
    "        } else {",
    "          step = vec2(-1.0,  0.0);",
    "        }",
    "      } else {",
    "        if (disc < 6.5) {",
    "          step = vec2(-1.0, -1.0);",
    "        } else {",
    "          step = vec2( 0.0, -1.0);",
    "        }",
    "      }",
    "    }",
    "",
    "    rem_herbi = texture2D(uTexHerbivore, vPosition + step * uPixSize);",
    "    if (herbivore_lives(loc_herbi)) {",
    "      if (herbivore_lives(rem_herbi)) {",
    "      } else {",
    "        if (spawns) {",
    "          // gl_FragColor = herbivore_spawn();",
    "        } else {",
    "          gl_FragColor = vec4(0.0);",
    "        }",
    "      }",
    "    } else {",
    "      if (herbivore_lives(rem_herbi)) {",
    "        gl_FragColor = rem_herbi;",
    "      }",
    "    }",
    "  }",
    "}"
  ].join('\n');

  var FSHADER_HERBIVORE_MOVE = [
    "precision mediump float;",
    "",
    "varying vec2 vPosition;",
    "varying vec2 vRandomCoord;",
    "uniform sampler2D uTexHerbivore;",
    "uniform sampler2D uTexPermutation;",
    "uniform vec2 uPixSize;",
    "uniform float uHerbivoreStepRate;",
    "",
    "vec2 step;",
    "vec4 rnd, rnd2, loc_herbi, rem_herbi, loc_grass, perm;",
    "",
    "bool herbivore_lives(vec4 herbi) {",
    "  return herbi.a > 0.0001;",
    "}",
    "",
    "",
    "void main() {",
    "  loc_herbi = texture2D(uTexHerbivore, vPosition);",
    "  perm = texture2D(uTexPermutation, vRandomCoord);",
    "  gl_FragColor = loc_herbi;",
    "  float disc = perm.x * 255.0;",
    "  if (disc < 254.5 && (perm.y < uHerbivoreStepRate)) {",
    "    if (disc < 3.5) {",
    "      if (disc < 1.5) {",
    "        if (disc < 0.5) {",
    "          step = vec2( 1.0, -1.0);",
    "        } else {",
    "          step = vec2( 1.0,  0.0);",
    "        }",
    "      } else {",
    "        if (disc < 2.5) {",
    "          step = vec2( 1.0,  1.0);",
    "        } else {",
    "          step = vec2( 0.0,  1.0);",
    "        }",
    "      }",
    "    } else {",
    "      if (disc < 5.5) {",
    "        if (disc < 4.5) {",
    "          step = vec2(-1.0,  1.0);",
    "        } else {",
    "          step = vec2(-1.0,  0.0);",
    "        }",
    "      } else {",
    "        if (disc < 6.5) {",
    "          step = vec2(-1.0, -1.0);",
    "        } else {",
    "          step = vec2( 0.0, -1.0);",
    "        }",
    "      }",
    "    }",
    "",
    "    rem_herbi = texture2D(uTexHerbivore, vPosition + step * uPixSize);",
    "    if (herbivore_lives(loc_herbi)) {",
    "      if (herbivore_lives(rem_herbi)) {",
    "      } else {",
    "        gl_FragColor = vec4(0.0);",
    "      }",
    "    } else {",
    "      if (herbivore_lives(rem_herbi)) {",
    "        gl_FragColor = rem_herbi;",
    "      }",
    "    }",
    "  }",
    "  gl_FragColor.r = fract(vRandomCoord.x * 0.5) < 0.5 ? 1.0 : 0.5;",
    "  gl_FragColor.g = fract(vRandomCoord.y * 0.5) < 0.5 ? 1.0 : 0.5;",
    "}"
  ].join('\n');

  var FSHADER_GRASS_GROW = [
    "precision mediump float;",
    "",
    "varying vec2 vPosition;",
    "varying vec2 vRandomCoord;",
    "varying vec2 vRandomCoord2;",
    "uniform vec3 uGrassMutationRate;",
    "uniform float uGrassGrowRate;",
    "uniform mediump vec2 uPixSize;",
    "uniform sampler2D uTexRandom;",
    "uniform sampler2D uTexGrass;",
    "uniform sampler2D uTexHerbivore;",
    "",
    "const float DARK = 0.0;",
    "const float LIGH = 0.8;",
    "",
    "vec4 g[8];",
    "vec4 rnd, rnd2, herbi, grass;",
    "",
    "vec3 mutateColor(vec3 c) {",
    "  return clamp(c.rgb + (rnd.xyz * 2.0 - vec3(1.0)) * uGrassMutationRate, 0.0, 1.0);",
    "}",
    "",
    "void grow(vec4 c) {",
    "  if (c.a * 255.0 > 254.0) {",
    "    gl_FragColor = vec4(mutateColor(c.rgb), 1.0);",
    "  }",
    "}",
    "",
    "void main() {",
    "  grass = texture2D(uTexGrass, vPosition);",
    "  herbi = texture2D(uTexHerbivore, vPosition);",
    "  if (herbi.a > 0.0) {",
    "    gl_FragColor = vec4(0.0);",
    "    return;",
    "  }",
    "  gl_FragColor = grass;",
    "  rnd = texture2D(uTexRandom, vRandomCoord);",
    "  rnd2 = texture2D(uTexRandom, vRandomCoord2);",
    "  if (grass.a * 255.0 < 254.5 && rnd2.x < uGrassGrowRate) {",
    "    float disc = rnd.w * 255.0 / 16.0;",
    "    g[0] = texture2D(uTexGrass, vPosition + vec2(        0.0, -uPixSize.y));",
    "    g[1] = texture2D(uTexGrass, vPosition + vec2( uPixSize.x, -uPixSize.y));",
    "    g[2] = texture2D(uTexGrass, vPosition + vec2( uPixSize.x,         0.0));",
    "    g[3] = texture2D(uTexGrass, vPosition + vec2( uPixSize.x,  uPixSize.y));",
    "    g[4] = texture2D(uTexGrass, vPosition + vec2(        0.0,  uPixSize.y));",
    "    g[5] = texture2D(uTexGrass, vPosition + vec2(-uPixSize.x,  uPixSize.y));",
    "    g[6] = texture2D(uTexGrass, vPosition + vec2(-uPixSize.x,         0.0));",
    "    g[7] = texture2D(uTexGrass, vPosition + vec2(-uPixSize.x, -uPixSize.y));",
    "    if (disc < 7.5) {",
    "      if (disc < 3.5) {",
    "        if (disc < 1.5) {",
    "          if (disc < 0.5) {",
    "            grow(g[0]); grow(g[1]); grow(g[2]); grow(g[3]); grow(g[4]); grow(g[5]); grow(g[6]); grow(g[7]);",
    "          } else {",
    "            grow(g[1]); grow(g[2]); grow(g[3]); grow(g[4]); grow(g[5]); grow(g[6]); grow(g[7]); grow(g[0]);",
    "          }",
    "        } else {",
    "          if (disc < 2.5) {",
    "            grow(g[2]); grow(g[3]); grow(g[4]); grow(g[5]); grow(g[6]); grow(g[7]); grow(g[0]); grow(g[1]);",
    "          } else {",
    "            grow(g[3]); grow(g[4]); grow(g[5]); grow(g[6]); grow(g[7]); grow(g[0]); grow(g[1]); grow(g[2]);",
    "          }",
    "        }",
    "      } else {",
    "        if (disc < 5.5) {",
    "          if (disc < 4.5) {",
    "            grow(g[4]); grow(g[5]); grow(g[6]); grow(g[7]); grow(g[0]); grow(g[1]); grow(g[2]); grow(g[3]);",
    "          } else {",
    "            grow(g[5]); grow(g[6]); grow(g[7]); grow(g[0]); grow(g[1]); grow(g[2]); grow(g[3]); grow(g[4]);",
    "          }",
    "        } else {",
    "          if (disc < 6.5) {",
    "            grow(g[6]); grow(g[7]); grow(g[0]); grow(g[1]); grow(g[2]); grow(g[3]); grow(g[4]); grow(g[5]);",
    "          } else {",
    "            grow(g[7]); grow(g[0]); grow(g[1]); grow(g[2]); grow(g[3]); grow(g[4]); grow(g[5]); grow(g[6]);",
    "          }",
    "        }",
    "      }",
    "    } else {",
    "      if (disc < 11.5) {",
    "        if (disc < 9.5) {",
    "          if (disc < 8.5) {",
    "            grow(g[7]); grow(g[6]); grow(g[5]); grow(g[4]); grow(g[3]); grow(g[2]); grow(g[1]); grow(g[0]);",
    "          } else {",
    "            grow(g[6]); grow(g[5]); grow(g[4]); grow(g[3]); grow(g[2]); grow(g[1]); grow(g[0]); grow(g[7]);",
    "          }",
    "        } else {",
    "          if (disc < 10.5) {",
    "            grow(g[5]); grow(g[4]); grow(g[3]); grow(g[2]); grow(g[1]); grow(g[0]); grow(g[7]); grow(g[6]);",
    "          } else {",
    "            grow(g[4]); grow(g[3]); grow(g[2]); grow(g[1]); grow(g[0]); grow(g[7]); grow(g[6]); grow(g[5]);",
    "          }",
    "        }",
    "      } else {",
    "        if (disc < 13.5) {",
    "          if (disc < 12.5) {",
    "            grow(g[3]); grow(g[2]); grow(g[1]); grow(g[0]); grow(g[7]); grow(g[6]); grow(g[5]); grow(g[4]);",
    "          } else {",
    "            grow(g[2]); grow(g[1]); grow(g[0]); grow(g[7]); grow(g[6]); grow(g[5]); grow(g[4]); grow(g[3]);",
    "          }",
    "        } else {",
    "          if (disc < 14.5) {",
    "            grow(g[1]); grow(g[0]); grow(g[7]); grow(g[6]); grow(g[5]); grow(g[4]); grow(g[3]); grow(g[2]);",
    "          } else {",
    "            grow(g[0]); grow(g[7]); grow(g[6]); grow(g[5]); grow(g[4]); grow(g[3]); grow(g[2]); grow(g[1]);",
    "          }",
    "        }",
    "      }",
    "    }",
    "  }",
    "}"
  ].join('\n');


  function doLayout() {
    if (canvas) {
      var margin = 20;
      var size = Math.min(window.innerWidth - margin, window.innerHeight - margin);
      canvas.style.width = "" + size + "px";
      canvas.style.height = "" + size + "px";
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
    resizeCanvasBuffer(SIZE, SIZE);
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
})(self, window, document, Math, Uint8Array, Float32Array);





