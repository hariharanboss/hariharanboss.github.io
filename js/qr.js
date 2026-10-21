/* ==========================================================
   GetNumber — qr.js
   Dependency-free QR Code generator (byte mode).
   Implements: GF(256) arithmetic, Reed-Solomon ECC, block
   interleaving, function patterns, 8 mask patterns, penalty
   scoring, format/version info.
   Renders to SVG or Canvas. No network, works offline.
   ========================================================== */
(function (global) {
  'use strict';

  var ECL = { L: 0, M: 1, Q: 2, H: 3 };
  var ECL_FORMAT_BITS = [1, 0, 3, 2]; // L, M, Q, H

  /* ECC codewords per block, indexed [ecl][version-1] */
  var ECC_PER_BLOCK = [
    [7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
    [13,22,18,26,18,24,18,22,20,24,28,26,24,20,30,24,28,28,26,30,28,30,30,30,30,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
    [17,28,22,16,22,28,26,26,24,28,24,28,22,24,24,30,28,28,26,28,30,24,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30,30]
  ];

  /* number of error-correction blocks, indexed [ecl][version-1] */
  var NUM_BLOCKS = [
    [1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25],
    [1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49],
    [1,1,2,2,4,4,6,6,8,8,8,10,12,16,12,17,16,18,21,20,23,23,25,27,29,34,34,35,38,40,43,45,48,51,53,56,59,62,65,68],
    [1,1,2,4,4,4,5,6,8,8,11,11,16,16,18,16,19,21,25,25,25,34,30,32,35,37,40,42,45,48,51,54,57,60,63,66,70,74,77,81]
  ];

  /* ---------- GF(256) ---------- */
  var EXP = new Uint8Array(512);
  var LOG = new Uint8Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (var j = 255; j < 512; j++) EXP[j] = EXP[j - 255];
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return EXP[LOG[a] + LOG[b]];
  }

  /* ---------- Reed-Solomon ---------- */
  function rsDivisor(degree) {
    var result = new Uint8Array(degree);
    result[degree - 1] = 1;
    var root = 1;
    for (var i = 0; i < degree; i++) {
      for (var j = 0; j < degree; j++) {
        result[j] = gfMul(result[j], root);
        if (j + 1 < degree) result[j] ^= result[j + 1];
      }
      root = gfMul(root, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    var result = new Uint8Array(divisor.length);
    for (var i = 0; i < data.length; i++) {
      var factor = data[i] ^ result[0];
      result.copyWithin(0, 1);
      result[divisor.length - 1] = 0;
      for (var j = 0; j < divisor.length; j++) {
        result[j] ^= gfMul(divisor[j], factor);
      }
    }
    return result;
  }

  /* ---------- capacity maths ---------- */
  function numRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function numDataCodewords(ver, ecl) {
    return Math.floor(numRawDataModules(ver) / 8) -
      ECC_PER_BLOCK[ecl][ver - 1] * NUM_BLOCKS[ecl][ver - 1];
  }

  function alignmentPositions(ver) {
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    // step = floor[(size - 13) / (numAlign*2 - 2)] * 2, with a special case for v32
    var step = (ver === 32)
      ? 26
      : Math.floor((ver * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2;

    // Ascending order: result[0] is always 6 (the finder-pattern column),
    // the remaining positions run down from the bottom-right corner.
    var result = new Array(numAlign);
    result[0] = 6;
    for (var i = numAlign - 1, pos = ver * 4 + 10; i >= 1; i--, pos -= step) {
      result[i] = pos;
    }
    return result;
  }

  /* ---------- bit buffer ---------- */
  function BitBuf() { this.bits = []; }
  BitBuf.prototype.push = function (val, len) {
    for (var i = len - 1; i >= 0; i--) this.bits.push((val >>> i) & 1);
  };
  BitBuf.prototype.size = function () { return this.bits.length; };

  /* ---------- encoder ---------- */
  function encode(text, opts) {
    opts = opts || {};
    var eclName = String(opts.ecl || 'M').toUpperCase();
    if (!(eclName in ECL)) eclName = 'M';
    var ecl = ECL[eclName];

    var bytes = utf8Bytes(String(text));
    var minVer = Math.max(1, opts.minVersion || 1);
    var maxVer = Math.min(40, opts.maxVersion || 40);

    var ver = -1;
    for (var v = minVer; v <= maxVer; v++) {
      var ccBits = v <= 9 ? 8 : 16;
      var need = 4 + ccBits + bytes.length * 8;
      if (need <= numDataCodewords(v, ecl) * 8) { ver = v; break; }
    }
    if (ver < 0) throw new Error('QR: data is too long for a single QR code.');

    /* --- build the bit stream --- */
    var bb = new BitBuf();
    bb.push(0x4, 4);                       // byte mode
    bb.push(bytes.length, ver <= 9 ? 8 : 16);
    for (var i = 0; i < bytes.length; i++) bb.push(bytes[i], 8);

    var capacityBits = numDataCodewords(ver, ecl) * 8;
    bb.push(0, Math.min(4, capacityBits - bb.size()));   // terminator
    bb.push(0, (8 - (bb.size() % 8)) % 8);                 // byte align

    var padByte = 0xec;
    while (bb.size() < capacityBits) {
      bb.push(padByte, 8);
      padByte = (padByte === 0xec) ? 0x11 : 0xec;
    }

    var dataBytes = new Uint8Array(bb.size() / 8);
    for (var k = 0; k < bb.bits.length; k++) {
      if (bb.bits[k]) dataBytes[k >>> 3] |= (0x80 >>> (k & 7));
    }

    /* --- split into blocks, add ECC, interleave --- */
    var codewords = addEccAndInterleave(dataBytes, ver, ecl);

    /* --- draw --- */
    var size = ver * 4 + 17;
    var modules = [], isFn = [];
    for (var r = 0; r < size; r++) {
      modules.push(new Array(size).fill(false));
      isFn.push(new Array(size).fill(false));
    }

    var self = {
      size: size,
      modules: modules,
      isFn: isFn,
      setFn: function (x, y, dark) {
        if (x < 0 || y < 0 || x >= size || y >= size) return;
        modules[y][x] = !!dark;
        isFn[y][x] = true;
      }
    };

    drawFunctionPatterns(self, ver);
    drawCodewords(self, codewords);

    /* --- choose the best mask --- */
    var bestMask = 0, bestPenalty = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(self, m);
      drawFormatBits(self, ecl, m, ver);
      var p = penaltyScore(self.modules, size);
      if (p < bestPenalty) { bestPenalty = p; bestMask = m; }
      applyMask(self, m); // undo
    }
    applyMask(self, bestMask);
    drawFormatBits(self, ecl, bestMask, ver);

    return { size: size, modules: modules, version: ver, mask: bestMask, ecl: eclName };
  }

  function addEccAndInterleave(dataBytes, ver, ecl) {
    var numBlocks = NUM_BLOCKS[ecl][ver - 1];
    var eccLen = ECC_PER_BLOCK[ecl][ver - 1];
    var rawCodewords = Math.floor(numRawDataModules(ver) / 8);
    var numShort = numBlocks - (rawCodewords % numBlocks);
    var shortLen = Math.floor(rawCodewords / numBlocks);

    var dataLens = [];
    for (var i = 0; i < numBlocks; i++) {
      dataLens.push(shortLen - eccLen + (i < numShort ? 0 : 1));
    }

    var divisor = rsDivisor(eccLen);
    var blocks = [];
    var pos = 0;
    for (var j = 0; j < numBlocks; j++) {
      var d = dataBytes.subarray(pos, pos + dataLens[j]);
      pos += dataLens[j];
      blocks.push({ d: d, e: rsRemainder(d, divisor) });
    }

    var out = [];
    var maxData = Math.max.apply(null, dataLens);
    for (var x = 0; x < maxData; x++) {
      for (var y = 0; y < numBlocks; y++) {
        if (x < dataLens[y]) out.push(blocks[y].d[x]);
      }
    }
    for (var e = 0; e < eccLen; e++) {
      for (var z = 0; z < numBlocks; z++) out.push(blocks[z].e[e]);
    }
    return out;
  }

  function drawFunctionPatterns(q, ver) {
    var size = q.size;

    // timing patterns
    for (var i = 0; i < size; i++) {
      q.setFn(6, i, i % 2 === 0);
      q.setFn(i, 6, i % 2 === 0);
    }
    // finder patterns (3 corners)
    drawFinder(q, 3, 3);
    drawFinder(q, size - 4, 3);
    drawFinder(q, 3, size - 4);
    // alignment patterns
    var pos = alignmentPositions(ver);
    var n = pos.length;
    for (var a = 0; a < n; a++) {
      for (var b = 0; b < n; b++) {
        var isFinderCorner =
          (a === 0 && b === 0) ||
          (a === 0 && b === n - 1) ||
          (a === n - 1 && b === 0);
        if (!isFinderCorner) drawAlignment(q, pos[a], pos[b]);
      }
    }
    // reserve format info areas (drawn properly later)
    drawFormatBits(q, ECL.M, 0, ver);
    if (ver >= 7) drawVersionBits(q, ver);
  }

  function drawFinder(q, cx, cy) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        q.setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  }

  function drawAlignment(q, cx, cy) {
    for (var dy = -2; dy <= 2; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        q.setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }

  function drawFormatBits(q, ecl, mask, ver) {
    var size = q.size;
    var data = (ECL_FORMAT_BITS[ecl] << 3) | mask;
    var rem = data;
    for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412;

    var bit = function (i) { return ((bits >>> i) & 1) !== 0; };

    // first copy
    for (var a = 0; a <= 5; a++) q.setFn(8, a, bit(a));
    q.setFn(8, 7, bit(6));
    q.setFn(8, 8, bit(7));
    q.setFn(7, 8, bit(8));
    for (var b = 9; b < 15; b++) q.setFn(14 - b, 8, bit(b));

    // second copy
    for (var c = 0; c < 8; c++) q.setFn(size - 1 - c, 8, bit(c));
    for (var d = 8; d < 15; d++) q.setFn(8, size - 15 + d, bit(d));

    q.setFn(8, size - 8, true); // always-dark module
  }

  function drawVersionBits(q, ver) {
    var size = q.size;
    var rem = ver;
    for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    var bits = (ver << 12) | rem;
    for (var j = 0; j < 18; j++) {
      var dark = ((bits >>> j) & 1) !== 0;
      var a = size - 11 + (j % 3);
      var b = Math.floor(j / 3);
      q.setFn(a, b, dark);
      q.setFn(b, a, dark);
    }
  }

  function drawCodewords(q, codewords) {
    var size = q.size;
    var i = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!q.isFn[y][x] && i < codewords.length * 8) {
            q.modules[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0;
            i++;
          }
        }
      }
    }
  }

  function applyMask(q, mask) {
    var size = q.size;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (q.isFn[y][x]) continue;
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = ((x * y) % 2 + (x * y) % 3) === 0; break;
          case 6: invert = (((x * y) % 2 + (x * y) % 3) % 2) === 0; break;
          case 7: invert = ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0; break;
          default: invert = false;
        }
        if (invert) q.modules[y][x] = !q.modules[y][x];
      }
    }
  }

  /* ---------- penalty scoring ---------- */
  function finderPenaltyAddHistory(size, currentRunLength, runHistory) {
    if (runHistory[0] === 0) currentRunLength += size;
    runHistory.pop();
    runHistory.unshift(currentRunLength);
  }

  function finderPenaltyCountPatterns(runHistory) {
    var n = runHistory[1];
    var core = n > 0 &&
      runHistory[2] === runHistory[4] &&
      runHistory[3] === n * 3 &&
      runHistory[4] === n &&
      runHistory[5] === n;
    return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0) +
           (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0);
  }

  function finderPenaltyTerminateAndCount(size, currentRunColor, currentRunLength, runHistory) {
    if (currentRunColor) {
      finderPenaltyAddHistory(size, currentRunLength, runHistory);
      currentRunLength = 0;
    }
    currentRunLength += size;
    finderPenaltyAddHistory(size, currentRunLength, runHistory);
    return finderPenaltyCountPatterns(runHistory);
  }

  function penaltyScore(modules, size) {
    var result = 0, x, y;

    for (y = 0; y < size; y++) {
      var runColor = false, runLen = 0;
      var hist = [0, 0, 0, 0, 0, 0, 0];
      for (x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) result += 3;
          else if (runLen > 5) result++;
        } else {
          finderPenaltyAddHistory(size, runLen, hist);
          if (!runColor) result += finderPenaltyCountPatterns(hist) * 40;
          runColor = modules[y][x];
          runLen = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(size, runColor, runLen, hist) * 40;
    }

    for (x = 0; x < size; x++) {
      var runColor2 = false, runLen2 = 0;
      var hist2 = [0, 0, 0, 0, 0, 0, 0];
      for (y = 0; y < size; y++) {
        if (modules[y][x] === runColor2) {
          runLen2++;
          if (runLen2 === 5) result += 3;
          else if (runLen2 > 5) result++;
        } else {
          finderPenaltyAddHistory(size, runLen2, hist2);
          if (!runColor2) result += finderPenaltyCountPatterns(hist2) * 40;
          runColor2 = modules[y][x];
          runLen2 = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(size, runColor2, runLen2, hist2) * 40;
    }

    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var c = modules[y][x];
        if (c === modules[y][x + 1] && c === modules[y + 1][x] && c === modules[y + 1][x + 1]) {
          result += 3;
        }
      }
    }

    var dark = 0;
    for (y = 0; y < size; y++) {
      for (x = 0; x < size; x++) if (modules[y][x]) dark++;
    }
    var total = size * size;
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k * 10;

    return result;
  }

  /* ---------- helpers ---------- */
  function utf8Bytes(str) {
    if (global.TextEncoder) return new global.TextEncoder().encode(str);
    var arr = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) arr.push(c);
      else if (c < 0x800) arr.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      else arr.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
    return new Uint8Array(arr);
  }

  /* ---------- renderers ---------- */
  function toSvg(text, opts) {
    opts = opts || {};
    var qr = encode(text, opts);
    var quiet = opts.quiet == null ? 3 : opts.quiet;
    var size = qr.size;
    var total = size + quiet * 2;
    var dark = opts.dark || '#000000';
    var light = opts.light || '#ffffff';

    var path = [];
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (qr.modules[y][x]) {
          path.push('M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z');
        }
      }
    }

    var px = opts.pixelSize || 4;
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (total * px) +
      '" height="' + (total * px) + '" viewBox="0 0 ' + total + ' ' + total +
      '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + total + '" height="' + total + '" fill="' + light + '"/>' +
      '<path d="' + path.join('') + '" fill="' + dark + '"/>' +
      '</svg>';
  }

  function toCanvas(text, canvas, opts) {
    opts = opts || {};
    var qr = encode(text, opts);
    var quiet = opts.quiet == null ? 3 : opts.quiet;
    var total = qr.size + quiet * 2;
    var px = opts.pixelSize || 4;

    canvas.width = total * px;
    canvas.height = total * px;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.light || '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = opts.dark || '#000000';
    for (var y = 0; y < qr.size; y++) {
      for (var x = 0; x < qr.size; x++) {
        if (qr.modules[y][x]) {
          ctx.fillRect((x + quiet) * px, (y + quiet) * px, px, px);
        }
      }
    }
    return canvas;
  }

  global.QR = {
    encode: encode,
    toSvg: toSvg,
    toCanvas: toCanvas
  };
})(window);
