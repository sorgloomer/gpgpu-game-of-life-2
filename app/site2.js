(function(Math, document, self){


  var ITERATIONS_PER_CYCLE = 200;

// 3 colors eqqilibrium
  var SIZE = [120, 80];
  var SPAWNRATE = 70;
  var MAX_HEALTH = 60;
  var HEALTH_INC = 25;
  var COLOR_DIFF_COEFF = 0.004;
  var HERBI_STEP_CHANCE = 0.1;
  var GRASS_COLOR_MUTATION_RATE = 4.00;
  var HERBIVORE_COLOR_MUTATION_RATE = 15.00;

  /*
   // multi color, herbs win
   var SIZE = [120, 80];
   var SPAWNRATE = 70;
   var MAX_HEALTH = 60;
   var HEALTH_INC = 25;
   var COLOR_DIFF_COEFF = 0.009;
   var HERBI_STEP_CHANCE = 0.1;
   */

  /*
   var SIZE = [120, 80];
   var SPAWNRATE = 70;
   var MAX_HEALTH = 60;
   var HEALTH_INC = 25;
   var COLOR_DIFF_COEFF = 0.005;
   var HERBI_STEP_CHANCE = 0.1;
   */


  var gameTiles;
  var herbivores = [];
  var dirty_tiles = [];

  function VecT(n) {
    var ArrayType = Float32Array;
    function create(etalon) {
      return etalon
        ? new ArrayType(etalon)
        : new ArrayType(n);
    }
    function set(a, b) {
      for (var i = 0; i < a.length; i++) a[i] = b[i];
    }
    function len2(a) {
      var result = 0.0, tmp;
      for (var i = 0; i < a.length; i++) {
        tmp = a[i];
        result += tmp * tmp;
      }
      return result;
    }
    function len(a) {
      return Math.sqrt(len2(a));
    }
    function dist2(a, b) {
      var result = 0, tmp;
      for (var i = 0; i < a.length; i++) {
        tmp = b[i] - a[i];
        result += tmp * tmp;
      }
      return result;
    }
    function dist(a, b) {
      return Math.sqrt(dist2(a, b));
    }

    return {
      create: create,
      set: set,
      dist2: dist2,
      dist: dist,
      len2: len2,
      len: len
    };
  }

  var Color = VecT(3);
  function rand() {
    return Math.random() * 2 - 1;
  }

  function mutateColor(c, out, rate) {
    out[0] = clampByte(c[0] + rand() * rate);
    out[1] = clampByte(c[1] + rand() * rate);
    out[2] = clampByte(c[2] + rand() * rate);
    return out;
  }
  function mutateGrassColor(c, out) {
    return mutateColor(c, out, GRASS_COLOR_MUTATION_RATE);
  }
  function mutateHerbivoreColor(c, out) {
    return mutateColor(c, out, HERBIVORE_COLOR_MUTATION_RATE);
  }


  function randInt(min, max) {
    return min + ((Math.random() * (max - min + 0.999999)) |0);
  }

  function clamp(integ, min, max) {
    return (integ > max) ? max : ((integ < min) ? min : integ);
  }
  function clampByte(integ) {
    return clamp(integ, 0, 255);
  }



  function happens(chance) {
    return Math.random() < chance;
  }

  function Herbivore(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = Color.create(color);
    this.health = MAX_HEALTH;
    this.spawn = SPAWNRATE;
    this.dead = false;
    this.tile = null;
  }
  Herbivore.prototype.step = function() {
    if (happens(HERBI_STEP_CHANCE)) {
      var nx = this.x + rand();
      var ny = this.y + rand();
      nx = clamp(nx, 0, SIZE[0] - 0.00001);
      ny = clamp(ny, 0, SIZE[1] - 0.00001);
      this.moveTo(nx, ny);
    }
    if (happens(0.5)) {
      if (this.spawn-- < 1) {
        this.spawn = SPAWNRATE;
        var newHerbivore = new Herbivore(this.x, this.y);
        mutateHerbivoreColor(this.color, newHerbivore.color);
        herbivores.push(newHerbivore);
      }
    }
    if (happens(0.5)) {
      if (this.health-- < 1) {
        this.doDie();
      }
    }
    if (this.health < MAX_HEALTH && happens(0.8)) {
      var tile = tileAt(this.x, this.y);
      if (tile && tile.hasGrass) {
        var grassDist = Color.dist(tile.grass, this.color);
        if (happens(1.0 - COLOR_DIFF_COEFF * grassDist)) {
          this.health += HEALTH_INC;
          tile.eatGrass();
        }
      }
    }
  };

  Herbivore.prototype.moveTo = function(x, y) {
    var nTile = tileAt(x, y), oTile = this.tile;
    if (nTile) nTile.addHerbivore(this);
    if (oTile) oTile.removeHerbivore(this);
    this.tile = nTile;
    this.x = x;
    this.y = y;
  };
  Herbivore.prototype.doDie = function() {
    this.dead = true;
    if (this.tile) this.tile.removeHerbivore(this);
  };


  var TEMP_COLOR = Color.create();
  var HEX = "0123456789abcdef";
  function hexbyte(num) {
    num = num | 0;
    return HEX.charAt((num >>> 4) & 0x0f) + HEX.charAt(num & 0x0f);
  }
  function cssColor(color) {
    return "#" + hexbyte(color[0]) + hexbyte(color[1]) + hexbyte(color[2]);
  }

  function Tile(x, y, element) {
    this.x = x;
    this.y = y;
    this.element = element;
    this.hasGrass = false;
    this.grass = Color.create();
    this.herbivores = [];

    this.elementBackgroundColor = '';
    this.elementBorderColor = '';
    this.$dirty = false;
  }

  Tile.prototype.grow = function() {
    if (!this.hasGrass) return;
    var dx = randInt(-1, 1);
    var dy = randInt(-1, 1);
    var tile = tileAt(this.x + dx, this.y + dy);
    if (!tile) return;
    if (tile.hasGrass) return;

    mutateGrassColor(this.grass, TEMP_COLOR);
    tile.setGrass(TEMP_COLOR);
  };

  Tile.prototype.setGrass = function(color) {
    this.hasGrass = true;
    Color.set(this.grass, color);
    var csscol = cssColor(color);
    this.elementBorderColor = csscol;
    if (this.herbivores.length < 1) {
      this.elementBackgroundColor = csscol;
    }
    this.makeDirty();
  };
  Tile.prototype.eatGrass = function() {
    this.hasGrass = false;
    this.elementBorderColor = "#fff";
    if (this.herbivores.length < 1) {
      this.elementBackgroundColor = "#fff";
    }
    this.makeDirty();
  };

  var SUM_HERBI = 0;
  Tile.prototype.addHerbivore = function(h) {
    this.elementBackgroundColor = cssColor(h.color);
    this.makeDirty();
    this.herbivores.push(h);
    SUM_HERBI++;
  };

  Tile.prototype.removeHerbivore = function(h) {
    retain(this.herbivores, function(i) { return i !== h; });
    if (this.herbivores.length < 1) {
      if (this.hasGrass) {
        this.elementBackgroundColor = cssColor(this.grass);
      } else {
        this.elementBackgroundColor = "#fff";
      }
    } else {
      this.elementBackgroundColor = cssColor(this.herbivores[0].color);
    }
    this.makeDirty();
    SUM_HERBI--;
  };

  Tile.prototype.makeDirty = function() {
    if (!this.$dirty) {
      dirty_tiles.push(this);
      this.$dirty = true;
    }
  };

  Tile.updateElement = function(_this) {
    _this.$dirty = false;
    _this.element.style.backgroundColor = _this.elementBackgroundColor;
    _this.element.style.borderColor = _this.elementBorderColor;
  };

  function tileAt(x, y) {
    var o = gameTiles;
    if (!o) return null;
    o = o[y|0];
    if (!o) return null;
    return o[x|0] || null;
  }

  function setupDom() {
    var table = [];
    var elTable = document.getElementById("main-area");
    for (var i = 0; i < SIZE[1]; i++) {
      var elRow = document.createElement('div');
      elRow.classList.add('row');
      var row = [];
      for (var j = 0; j < SIZE[0]; j++) {
        var elCell = document.createElement('span');
        elCell.classList.add('cell');
        var tile = new Tile(j, i, elCell);
        (function(tile) {
          elCell.onmousedown = function() {
            tile.setGrass([0, 255, 0]);
            return false;
          };
        })(tile);
        row.push(tile);
        elRow.appendChild(elCell);
      }
      table.push(row);
      elTable.appendChild(elRow);
    }
    gameTiles = table;
  }

  var START_COLOR = Color.create([0, 0, 0]);

  function setupGame() {
    var i;
    for (i = 0; i < 30; i++) {
      gameTiles[2 * i][0].setGrass(START_COLOR);
      gameTiles[2 * i][2].setGrass(START_COLOR);
      gameTiles[2 * i][5].setGrass(START_COLOR);
      gameTiles[SIZE[1] - 1 - (i>>1)][SIZE[0] - 1 - 3*i].setGrass(START_COLOR);
    }
    gameTiles[10][100].setGrass(START_COLOR);
    for (i = 0; i < 5; i += 2) {
      herbivores.push(new Herbivore(0, i*2, START_COLOR));
    }
  }

  function randPos() {
    return [randInt(0, SIZE[0]-1), randInt(0, SIZE[1]-1)];
  }

  function stepHerbivore(h) {
    return h.step();
  }
  function notDead(h) {
    return !h.dead;
  }
  function retain(array, fn) {
    var i, j;
    for (i = 0, j = 0; i < array.length; i++) {
      if (fn(array[i])) {
        array[j++] = array[i];
      }
    }
    array.length = j;
  }


  function iterateGame() {
    for (var i = 0; i < 100; i++) {
      var pos = randPos();
      var tile = tileAt(pos[0], pos[1]);
      if (tile) tile.grow();
    }

    herbivores.forEach(stepHerbivore);
    retain(herbivores, notDead);
  }


  function updateView() {
    dirty_tiles.forEach(Tile.updateElement);
    dirty_tiles.length = 0;
  }
  function cycle() {
    for (var i = 0; i < ITERATIONS_PER_CYCLE; i++) {
      iterateGame();
    }
    updateView();
  }

  function cycleAndSchedule() {
    cycle();
    schedule();
  }
  function schedule() {
    setTimeout(cycleAndSchedule, 10);
  }

  function onLoaded() {
    setupDom();
    setupGame();
    schedule();
  }

  setTimeout(onLoaded, 0);


  self.info = function() {
    console.log("Herbivore count: " + herbivores.length);
  };
})(Math, document, self);
