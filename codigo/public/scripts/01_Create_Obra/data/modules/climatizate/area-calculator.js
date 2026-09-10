// area-calculator.js
import { calculateVazaoArAndThermalGains } from "../../../features/calculations/air-flow.js";
import { AreaCalculatorCanvas } from "./area-calculator-canvas.js";

const MODAL_ID = "areaCalculatorModal";
const CANVAS_WIDTH = 820;
const CANVAS_HEIGHT = 560;
const MAX_HISTORY = 50;
// Single source of truth for the base scale constant. Passed into the
// canvas manager at construction time so the two files can never drift
// out of sync with each other (previously both hard-coded `40`).
const PIXELS_PER_METER = 40;
const ESCALA_MIN = 0.05;
const ESCALA_MAX = 5.0;

let state = createInitialState();
let canvasManager = null;
let isEditingWall = false;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let rightMouseDown = false;
let floatingInputTimer = null;

function createInitialState(roomId = "") {
  return {
    roomId,
    points: [],
    walls: [],
    closed: false,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    snapActive: false,
    gridSnapActive: false,
    snapPoint: null,
    alignSnap: null,
    snapIndex: -1,
    shiftPressed: false,
    selectedWallIndex: -1,
    snapVertices: [],
    editingWallIndex: -1,
    isDrawing: true,
    showDeleteButton: false,
    orthoMode: true,
    angleSnapStep: 90,
    wallThickness: 0.15,
    history: [],
    historyIndex: -1,
    // Called by AreaCalculatorCanvas.zoomToFit() after it changes state.scale,
    // so wall geometry gets re-derived at the new scale before centering.
    onScaleChanged: null,
  };
}

function parseAreaValue(value) {
  const normalized = String(value ?? "").replace(",", ".").trim();
  const numeric = Number.parseFloat(normalized);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function formatAreaValue(value) {
  return parseAreaValue(value).toFixed(2);
}

function getAreaShapeInput(roomId = state.roomId) {
  if (!roomId) return null;
  return document.querySelector(
    `input[data-field="areaShape"][data-room-id="${roomId}"]`,
  );
}

function serializeAreaShape() {
  return JSON.stringify({
    version: 1,
    points: state.points.map((point) => ({ x: point.x, y: point.y })),
    walls: state.walls.map((wall) => ({ length: wall.length, angle: wall.angle })),
    closed: state.closed,
    scale: state.scale,
    offsetX: state.offsetX,
    offsetY: state.offsetY,
    orthoMode: state.orthoMode,
    angleSnapStep: state.angleSnapStep,
    wallThickness: state.wallThickness,
    area: calculatePolygonArea(),
    perimeter: calculatePerimeter(),
  });
}

function parseSavedAreaShape(roomId) {
  const input = getAreaShapeInput(roomId);
  if (!input?.value) return null;

  try {
    const parsed = JSON.parse(input.value);
    if (!parsed || !Array.isArray(parsed.points) || !Array.isArray(parsed.walls)) {
      return null;
    }
    if (parsed.points.length < 1 || parsed.walls.length < 1) {
      return null;
    }
    return parsed;
  } catch (error) {
    console.warn("Forma CAD da area invalida para a sala:", roomId, error);
    return null;
  }
}

function hasSavedAreaShape(roomId) {
  const savedShape = parseSavedAreaShape(roomId);
  return !!(savedShape?.closed && savedShape.points.length >= 3);
}

function restoreSavedAreaShape(roomId) {
  const savedShape = parseSavedAreaShape(roomId);
  if (!savedShape) return false;

  state.points = savedShape.points.map((point) => ({
    x: Number(point.x) || 0,
    y: Number(point.y) || 0,
  }));
  state.walls = savedShape.walls.map((wall) => ({
    length: Number(wall.length) || 0,
    angle: Number(wall.angle) || 0,
    deleted: !!wall.deleted,
  }));
  state.closed = !!savedShape.closed;
  state.isDrawing = !state.closed;
  state.scale = Number(savedShape.scale) || 1;
  state.offsetX = Number(savedShape.offsetX) || 0;
  state.offsetY = Number(savedShape.offsetY) || 0;
  state.orthoMode = savedShape.orthoMode !== undefined ? !!savedShape.orthoMode : true;
  state.angleSnapStep = Number(savedShape.angleSnapStep) || 90;
  state.wallThickness = Number(savedShape.wallThickness) || 0.15;
  state.history = [snapshotWalls()];
  state.historyIndex = 0;

  if (canvasManager) {
    canvasManager.updateState(state);
  }
  return true;
}

function refreshAreaCalculatorButton(roomId) {
  const button = document.querySelector(
    `.area-calc-button[data-room-id="${roomId}"]`,
  );
  if (!button) return;

  const saved = hasSavedAreaShape(roomId);
  button.textContent = saved ? "Visualizar" : "Calcular";
  button.classList.toggle("has-area-shape", saved);
  button.title = saved ? "Visualizar ou editar a forma salva" : "Calcular area pelo CAD";
}

function notifyAreaShapeChanged(roomId) {
  refreshAreaCalculatorButton(roomId);
  document.dispatchEvent(
    new CustomEvent("area-shape-changed", { detail: { roomId } }),
  );
}

function refreshAllAreaCalculatorButtons() {
  document.querySelectorAll(".area-calc-button[data-room-id]").forEach((button) => {
    refreshAreaCalculatorButton(button.dataset.roomId);
  });
}

function getCanvas() {
  return document.getElementById("areaCalculatorCanvas");
}

function getPixelsPerMeter() {
  return PIXELS_PER_METER;
}

function metersToPixels(value) {
  return Number(value || 0) * getPixelsPerMeter();
}

function pixelsToMeters(value) {
  return Number(value || 0) / getPixelsPerMeter();
}

// ============ HISTÓRICO (UNDO/REDO) ============
function snapshotWalls() {
  return state.walls.map((w) => ({ length: w.length, angle: w.angle, deleted: !!w.deleted }));
}

function pushHistory() {
  // descarta futuro se estava no meio do histórico
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snapshotWalls());
  if (state.history.length > MAX_HISTORY) {
    state.history.shift();
  }
  state.historyIndex = state.history.length - 1;
  updateUndoRedoButtons();
}

function undo() {
  if (state.historyIndex <= 0) {
    state.walls = [];
    state.points = state.points.length ? [state.points[0]] : [];
    state.historyIndex = -1;
    finalizeHistoryRestore();
    return;
  }
  state.historyIndex -= 1;
  state.walls = state.history[state.historyIndex].map((w) => ({ ...w }));
  finalizeHistoryRestore();
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) return;
  state.historyIndex += 1;
  state.walls = state.history[state.historyIndex].map((w) => ({ ...w }));
  finalizeHistoryRestore();
}

function finalizeHistoryRestore() {
  if (state.walls.length === 0 && state.points.length <= 1) {
    if (state.points.length === 0) state.closed = false;
  }
  recalculatePointsFromWalls();
  state.closed = false;
  state.isDrawing = true;
  hideFloatingInput();
  updateAreaUI();
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const undoBtn = document.querySelector('[data-area-action="undo"]');
  const redoBtn = document.querySelector('[data-area-action="redo"]');
  if (undoBtn) undoBtn.disabled = state.historyIndex < 0;
  if (redoBtn) redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

// ============ ESCALA ============
function zoomArea(factor) {
  let novaEscala = state.scale * factor;
  if (novaEscala < ESCALA_MIN) novaEscala = ESCALA_MIN;
  if (novaEscala > ESCALA_MAX) novaEscala = ESCALA_MAX;
  state.scale = novaEscala;

  recalculatePointsFromWalls();
  updateAreaUI();
  updateZoomInfo();
}

function fitToView() {
  if (canvasManager) {
    canvasManager.zoomToFit();
  }
  updateAreaUI();
  updateZoomInfo();
}

function updateZoomInfo() {
  const ppm = getPixelsPerMeter();
  const zoomInfo = document.querySelector(".area-zoom-info");
  if (zoomInfo) {
    zoomInfo.textContent = `Zoom: ${Math.round(state.scale * 100)}% | ${ppm.toFixed(1)} px/m`;
  }
}

// ============ PAREDES ============
function getWallLetter(index) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < 26) {
    return letters[index];
  }
  const first = Math.floor(index / 26) - 1;
  const second = index % 26;
  return (first >= 0 ? letters[first] : '') + letters[second];
}

function recalculatePointsFromWalls() {
  if (state.points.length === 0) return;

  const points = state.points.map((point) => ({ ...point }));
  let current = { ...points[0] };

  state.walls.forEach((wall, index) => {
    if (wall.deleted) {
      current = { ...points[index + 1] };
      return;
    }

    points[index] = { ...current };
    current = {
      x: current.x + Math.cos(wall.angle) * metersToPixels(wall.length),
      y: current.y + Math.sin(wall.angle) * metersToPixels(wall.length),
    };
    points[index + 1] = { ...current };
  });

  state.points = points;

  if (canvasManager) {
    canvasManager.updateSnapVertices();
  }
}

// NOTE: findWallNearPoint used to be duplicated here with its own copy of
// the hit-testing math. It's now delegated to the canvas manager's single
// canonical implementation so the two can never disagree about which wall
// is under the cursor.
function findWallNearPoint(point) {
  return getCanvasManager().findWallNearPoint(point);
}

function showFloatingInput(wallIndex) {
  const inputElement = document.querySelector(
    `#areaWallList input[data-wall-index="${wallIndex}"]`,
  );
  if (!inputElement || !state.walls[wallIndex] || state.walls[wallIndex].deleted) return;

  inputElement.value = state.walls[wallIndex].length.toFixed(2);
  inputElement.focus();
  inputElement.select();

  state.selectedWallIndex = wallIndex;
  state.editingWallIndex = wallIndex;
  state.showDeleteButton = true;
  isEditingWall = true;

  if (canvasManager) {
    canvasManager.setEditingWall(wallIndex);
  }

  showDeleteButton(wallIndex);
}

function hideFloatingInput() {
  state.selectedWallIndex = -1;
  state.editingWallIndex = -1;
  state.showDeleteButton = false;
  isEditingWall = false;

  if (canvasManager) {
    canvasManager.setEditingWall(-1);
  }

  hideDeleteButton();
}

function showDeleteButton(wallIndex) {
  const deleteBtn = document.getElementById("areaDeleteWallBtn");
  if (!deleteBtn) return;

  const start = state.points[wallIndex];
  const end = state.points[wallIndex + 1];
  if (!start || !end) return;

  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  const meioX = (start.x + end.x) / 2 + state.offsetX;
  const meioY = (start.y + end.y) / 2 + state.offsetY;

  deleteBtn.style.display = "flex";
  deleteBtn.style.left = (rect.left + meioX + 25) + "px";
  deleteBtn.style.top = (rect.top + meioY - 40) + "px";
  deleteBtn.dataset.wallIndex = wallIndex;
}

function hideDeleteButton() {
  const deleteBtn = document.getElementById("areaDeleteWallBtn");
  if (deleteBtn) {
    deleteBtn.style.display = "none";
  }
}

function deleteWall(wallIndex) {
  if (wallIndex < 0 || wallIndex >= state.walls.length) return;

  state.walls[wallIndex].deleted = true;
  state.closed = false;
  state.isDrawing = true;

  hideFloatingInput();
  pushHistory();
  updateAreaUI();
}

function hasDeletedWalls() {
  return state.walls.some((wall) => wall.deleted);
}

// ============ FECHAR / REABRIR FORMA ============
function closeShape() {
  if (state.points.length < 3 || hasDeletedWalls()) {
    // Mostra mensagem mais amigável
    const status = document.getElementById("areaCalculatorStatus");
    if (status) {
      status.textContent = state.points.length < 3
        ? "⚠️ Crie pelo menos 3 pontos antes de fechar a forma."
        : "⚠️ Não é possível fechar uma forma com paredes apagadas.";
      setTimeout(() => {
        if (status.textContent.startsWith("⚠️")) {
          updateAreaUI();
        }
      }, 2000);
    }
    return;
  }
  
  state.closed = true;
  state.isDrawing = false;
  hideFloatingInput();
  updateAreaUI();
  
  // Auto-fit da forma finalizada
  fitToView();
}

function reopenShape() {
  state.closed = false;
  state.isDrawing = true;
  updateAreaUI();
}

// ============ ÁREA / PERÍMETRO ============
function calculatePolygonArea() {
  if (!state.closed || state.points.length < 3) {
    return 0;
  }

  let area = 0;
  for (let index = 0; index < state.points.length; index += 1) {
    const current = state.points[index];
    const next = state.points[(index + 1) % state.points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2) / (getPixelsPerMeter() ** 2);
}

function calculatePerimeter() {
  return state.walls.reduce((sum, wall) => sum + (wall.deleted ? 0 : wall.length), 0);
}

// ============ LISTA DE PAREDES ============
function renderWallList() {
  const list = document.getElementById("areaWallList");
  if (!list) return;

  if (state.walls.length === 0) {
    list.innerHTML = '<div class="area-empty">Nenhuma parede criada.</div>';
    return;
  }

  list.innerHTML = state.walls
    .map((wall, index) => {
      if (wall.deleted) return "";
      const letter = getWallLetter(index);
      const isEditing = index === state.editingWallIndex;
      const isTooShort = wall.length < 0.02;
      return `
          <label class="area-wall-item ${isEditing ? 'editing' : ''} ${isTooShort ? 'warning' : ''}">
            <span><strong>Parede ${letter}</strong>${isTooShort ? ' <span class="wall-warning-icon" title="Parede muito curta">⚠️</span>' : ''}</span>
            <input type="number"
                   min="0.01"
                   step="0.01"
                   value="${wall.length.toFixed(2)}"
                   data-wall-index="${index}"
                   class="${isEditing ? 'wall-input-editing' : ''}">
            <span class="wall-letter-badge">${letter}</span>
            ${isEditing ? '<span class="editing-indicator">✏️</span>' : ''}
            <button type="button" class="btn-delete-wall" data-delete-wall="${index}" title="Deletar parede ${letter}">
              🗑️
            </button>
          </label>
        `;
    })
    .join("");

  list.querySelectorAll("input[data-wall-index]").forEach((input) => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.wallIndex);
      const value = Number.parseFloat(input.value);
      if (Number.isFinite(value) && value > 0 && state.walls[index]) {
        updateWallLength(index, value);
      }
    });

    input.addEventListener("change", () => {
      const index = Number(input.dataset.wallIndex);
      const value = Number.parseFloat(input.value);
      if (Number.isFinite(value) && value > 0 && state.walls[index]) {
        updateWallLength(index, value);
        pushHistory();
      }
    });
  });

  list.querySelectorAll("button[data-delete-wall]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const index = Number(btn.dataset.deleteWall);
      deleteWall(index);
    });
  });
}

function updateWallLength(index, value) {
  if (!state.walls[index]) return;

  state.walls[index].length = value;
  state.editingWallIndex = index;

  recalculatePointsFromWalls();

  if (canvasManager) {
    canvasManager.setEditingWall(index);
    canvasManager.draw();
  }

  updateWallListValues();
  updateAreaResult();
}

function updateWallListValues() {
  const inputs = document.querySelectorAll("#areaWallList input[data-wall-index]");
  inputs.forEach((input) => {
    const index = Number(input.dataset.wallIndex);
    if (state.walls[index] && document.activeElement !== input) {
      input.value = state.walls[index].length.toFixed(2);
    }
  });
}

function updateAreaResult() {
  const result = document.getElementById("areaCalculatorResult");
  const perimeterEl = document.getElementById("areaCalculatorPerimeter");
  if (result) {
    const area = calculatePolygonArea();
    result.textContent = `${formatAreaValue(area)} m²`;
  }
  if (perimeterEl) {
    perimeterEl.textContent = `${calculatePerimeter().toFixed(2)} m`;
  }
}

// ============ ATUALIZA UI ============
function updateAreaUI() {
  const status = document.getElementById("areaCalculatorStatus");
  const result = document.getElementById("areaCalculatorResult");
  const perimeterEl = document.getElementById("areaCalculatorPerimeter");
  const area = calculatePolygonArea();

  // ===== Botão Confirmar =====
  const confirmBtn = document.getElementById("btnConfirm");
  if (confirmBtn) {
    // Só libera se a forma estiver fechada E tiver pelo menos 3 pontos
    if (state.closed && state.points.length >= 3) {
      confirmBtn.disabled = false;
      confirmBtn.classList.add("active");
      confirmBtn.textContent = "✅ Confirmar";
    } else {
      confirmBtn.disabled = true;
      confirmBtn.classList.remove("active");
      confirmBtn.textContent = state.points.length >= 3 ? "🔒 Feche a forma" : "⚠️ Desenhe a forma";
    }
  }

  // ===== Botão Fechar Forma =====
  const closeBtn = document.querySelector('[data-area-action="close-shape"]');
  const reopenBtn = document.querySelector('[data-area-action="reopen-shape"]');
  
  if (closeBtn) {
    closeBtn.style.display = state.closed ? "none" : "inline-block";
    closeBtn.disabled = state.points.length < 3 || hasDeletedWalls();
    // Se tiver menos de 3 pontos, mostra tooltip
    if (state.points.length < 3) {
      closeBtn.title = "Crie pelo menos 3 pontos antes de fechar";
    } else if (hasDeletedWalls()) {
      closeBtn.title = "Não é possível fechar uma forma com paredes apagadas";
    } else {
      closeBtn.title = "Fechar a forma";
    }
  }
  
  if (reopenBtn) {
    reopenBtn.style.display = state.closed ? "inline-block" : "none";
  }

  // ===== Status =====
  if (status) {
    if (state.closed) {
      const warn = canvasManager && canvasManager.hasSelfIntersection()
        ? " ⚠️ Forma com auto-interseção — revise as paredes."
        : "";
      status.textContent = `✅ Forma fechada. Confirme para aplicar a área.${warn}`;
    } else if (state.points.length === 0) {
      status.textContent = "🖱️ Clique para iniciar o desenho | Botão direito para navegar";
    } else if (!state.isDrawing) {
      status.textContent = "🔍 Modo navegação | Botão direito para mover | ESC para voltar a desenhar";
    } else {
      const snapText = state.snapActive
        ? " ⚡ Snap ativado!"
        : (state.alignSnap ? " 📐 Alinhado" : (state.gridSnapActive ? " ⊞ Grade" : ""));
      const orthoText = canvasManager && canvasManager.isOrthoActive() ? " 🔒 " : "";
      status.textContent = `🖱️ Clique para adicionar paredes | Duplo clique na parede para editar${orthoText}${snapText}`;
    }
  }

  // ===== Resultados =====
  if (result) {
    result.textContent = `${formatAreaValue(area)} m²`;
  }
  if (perimeterEl) {
    perimeterEl.textContent = `${calculatePerimeter().toFixed(2)} m`;
  }

  // ===== Badge =====
  const badge = document.getElementById("areaStatusBadge");
  if (badge) {
    if (state.closed) {
      badge.textContent = "✅ Concluído";
      badge.className = "area-status-badge status-concluido";
    } else if (state.points.length === 0) {
      badge.textContent = "⏳ Aguardando";
      badge.className = "area-status-badge status-aguardando";
    } else if (!state.isDrawing) {
      badge.textContent = "🔍 Navegando";
      badge.className = "area-status-badge status-navegando";
    } else {
      badge.textContent = "✏️ Desenhando" + (state.snapActive ? " ⚡" : "");
      badge.className = "area-status-badge status-desenhando";
    }
  }

  // ===== Ortho =====
  const orthoBtn = document.querySelector('[data-area-action="toggle-ortho"]');
  if (orthoBtn) {
    orthoBtn.classList.toggle("active", !!state.orthoMode);
  }

  // ===== Contagem de paredes =====
  const wallCount = document.getElementById("areaWallCount");
  if (wallCount) {
    wallCount.textContent = state.walls.length;
  }

  renderWallList();
  updateUndoRedoButtons();

  if (canvasManager) {
    canvasManager.draw();
  }

  updateZoomInfo();
  updateCanvasCursor();
}

function updateCanvasCursor() {
  const canvas = getCanvas();
  if (!canvas) return;

  if (isPanning) {
    canvas.style.cursor = "grabbing";
  } else if (state.isDrawing && !state.closed) {
    canvas.style.cursor = "crosshair";
  } else {
    canvas.style.cursor = "grab";
  }
}

// ============ EVENTOS DO CANVAS ============
function handleCanvasClick(event) {
  if (!state.isDrawing || state.closed) {
    return;
  }

  const manager = getCanvasManager();
  const raw = manager.getCanvasPoint(event);

  const resolved = manager.resolvePoint(raw);
  state.snapActive = !!resolved.snap;
  state.gridSnapActive = !!resolved.gridSnap;
  state.alignSnap = resolved.align || null;
  state.snapPoint = resolved.snap || (resolved.gridSnap ? resolved.point : null);

  if (state.points.length === 0) {
    state.points.push({ x: resolved.point.x, y: resolved.point.y });
    manager.updateSnapVertices();
    updateAreaUI();
    return;
  }

  const last = state.points[state.points.length - 1];

  // BUGFIX: ortho used to be applied whenever there was no *vertex* snap,
  // which meant a resolved grid-snap point got shoved off the grid by the
  // ortho angle afterwards. Both snap kinds now fully bypass ortho.
  const target = manager.resolveTargetForOrtho(last, resolved);

  const dx = target.x - last.x;
  const dy = target.y - last.y;

  const distMetros = pixelsToMeters(Math.sqrt(dx * dx + dy * dy));
  if (distMetros < 0.01) {
    flashStatus("Parede muito curta — clique mais afastado do último ponto.");
    return;
  }

  const angulo = Math.atan2(dy, dx);
  state.walls.push({ length: distMetros, angle: angulo });
  recalculatePointsFromWalls();
  pushHistory();
  updateAreaUI();

  const wallIndexToEdit = state.walls.length - 1;
  if (floatingInputTimer) {
    clearTimeout(floatingInputTimer);
  }
  floatingInputTimer = setTimeout(() => {
    floatingInputTimer = null;
    // Guard against a second click having deleted/undone this wall in the
    // meantime (e.g. rapid double-click race that used to open the wrong
    // wall's input).
    if (state.walls[wallIndexToEdit]) {
      showFloatingInput(wallIndexToEdit);
    }
  }, 150);
}

function flashStatus(message) {
  const status = document.getElementById("areaCalculatorStatus");
  if (!status) return;
  const previous = status.textContent;
  status.textContent = `⚠️ ${message}`;
  setTimeout(() => {
    // Only restore if nothing else has overwritten it since.
    if (status.textContent === `⚠️ ${message}`) {
      status.textContent = previous;
    }
  }, 1600);
}

function handleCanvasDoubleClick(event) {
  if (state.closed) return;

  const manager = getCanvasManager();
  const point = manager.getCanvasPoint(event);
  const wallIndex = findWallNearPoint(point);
  if (wallIndex >= 0) {
    if (floatingInputTimer) {
      clearTimeout(floatingInputTimer);
      floatingInputTimer = null;
    }
    showFloatingInput(wallIndex);
  }
}

function getCanvasManager() {
  if (!canvasManager) {
    canvasManager = new AreaCalculatorCanvas(state, { pixelsPerMeter: PIXELS_PER_METER });
  }
  return canvasManager;
}

// ============ MODAL ============
function ensureModal() {
  if (document.getElementById(MODAL_ID)) {
    return;
  }

  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "area-calculator-modal";
  modal.innerHTML = `
    <div class="area-calculator-dialog" role="dialog" aria-modal="true" aria-labelledby="areaCalculatorTitle">
      <div class="area-calculator-header">
        <div class="header-title-group">
          <h3 id="areaCalculatorTitle">Cálculo da área</h3>
          <div class="area-status-badge status-aguardando" id="areaStatusBadge">⏳ Aguardando</div>
          <div class="area-calculator-result" id="areaCalculatorResult">0.00 m²</div>
        </div>
        <button type="button" class="btn btn-small btn-secondary" data-area-action="close">Fechar</button>
      </div>
      
      <div class="area-calculator-body">
        <!-- Painel esquerdo com controles -->
        <aside class="area-calculator-panel">
          <div class="area-calculator-status" id="areaCalculatorStatus">Clique no canvas para iniciar.</div>
          <div class="area-result-detail">
            <span>Perímetro</span>
            <span id="areaCalculatorPerimeter">0.00 m</span>
          </div>

          <div class="area-config-group">
            <div class="area-config-row">
              <span>Modo Perpendicular</span>
              <button type="button" class="btn btn-small area-ortho-toggle active" data-area-action="toggle-ortho">🔒</button>
            </div>
            <div class="area-config-row">
              <span>Ângulo de snap</span>
              <select id="areaAngleSnap">
                <option value="90">90°</option>
                <option value="45">45°</option>
                <option value="30">30°</option>
              </select>
            </div>
            <div class="area-config-row">
              <span>Espessura parede (m)</span>
              <input type="number" id="areaWallThickness" min="0.05" max="0.5" step="0.01" value="0.15">
            </div>
          </div>

          <div class="area-toolbar-row">
            <button type="button" class="btn btn-small btn-secondary" data-area-action="undo" title="Desfazer (Ctrl+Z)">↶ Desfazer</button>
            <button type="button" class="btn btn-small btn-secondary" data-area-action="redo" title="Refazer (Ctrl+Y)">↷ Refazer</button>
            <button type="button" class="btn btn-small btn-secondary" data-area-action="fit" title="Ajustar à tela (Zoom Extents)">⤢ Ajustar</button>
          </div>

          <div class="area-calculator-actions">
            <button type="button" class="btn btn-small btn-primary" data-area-action="zoom-in">Zoom +</button>
            <button type="button" class="btn btn-small btn-primary" data-area-action="zoom-out">Zoom -</button>
            <button type="button" class="btn btn-small btn-close-shape" data-area-action="close-shape" id="btnCloseShape" disabled>Criar forma</button>
            <button type="button" class="btn btn-small btn-warning" data-area-action="reopen-shape" style="display:none;" id="btnReopenShape">Reabrir</button>
            <button type="button" class="btn btn-small btn-danger" data-area-action="reset">Limpar</button>
          </div>
          
          <div class="area-calculator-actions-bottom">
            <button type="button" class="btn btn-confirm" data-area-action="confirm" id="btnConfirm" disabled>⚠️ Desenhe a forma</button>
            <button type="button" class="btn btn-secondary" data-area-action="close">Cancelar</button>
          </div>
        </aside>

        <!-- Container central: Canvas + Lista de paredes lado a lado -->
        <div class="area-canvas-and-walls">
          <div class="area-canvas-wrap">
            <canvas id="areaCalculatorCanvas" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}"></canvas>
            <div class="area-shift-indicator" id="areaShiftIndicator" style="display:none;">🔒 SHIFT</div>
            <div class="area-snap-indicator" id="areaSnapIndicator" style="display:none;"></div>
            <div class="area-zoom-info" id="areaZoomInfo">Zoom: 100%</div>
            <div class="area-coords-info" id="areaCoordsInfo"></div>
            <div class="area-navigation-hint" id="areaNavigationHint" style="display:none;">🔍 Modo navegação - Botão direito para mover</div>
          </div>
          
          <!-- Lista de paredes ao lado direito do canvas -->
          <div class="area-wall-list-container">
            <div class="area-wall-list-header">
              <span>📋 Paredes</span>
              <span class="wall-count" id="areaWallCount">0</span>
            </div>
            <div class="area-wall-list" id="areaWallList">
              <div class="area-empty">Nenhuma parede criada.</div>
            </div>
          </div>
        </div>
      </div>

      <button type="button" class="area-delete-wall-btn" id="areaDeleteWallBtn" style="display:none;" title="Deletar parede">
        <span class="delete-icon">🗑️</span>
        <span class="delete-text">Deletar</span>
      </button>
    </div>
  `;

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeAreaCalculatorModal();
      return;
    }

    const action = event.target?.dataset?.areaAction;
    if (action) {
      handleAreaAction(action);
    }
  });

  document.body.appendChild(modal);

  bindCanvasEvents();
  bindDeleteButtonEvents();
  bindConfigEvents();

  // Re-run HiDPI setup on resize so the canvas stays crisp if the modal's
  // layout reflows (e.g. viewport resize, panel collapse on mobile).
  window.addEventListener("resize", () => {
    if (canvasManager && document.getElementById(MODAL_ID)?.classList.contains("is-open")) {
      canvasManager.setupHiDPI();
      canvasManager.draw();
    }
  });
}

function bindConfigEvents() {
  const angleSelect = document.getElementById("areaAngleSnap");
  if (angleSelect) {
    angleSelect.addEventListener("change", () => {
      state.angleSnapStep = Number.parseInt(angleSelect.value, 10) || 90;
      if (canvasManager) canvasManager.draw();
    });
  }

  const thicknessInput = document.getElementById("areaWallThickness");
  if (thicknessInput) {
    thicknessInput.addEventListener("input", () => {
      const value = Number.parseFloat(thicknessInput.value);
      if (Number.isFinite(value) && value > 0) {
        state.wallThickness = value;
        if (canvasManager) canvasManager.draw();
      }
    });
  }
}

function bindDeleteButtonEvents() {
  const deleteBtn = document.getElementById("areaDeleteWallBtn");
  if (!deleteBtn) return;

  deleteBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const wallIndex = Number(deleteBtn.dataset.wallIndex);
    if (wallIndex >= 0 && wallIndex < state.walls.length) {
      deleteWall(wallIndex);
    }
  });
}

function bindCanvasEvents() {
  const canvas = getCanvas();
  if (!canvas || canvas.dataset.areaBound === "true") {
    return;
  }

  canvas.dataset.areaBound = "true";
  const manager = getCanvasManager();

  canvas.addEventListener("click", handleCanvasClick);
  canvas.addEventListener("dblclick", handleCanvasDoubleClick);

  // BUGFIX (right-click pan): panning previously updated state.offsetX/Y but
  // draw() never applied that offset as a canvas transform, so nothing ever
  // visibly moved. draw() now wraps world-space content in
  // ctx.translate(offsetX, offsetY) — see area-calculator-canvas.js.
  canvas.addEventListener("mousedown", (event) => {
    if (event.button === 2) {
      event.preventDefault();
      rightMouseDown = true;
      isPanning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;

      state.isDrawing = false;
      hideFloatingInput();

      const navHint = document.getElementById("areaNavigationHint");
      if (navHint) navHint.style.display = "block";

      updateAreaUI();
      updateCanvasCursor();
    }
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  canvas.addEventListener("mousemove", (event) => {
    if (isPanning && rightMouseDown) {
      const dx = event.clientX - panStartX;
      const dy = event.clientY - panStartY;
      state.offsetX += dx;
      state.offsetY += dy;
      panStartX = event.clientX;
      panStartY = event.clientY;
      manager.draw();
      return;
    }

    if (!isPanning) {
      manager.handleMouseMove(event);
      updateCoordsInfo(event);
    }
  });

  canvas.addEventListener("mouseleave", () => {
    if (!isPanning) {
      manager.handleMouseLeave();
      const coordsInfo = document.getElementById("areaCoordsInfo");
      if (coordsInfo) coordsInfo.textContent = "";
    }
  });

  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoomArea(event.deltaY < 0 ? 1.1 : 0.9);
    },
    { passive: false },
  );

  document.addEventListener("mousemove", (event) => {
    if (isPanning && rightMouseDown) {
      const dx = event.clientX - panStartX;
      const dy = event.clientY - panStartY;
      state.offsetX += dx;
      state.offsetY += dy;
      panStartX = event.clientX;
      panStartY = event.clientY;
      manager.draw();
    }
  });

  document.addEventListener("mouseup", (event) => {
    if (event.button === 2) {
      rightMouseDown = false;
      isPanning = false;
      updateCanvasCursor();

      const navHint = document.getElementById("areaNavigationHint");
      if (navHint) navHint.style.display = "none";
    }
  });

  document.addEventListener("keydown", (event) => {
    const modalOpen = document.getElementById(MODAL_ID)?.classList.contains("is-open");
    if (!modalOpen) return;

    if (event.key === "Shift") {
      state.shiftPressed = true;
      const indicator = document.getElementById("areaShiftIndicator");
      if (indicator) indicator.style.display = "block";
      manager.draw();
    }
    if (event.key === "Escape") {
      if (isEditingWall) {
        hideFloatingInput();
      } else if (!state.isDrawing) {
        state.isDrawing = true;
        updateAreaUI();
      }
    }
    if (event.key === "Delete" && state.editingWallIndex >= 0) {
      deleteWall(state.editingWallIndex);
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      undo();
    }
    if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"))) {
      event.preventDefault();
      redo();
    }
    if (event.key.toLowerCase() === "o" && !event.ctrlKey && !event.metaKey) {
      toggleOrthoMode();
    }
    if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey) {
      fitToView();
    }
  });

  document.addEventListener("keyup", (event) => {
    if (event.key === "Shift") {
      state.shiftPressed = false;
      const indicator = document.getElementById("areaShiftIndicator");
      if (indicator) indicator.style.display = "none";
      manager.draw();
    }
  });
}

function updateCoordsInfo(event) {
  const coordsInfo = document.getElementById("areaCoordsInfo");
  if (!coordsInfo || !canvasManager) return;
  const point = canvasManager.getCanvasPoint(event);
  const mx = pixelsToMeters(point.x);
  const my = pixelsToMeters(point.y);
  coordsInfo.textContent = `X: ${mx.toFixed(2)}m  Y: ${my.toFixed(2)}m`;
}

function toggleOrthoMode() {
  state.orthoMode = !state.orthoMode;
  updateAreaUI();
}

// ============ AÇÕES ============
function handleAreaAction(action) {
  if (action === "close") closeAreaCalculatorModal();
  if (action === "close-shape") closeShape();
  if (action === "reopen-shape") reopenShape();
  if (action === "reset") {
    const roomId = state.roomId;
    state = createInitialState(roomId);
    state.onScaleChanged = recalculatePointsFromWalls;
    if (canvasManager) {
      canvasManager.updateState(state);
    }
    updateAreaUI();
  }
  if (action === "zoom-in") zoomArea(1.2);
  if (action === "zoom-out") zoomArea(0.8);
  if (action === "fit") fitToView();
  if (action === "confirm") confirmAreaCalculator();
  if (action === "undo") undo();
  if (action === "redo") redo();
  if (action === "toggle-ortho") toggleOrthoMode();
}

function confirmAreaCalculator() {
  // Verifica se a forma está fechada
  if (!state.closed || state.points.length < 3) {
    const status = document.getElementById("areaCalculatorStatus");
    if (status) {
      status.textContent = "⚠️ Feche a forma antes de confirmar!";
      setTimeout(() => {
        if (status.textContent === "⚠️ Feche a forma antes de confirmar!") {
          updateAreaUI();
        }
      }, 2000);
    }
    return;
  }

  const areaInput = document.querySelector(
    `input[data-field="area"][data-room-id="${state.roomId}"]`,
  );
  if (!areaInput) {
    closeAreaCalculatorModal();
    return;
  }

  const calculatedArea = calculatePolygonArea();
  if (calculatedArea > 0) {
    areaInput.value = formatAreaValue(calculatedArea);
    const shapeInput = getAreaShapeInput(state.roomId);
    if (shapeInput) {
      shapeInput.value = serializeAreaShape();
      shapeInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (typeof window.updateRoomVolumeFromArea === "function") {
      window.updateRoomVolumeFromArea(areaInput);
    }
    calculateVazaoArAndThermalGains(state.roomId);
    notifyAreaShapeChanged(state.roomId);
  }

  closeAreaCalculatorModal();
}

function openAreaCalculatorModal(roomId) {
  ensureModal();
  state = createInitialState(roomId);
  state.onScaleChanged = recalculatePointsFromWalls;

  if (canvasManager) {
    canvasManager.updateState(state);
    canvasManager.setupHiDPI();
  } else {
    canvasManager = new AreaCalculatorCanvas(state, { pixelsPerMeter: PIXELS_PER_METER });
  }

  restoreSavedAreaShape(roomId);

  const angleSelect = document.getElementById("areaAngleSnap");
  if (angleSelect) angleSelect.value = String(state.angleSnapStep);
  const thicknessInput = document.getElementById("areaWallThickness");
  if (thicknessInput) thicknessInput.value = String(state.wallThickness);

  const modal = document.getElementById(MODAL_ID);
  modal.classList.add("is-open");
  document.body.classList.add("area-calculator-open");
  updateAreaUI();
}

function closeAreaCalculatorModal() {
  hideFloatingInput();
  isPanning = false;
  rightMouseDown = false;
  if (floatingInputTimer) {
    clearTimeout(floatingInputTimer);
    floatingInputTimer = null;
  }

  const modal = document.getElementById(MODAL_ID);
  if (modal) {
    modal.classList.remove("is-open");
  }
  document.body.classList.remove("area-calculator-open");
}

// ============ EXPORT ============
if (typeof window !== "undefined") {
  window.openAreaCalculatorModal = openAreaCalculatorModal;
  window.closeAreaCalculatorModal = closeAreaCalculatorModal;
  window.zoomArea = zoomArea;
  window.refreshAreaCalculatorButton = refreshAreaCalculatorButton;
  window.refreshAllAreaCalculatorButtons = refreshAllAreaCalculatorButtons;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refreshAllAreaCalculatorButtons);
  } else {
    refreshAllAreaCalculatorButtons();
  }
}

export { openAreaCalculatorModal, closeAreaCalculatorModal };
