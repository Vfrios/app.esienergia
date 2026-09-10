// area-calculator-canvas.js
export class AreaCalculatorCanvas {
  constructor(state, options = {}) {
    this.state = state;
    this.mouse = null;
    this.canvas = document.getElementById("areaCalculatorCanvas");
    this.ctx = this.canvas?.getContext("2d");
    this.SNAP_RAIO = 15;
    this.GRID_SNAP_RAIO = 9;
    this.ALIGN_SNAP_RAIO = 10;
    // Single source of truth for the base scale. The parent module passes
    // the same constant in so the two files can never drift apart.
    this.PIXELS_PER_METER = options.pixelsPerMeter || 40;
    this.editingWallIndex = -1;
    this.hoveredWallIndex = -1;
    this.lastGridSnap = false;
    this.dpr = window.devicePixelRatio || 1;
    this._cssWidth = this.canvas ? this.canvas.width : 0;
    this._cssHeight = this.canvas ? this.canvas.height : 0;
    this.setupHiDPI();
  }

  // ---------- HiDPI / crisp rendering ----------
  // Without this, canvases render blurry on retina/4K screens because the
  // backing pixel buffer is 1:1 with CSS pixels instead of device pixels.
  setupHiDPI() {
    if (!this.canvas || !this.ctx) return;
    const cssWidth = this._cssWidth || this.canvas.clientWidth || this.canvas.width;
    const cssHeight = this._cssHeight || this.canvas.clientHeight || this.canvas.height;
    this._cssWidth = cssWidth;
    this._cssHeight = cssHeight;
    this.dpr = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(cssWidth * this.dpr);
    this.canvas.height = Math.round(cssHeight * this.dpr);
    this.canvas.style.width = cssWidth + "px";
    this.canvas.style.height = cssHeight + "px";

    // Reset transform before re-scaling (avoids compounding on repeated calls).
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(this.dpr, this.dpr);
  }

  // Logical (CSS-pixel) width/height — use these instead of this.canvas.width
  // /height anywhere you need the drawable area, since the backing buffer is
  // now scaled by devicePixelRatio.
  get width() {
    return this._cssWidth;
  }

  get height() {
    return this._cssHeight;
  }

  updateState(newState) {
    this.state = newState;
    this.mouse = null;
    this.editingWallIndex = -1;
    this.hoveredWallIndex = -1;
    this.updateSnapVertices();
  }

  setEditingWall(index) {
    this.editingWallIndex = index;
  }

  updateSnapVertices() {
    this.state.snapVertices = this.state.points.map((p, index) => ({
      x: p.x,
      y: p.y,
      index: index,
      isFirst: index === 0,
    }));
  }

  getPixelsPerMeter() {
    return this.PIXELS_PER_METER * this.state.scale;
  }

  // Converts a client (screen) coordinate into world/canvas-space coordinates,
  // i.e. the same space that state.points live in. This must stay the exact
  // inverse of the translate(offsetX, offsetY) applied in draw().
  getCanvasCoords(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) - this.state.offsetX) / this.state.scale,
      y: ((clientY - rect.top) - this.state.offsetY) / this.state.scale,
    };
  }

  getCanvasPoint(event) {
    return this.getCanvasCoords(event.clientX, event.clientY);
  }

  // ---------- Snap em vértices existentes ----------
  findSnapPoint(x, y) {
    if (this.state.snapVertices.length === 0) return null;

    let closest = null;
    let closestDist = this.SNAP_RAIO / this.state.scale;

    for (let vertex of this.state.snapVertices) {
      const dx = x - vertex.x;
      const dy = y - vertex.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < closestDist) {
        closestDist = dist;
        closest = vertex;
      }
    }

    return closest;
  }

  // ---------- Snap na grade (precisão tipo CAD) ----------
  findGridSnapPoint(x, y) {
    const screenPpm = this.getPixelsPerMeter();
    const stepMeters = this.getGridStepMeters(screenPpm);
    const screenStepPx = stepMeters * screenPpm;
    if (screenStepPx < 5) return null;

    const passo = stepMeters * this.PIXELS_PER_METER;

    const nearX = Math.round(x / passo) * passo;
    const nearY = Math.round(y / passo) * passo;
    const dist = Math.sqrt((x - nearX) ** 2 + (y - nearY) ** 2);

    if (dist < this.GRID_SNAP_RAIO / this.state.scale) {
      return { x: nearX, y: nearY, isGrid: true };
    }
    return null;
  }

  // Alinhamento com qualquer vértice já criado, tipo "smart guides" do Figma.
  findAlignmentSnap(rawPoint) {
    const threshold = this.ALIGN_SNAP_RAIO / this.state.scale;
    let bestV = null;
    let bestH = null;

    this.state.points.forEach((vertex) => {
      const dx = Math.abs(rawPoint.x - vertex.x);
      const dy = Math.abs(rawPoint.y - vertex.y);

      if (dx < threshold && (!bestV || dx < bestV.dist)) {
        bestV = { coord: vertex.x, vertex, dist: dx };
      }
      if (dy < threshold && (!bestH || dy < bestH.dist)) {
        bestH = { coord: vertex.y, vertex, dist: dy };
      }
    });

    if (!bestV && !bestH) return null;
    return {
      x: bestV ? bestV.coord : rawPoint.x,
      y: bestH ? bestH.coord : rawPoint.y,
      vAlign: bestV,
      hAlign: bestH,
    };
  }

  getGridStepMeters(ppm) {
    return ppm >= 40 ? 1 : (ppm >= 20 ? 0.5 : (ppm >= 10 ? 0.2 : 0.1));
  }

  // Resolve o ponto final considerando: vértice > grade > ortho (ângulo) > livre
  resolvePoint(rawPoint) {
    const vertexSnap = this.findSnapPoint(rawPoint.x, rawPoint.y);
    if (vertexSnap) {
      return { point: { x: vertexSnap.x, y: vertexSnap.y }, snap: vertexSnap, gridSnap: false, align: null };
    }

    const alignSnap = this.findAlignmentSnap(rawPoint);
    if (alignSnap) {
      return { point: { x: alignSnap.x, y: alignSnap.y }, snap: null, gridSnap: false, align: alignSnap };
    }

    const gridSnap = this.findGridSnapPoint(rawPoint.x, rawPoint.y);
    if (gridSnap) {
      return { point: { x: gridSnap.x, y: gridSnap.y }, snap: null, gridSnap: true, align: null };
    }

    return { point: rawPoint, snap: null, gridSnap: false, align: null };
  }

  isOrthoActive() {
    return this.state.orthoMode !== this.state.shiftPressed; // XOR: toggle persistente + tecla temporária invertem
  }

  applyOrtho(last, point) {
    if (!this.isOrthoActive() || !last) return point;
    const step = ((this.state.angleSnapStep || 90) * Math.PI) / 180;
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    const angulo = Math.atan2(dy, dx);
    const anguloAjustado = Math.round(angulo / step) * step;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return {
      x: last.x + Math.cos(anguloAjustado) * dist,
      y: last.y + Math.sin(anguloAjustado) * dist,
    };
  }

  // BUGFIX: previously this only checked `resolved.snap`, so when a point was
  // resolved via the *grid* snap, ortho would still run afterwards and shove
  // the already-correct grid point off-grid along the nearest ortho angle.
  // Vertex-snap and grid-snap now both bypass ortho, since they are already
  // fully resolved, precise target points.
  resolveTargetForOrtho(last, resolved) {
    if (resolved.snap || resolved.gridSnap || resolved.align) return resolved.point;
    return this.applyOrtho(last, resolved.point);
  }

  handleMouseMove(event) {
    if (this.state.closed || this.state.points.length === 0 || !this.state.isDrawing) {
      this.mouse = null;
      this.state.snapActive = false;
      this.state.snapPoint = null;
      this.state.gridSnapActive = false;
      this.state.alignSnap = null;
      this.hoveredWallIndex = -1;
      this.draw();
      return;
    }

    const raw = this.getCanvasPoint(event);
    this.hoveredWallIndex = this.findWallNearPoint(raw);

    const resolved = this.resolvePoint(raw);
    this.state.snapActive = !!resolved.snap;
    this.state.gridSnapActive = !!resolved.gridSnap;
    this.state.alignSnap = resolved.align || null;
    this.state.snapPoint = resolved.snap || (resolved.gridSnap ? resolved.point : null);
    this.mouse = resolved.point;
    this.draw();
  }

  handleMouseLeave() {
    this.mouse = null;
    this.state.snapActive = false;
    this.state.gridSnapActive = false;
    this.state.snapPoint = null;
    this.state.alignSnap = null;
    this.hoveredWallIndex = -1;
    this.draw();
  }

  // Single canonical implementation — the old duplicate copy that lived in
  // area-calculator.js has been removed; that module now calls this one via
  // the shared canvas manager instance so the two can't drift out of sync.
  findWallNearPoint(point) {
    const radius = 20 / this.state.scale;
    for (let index = 0; index < this.state.walls.length; index += 1) {
      if (this.state.walls[index].deleted) continue;
      const start = this.state.points[index];
      const end = this.state.points[index + 1];
      if (!start || !end) continue;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthSquared = dx * dx + dy * dy;
      if (lengthSquared === 0) continue;

      let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
      t = Math.max(0, Math.min(1, t));
      const nearX = start.x + t * dx;
      const nearY = start.y + t * dy;
      const distance = Math.sqrt((point.x - nearX) ** 2 + (point.y - nearY) ** 2);
      if (distance <= radius) {
        return index;
      }
    }
    return -1;
  }

  // ---------- Limites de câmera (pan/zoom) ----------
  // Keeps the drawing from being dragged so far off-screen that the user
  // "loses" it, and provides a proper zoom-to-fit for when that happens.
  getContentBounds() {
    if (!this.state.points.length) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    this.state.points.forEach((p) => {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    });
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  clampOffset() {
    const bounds = this.getContentBounds();
    if (!bounds || !this.canvas) return;

    const margin = 200; // px of breathing room so content isn't glued to the edge
    const viewW = this.width;
    const viewH = this.height;

    // The on-screen position of content is (point + offset). Keep at least
    // a sliver of the bounding box within [-margin, view+margin].
    const minOffsetX = -bounds.maxX * this.state.scale - margin + 40;
    const maxOffsetX = viewW + margin - bounds.minX * this.state.scale - 40;
    const minOffsetY = -bounds.maxY * this.state.scale - margin + 40;
    const maxOffsetY = viewH + margin - bounds.minY * this.state.scale - 40;

    if (minOffsetX <= maxOffsetX) {
      this.state.offsetX = Math.min(Math.max(this.state.offsetX, minOffsetX), maxOffsetX);
    }
    if (minOffsetY <= maxOffsetY) {
      this.state.offsetY = Math.min(Math.max(this.state.offsetY, minOffsetY), maxOffsetY);
    }
  }

  zoomToFit(padding = 60) {
    const bounds = this.getContentBounds();
    if (!bounds || !this.canvas) return;

    if (bounds.width < 1 && bounds.height < 1) {
      // Single point / degenerate shape — just center it.
      this.state.offsetX = this.width / 2 - bounds.minX;
      this.state.offsetY = this.height / 2 - bounds.minY;
      return;
    }

    const availW = this.width - padding * 2;
    const availH = this.height - padding * 2;
    const scaleX = bounds.width > 0 ? availW / bounds.width : Infinity;
    const scaleY = bounds.height > 0 ? availH / bounds.height : Infinity;
    let targetScale = Math.min(scaleX, scaleY, 5); // don't over-zoom tiny shapes
    if (!Number.isFinite(targetScale) || targetScale <= 0) targetScale = 1;

    const ESCALA_MIN = 0.05;
    const ESCALA_MAX = 5.0;
    this.state.scale = Math.min(Math.max(targetScale, ESCALA_MIN), ESCALA_MAX);

    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    this.state.offsetX = this.width / 2 - cx * this.state.scale;
    this.state.offsetY = this.height / 2 - cy * this.state.scale;
  }

  // =====================================================
  // DRAW
  // =====================================================
  draw() {
    if (!this.ctx || !this.canvas) return;

    this.clampOffset();

    this.ctx.clearRect(0, 0, this.width, this.height);

    // Fixed screen-space chrome (rulers use world-aware ticks internally).
    this.drawGrid();

    if (this.state.points.length === 0) {
      this.drawCompass();
      this.drawRulers();
      return;
    }

    // Everything below is "world space" content: it pans with offsetX/Y.
    this.ctx.save();
    this.ctx.translate(this.state.offsetX, this.state.offsetY);
    this.ctx.scale(this.state.scale, this.state.scale);

    this.drawWalls();
    this.drawOrthoGuides();
    this.drawAlignmentGuides();
    this.drawGuideLine();
    this.drawDimensions();
    this.drawVertices();

    this.ctx.restore();

    // Fixed screen-space chrome again, drawn on top.
    this.drawCompass();
    this.drawRulers();
    this.updateSnapIndicator();
  }

  drawGrid() {
    const ppm = this.getPixelsPerMeter();
    const passo = this.getGridStepMeters(ppm);
    const passoPixels = passo * ppm;

    if (passoPixels < 5) return;

    const offX = this.state.offsetX % passoPixels;
    const offY = this.state.offsetY % passoPixels;

    this.ctx.strokeStyle = "rgba(60, 60, 60, 0.15)";
    this.ctx.lineWidth = 0.8;

    for (let x = offX; x <= this.width; x += passoPixels) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = offY; y <= this.height; y += passoPixels) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }

    // Linhas "mestras" a cada 5 unidades de grade (mais escuras, tipo blueprint)
    const passoMestrePixels = passoPixels * 5;
    const offXMestre = this.state.offsetX % passoMestrePixels;
    const offYMestre = this.state.offsetY % passoMestrePixels;
    this.ctx.strokeStyle = "rgba(50, 60, 90, 0.28)";
    this.ctx.lineWidth = 1;
    for (let x = offXMestre; x <= this.width; x += passoMestrePixels) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();
    }
    for (let y = offYMestre; y <= this.height; y += passoMestrePixels) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.width, y);
      this.ctx.stroke();
    }
  }

  // Régua nas bordas superior e esquerda, em metros.
  // Ticks/labels are computed relative to the current pan offset so the
  // numbers always reflect true world coordinates, not screen position.
  drawRulers() {
    const ppm = this.getPixelsPerMeter();
    const passo = this.getGridStepMeters(ppm);
    const passoPixels = passo * ppm;
    if (passoPixels < 5) return;

    const RULER_SIZE = 18;
    this.ctx.save();
    this.ctx.fillStyle = "rgba(30, 41, 59, 0.85)";
    this.ctx.fillRect(0, 0, this.width, RULER_SIZE);
    this.ctx.fillRect(0, 0, RULER_SIZE, this.height);

    this.ctx.fillStyle = "#e2e8f0";
    this.ctx.font = "9px Consolas, monospace";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "top";

    const startX = ((this.state.offsetX % passoPixels) + passoPixels) % passoPixels;
    for (let x = startX; x < this.width; x += passoPixels) {
      const metros = (x - this.state.offsetX) / ppm;
      const isMajor = Math.abs(Math.round(metros) - metros) < 1e-6;
      this.ctx.strokeStyle = "rgba(226,232,240,0.6)";
      this.ctx.beginPath();
      this.ctx.moveTo(x, RULER_SIZE - (isMajor ? 10 : 5));
      this.ctx.lineTo(x, RULER_SIZE);
      this.ctx.stroke();
      if (isMajor) this.ctx.fillText(metros.toFixed(0), x, 1);
    }

    this.ctx.textAlign = "left";
    this.ctx.textBaseline = "middle";
    const startY = ((this.state.offsetY % passoPixels) + passoPixels) % passoPixels;
    for (let y = startY; y < this.height; y += passoPixels) {
      const metros = (y - this.state.offsetY) / ppm;
      const isMajor = Math.abs(Math.round(metros) - metros) < 1e-6;
      this.ctx.strokeStyle = "rgba(226,232,240,0.6)";
      this.ctx.beginPath();
      this.ctx.moveTo(RULER_SIZE - (isMajor ? 10 : 5), y);
      this.ctx.lineTo(RULER_SIZE, y);
      this.ctx.stroke();
      if (isMajor) {
        this.ctx.save();
        this.ctx.translate(2, y);
        this.ctx.fillText(metros.toFixed(0), 6, 0);
        this.ctx.restore();
      }
    }

    // canto
    this.ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
    this.ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);
    this.ctx.fillStyle = "#94a3b8";
    this.ctx.font = "7px Consolas, monospace";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText("m", RULER_SIZE / 2, RULER_SIZE / 2);
    this.ctx.restore();
  }

  drawCompass() {
    const margin = 30;
    const centerX = this.width - margin;
    const centerY = margin;
    const radius = 25;

    this.ctx.save();

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius + 8, 0, Math.PI * 2);
    this.ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    this.ctx.fill();
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
    this.ctx.lineWidth = 1;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.arc(centerX, centerY, radius * 0.7, 0, Math.PI * 2);
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    this.ctx.lineWidth = 0.8;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY - radius * 0.8);
    this.ctx.lineTo(centerX - radius * 0.25, centerY + radius * 0.1);
    this.ctx.lineTo(centerX + radius * 0.25, centerY + radius * 0.1);
    this.ctx.closePath();
    this.ctx.fillStyle = "#dc2626";
    this.ctx.fill();
    this.ctx.strokeStyle = "#991b1b";
    this.ctx.lineWidth = 0.5;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY + radius * 0.8);
    this.ctx.lineTo(centerX - radius * 0.2, centerY - radius * 0.05);
    this.ctx.lineTo(centerX + radius * 0.2, centerY - radius * 0.05);
    this.ctx.closePath();
    this.ctx.fillStyle = "#9ca3af";
    this.ctx.fill();
    this.ctx.strokeStyle = "#6b7280";
    this.ctx.lineWidth = 0.5;
    this.ctx.stroke();

    this.ctx.beginPath();
    this.ctx.moveTo(centerX, centerY - radius * 0.8);
    this.ctx.lineTo(centerX, centerY + radius * 0.8);
    this.ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    this.ctx.lineWidth = 0.8;
    this.ctx.stroke();

    this.ctx.fillStyle = "#dc2626";
    this.ctx.font = "bold 14px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "bottom";
    this.ctx.fillText("N", centerX, centerY - radius + 2);

    this.ctx.fillStyle = "#6b7280";
    this.ctx.textBaseline = "top";
    this.ctx.fillText("S", centerX, centerY + radius - 4);

    this.ctx.fillStyle = "#4b5563";
    this.ctx.font = "bold 10px Arial";
    this.ctx.textBaseline = "middle";
    this.ctx.textAlign = "left";
    this.ctx.fillText("E", centerX + radius * 0.65, centerY);
    this.ctx.textAlign = "right";
    this.ctx.fillText("W", centerX - radius * 0.65, centerY);

    this.ctx.restore();
  }

  // Paredes desenhadas com espessura real (duas linhas + preenchimento), como planta baixa
  drawWalls() {
    const ppm = this.getPixelsPerMeter();
    const thicknessPx = Math.max((this.state.wallThickness || 0.15) * ppm, 3);

    this.state.walls.forEach((wall, index) => {
      if (wall.deleted) return;
      const start = this.state.points[index];
      const end = this.state.points[index + 1];
      if (!start || !end) return;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const hx = (nx * thicknessPx) / 2;
      const hy = (ny * thicknessPx) / 2;

      const isEditing = index === this.editingWallIndex;
      const isHovered = index === this.hoveredWallIndex;

      // corpo da parede (polígono com espessura)
      this.ctx.beginPath();
      this.ctx.moveTo(start.x + hx, start.y + hy);
      this.ctx.lineTo(end.x + hx, end.y + hy);
      this.ctx.lineTo(end.x - hx, end.y - hy);
      this.ctx.lineTo(start.x - hx, start.y - hy);
      this.ctx.closePath();
      this.ctx.fillStyle = isEditing
        ? "rgba(239, 68, 68, 0.18)"
        : (isHovered ? "rgba(59, 130, 246, 0.18)" : "rgba(31, 41, 55, 0.08)");
      this.ctx.fill();

      this.ctx.lineWidth = isEditing ? 2.5 : (isHovered ? 2 : 1.5);
      this.ctx.strokeStyle = isEditing ? "#ef4444" : (isHovered ? "#3b82f6" : (this.state.closed ? "#0f766e" : "#1f2937"));
      this.ctx.stroke();

      // eixo central (linha de referência tracejada, útil para conferência)
      this.ctx.save();
      this.ctx.setLineDash([4, 3]);
      this.ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
      this.ctx.lineWidth = 0.8;
      this.ctx.beginPath();
      this.ctx.moveTo(start.x, start.y);
      this.ctx.lineTo(end.x, end.y);
      this.ctx.stroke();
      this.ctx.restore();

      // Aviso visual de comprimento inválido/degenerado (parede quase nula).
      if (wall.length < 0.02) {
        this.ctx.save();
        this.ctx.fillStyle = "#f59e0b";
        this.ctx.beginPath();
        this.ctx.arc((start.x + end.x) / 2, (start.y + end.y) / 2, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.restore();
      }
    });

    if (this.state.closed && this.state.points.length >= 3) {
      this.ctx.fillStyle = this.hasSelfIntersection()
        ? "rgba(239, 68, 68, 0.12)"
        : "rgba(15, 118, 110, 0.08)";
      this.ctx.beginPath();
      this.ctx.moveTo(this.state.points[0].x, this.state.points[0].y);
      this.state.points.slice(1).forEach((point) => this.ctx.lineTo(point.x, point.y));
      this.ctx.closePath();
      this.ctx.fill();
    }
  }

  // Detecta auto-interseção simples do polígono fechado (segmentos não
  // adjacentes que se cruzam). Usado apenas para feedback visual — não
  // impede o fechamento, mas avisa que a forma está inválida.
  hasSelfIntersection() {
    const pts = this.state.points;
    const n = pts.length;
    if (n < 4) return false;

    const segIntersect = (p1, p2, p3, p4) => {
      const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
      if (Math.abs(d) < 1e-9) return false;
      const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
      const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
      return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
    };

    for (let i = 0; i < n; i += 1) {
      const a1 = pts[i];
      const a2 = pts[(i + 1) % n];
      for (let j = i + 1; j < n; j += 1) {
        if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
        const b1 = pts[j];
        const b2 = pts[(j + 1) % n];
        if (segIntersect(a1, a2, b1, b2)) return true;
      }
    }
    return false;
  }

  // Raios-guia (polar tracking) quando o modo Perpendicular está ativo
  drawOrthoGuides() {
    if (this.state.closed || !this.state.isDrawing || this.state.points.length === 0) return;
    if (!this.isOrthoActive()) return;

    const last = this.state.points[this.state.points.length - 1];
    const step = (this.state.angleSnapStep || 90) * Math.PI / 180;
    // Rays must reach past the visible viewport even while panned, so base
    // the length on canvas size plus the current pan offset magnitude.
    const rayLen = Math.max(this.width, this.height) + Math.abs(this.state.offsetX) + Math.abs(this.state.offsetY) + 200;

    this.ctx.save();
    this.ctx.setLineDash([2, 5]);
    this.ctx.strokeStyle = "rgba(99, 102, 241, 0.35)";
    this.ctx.lineWidth = 1;
    for (let a = 0; a < Math.PI * 2; a += step) {
      this.ctx.beginPath();
      this.ctx.moveTo(last.x, last.y);
      this.ctx.lineTo(last.x + Math.cos(a) * rayLen, last.y + Math.sin(a) * rayLen);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawAlignmentGuides() {
    const align = this.state.alignSnap;
    if (!align || this.state.closed || !this.state.isDrawing) return;

    const BIG = 20000;
    this.ctx.save();
    this.ctx.setLineDash([2, 4]);
    this.ctx.strokeStyle = "#f97316";
    this.ctx.lineWidth = 1 / this.state.scale;

    if (align.vAlign) {
      this.ctx.beginPath();
      this.ctx.moveTo(align.vAlign.coord, -BIG);
      this.ctx.lineTo(align.vAlign.coord, BIG);
      this.ctx.stroke();
    }
    if (align.hAlign) {
      this.ctx.beginPath();
      this.ctx.moveTo(-BIG, align.hAlign.coord);
      this.ctx.lineTo(BIG, align.hAlign.coord);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  drawGuideLine() {
    if (this.state.closed || !this.mouse || !this.state.isDrawing) {
      return;
    }

    const last = this.state.points[this.state.points.length - 1];
    const resolved = {
      point: { x: this.mouse.x, y: this.mouse.y },
      snap: this.state.snapActive,
      gridSnap: this.state.gridSnapActive,
      align: this.state.alignSnap,
    };
    const target = this.resolveTargetForOrtho(last, resolved);

    this.ctx.save();
    this.ctx.setLineDash([6, 6]);
    this.ctx.strokeStyle = this.state.snapActive
      ? "#27ae60"
      : (this.state.alignSnap ? "#f97316" : (this.isOrthoActive() ? "#6366f1" : "#64748b"));
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(last.x, last.y);
    this.ctx.lineTo(target.x, target.y);
    this.ctx.stroke();
    this.ctx.restore();

    const dx = target.x - last.x;
    const dy = target.y - last.y;
    const distMetros = this.pixelsToMeters(Math.sqrt(dx * dx + dy * dy));
    const text = `${distMetros.toFixed(2)} m`;

    this.ctx.font = "bold 12px Arial";
    this.ctx.textAlign = "left";
    const width = this.ctx.measureText(text).width + 12;
    this.ctx.fillStyle = "rgba(255,255,255,0.95)";
    this.ctx.shadowColor = "rgba(0,0,0,0.3)";
    this.ctx.shadowBlur = 6;
    this.ctx.fillRect(target.x + 15, target.y - 25, width, 22);
    this.ctx.shadowBlur = 0;
    this.ctx.fillStyle = this.state.snapActive ? "#27ae60" : (this.isOrthoActive() ? "#6366f1" : "#1f2937");
    this.ctx.fillText(text, target.x + 20, target.y - 8);

    if (this.state.snapActive) {
      this.ctx.fillStyle = "#27ae60";
      this.ctx.font = "bold 10px Arial";
      this.ctx.fillText("⚡ SNAP", target.x + 15, target.y - 42);
    } else if (this.state.alignSnap) {
      this.ctx.fillStyle = "#f97316";
      this.ctx.font = "bold 10px Arial";
      this.ctx.fillText("📐 ALINHADO", target.x + 15, target.y - 42);
    } else if (this.isOrthoActive()) {
      const angulo = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      this.ctx.fillStyle = "#6366f1";
      this.ctx.font = "bold 10px Arial";
      this.ctx.fillText(`🔒 ${angulo}°`, target.x + 15, target.y - 42);
    }
  }

  // Cotas técnicas (linhas de extensão + linha de cota + setas), como em plantas de verdade.
  // Anti-overlap: quando duas paredes adjacentes se encontram em ângulo
  // agudo, ou uma parede é muito curta para caber o texto da cota, a linha
  // de cota é empurrada para um offset maior — como o "auto-arrange" de
  // dimensões de um CAD de verdade.
  drawDimensions() {
    const BASE_OFFSET = 20;
    const EXT_GAP = 3;
    const EXT_OVERSHOOT = 6;
    const ARROW = 5;

    const offsets = this.computeDimensionOffsets(BASE_OFFSET);

    this.state.walls.forEach((wall, index) => {
      if (wall.deleted) return;
      const start = this.state.points[index];
      const end = this.state.points[index + 1];
      if (!start || !end) return;

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const nx = -uy;
      const ny = ux;

      const OFFSET = offsets[index];
      const p1 = { x: start.x + nx * OFFSET, y: start.y + ny * OFFSET };
      const p2 = { x: end.x + nx * OFFSET, y: end.y + ny * OFFSET };

      const isEditing = index === this.editingWallIndex;
      const color = isEditing ? "#ef4444" : "#2563eb";

      this.ctx.save();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = 1;

      // linhas de extensão (saem da parede até a linha de cota)
      this.ctx.beginPath();
      this.ctx.moveTo(start.x + nx * EXT_GAP, start.y + ny * EXT_GAP);
      this.ctx.lineTo(start.x + nx * (OFFSET + EXT_OVERSHOOT), start.y + ny * (OFFSET + EXT_OVERSHOOT));
      this.ctx.stroke();

      this.ctx.beginPath();
      this.ctx.moveTo(end.x + nx * EXT_GAP, end.y + ny * EXT_GAP);
      this.ctx.lineTo(end.x + nx * (OFFSET + EXT_OVERSHOOT), end.y + ny * (OFFSET + EXT_OVERSHOOT));
      this.ctx.stroke();

      // linha de cota
      this.ctx.beginPath();
      this.ctx.moveTo(p1.x, p1.y);
      this.ctx.lineTo(p2.x, p2.y);
      this.ctx.stroke();

      // setas (triângulos) apontando para dentro
      this.drawArrowHead(p1, ux, uy, ARROW, color);
      this.drawArrowHead(p2, -ux, -uy, ARROW, color);

      // texto da medida, alinhado ao ângulo da parede
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      let angle = Math.atan2(dy, dx);
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) angle += Math.PI;

      this.ctx.translate(midX, midY);
      this.ctx.rotate(angle);
      const text = `${wall.length.toFixed(2)} m`;
      this.ctx.font = "bold 11px Consolas, monospace";
      const textWidth = this.ctx.measureText(text).width + 8;
      this.ctx.fillStyle = "rgba(255,255,255,0.92)";
      this.ctx.fillRect(-textWidth / 2, -16, textWidth, 14);
      this.ctx.fillStyle = color;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(text, 0, -9);
      this.ctx.restore();

      // etiqueta da parede (letra), centrada sobre a própria parede
      this.drawWallLetter(start, end, index, isEditing);
    });
  }

  // Calcula, por parede, um offset de cota que evita colisão com a cota da
  // parede vizinha quando o ângulo entre elas é agudo (< ~50°) ou quando a
  // parede é curta demais para o texto da medida caber sem sobrepor a régua
  // vizinha. Paredes "problemáticas" ganham offset extra, escalonado.
  computeDimensionOffsets(baseOffset) {
    const walls = this.state.walls;
    const offsets = new Array(walls.length).fill(baseOffset);
    const ACUTE_ANGLE_RAD = (50 * Math.PI) / 180;
    const MIN_LEN_FOR_TEXT = 45; // px — abaixo disso o texto da cota não cabe confortavelmente

    for (let index = 0; index < walls.length; index += 1) {
      if (walls[index].deleted) continue;
      const start = this.state.points[index];
      const end = this.state.points[index + 1];
      if (!start || !end) continue;

      let bump = 0;

      // Parede curta: precisa de mais afastamento para não sobrepor o texto
      // das paredes vizinhas.
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lenPx = Math.sqrt(dx * dx + dy * dy);
      if (lenPx < MIN_LEN_FOR_TEXT) {
        bump += 14;
      }

      // Ângulo agudo com a próxima parede compartilhando vértice: alterna
      // o offset para as duas paredes não desenharem a cota uma em cima da
      // outra.
      const nextWall = walls[index + 1];
      if (nextWall) {
        const nextEnd = this.state.points[index + 2];
        if (nextEnd) {
          const v1 = { x: start.x - end.x, y: start.y - end.y };
          const v2 = { x: nextEnd.x - end.x, y: nextEnd.y - end.y };
          const dot = v1.x * v2.x + v1.y * v2.y;
          const mag = (Math.sqrt(v1.x ** 2 + v1.y ** 2) * Math.sqrt(v2.x ** 2 + v2.y ** 2)) || 1;
          const angle = Math.acos(Math.min(1, Math.max(-1, dot / mag)));
          if (angle < ACUTE_ANGLE_RAD) {
            bump += (index % 2 === 0) ? 10 : 22;
          }
        }
      }

      offsets[index] = baseOffset + bump;
    }

    return offsets;
  }

  drawArrowHead(tip, ux, uy, size, color) {
    const nx = -uy;
    const ny = ux;
    this.ctx.save();
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.moveTo(tip.x, tip.y);
    this.ctx.lineTo(tip.x + ux * size + nx * size * 0.4, tip.y + uy * size + ny * size * 0.4);
    this.ctx.lineTo(tip.x + ux * size - nx * size * 0.4, tip.y + uy * size - ny * size * 0.4);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.restore();
  }

  drawWallLetter(start, end, index, isEditing) {
    const x = (start.x + end.x) / 2;
    const y = (start.y + end.y) / 2;
    const letter = this.getWallLetter(index);
    const radius = 10;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fillStyle = isEditing ? "#ef4444" : "#2563eb";
    this.ctx.shadowColor = "rgba(0,0,0,0.3)";
    this.ctx.shadowBlur = 4;
    this.ctx.fill();
    this.ctx.shadowBlur = 0;
    this.ctx.strokeStyle = "#ffffff";
    this.ctx.lineWidth = 1.5;
    this.ctx.stroke();

    this.ctx.fillStyle = "#ffffff";
    this.ctx.font = "bold 11px Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";
    this.ctx.fillText(letter, x, y + 0.5);
    this.ctx.restore();
  }

  drawVertices() {
    this.state.points.forEach((point, index) => {
      const isSnapped = this.state.snapActive && this.state.snapPoint &&
                        Math.abs(point.x - this.state.snapPoint.x) < 0.1 &&
                        Math.abs(point.y - this.state.snapPoint.y) < 0.1;

      if (isSnapped) {
        this.ctx.beginPath();
        this.ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(39, 174, 96, 0.2)";
        this.ctx.fill();
        this.ctx.strokeStyle = "#27ae60";
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      }

      this.ctx.beginPath();
      this.ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      this.ctx.fillStyle = index === 0 ? "#2563eb" : (isSnapped ? "#27ae60" : "#111827");
      this.ctx.fill();
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      // Ângulo interno no vértice (útil para conferência), quando há paredes
      // suficientes para formar um ângulo.
      const prev = this.state.points[index - 1];
      const next = this.state.points[index + 1];
      if (prev && next && (this.state.closed || (index > 0 && index < this.state.points.length - 1))) {
        const v1 = { x: prev.x - point.x, y: prev.y - point.y };
        const v2 = { x: next.x - point.x, y: next.y - point.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const mag = (Math.sqrt(v1.x ** 2 + v1.y ** 2) * Math.sqrt(v2.x ** 2 + v2.y ** 2)) || 1;
        const angleDeg = Math.round((Math.acos(Math.min(1, Math.max(-1, dot / mag))) * 180) / Math.PI);

        const bisX = (v1.x / (Math.hypot(v1.x, v1.y) || 1)) + (v2.x / (Math.hypot(v2.x, v2.y) || 1));
        const bisY = (v1.y / (Math.hypot(v1.x, v1.y) || 1)) + (v2.y / (Math.hypot(v2.x, v2.y) || 1));
        const bisLen = Math.hypot(bisX, bisY) || 1;
        const labelX = point.x + (bisX / bisLen) * -18;
        const labelY = point.y + (bisY / bisLen) * -18;

        this.ctx.save();
        this.ctx.font = "9px Consolas, monospace";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        const label = `${angleDeg}°`;
        const w = this.ctx.measureText(label).width + 6;
        this.ctx.fillStyle = "rgba(15,23,42,0.75)";
        this.ctx.fillRect(labelX - w / 2, labelY - 7, w, 14);
        this.ctx.fillStyle = "#e2e8f0";
        this.ctx.fillText(label, labelX, labelY);
        this.ctx.restore();
      }
    });
  }

  updateSnapIndicator() {
    const indicator = document.getElementById("areaSnapIndicator");
    if (!indicator) return;

    const rect = this.canvas.getBoundingClientRect();

    if (this.state.snapActive && this.state.snapPoint) {
      indicator.style.display = "block";
      indicator.classList.remove("grid-snap");
      indicator.style.left = (rect.left + this.state.snapPoint.x * this.state.scale + this.state.offsetX - 11) + "px";
      indicator.style.top = (rect.top + this.state.snapPoint.y * this.state.scale + this.state.offsetY - 11) + "px";
    } else if (this.state.gridSnapActive && this.state.snapPoint) {
      indicator.style.display = "block";
      indicator.classList.add("grid-snap");
      indicator.style.left = (rect.left + this.state.snapPoint.x * this.state.scale + this.state.offsetX - 11) + "px";
      indicator.style.top = (rect.top + this.state.snapPoint.y * this.state.scale + this.state.offsetY - 11) + "px";
    } else {
      indicator.style.display = "none";
    }
  }

  pixelsToMeters(value) {
    return Number(value || 0) / this.getPixelsPerMeter();
  }

  getWallLetter(index) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (index < 26) {
      return letters[index];
    }
    const first = Math.floor(index / 26) - 1;
    const second = index % 26;
    return (first >= 0 ? letters[first] : '') + letters[second];
  }
}
