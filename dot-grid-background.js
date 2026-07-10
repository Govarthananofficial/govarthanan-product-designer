/*!
 * DotGridBackground — reusable, mouse-reactive canvas dot-grid background.
 *
 * Framework-agnostic. Mount either declaratively or imperatively:
 *
 *   <header class="hero" data-dot-grid></header>
 *
 *   const bg = new DotGridBackground(document.querySelector('.hero'), {
 *     spacing: 22,
 *     color: '#FFFFFF',
 *   });
 *   // later, if the element is ever removed from the page:
 *   bg.destroy();
 *
 * The container element must be able to host an absolutely-positioned
 * child (the module will set `position: relative` on it automatically if
 * it's still `position: static`). All other content in the container
 * should sit in normal flow above the canvas — this module never touches
 * z-index on anything but its own canvas.
 *
 * No dependency on GSAP. If `window.gsap` is present at construction time,
 * its shared ticker drives the animation loop instead of a private
 * requestAnimationFrame loop (one fewer competing rAF loop on pages that
 * already run GSAP/ScrollTrigger animations), and `gsap.utils.interpolate`
 * is used for the per-frame lerp. Both paths produce identical motion.
 */
(function (global, doc) {
  'use strict';

  var DEFAULTS = {
    spacing: 22,                // px between dots at rest, desktop
    radius: 1,                   // dot radius at rest, px
    maxRadius: 2.75,             // dot radius at full proximity to cursor, px
    color: '#FFFFFF',           // hex color
    opacity: 0.18,               // fill opacity (0-1) — keep low, this is a background
    influenceRadius: 170,       // px — cursor proximity that begins affecting a dot
    maxDisplacement: 22,        // px — max distance a dot can be pushed
    ease: 0.12,                  // 0-1 lerp factor per tick; higher = snappier, lower = softer
    maxFPS: 60,                  // animation loop cap
    mode: 'repel',              // 'repel' (dots pushed away from cursor) | 'attract' (pulled toward it)
    zIndex: 0,                   // canvas z-index within the container's stacking context
    mobileBreakpoint: 640,      // px container width — at/below this, spacing is scaled up
    mobileSpacingMultiplier: 1.6, // multiplies `spacing` under mobileBreakpoint (fewer dots)
    maxDPR: 2,                   // cap devicePixelRatio so 3x/4x phone screens don't burn fill-rate
    respectReducedMotion: true, // prefers-reduced-motion: reduce -> static grid, no animation
  };

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
    if (!m) return { r: 0, g: 20, b: 209 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }

  function smoothstep(t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      var args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
  }

  function DotGridBackground(container, options) {
    if (!container) throw new Error('DotGridBackground: container element is required');

    this.container = container;
    this.opts = Object.assign({}, DEFAULTS, options || {});
    this.rgb = hexToRgb(this.opts.color);
    this.lerp = (global.gsap && global.gsap.utils && global.gsap.utils.interpolate)
      ? global.gsap.utils.interpolate
      : function (a, b, t) { return a + (b - a) * t; };

    this.dots = [];
    this.mouse = { x: -99999, y: -99999, active: false };
    this.pendingMouseEvent = null;
    this.running = false;
    this.destroyed = false;
    this.rafId = null;
    this.gsapTickerFn = null;
    this.usingGsapTicker = false;
    this.lastFrameTime = 0;
    this.isIntersecting = true;

    this.reducedMotionMQ = (typeof global.matchMedia === 'function')
      ? global.matchMedia('(prefers-reduced-motion: reduce)')
      : null;

    this._buildCanvas();
    this._bindEvents();
    this._resize();
    this._buildGrid();
    this._observeVisibility();
    this._observeReducedMotion();

    if (this._prefersReducedMotion()) {
      this._drawStatic();
    } else {
      this.start();
    }
  }

  DotGridBackground.prototype._buildCanvas = function () {
    var cs = global.getComputedStyle(this.container);
    if (cs.position === 'static') {
      this.container.style.position = 'relative';
    }

    var canvas = doc.createElement('canvas');
    canvas.className = 'dot-grid-bg-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.display = 'block';
    canvas.style.zIndex = String(this.opts.zIndex);

    this.container.insertBefore(canvas, this.container.firstChild);
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  };

  DotGridBackground.prototype._prefersReducedMotion = function () {
    return !!(this.opts.respectReducedMotion && this.reducedMotionMQ && this.reducedMotionMQ.matches);
  };

  DotGridBackground.prototype._bindEvents = function () {
    var self = this;

    this._onMouseMove = function (e) { self.pendingMouseEvent = e; };
    this._onMouseLeave = function () { self.mouse.active = false; };
    this._onResize = debounce(function () {
      self._resize();
      self._buildGrid();
    }, 150);
    this._onVisibilityChange = function () {
      if (doc.hidden) self.stop();
      else if (self.isIntersecting) self.start();
    };

    // Listen on the container (not the canvas — the canvas is pointer-events:none)
    // so the effect still reacts to the mouse while it's over real content
    // (headings, buttons) stacked above the canvas.
    this.container.addEventListener('mousemove', this._onMouseMove, { passive: true });
    this.container.addEventListener('mouseleave', this._onMouseLeave, { passive: true });
    global.addEventListener('resize', this._onResize);
    doc.addEventListener('visibilitychange', this._onVisibilityChange);
  };

  DotGridBackground.prototype._observeVisibility = function () {
    var self = this;
    if (typeof IntersectionObserver !== 'function') return; // no IO support: always-on fallback
    this._io = new IntersectionObserver(function (entries) {
      var entry = entries[0];
      self.isIntersecting = entry.isIntersecting;
      if (entry.isIntersecting) {
        if (!self._prefersReducedMotion()) self.start();
      } else {
        self.stop();
      }
    }, { threshold: 0 });
    this._io.observe(this.container);
  };

  DotGridBackground.prototype._observeReducedMotion = function () {
    var self = this;
    if (!this.reducedMotionMQ) return;
    this._onReducedMotionChange = function () {
      if (self._prefersReducedMotion()) {
        self.stop();
        self._drawStatic();
      } else {
        self.start();
      }
    };
    if (this.reducedMotionMQ.addEventListener) {
      this.reducedMotionMQ.addEventListener('change', this._onReducedMotionChange);
    } else if (this.reducedMotionMQ.addListener) { // Safari <14
      this.reducedMotionMQ.addListener(this._onReducedMotionChange);
    }
  };

  DotGridBackground.prototype._resize = function () {
    var rect = this.container.getBoundingClientRect();
    var dpr = Math.min(global.devicePixelRatio || 1, this.opts.maxDPR);
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  DotGridBackground.prototype._currentSpacing = function () {
    return this.width <= this.opts.mobileBreakpoint
      ? this.opts.spacing * this.opts.mobileSpacingMultiplier
      : this.opts.spacing;
  };

  DotGridBackground.prototype._buildGrid = function () {
    var spacing = this._currentSpacing();
    var cols = Math.ceil(this.width / spacing) + 1;
    var rows = Math.ceil(this.height / spacing) + 1;
    var offsetX = (this.width - (cols - 1) * spacing) / 2;
    var offsetY = (this.height - (rows - 1) * spacing) / 2;

    var dots = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var rx = offsetX + c * spacing;
        var ry = offsetY + r * spacing;
        dots.push({ rx: rx, ry: ry, x: rx, y: ry, radius: this.opts.radius });
      }
    }
    this.dots = dots;
  };

  DotGridBackground.prototype._consumePendingMouseEvent = function () {
    if (!this.pendingMouseEvent) return;
    var rect = this.canvas.getBoundingClientRect();
    var e = this.pendingMouseEvent;
    this.mouse.x = e.clientX - rect.left;
    this.mouse.y = e.clientY - rect.top;
    this.mouse.active = true;
    this.pendingMouseEvent = null;
  };

  DotGridBackground.prototype._step = function () {
    this._consumePendingMouseEvent();

    var o = this.opts;
    var mx = this.mouse.active ? this.mouse.x : -99999;
    var my = this.mouse.active ? this.mouse.y : -99999;
    var dir = o.mode === 'attract' ? -1 : 1;
    var lerp = this.lerp;

    for (var i = 0; i < this.dots.length; i++) {
      var d = this.dots[i];
      var targetX = d.rx, targetY = d.ry, targetRadius = o.radius;

      var dx0 = d.rx - mx, dy0 = d.ry - my;
      // cheap bounding-box early-out before the sqrt
      if (dx0 > -o.influenceRadius && dx0 < o.influenceRadius && dy0 > -o.influenceRadius && dy0 < o.influenceRadius) {
        var dist = Math.sqrt(dx0 * dx0 + dy0 * dy0);
        if (dist < o.influenceRadius) {
          var t = smoothstep(1 - dist / o.influenceRadius);
          var angle = Math.atan2(dy0, dx0);
          var disp = o.maxDisplacement * t * dir;
          targetX = d.rx + Math.cos(angle) * disp;
          targetY = d.ry + Math.sin(angle) * disp;
          targetRadius = o.radius + (o.maxRadius - o.radius) * t;
        }
      }

      d.x = lerp(d.x, targetX, o.ease);
      d.y = lerp(d.y, targetY, o.ease);
      d.radius = lerp(d.radius, targetRadius, o.ease);
    }

    this._draw();
  };

  DotGridBackground.prototype._draw = function () {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(' + this.rgb.r + ',' + this.rgb.g + ',' + this.rgb.b + ',' + this.opts.opacity + ')';
    ctx.beginPath();
    for (var i = 0; i < this.dots.length; i++) {
      var d = this.dots[i];
      ctx.moveTo(d.x + d.radius, d.y);
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
    }
    ctx.fill();
  };

  DotGridBackground.prototype._drawStatic = function () {
    var ctx = this.ctx;
    var r = this.opts.radius;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = 'rgba(' + this.rgb.r + ',' + this.rgb.g + ',' + this.rgb.b + ',' + this.opts.opacity + ')';
    ctx.beginPath();
    for (var i = 0; i < this.dots.length; i++) {
      var d = this.dots[i];
      ctx.moveTo(d.rx + r, d.ry);
      ctx.arc(d.rx, d.ry, r, 0, Math.PI * 2);
    }
    ctx.fill();
  };

  DotGridBackground.prototype._tick = function () {
    if (!this.running) return;
    var now = (global.performance && global.performance.now) ? global.performance.now() : Date.now();
    var minInterval = 1000 / this.opts.maxFPS;
    if (now - this.lastFrameTime >= minInterval) {
      this.lastFrameTime = now;
      this._step();
    }
  };

  DotGridBackground.prototype.start = function () {
    if (this.running || this.destroyed || this._prefersReducedMotion()) return;
    this.running = true;
    this.lastFrameTime = 0;

    if (global.gsap && global.gsap.ticker) {
      var self = this;
      this.gsapTickerFn = function () { self._tick(); };
      global.gsap.ticker.add(this.gsapTickerFn);
      this.usingGsapTicker = true;
    } else {
      var loop = function (self) {
        return function rafLoop() {
          if (!self.running) return;
          self._tick();
          self.rafId = requestAnimationFrame(rafLoop);
        };
      }(this);
      this.rafId = requestAnimationFrame(loop);
      this.usingGsapTicker = false;
    }
  };

  DotGridBackground.prototype.stop = function () {
    if (!this.running) return;
    this.running = false;
    if (this.usingGsapTicker && global.gsap && global.gsap.ticker && this.gsapTickerFn) {
      global.gsap.ticker.remove(this.gsapTickerFn);
      this.gsapTickerFn = null;
    } else if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  };

  DotGridBackground.prototype.destroy = function () {
    this.stop();
    this.destroyed = true;

    this.container.removeEventListener('mousemove', this._onMouseMove);
    this.container.removeEventListener('mouseleave', this._onMouseLeave);
    global.removeEventListener('resize', this._onResize);
    doc.removeEventListener('visibilitychange', this._onVisibilityChange);

    if (this._io) this._io.disconnect();
    if (this.reducedMotionMQ && this._onReducedMotionChange) {
      if (this.reducedMotionMQ.removeEventListener) {
        this.reducedMotionMQ.removeEventListener('change', this._onReducedMotionChange);
      } else if (this.reducedMotionMQ.removeListener) {
        this.reducedMotionMQ.removeListener(this._onReducedMotionChange);
      }
    }
    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  };

  // ---- declarative auto-init: <el data-dot-grid data-dot-grid-spacing="28" ...> ----
  var DATA_OPTION_MAP = {
    dotGridSpacing: 'spacing',
    dotGridRadius: 'radius',
    dotGridMaxRadius: 'maxRadius',
    dotGridColor: 'color',
    dotGridOpacity: 'opacity',
    dotGridInfluenceRadius: 'influenceRadius',
    dotGridMaxDisplacement: 'maxDisplacement',
    dotGridEase: 'ease',
    dotGridMaxFps: 'maxFPS',
    dotGridMode: 'mode',
    dotGridZIndex: 'zIndex'
  };
  var NUMERIC_OPTIONS = {
    spacing: 1, radius: 1, maxRadius: 1, opacity: 1, influenceRadius: 1,
    maxDisplacement: 1, ease: 1, maxFPS: 1, zIndex: 1
  };

  function parseDataOptions(el) {
    var opts = {};
    Object.keys(DATA_OPTION_MAP).forEach(function (dataKey) {
      var optKey = DATA_OPTION_MAP[dataKey];
      var raw = el.dataset[dataKey];
      if (raw === undefined) return;
      opts[optKey] = NUMERIC_OPTIONS[optKey] ? parseFloat(raw) : raw;
    });
    return opts;
  }

  function autoInit() {
    var nodes = doc.querySelectorAll('[data-dot-grid]');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el._dotGridInstance) continue;
      el._dotGridInstance = new DotGridBackground(el, parseDataOptions(el));
    }
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', autoInit);
  } else {
    autoInit();
  }

  global.DotGridBackground = DotGridBackground;
})(window, document);
