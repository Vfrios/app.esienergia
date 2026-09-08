/**
 * data/modules/machines/machines-core.js
 * Sistema de máquinas
 *
 * CORRIGIDO:
 * - Seleção automática de capacidade apenas para Tubo Axial após aplicação
 * - Seleção automática acontece apenas UMA vez
 * - Capacidade seleciona valor MAIS PRÓXIMO (não importa se maior ou menor)
 */

import { updateElementText, safeNumber } from "../../utils/core-utils.js";
import { generateMachineId } from "../../utils/id-generator.js";

// =============================================================================
// CACHE E ESTADO GLOBAL
// =============================================================================

if (typeof window !== "undefined" && !window.machinesDataCache) {
  window.machinesDataCache = null;
}

// =============================================================================
// CONTROLE DE SELEÇÃO AUTOMÁTICA
// =============================================================================

// Flag global para controlar se a seleção automática já foi executada
// Chave: machineId, Valor: boolean
const autoSelectionExecuted = new Map();
const VENTILATION_APPLICATIONS = [
  "pressurizacao",
  "exaustao_bateria",
  "exaustao_baia_trafo",
];
const CAPACITY_USER_EDITED_ATTR = "data-capacity-user-edited";
const CAPACITY_AUTO_CHANGE_ATTR = "data-capacity-auto-change";

function setCapacityUserEdited(selectElement, isEdited) {
  if (!selectElement) return;
  selectElement.setAttribute(
    CAPACITY_USER_EDITED_ATTR,
    isEdited ? "true" : "false",
  );
}

function isCapacityUserEdited(selectElement) {
  return selectElement?.getAttribute(CAPACITY_USER_EDITED_ATTR) === "true";
}

function markCapacityAutoChange(selectElement, isAuto) {
  if (!selectElement) return;
  if (isAuto) {
    selectElement.setAttribute(CAPACITY_AUTO_CHANGE_ATTR, "true");
    return;
  }
  selectElement.removeAttribute(CAPACITY_AUTO_CHANGE_ATTR);
}

function isCapacityAutoChange(selectElement) {
  return selectElement?.getAttribute(CAPACITY_AUTO_CHANGE_ATTR) === "true";
}

// =============================================================================
// FUNÇÕES CORE UNIFICADAS
// =============================================================================

/**
 * Carrega dados das máquinas com cache
 */
async function loadMachinesData() {
  if (window.machinesDataCache?.machines?.length) {
    return window.machinesDataCache;
  }

  try {
    const response = await fetch("/machines");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const machinesData = {
      machines: Array.isArray(data) ? data : data.machines,
    };

    window.machinesDataCache = machinesData;
    window.machinesData = machinesData.machines;
    return machinesData;
  } catch (error) {
    console.error(" Erro ao carregar máquinas:", error);
    return window.machinesDataCache || { machines: [] };
  }
}

/**
 * DISPARA EVENTO QUANDO UM CAMPO DE MÁQUINA É ALTERADO
 */
function notifyMachineFieldChange(machineId, fieldType) {
  if (window.handleMachineFieldChange) {
    window.handleMachineFieldChange(machineId, fieldType);
  }

  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  const roomId = machineElement?.dataset.roomId;

  if (roomId) {
    const event = new CustomEvent("machineFieldChanged", {
      detail: {
        machineId: machineId,
        roomId: roomId,
        fieldType: fieldType,
      },
    });
    window.dispatchEvent(event);
  }
}

// =============================================================================
// SISTEMA DE NOMENCLATURA AUTOMÁTICA
// =============================================================================

/**
 * GERA NOME AUTOMÁTICO APENAS QUANDO TIPO E CAPACIDADE ESTÃO SELECIONADOS
 */
function generateMachineName(machineType, roomId, currentMachineId = null) {
  console.log(` Gerando nome automático para ${machineType} na sala ${roomId}`);

  const container = document.getElementById(`machines-${roomId}`);
  if (!container) return machineType;

  const existingMachines = Array.from(
    container.querySelectorAll(".climatization-machine"),
  );
  const allMachinesData = [];

  existingMachines.forEach((machine) => {
    const machineId = machine.dataset.machineId;
    const typeSelect = machine.querySelector(".machine-type-select");
    const powerSelect = machine.querySelector(".machine-power-select");

    if (
      typeSelect &&
      typeSelect.value === machineType &&
      powerSelect &&
      powerSelect.value
    ) {
      allMachinesData.push({
        machineId: machineId,
        type: typeSelect.value,
        power: powerSelect.value,
        capacityValue: getGenericCapacityValue(powerSelect.value),
      });
    }
  });

  if (currentMachineId && machineType) {
    const currentMachineElement = document.querySelector(
      `[data-machine-id="${currentMachineId}"]`,
    );
    const powerSelect = currentMachineElement?.querySelector(
      ".machine-power-select",
    );
    const currentPower = powerSelect ? powerSelect.value : "";

    if (currentPower) {
      allMachinesData.push({
        machineId: currentMachineId,
        type: machineType,
        power: currentPower,
        capacityValue: getGenericCapacityValue(currentPower),
        isNew: true,
      });
    } else {
      return machineType;
    }
  }

  if (allMachinesData.length === 0) {
    return machineType;
  }

  allMachinesData.sort((a, b) => b.capacityValue - a.capacityValue);

  const capacityGroups = {};
  allMachinesData.forEach((machine) => {
    const capacityKey = machine.power;
    if (!capacityGroups[capacityKey]) {
      capacityGroups[capacityKey] = [];
    }
    capacityGroups[capacityKey].push(machine);
  });

  const sortedGroups = Object.entries(capacityGroups).sort(
    ([, groupA], [, groupB]) => {
      const capacityA = groupA[0].capacityValue;
      const capacityB = groupB[0].capacityValue;
      return capacityB - capacityA;
    },
  );

  let groupNumber = 1;
  const newNames = {};

  sortedGroups.forEach(([capacityKey, machines]) => {
    machines.sort((a, b) => a.machineId.localeCompare(b.machineId));

    machines.forEach((machine, index) => {
      const letter = String.fromCharCode(65 + index);
      const newName = `${machineType}-${groupNumber.toString().padStart(2, "0")}${letter} (${machine.power})`;
      newNames[machine.machineId] = newName;
    });

    groupNumber++;
  });

  if (currentMachineId) {
    return newNames[currentMachineId] || machineType;
  } else {
    Object.entries(newNames).forEach(([machineId, newName]) => {
      const machineElement = document.querySelector(
        `[data-machine-id="${machineId}"]`,
      );
      if (machineElement) {
        const titleInput = machineElement.querySelector(
          ".machine-title-editable",
        );
        if (titleInput && titleInput.value !== newName) {
          titleInput.value = newName;
        }
      }
    });
  }
}

/**
 * OBTÉM VALOR NUMÉRICO DA CAPACIDADE PARA ORDENAÇÃO
 */
function getGenericCapacityValue(powerText) {
  if (!powerText) return 0;

  try {
    const numericMatch = powerText.match(/(\d+[.,]?\d*)/);
    if (numericMatch) {
      return parseFloat(numericMatch[0].replace(",", "."));
    }
    return 0;
  } catch (error) {
    console.error("Erro ao obter capacidade:", error);
    return 0;
  }
}

function getClimatizationRequiredCapacity(roomId) {
  const cargaInput = document.querySelector(`#carga-estimada-${roomId} input`);
  const fatorSegurancaInput = document.getElementById(
    `fator-seguranca-${roomId}`,
  );

  const cargaEstimada = Number.parseFloat(cargaInput?.value || "");
  if (!Number.isFinite(cargaEstimada) || cargaEstimada <= 0) {
    return null;
  }

  const fatorSegurancaRaw = Number.parseFloat(
    fatorSegurancaInput?.value || "0",
  );
  const fatorSeguranca = Number.isFinite(fatorSegurancaRaw)
    ? fatorSegurancaRaw / 100
    : 0;

  return cargaEstimada * (1 + fatorSeguranca);
}

function getBackupAdditionalUnits(backupType) {
  switch (backupType) {
    case "n+1":
      return 1;
    case "n+2":
      return 2;
    default:
      return 0;
  }
}

function getClimatizationBackupType(roomId) {
  const roomContent = document.getElementById(`room-content-${roomId}`);
  if (!roomContent) return "n";

  const backupSelect = roomContent.querySelector(".backup-select");
  if (backupSelect?.value) {
    return backupSelect.value;
  }

  const climaBackupInput = roomContent.querySelector(
    '.clima-input[data-field="backup"]',
  );
  if (climaBackupInput?.value) {
    return climaBackupInput.value;
  }

  return "n";
}

function updateClimatizationQuantityFromCapacity(machineId, options = {}) {
  const { force = false } = options;

  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return false;

  const aplicacaoSelect = machineElement.querySelector(
    ".machine-aplicacao-select",
  );
  const powerSelect = machineElement.querySelector(".machine-power-select");
  const qntInput = machineElement.querySelector(".machine-qnt-input");
  const roomId = machineElement.dataset.roomId;

  if (!aplicacaoSelect || !powerSelect || !qntInput || !roomId) return false;
  if (aplicacaoSelect.value !== "climatizacao") return false;

  if (!force && qntInput.getAttribute("data-user-edited") === "true") {
    return false;
  }

  const capacidadeSelecionada = getGenericCapacityValue(powerSelect.value);
  const capacidadeNecessaria = getClimatizationRequiredCapacity(roomId);
  const backupType = getClimatizationBackupType(roomId);
  const backupAdditionalUnits = getBackupAdditionalUnits(backupType);

  if (
    !Number.isFinite(capacidadeSelecionada) ||
    capacidadeSelecionada <= 0 ||
    !Number.isFinite(capacidadeNecessaria) ||
    capacidadeNecessaria <= 0
  ) {
    return false;
  }

  const unidadesOperacionais = Math.max(
    1,
    Math.ceil(capacidadeNecessaria / capacidadeSelecionada),
  );
  const quantidadeCalculada = unidadesOperacionais + backupAdditionalUnits;
  qntInput.value = quantidadeCalculada;
  qntInput.setAttribute("data-user-edited", "false");

  console.log(
    ` Quantidade climatização atualizada para ${quantidadeCalculada} (${unidadesOperacionais} operacionais + ${backupAdditionalUnits} backup, tipo: ${backupType}, necessária: ${capacidadeNecessaria.toFixed(2)} TR, máquina: ${capacidadeSelecionada} TR)`,
  );

  calculateMachinePrice(machineId);
  return true;
}

function syncClimatizationMachineQuantitiesFromCapacity(roomId) {
  const roomMachines = document.querySelectorAll(
    `[data-room-id="${roomId}"].climatization-machine`,
  );

  roomMachines.forEach((machineElement) => {
    const machineId = machineElement.dataset.machineId;
    if (!machineId) return;

    updateClimatizationQuantityFromCapacity(machineId);
  });
}

function calculateVentilationFlow(aplicacao, inputs) {
  switch (aplicacao) {
    case "pressurizacao":
      return inputs.vazaoAr ? inputs.vazaoAr * 3.6 : null;
    case "exaustao_bateria":
      return inputs.volume ? inputs.volume * 12 : null;
    case "exaustao_baia_trafo":
      if (inputs.potencia && inputs.tempInterna && inputs.tempExterna) {
        const deltaT = inputs.tempInterna - inputs.tempExterna;
        if (deltaT !== 0) {
          const constants = getSystemConstants();
          const Q = inputs.potencia * 859.85;
          const massaGR = Q / (constants.fatorEspecifico * Math.abs(deltaT));
          const massaAr = massaGR / 1000;
          return Math.abs(massaAr / constants.Densi_ar);
        }
      }
      return null;
    default:
      return null;
  }
}

function selectBestVentilationCapacity(capacityOptions, vazaoNecessaria) {
  const sortedOptions = [...capacityOptions]
    .filter((option) => Number.isFinite(option.value) && option.value > 0)
    .sort((a, b) => a.value - b.value);

  if (
    !sortedOptions.length ||
    !Number.isFinite(vazaoNecessaria) ||
    vazaoNecessaria <= 0
  ) {
    return null;
  }

  const singleMachineOption = sortedOptions.find(
    (option) => option.value >= vazaoNecessaria,
  );
  if (singleMachineOption) {
    return {
      bestOption: singleMachineOption,
      quantity: 1,
      totalCapacity: singleMachineOption.value,
      balance: singleMachineOption.value - vazaoNecessaria,
    };
  }

  const largestOption = sortedOptions[sortedOptions.length - 1];
  const quantity = Math.ceil(vazaoNecessaria / largestOption.value);
  const totalCapacity = quantity * largestOption.value;

  return {
    bestOption: largestOption,
    quantity,
    totalCapacity,
    balance: totalCapacity - vazaoNecessaria,
  };
}

// =============================================================================
// FUNÇÃO PRINCIPAL PARA CONTROLE DE QUANTIDADE
// =============================================================================

/**
 * ATUALIZA QUANTIDADE COM BASE NA APLICAÇÃO - CORRIGIDO
 * Respeita data-user-edited para QUALQUER aplicação
 */
function handleAplicacaoChange(machineId) {
  console.log(` Aplicação alterada na máquina ${machineId}`);

  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return;

  const aplicacaoSelect = machineElement.querySelector(
    ".machine-aplicacao-select",
  );
  const qntInput = machineElement.querySelector(".machine-qnt-input");
  const powerSelect = machineElement.querySelector(".machine-power-select");
  const roomId = machineElement.dataset.roomId;

  if (!aplicacaoSelect || !qntInput || !roomId) return;

  const aplicacao = aplicacaoSelect.value;
  const quantidadeAtual = qntInput.value;
  const isUserEdited = qntInput.getAttribute("data-user-edited") === "true";

  if (VENTILATION_APPLICATIONS.includes(aplicacao)) {
    autoSelectionExecuted.set(machineId, false);
  }

  setCapacityUserEdited(powerSelect, false);

  if (aplicacao === "climatizacao") {
    qntInput.setAttribute("data-user-edited", "false");
  }

  console.log(` - Aplicação selecionada: ${aplicacao}`);
  console.log(` - Quantidade atual: ${quantidadeAtual}`);
  console.log(` - Editada pelo usuário: ${isUserEdited}`);

  // REGRA ÚNICA: Se foi editado pelo usuário, NUNCA alterar automaticamente
  if (isUserEdited) {
    console.log(
      ` Quantidade marcada como manual (${quantidadeAtual}), ignorando alteração automática para TODAS as aplicações.`,
    );
  } else {
    // Só executa lógica automática se NÃO foi editado pelo usuário
    console.log(
      ` Quantidade automática permitida (não foi editada manualmente)`,
    );

    if (aplicacao === "climatizacao") {
      updateClimatizationQuantityFromCapacity(machineId, { force: true });
      // Para climatização, tenta pegar do backup
      const backupElement = null; // legado desativado
      if (backupElement) {
        const backupText = backupElement.textContent.trim();
        const match = backupText.match(/(\d+)/);
        if (match) {
          const backupValue = parseInt(match[1]);
          if (backupValue > 0 && backupValue !== parseInt(quantidadeAtual)) {
            qntInput.value = backupValue;
            console.log(
              ` Quantidade climatização atualizada para ${backupValue} (backup: ${backupText})`,
            );
          }
        }
      }
    } else if (
      ["pressurizacao", "exaustao_bateria", "exaustao_baia_trafo"].includes(
        aplicacao,
      )
    ) {
      // Para ventilação, pode ter lógica específica se necessário
      console.log(
        ` Aplicação de ventilação (${aplicacao}) - mantendo quantidade atual: ${quantidadeAtual}`,
      );
      // Aqui você pode adicionar lógica específica para ventilação se necessário
    }
  }

  if (VENTILATION_APPLICATIONS.includes(aplicacao)) {
    setTimeout(() => {
      applyVentilationCapacityBusinessRules(machineId, roomId);
    }, 0);
  }

  calculateMachinePrice(machineId);
  notifyMachineFieldChange(machineId, "aplicacao");

  const event = new CustomEvent("machineChanged", {
    detail: {
      machineId: machineId,
      roomId: roomId,
      changeType: "aplicacao",
      aplicacao: aplicacao,
      userEdited: isUserEdited,
    },
  });
  window.dispatchEvent(event);
}

// =============================================================================
// CONSTRUÇÃO DE UI UNIFICADA
// =============================================================================

/**
 * Constrói seção completa de máquinas
 */
function buildMachinesSection(obraId, projectId, roomName, finalRoomId) {
  if (!finalRoomId) return "";

  return `
 <div class="section-block">
 <div class="section-header-machine">
 <button class="minimizer" onclick="toggleSection('${finalRoomId}-maquinas')">+</button>
 <h4 class="section-title">Máquinas</h4>
 </div>
 <div class="section-content collapsed" id="section-content-${finalRoomId}-maquinas">
 <div class="machines-container" id="machines-${finalRoomId}">
 <p class="empty-message">Nenhuma máquina adicionada ainda.</p>
 </div>
 <div class="add-machine">
 <button class="btn btn-add-secondary" onclick="addMachine('${finalRoomId}')">+ Adicionar Máquina</button> 
 </div>
 <div class="all-machines-total-price">
 <strong>Total de Maquinas: <span id="total-all-machines-price-${finalRoomId}">R$ 0,00</span></strong>
 </div>
 </div>
 </div>`;
}

async function downloadMachineExcel(machineId) {
  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) {
    console.error(`Máquina não encontrada: ${machineId}`);
    return;
  }

  const options = Array.from(
    machineElement.querySelectorAll('.option-item'),
  ).map((item) => ({
    name: item.querySelector('.option-name')?.textContent?.trim() || '',
    selected: Boolean(item.querySelector('input[type="checkbox"]')?.checked),
  })).filter((option) => option.name);
  const selectedConfigs = Array.from(
    machineElement.querySelectorAll('.config-checkbox input[type="checkbox"]:checked'),
  ).map((input) => input.dataset.configName || input.id);

  const value = (selector) => machineElement.querySelector(selector)?.value || '';
  const payload = {
    machine_id: machineId,
    name: machineElement.querySelector('.machine-title-editable')?.value || '',
    type: value('.machine-type-select'),
    application: value('.machine-aplicacao-select'),
    capacity: value('.machine-power-select'),
    voltage: value('.machine-voltage-select'),
    command_voltage: value('.machine-command-voltage-select'),
    quantity: value('.machine-qnt-input'),
    options,
    configurations: selectedConfigs,
  };

  try {
    const response = await fetch('/api/machines/export-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || 'Não foi possível gerar o Excel.');
    }

    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || `folha-equipamento-${machineId}.xlsx`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Erro ao baixar folha de dados da máquina:', error);
    if (typeof window.showSystemStatus === 'function') {
      window.showSystemStatus(error.message, 'error');
    } else {
      alert(error.message);
    }
  }
}

/**
 * Constrói HTML de máquina individual
 */
function buildMachineHTML(machineId, displayName, machines, roomId) {
  const machineTypes = machines.map((m) => m.type);

  return `
 <div class="climatization-machine" data-machine-id="${machineId}" data-room-id="${roomId}">
 <div class="machine-header">
 <button class="minimizer" onclick="toggleMachineSection(this)">−</button>
 <input type="text" class="machine-title-editable" id="title-${machineId}" value="${displayName}" 
 onchange="updateMachineTitle(this, '${machineId}')" onclick="this.select()">
 <button class="btn btn-delete-small" onclick="deleteMachine('${machineId}')">Remover</button>
 </div>
 <div class="machine-content" id="machine-content-${machineId}">
 <div class="climatization-form-grid">
 
 ${buildFormGroup("Tipo:", `<select id="tipo-${machineId}" class="form-input machine-type-select" data-machine-id="${machineId}" onchange="updateMachineOptions(this)"><option value="">Selecionar</option>${machineTypes.map((opt) => `<option value="${opt}">${opt}</option>`).join("")}</select>`)}
 ${buildFormGroup("Aplicação:", `<select id="aplicacao-${machineId}" class="form-input machine-aplicacao-select" data-machine-id="${machineId}" onchange="handleAplicacaoChange('${machineId}')"><option value="">Selecionar</option><option value="climatizacao">Climatização</option><option value="pressurizacao">Pressurização</option><option value="exaustao_bateria">Exaustão da sala de bateria</option><option value="exaustao_baia_trafo">Exaustão da sala baia de trafo</option></select>`)}
 ${buildFormGroup("Capacidade:", `<select id="capacidade-${machineId}" class="form-input machine-power-select" data-machine-id="${machineId}" onchange="handlePowerChange('${machineId}')" disabled><option value="">Selecionar</option></select>`)}
 ${buildFormGroup("Tensão:", `<select id="tensao-${machineId}" class="form-input machine-voltage-select" data-machine-id="${machineId}" onchange="calculateMachinePrice('${machineId}')" disabled><option value="">Selecionar</option></select>`)}
 ${buildFormGroup("Tensão Comando:", `<select id="tensao-comando-${machineId}" class="form-input machine-command-voltage-select" data-machine-id="${machineId}"><option value="N/A">Selecionar <option value="120V">120V</option><option value="220V" selected>220V</option><option value="24V">24V</option></select>`)}
 ${buildFormGroup("Qnt:", `<input id="solution-${machineId}" type="number" class="form-input machine-qnt-input" data-machine-id="${machineId}" min="1" value="1" onchange="updateQuantity('${machineId}')">`)}
 ${buildFormGroup("Preço Base:", `<div class="price-display" id="base-price-${machineId}">R$ 0,00</div>`)}
 ${buildFormGroup("Preço Total:", `<div class="price-display" id="total-price-${machineId}">R$ 0,00</div>`)}
 </div>
 <div class="machine-options-section">
 <h6>Opções Adicionais:</h6>
 <div class="options-grid" id="options-container-${machineId}">
 <p class="empty-options-message">Selecione tipo e capacidade</p>
 </div>
 </div>
 <div class="machine-config-section">
 <h6>Configurações de Instalação:</h6>
 <div class="config-grid" id="config-container-${machineId}">
 <p class="empty-config-message">Selecione tipo e capacidade</p>
 </div>
 </div>
 <div class="machine-excel-actions">
 <button type="button" class="btn btn-download-machine-excel" onclick="downloadMachineExcel('${machineId}')">Baixar Excel</button>
 </div>
 </div>
 </div>`;
}

// =============================================================================
// COMPONENTES UI REUTILIZÁVEIS
// =============================================================================

/**
 * Constrói grupo de formulário
 */
function buildFormGroup(label, content) {
  return `<div class="form-group"><label>${label}</label>${content}</div>`;
}

/**
 * Constrói elemento select
 */
function buildSelect(
  options,
  machineId,
  className,
  onchangeHandler,
  disabled = false,
  selectedValue = "",
) {
  const disabledAttr = disabled ? "disabled" : "";

  const getOptionText = (value) => {
    const mapping = {
      climatizacao: "Climatização",
      pressurizacao: "Pressurização",
      exaustao_bateria: "Exaustão da sala de bateria",
      exaustao_baia_trafo: "Exaustão da sala baia de trafo",
    };
    return mapping[value] || value;
  };

  const optionsHTML = options
    .map((opt) => {
      const optionText = getOptionText(opt);
      return `<option value="${opt}" ${opt === selectedValue ? "selected" : ""}>${optionText}</option>`;
    })
    .join("");

  return `
 <select class="form-input ${className}" data-machine-id="${machineId}" 
 onchange="${onchangeHandler}" ${disabledAttr}>
 <option value="">Selecionar</option>${optionsHTML}
 </select>`;
}

/**
 * Constrói opções da máquina
 */
function buildOptionsHTML(
  options,
  machineId,
  selectedOptions = [],
  selectedPower = null,
) {
  if (!options?.length)
    return '<p class="empty-options-message">Nenhuma opção disponível</p>';

  return options
    .map((option) => {
      const isChecked = selectedOptions.some(
        (selected) => selected.id === option.id,
      );
      const optionValue = safeNumber(
        selectedPower && option.values?.[selectedPower],
      );
      const displayValue = `+R$ ${optionValue.toLocaleString("pt-BR")}`;

      return `
 <div class="option-item ${isChecked ? "option-selected" : ""}" onclick="toggleOption('${machineId}', ${option.id})">
 <div class="option-checkbox">
 <input type="checkbox" value="${optionValue}" data-option-id="${option.id}" 
 data-option-name="${option.name}" id="option-${machineId}-${option.id}"
 onchange="updateOptionSelection('${machineId}', ${option.id}); calculateMachinePrice('${machineId}')"
 ${isChecked ? "checked" : ""}>
 <div class="option-content">
 <div class="option-name">${option.name}</div>
 <div class="option-price">${displayValue}</div>
 </div>
 </div>
 </div>`;
    })
    .join("");
}

/**
 * CONSTRÓI HTML DAS CONFIGURAÇÕES DE INSTALAÇÃO
 */
function buildConfigHTML(
  configuracoes,
  machineId,
  configuracoesSelecionadas = [],
  potencia = "",
) {
  if (
    !configuracoes ||
    !Array.isArray(configuracoes) ||
    configuracoes.length === 0
  ) {
    return '<p class="empty-config-message">Nenhuma configuração disponível</p>';
  }

  return configuracoes
    .map((config) => {
      const isSaved = configuracoesSelecionadas.some((savedConfig) => {
        if (typeof savedConfig === "object") {
          return (
            savedConfig.id === config.id || savedConfig.nome === config.nome
          );
        }
        return savedConfig === config.id || savedConfig === config.nome;
      });

      const isChecked = isSaved;
      const configName = config.nome;
      const isBocalInsuflamento =
        configName ===
        "Bocal de insuflamento protegido por grelha diretamente no ambiente";
      const isBocalAcoplado =
        configName ===
        "Bocal acoplado à rede de dutos por lona flexível. Distribuição por grelhas";
      const isExclusiveGroup = isBocalInsuflamento || isBocalAcoplado;

      return `
 <div class="config-option ${isChecked ? "config-selected" : ""} ${isExclusiveGroup ? "exclusive-group" : ""}" 
 onclick="toggleConfig('${machineId}', ${config.id})">
 <div class="config-checkbox">
 <input type="checkbox" data-config-id="${config.id}" 
 data-config-name="${configName}" 
 data-exclusive-group="${isExclusiveGroup ? "bocal-distribuicao" : ""}"
 id="config-${machineId}-${config.id}"
 onchange="handleConfigChange('${machineId}', ${config.id})"
 ${isChecked ? "checked" : ""}>
 <div class="config-content">
 <div class="config-name">${configName}</div>
 </div>
 </div>
 </div>`;
    })
    .join("");
}

// =============================================================================
// GERENCIAMENTO DE MÁQUINAS
// =============================================================================

/**
 * Adiciona nova máquina COM NOME SIMPLES INICIAL
 */
async function addMachine(roomId) {
  const container = document.getElementById(`machines-${roomId}`);
  if (!container) return;

  const machineId = generateMachineId(roomId);
  const machineCount = container.querySelectorAll(
    ".climatization-machine",
  ).length;

  try {
    const machinesData = await loadMachinesData();
    if (!machinesData.machines.length)
      throw new Error("Nenhum dado disponível");

    const autoName = `Maquina ${machineCount + 1}`;
    const machineHTML = buildMachineHTML(
      machineId,
      autoName,
      machinesData.machines,
      roomId,
    );
    container.insertAdjacentHTML("beforeend", machineHTML);

    const emptyMsg = container.querySelector(".empty-message");
    if (emptyMsg) emptyMsg.remove();

    // CONFIGURA OBSERVER PARA SELEÇÃO AUTOMÁTICA DE CAPACIDADE
    setupAutoCapacitySelection(machineId, roomId);

    updateAllMachinesTotal(roomId);

    console.log(` Máquina ${autoName} adicionada à sala ${roomId}`);

    const event = new CustomEvent("machineAdded", {
      detail: {
        machineId: machineId,
        roomId: roomId,
        machineName: autoName,
      },
    });
    window.dispatchEvent(event);

    return true;
  } catch (error) {
    console.error(" Erro ao adicionar máquina:", error);
    showEmptyMessage(container, "Erro ao carregar dados");
  }
}

// =============================================================================
// SELEÇÃO AUTOMÁTICA DE CAPACIDADE
// =============================================================================

// =============================================================================
// SELEÇÃO AUTOMÁTICA DE CAPACIDADE
// =============================================================================

/**
 * CONFIGURA OBSERVER PARA SELEÇÃO AUTOMÁTICA DE CAPACIDADE
 * Funciona para QUALQUER tipo de máquina quando a aplicação for de ventilação
 */
function setupAutoCapacitySelection(machineId, roomId) {
  console.log(` Configurando auto-seleção para máquina ${machineId}`);

  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return;

  const tipoSelect = machineElement.querySelector(".machine-type-select");
  const aplicacaoSelect = machineElement.querySelector(
    ".machine-aplicacao-select",
  );

  if (!tipoSelect || !aplicacaoSelect) return;

  // Limpa flag para esta máquina
  autoSelectionExecuted.set(machineId, false);

  // Lista de aplicações de ventilação que devem disparar auto-seleção

  // Função que verifica condições e executa seleção
  const checkAndExecuteAutoSelection = function () {
    // Se já executou, não executa novamente
    if (autoSelectionExecuted.get(machineId) === true) {
      console.log(` Auto-seleção já executada para máquina ${machineId}`);
      return;
    }

    const tipo = tipoSelect.value;
    const aplicacao = aplicacaoSelect.value;

    console.log(
      ` Verificando auto-seleção: tipo=${tipo}, aplicacao=${aplicacao}`,
    );

    // Executa para qualquer tipo, desde que
    // 1. Tenha um tipo selecionado (não vazio)
    // 2. A aplicação seja de ventilação (pressurizacao, exaustao_bateria, exaustao_baia_trafo)

    if (!tipo) {
      console.log(` Aguardando seleção de tipo para máquina ${machineId}`);
      return;
    }

    if (!VENTILATION_APPLICATIONS.includes(aplicacao)) {
      console.log(
        ` Aplicação "${aplicacao}" não é de ventilação - ignorando auto-seleção`,
      );
      return;
    }

    // TUDO PRONTO! Executa seleção automática
    console.log(
      ` Condições atendidas! Executando auto-seleção para máquina ${machineId} (tipo: ${tipo}, aplicação: ${aplicacao})`,
    );
    executeAutoCapacitySelection(machineId, roomId);
  };

  // Remove listeners antigos
  if (tipoSelect._autoSelectHandler) {
    tipoSelect.removeEventListener("change", tipoSelect._autoSelectHandler);
  }
  if (aplicacaoSelect._autoSelectHandler) {
    aplicacaoSelect.removeEventListener(
      "change",
      aplicacaoSelect._autoSelectHandler,
    );
  }

  // Adiciona listeners
  tipoSelect._autoSelectHandler = checkAndExecuteAutoSelection;
  aplicacaoSelect._autoSelectHandler = checkAndExecuteAutoSelection;

  tipoSelect.addEventListener("change", tipoSelect._autoSelectHandler);
  aplicacaoSelect.addEventListener(
    "change",
    aplicacaoSelect._autoSelectHandler,
  );

  // Verifica se já está tudo selecionado
  setTimeout(checkAndExecuteAutoSelection, 500);
}

function applyVentilationCapacityBusinessRules(
  machineId,
  roomId,
  options = {},
) {
  const { suppressRefresh = false, force = false } = options;

  console.log(
    ` Executando selecao automatica de capacidade para maquina ${machineId}`,
  );

  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return;

  const tipoSelect = machineElement.querySelector(".machine-type-select");
  if (!tipoSelect || !tipoSelect.value) {
    console.log(`Tipo nao selecionado`);
    return;
  }

  const aplicacaoSelect = machineElement.querySelector(
    ".machine-aplicacao-select",
  );
  if (!aplicacaoSelect || !aplicacaoSelect.value) {
    console.log(`Aplicacao nao selecionada`);
    return;
  }

  const tipo = tipoSelect.value;
  const aplicacao = aplicacaoSelect.value;

  console.log(` Tipo: ${tipo}, Aplicacao: ${aplicacao}`);

  const inputs = collectRoomInputs(roomId);
  let vazaoNecessaria = null;

  try {
    vazaoNecessaria = calculateVentilationFlow(aplicacao, inputs);
  } catch (error) {
    console.error("Erro ao calcular vazao:", error);
  }

  if (!vazaoNecessaria || isNaN(vazaoNecessaria) || vazaoNecessaria <= 0) {
    console.log(`Vazao invalida: ${vazaoNecessaria}`);
    return;
  }

  console.log(` Vazao necessaria: ${vazaoNecessaria.toFixed(2)} m3/h`);

  const powerSelect = machineElement.querySelector(".machine-power-select");
  if (!powerSelect) return;

  if (!force && isCapacityUserEdited(powerSelect)) {
    console.log(
      ` Capacidade manual preservada para máquina ${machineId}: ${powerSelect.value}`,
    );
    return;
  }

  powerSelect.disabled = false;

  const capacityOptions = [];
  for (let i = 0; i < powerSelect.options.length; i++) {
    const option = powerSelect.options[i];
    if (option.value) {
      const match = option.text.match(/(\d+[.,]?\d*)/);
      if (match) {
        const numericValue = parseFloat(match[0].replace(",", "."));
        capacityOptions.push({
          value: numericValue,
          text: option.text,
          optionValue: option.value,
        });
      }
    }
  }

  if (capacityOptions.length === 0) {
    console.log(`Nenhuma capacidade disponivel`);
    return;
  }

  console.log(
    ` Capacidades disponiveis:`,
    capacityOptions.map((c) => `${c.value} (${c.text})`),
  );

  const selection = selectBestVentilationCapacity(
    capacityOptions,
    vazaoNecessaria,
  );
  if (!selection) {
    console.log(`Nao foi possivel determinar a melhor capacidade`);
    return;
  }

  const { bestOption, quantity, totalCapacity, balance } = selection;
  console.log(
    ` Melhor combinacao: ${quantity} x ${bestOption.value} m3/h = ${totalCapacity.toFixed(2)} m3/h (saldo: ${balance.toFixed(2)} m3/h)`,
  );

  let selected = false;
  const currentValue = powerSelect.value;

  for (let i = 0; i < powerSelect.options.length; i++) {
    if (powerSelect.options[i].value === bestOption.optionValue) {
      if (currentValue !== bestOption.optionValue) {
        powerSelect.value = bestOption.optionValue;
        markCapacityAutoChange(powerSelect, true);
        selected = true;
        console.log(`Opcao selecionada: ${powerSelect.options[i].text}`);
      } else {
        console.log(
          `Capacidade ja estava correta: ${powerSelect.options[i].text}`,
        );
      }
      break;
    }
  }

  autoSelectionExecuted.set(machineId, true);
  setCapacityUserEdited(powerSelect, false);

  if (selected) {
    powerSelect.dispatchEvent(new Event("change", { bubbles: true }));
    markCapacityAutoChange(powerSelect, false);
  } else if (currentValue !== bestOption.optionValue) {
    console.log(`Nao foi possivel selecionar a capacidade`);
    return;
  }

  const event = new CustomEvent("machineCapacityAutoSelected", {
    detail: {
      machineId: machineId,
      roomId: roomId,
      capacity: bestOption.value,
      quantity: quantity,
      totalCapacity: totalCapacity,
      vazao: vazaoNecessaria,
      difference: balance,
    },
  });
  window.dispatchEvent(event);

  if (!suppressRefresh && window.refreshVentilationForRoom) {
    setTimeout(() => {
      window.refreshVentilationForRoom(roomId);
    }, 100);
  }

  console.log(
    `Selecao automatica concluida para maquina ${machineId}`,
  );
}

/**
 * EXECUTA A SELEÇÃO AUTOMÁTICA DA CAPACIDADE
 * Seleciona o valor MAIS PRÓXIMO (não importa se maior ou menor)
 */
function executeAutoCapacitySelection(machineId, roomId, options = {}) {
  return applyVentilationCapacityBusinessRules(machineId, roomId, options);
  console.log(
    ` Executando seleção automática de capacidade para máquina ${machineId}`,
  );

  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return;

  const tipoSelect = machineElement.querySelector(".machine-type-select");
  if (!tipoSelect || !tipoSelect.value) {
    console.log(` Tipo não selecionado`);
    return;
  }

  const aplicacaoSelect = machineElement.querySelector(
    ".machine-aplicacao-select",
  );
  if (!aplicacaoSelect || !aplicacaoSelect.value) {
    console.log(` Aplicação não selecionada`);
    return;
  }

  const tipo = tipoSelect.value;
  const aplicacao = aplicacaoSelect.value;

  console.log(` Tipo: ${tipo}, Aplicação: ${aplicacao}`);

  // Calcula vazão necessária baseada na aplicação
  const inputs = collectRoomInputs(roomId);
  let vazaoNecessaria = null;

  switch (aplicacao) {
    case "pressurizacao":
      vazaoNecessaria = inputs.vazaoAr ? inputs.vazaoAr * 3.6 : null;
      console.log(
        ` Vazão de ar: ${inputs.vazaoAr}, Vazão necessária (pressurização): ${vazaoNecessaria}`,
      );
      break;
    case "exaustao_bateria":
      vazaoNecessaria = inputs.volume ? inputs.volume * 12 : null;
      console.log(
        ` Volume: ${inputs.volume}, Vazão necessária (exaustão bateria): ${vazaoNecessaria}`,
      );
      break;
    case "exaustao_baia_trafo":
      if (inputs.potencia && inputs.tempInterna && inputs.tempExterna) {
        const deltaT = inputs.tempInterna - inputs.tempExterna;
        if (deltaT !== 0) {
          try {
            const constants = getSystemConstants();
            const Q = inputs.potencia * 859.85;
            const massaGR = Q / (constants.fatorEspecifico * Math.abs(deltaT));
            const massaAr = massaGR / 1000;
            vazaoNecessaria = Math.abs(massaAr / constants.Densi_ar);
            console.log(
              ` Potência: ${inputs.potencia}, ΔT: ${deltaT}, Vazão necessária: ${vazaoNecessaria}`,
            );
          } catch (e) {
            console.error("Erro ao calcular vazão:", e);
          }
        }
      }
      break;
  }

  if (!vazaoNecessaria || isNaN(vazaoNecessaria) || vazaoNecessaria <= 0) {
    console.log(` Vazão inválida: ${vazaoNecessaria}`);
    return;
  }

  console.log(` Vazão necessária: ${vazaoNecessaria.toFixed(2)} m³/h`);

  // Pega capacidades disponíveis
  const powerSelect = machineElement.querySelector(".machine-power-select");
  if (!powerSelect) return;

  // Habilita o select antes de popular
  powerSelect.disabled = false;

  const capacityOptions = [];
  for (let i = 0; i < powerSelect.options.length; i++) {
    const option = powerSelect.options[i];
    if (option.value) {
      const match = option.text.match(/(\d+[.,]?\d*)/);
      if (match) {
        const numericValue = parseFloat(match[0].replace(",", "."));
        capacityOptions.push({
          value: numericValue,
          text: option.text,
          optionValue: option.value,
        });
      }
    }
  }

  if (capacityOptions.length === 0) {
    console.log(` Nenhuma capacidade disponível`);
    return;
  }

  console.log(
    ` Capacidades disponíveis:`,
    capacityOptions.map((c) => `${c.value} (${c.text})`),
  );

  // ENCONTRA O VALOR MAIS PRÓXIMO
  let bestOption = capacityOptions[0];
  let smallestDifference = Math.abs(capacityOptions[0].value - vazaoNecessaria);

  for (let i = 1; i < capacityOptions.length; i++) {
    const diff = Math.abs(capacityOptions[i].value - vazaoNecessaria);
    if (diff < smallestDifference) {
      smallestDifference = diff;
      bestOption = capacityOptions[i];
    }
  }

  console.log(
    ` Capacidade MAIS PRÓXIMA: ${bestOption.value} m³/h (diferença: ${smallestDifference.toFixed(2)})`,
  );

  // Seleciona a opção
  let selected = false;
  for (let i = 0; i < powerSelect.options.length; i++) {
    if (powerSelect.options[i].value === bestOption.optionValue) {
      powerSelect.value = bestOption.optionValue;
      selected = true;
      console.log(` Opção selecionada: ${powerSelect.options[i].text}`);
      break;
    }
  }

  if (selected) {
    // Marca como executado
    autoSelectionExecuted.set(machineId, true);

    // Dispara eventos
    powerSelect.dispatchEvent(new Event("change", { bubbles: true }));

    console.log(` Seleção automática concluída para máquina ${machineId}`);

    const event = new CustomEvent("machineCapacityAutoSelected", {
      detail: {
        machineId: machineId,
        roomId: roomId,
        capacity: bestOption.value,
        vazao: vazaoNecessaria,
        difference: smallestDifference,
      },
    });
    window.dispatchEvent(event);

    if (window.refreshVentilationForRoom) {
      setTimeout(() => {
        window.refreshVentilationForRoom(roomId);
      }, 100);
    }
  } else {
    console.log(` Não foi possível selecionar a capacidade`);
  }
}

/**
 * Helper para coletar inputs da sala (cópia da função do módulo de ventilação)
 */
function syncVentilationMachineCapacities(roomId) {
  const machineElements = document.querySelectorAll(
    `.climatization-machine[data-room-id="${roomId}"]`,
  );

  machineElements.forEach((machineElement) => {
    const machineId = machineElement.dataset.machineId;
    const tipo = machineElement.querySelector(".machine-type-select")?.value;
    const aplicacao = machineElement.querySelector(
      ".machine-aplicacao-select",
    )?.value;
    const powerSelect = machineElement.querySelector(".machine-power-select");

    if (!machineId || !tipo || !VENTILATION_APPLICATIONS.includes(aplicacao)) {
      return;
    }

    if (isCapacityUserEdited(powerSelect)) {
      return;
    }

    applyVentilationCapacityBusinessRules(machineId, roomId, {
      suppressRefresh: true,
    });
  });
}

function collectRoomInputs(roomId) {
  const inputs = {};

  const vazaoArElement = document.getElementById(`vazao-ar-${roomId}`);
  const volumeElement = document.getElementById(`volume-${roomId}`);
  const potenciaElement = document.getElementById(`potencia-${roomId}`);
  const tempInternaElement = document.getElementById(`temp-interna-${roomId}`);
  const tempExternaElement = document.getElementById(`temp-externa-${roomId}`);

  if (vazaoArElement) {
    if (vazaoArElement.tagName === "DIV") {
      inputs.vazaoAr = parseFloat(vazaoArElement.textContent);
    } else {
      inputs.vazaoAr = parseFloat(vazaoArElement.value);
    }
  } else {
    inputs.vazaoAr = null;
  }

  inputs.volume = volumeElement ? parseFloat(volumeElement.value) : null;
  inputs.potencia = potenciaElement ? parseFloat(potenciaElement.value) : null;
  inputs.tempInterna = tempInternaElement
    ? parseFloat(tempInternaElement.value)
    : 45;
  inputs.tempExterna = tempExternaElement
    ? parseFloat(tempExternaElement.value)
    : 35;

  return inputs;
}

/**
 * Helper para obter constantes do sistema
 */
function getSystemConstants() {
  if (!window.systemConstants) {
    throw new Error("window.systemConstants não disponível");
  }
  return {
    Densi_ar: window.systemConstants.Densi_ar?.value,
    fatorEspecifico: window.systemConstants.fatorEspecifico?.value,
  };
}

// =============================================================================
// ATUALIZAÇÃO DE UI
// =============================================================================

/**
 * Atualiza opções da máquina
 */
async function updateMachineOptions(selectElement) {
  const machineId = selectElement.dataset.machineId;
  const selectedType = selectElement.value;

  autoSelectionExecuted.set(machineId, false);

  if (!selectedType) {
    resetMachineFields(machineId);

    const machineElement = document.querySelector(
      `[data-machine-id="${machineId}"]`,
    );
    if (machineElement) {
      const titleInput = machineElement.querySelector(
        ".machine-title-editable",
      );
      const container = document.getElementById(
        `machines-${machineElement.dataset.roomId}`,
      );
      const machineCount = container
        ? container.querySelectorAll(".climatization-machine").length
        : 1;

      if (titleInput && !titleInput.value.includes("Maquina")) {
        titleInput.value = `Maquina ${machineCount}`;
      }
    }

    notifyMachineFieldChange(machineId, "tipo");
    return;
  }

  try {
    const machinesData = window.machinesData || [];
    const machine = machinesData.find((m) => m.type === selectedType);

    if (machine) {
      updateMachineUI(machineId, machine);

      const aplicacaoSelect = document.querySelector(
        `.machine-aplicacao-select[data-machine-id="${machineId}"]`,
      );
      if (aplicacaoSelect) {
        if (machine.type === "Tubo Axial") {
          aplicacaoSelect.value = "";
        } else {
          const aplicacaoValue = machine.aplicacao;
          let mappedValue = aplicacaoValue;

          if (aplicacaoValue === "pressurizacao_ventilacao") {
            mappedValue = "pressurizacao";
          } else if (aplicacaoValue === "climatizacao") {
            mappedValue = "climatizacao";
          } else if (aplicacaoValue === "exaustao") {
            mappedValue = "";
          }

          const option = Array.from(aplicacaoSelect.options).find(
            (opt) => opt.value === mappedValue,
          );
          if (option) {
            aplicacaoSelect.value = mappedValue;
            if (mappedValue === "climatizacao") {
              handleAplicacaoChange(machineId);
            }
          }
        }
      }

      const machineElement = document.querySelector(
        `[data-machine-id="${machineId}"]`,
      );
      if (machineElement) {
        const powerSelect = machineElement.querySelector(
          ".machine-power-select",
        );
        if (powerSelect && powerSelect.value) {
          const roomId = machineElement.dataset.roomId;
          const newName = generateMachineName(selectedType, roomId, machineId);

          const titleInput = machineElement.querySelector(
            ".machine-title-editable",
          );
          if (titleInput) {
            titleInput.value = newName;
          }
        } else {
          const titleInput = machineElement.querySelector(
            ".machine-title-editable",
          );
          if (titleInput) {
            titleInput.value = selectedType;
          }
        }
      }

      // Dispara evento
      setTimeout(() => {
        const event = new CustomEvent("machinePowerSelectPopulated", {
          detail: { machineId: machineId },
        });
        window.dispatchEvent(event);
      }, 100);
    } else {
      resetMachineFields(machineId);
    }
  } catch (error) {
    console.error(" Erro em updateMachineOptions:", error);
    resetMachineFields(machineId);
  }

  const currentMachineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  const currentAplicacao = currentMachineElement?.querySelector(
    ".machine-aplicacao-select",
  )?.value;
  const currentRoomId = currentMachineElement?.dataset.roomId;
  const currentPowerSelect = currentMachineElement?.querySelector(
    ".machine-power-select",
  );

  setCapacityUserEdited(currentPowerSelect, false);

  if (
    selectedType &&
    currentRoomId &&
    VENTILATION_APPLICATIONS.includes(currentAplicacao)
  ) {
    setTimeout(() => {
      applyVentilationCapacityBusinessRules(machineId, currentRoomId);
    }, 0);
  }

  notifyMachineFieldChange(machineId, "tipo");
}

/**
 * ATUALIZA UI COMPLETA DA MÁQUINA
 */
function updateMachineUI(machineId, machine) {
  const potencies = Object.keys(machine.baseValues || {});
  const voltages = (machine.voltages || []).map((v) => v.name);

  updateSelectUI(
    `.machine-power-select[data-machine-id="${machineId}"]`,
    potencies,
    false,
  );
  updateSelectUI(
    `.machine-voltage-select[data-machine-id="${machineId}"]`,
    voltages,
    false,
  );

  const powerSelect = document.querySelector(
    `.machine-power-select[data-machine-id="${machineId}"]`,
  );
  setCapacityUserEdited(powerSelect, false);
  markCapacityAutoChange(powerSelect, false);

  const optionsContainer = document.getElementById(
    `options-container-${machineId}`,
  );
  if (optionsContainer) {
    optionsContainer.innerHTML = machine.options?.length
      ? buildOptionsHTML(machine.options, machineId)
      : '<p class="empty-options-message">Nenhuma opção disponível</p>';
  }

  const configContainer = document.getElementById(
    `config-container-${machineId}`,
  );
  if (configContainer) {
    if (machine.configuracoes_instalacao?.length) {
      const configHTML = buildConfigHTML(
        machine.configuracoes_instalacao,
        machineId,
      );
      configContainer.innerHTML = "";
      configContainer.insertAdjacentHTML("beforeend", configHTML);
    } else {
      configContainer.innerHTML =
        '<p class="empty-config-message">Nenhuma configuração disponível</p>';
    }
  }

  updateElementText(`base-price-${machineId}`, "R$ 0,00");
  updateElementText(`total-price-${machineId}`, "R$ 0,00");
}

/**
 * Atualiza select na UI
 */
function updateSelectUI(selector, options, disabled = false) {
  const select = document.querySelector(selector);
  if (select) {
    const getOptionText = (value) => {
      const mapping = {
        climatizacao: "Climatização",
        pressurizacao: "Pressurização",
        exaustao_bateria: "Exaustão da sala de bateria",
        exaustao_baia_trafo: "Exaustão da sala baia de trafo",
      };
      return mapping[value] || value;
    };

    const optionsHTML = options
      .map((opt) => {
        const optionText = getOptionText(opt);
        return `<option value="${opt}">${optionText}</option>`;
      })
      .join("");

    select.innerHTML = `<option value="">Selecionar</option>${optionsHTML}`;
    select.disabled = disabled;
  }
}

/**
 * RESETA CAMPOS DA MÁQUINA
 */
function resetMachineFields(machineId) {
  updateSelectUI(
    `.machine-power-select[data-machine-id="${machineId}"]`,
    [],
    true,
  );
  updateSelectUI(
    `.machine-voltage-select[data-machine-id="${machineId}"]`,
    [],
    true,
  );

  const powerSelect = document.querySelector(
    `.machine-power-select[data-machine-id="${machineId}"]`,
  );
  setCapacityUserEdited(powerSelect, false);
  markCapacityAutoChange(powerSelect, false);

  const aplicacaoSelect = document.querySelector(
    `.machine-aplicacao-select[data-machine-id="${machineId}"]`,
  );
  if (aplicacaoSelect) {
    aplicacaoSelect.value = "";
  }

  const optionsContainer = document.getElementById(
    `options-container-${machineId}`,
  );
  if (optionsContainer) {
    optionsContainer.innerHTML =
      '<p class="empty-options-message">Selecione um tipo de máquina</p>';
  }

  const configContainer = document.getElementById(
    `config-container-${machineId}`,
  );
  if (configContainer) {
    configContainer.innerHTML =
      '<p class="empty-config-message">Selecione um tipo de máquina</p>';
  }

  updateElementText(`base-price-${machineId}`, "R$ 0,00");
  updateElementText(`total-price-${machineId}`, "R$ 0,00");
}

// =============================================================================
// CÁLCULOS DE PREÇO
// =============================================================================

/**
 * Atualiza a quantidade e recalcula o preço
 */
function updateQuantity(machineId) {
  const qntInput = document.querySelector(
    `.machine-qnt-input[data-machine-id="${machineId}"]`,
  );
  if (!qntInput) return;

  const quantidade = Math.max(1, parseInt(qntInput.value) || 1);
  qntInput.value = quantidade;

  calculateMachinePrice(machineId);
}

/**
 * Calcula preço da máquina
 */
function calculateMachinePrice(machineId) {
  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return;

  const typeSelect = machineElement.querySelector(".machine-type-select");
  const powerSelect = machineElement.querySelector(".machine-power-select");
  const voltageSelect = machineElement.querySelector(".machine-voltage-select");
  const qntInput = machineElement.querySelector(".machine-qnt-input");

  const selectedType = typeSelect?.value;
  const selectedPower = powerSelect?.value;
  const selectedVoltage = voltageSelect?.value;
  const quantidade = qntInput ? parseInt(qntInput.value) || 1 : 1;

  let basePrice = 0,
    voltageValue = 0;

  if (selectedType && selectedPower && window.machinesData) {
    const machine = window.machinesData.find((m) => m.type === selectedType);
    basePrice = machine?.baseValues?.[selectedPower] || 0;
  }

  if (selectedType && selectedVoltage && window.machinesData) {
    const machine = window.machinesData.find((m) => m.type === selectedType);
    const voltageObj = machine?.voltages?.find(
      (v) => v.name === selectedVoltage,
    );
    voltageValue = voltageObj?.value || 0;
  }

  let optionsTotal = 0;
  const optionsContainer = document.getElementById(
    `options-container-${machineId}`,
  );
  if (optionsContainer) {
    optionsContainer
      .querySelectorAll('input[type="checkbox"]:checked')
      .forEach((option) => {
        optionsTotal += safeNumber(option.value);
      });
  }

  const basePriceUnitario = basePrice + voltageValue;
  const totalPriceUnitario = basePriceUnitario + optionsTotal;
  const totalPriceFinal = totalPriceUnitario * quantidade;

  updateElementText(
    `base-price-${machineId}`,
    `R$ ${safeNumber(basePriceUnitario).toLocaleString("pt-BR")}`,
  );
  updateElementText(
    `total-price-${machineId}`,
    `R$ ${safeNumber(totalPriceFinal).toLocaleString("pt-BR")}`,
  );

  const roomId = machineElement.dataset.roomId;
  if (roomId) updateAllMachinesTotal(roomId);
}

/**
 * Atualiza valores das opções
 */
function updateOptionValues(machineId) {
  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return;

  const typeSelect = machineElement.querySelector(".machine-type-select");
  const powerSelect = machineElement.querySelector(".machine-power-select");

  const selectedType = typeSelect?.value;
  const selectedPower = powerSelect?.value;

  if (!selectedType || !selectedPower || !window.machinesData) return;

  const machine = window.machinesData.find((m) => m.type === selectedType);
  if (!machine?.options) return;

  machine.options.forEach((option) => {
    const checkbox = document.getElementById(
      `option-${machineId}-${option.id}`,
    );
    if (checkbox) {
      const optionValue = safeNumber(
        selectedPower && option.values?.[selectedPower],
      );
      checkbox.value = optionValue;

      const priceDisplay = checkbox
        .closest(".option-item")
        ?.querySelector(".option-price");
      if (priceDisplay) {
        priceDisplay.textContent = `+R$ ${optionValue.toLocaleString("pt-BR")}`;
      }
    }
  });

  calculateMachinePrice(machineId);
}

// =============================================================================
// FUNÇÕES DE INTERAÇÃO DO USUÁRIO
// =============================================================================

function toggleMachineSection(button) {
  const content = button
    .closest(".climatization-machine")
    .querySelector(".machine-content");
  const isCollapsed = content.classList.toggle("collapsed");
  button.textContent = isCollapsed ? "+" : "−";
}

function updateMachineTitle(input, machineId) {
  if (!input.value.trim()) {
    const machineElement = document.querySelector(
      `[data-machine-id="${machineId}"]`,
    );
    const container = document.getElementById(
      `machines-${machineElement.dataset.roomId}`,
    );
    const machineCount = container
      ? container.querySelectorAll(".climatization-machine").length
      : 1;

    if (input && !input.value.includes("Maquina")) {
      input.value = `Maquina ${machineCount}`;
    }

    notifyMachineFieldChange(machineId, "title");
  }
}

function toggleOption(machineId, optionId) {
  const checkbox = document.getElementById(`option-${machineId}-${optionId}`);
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function updateOptionSelection(machineId, optionId) {
  const checkbox = document.getElementById(`option-${machineId}-${optionId}`);
  const item = checkbox?.closest(".option-item");
  if (item) {
    item.classList.toggle("option-selected", checkbox.checked);
  }
}

function handlePowerChange(machineId) {
  calculateMachinePrice(machineId);
  updateOptionValues(machineId);

  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (machineElement) {
    const typeSelect = machineElement.querySelector(".machine-type-select");
    const powerSelect = machineElement.querySelector(".machine-power-select");
    const aplicacaoSelect = machineElement.querySelector(
      ".machine-aplicacao-select",
    );
    const roomId = machineElement.dataset.roomId;

    if (powerSelect) {
      if (isCapacityAutoChange(powerSelect)) {
        setCapacityUserEdited(powerSelect, false);
        markCapacityAutoChange(powerSelect, false);
      } else {
        setCapacityUserEdited(powerSelect, true);
      }
    }

    if (typeSelect && typeSelect.value && powerSelect && powerSelect.value) {
      generateMachineName(typeSelect.value, roomId);
    } else if (
      typeSelect &&
      typeSelect.value &&
      (!powerSelect || !powerSelect.value)
    ) {
      const titleInput = machineElement.querySelector(
        ".machine-title-editable",
      );
      if (titleInput) {
        titleInput.value = typeSelect.value;
      }
    }

    if (aplicacaoSelect?.value === "climatizacao") {
      updateClimatizationQuantityFromCapacity(machineId, { force: true });
    }
  }

  notifyMachineFieldChange(machineId, "capacidade");

  if (machineElement) {
    const roomId = machineElement.dataset.roomId;
    const event = new CustomEvent("machineChanged", {
      detail: {
        machineId: machineId,
        roomId: roomId,
        changeType: "power",
      },
    });
    window.dispatchEvent(event);
  }
}

function deleteMachine(machineId) {
  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return;

  const roomId = machineElement.dataset.roomId;
  const container = machineElement.closest(".machines-container");
  const machineName =
    machineElement.querySelector(".machine-title-editable")?.value || "Máquina";

  machineElement.remove();

  if (roomId) {
    updateAllMachineNamesInRoom(roomId);
    updateAllMachinesTotal(roomId);

    if (window.refreshVentilationForRoom) {
      window.refreshVentilationForRoom(roomId);
    }

    const event = new CustomEvent("machineRemoved", {
      detail: {
        machineId: machineId,
        roomId: roomId,
        machineName: machineName,
      },
    });
    window.dispatchEvent(event);
  }

  if (
    container &&
    container.querySelectorAll(".climatization-machine").length === 0
  ) {
    showEmptyMessage(container, "Nenhuma máquina adicionada ainda.");
  }
}

function toggleConfig(machineId, configId) {
  const checkbox = document.getElementById(`config-${machineId}-${configId}`);
  if (checkbox) {
    checkbox.checked = !checkbox.checked;
    handleConfigChange(machineId, configId);
  }
}

function updateConfigSelection(machineId, configId) {
  const checkbox = document.getElementById(`config-${machineId}-${configId}`);
  const item = checkbox?.closest(".config-option");
  if (item) {
    item.classList.toggle("config-selected", checkbox.checked);
  }
}

function handleConfigChange(machineId, configId) {
  const checkbox = document.getElementById(`config-${machineId}-${configId}`);
  if (!checkbox) return;

  updateConfigSelection(machineId, configId);

  const isExclusiveGroup =
    checkbox.getAttribute("data-exclusive-group") === "bocal-distribuicao";
  if (isExclusiveGroup && checkbox.checked) {
    deselectOtherBocalOptions(machineId, configId);
  }

  calculateMachinePrice(machineId);
}

function deselectOtherBocalOptions(machineId, selectedConfigId) {
  const machineElement = document.querySelector(
    `[data-machine-id="${machineId}"]`,
  );
  if (!machineElement) return;

  const bocalCheckboxes = machineElement.querySelectorAll(
    'input[data-exclusive-group="bocal-distribuicao"]',
  );

  bocalCheckboxes.forEach((checkbox) => {
    const configId = parseInt(checkbox.getAttribute("data-config-id"));
    if (configId !== selectedConfigId && checkbox.checked) {
      checkbox.checked = false;
      updateConfigSelection(machineId, configId);
    }
  });
}

// =============================================================================
// FUNÇÕES AUXILIARES
// =============================================================================

function showEmptyMessage(container, message) {
  const existing = container.querySelector(".empty-message");
  if (existing) existing.remove();
  container.insertAdjacentHTML(
    "beforeend",
    `<p class="empty-message">${message}</p>`,
  );
}

function removeEmptyMessage(container) {
  const emptyMsg = container.querySelector(".empty-message");
  if (emptyMsg) emptyMsg.remove();
}

function calculateAllMachinesTotal(roomId) {
  const container = document.getElementById(`machines-${roomId}`);
  if (!container) return 0;

  let total = 0;
  container
    .querySelectorAll(".climatization-machine")
    .forEach((machineElement) => {
      const machineId = machineElement.dataset.machineId;
      const priceElement = document.getElementById(`total-price-${machineId}`);
      if (priceElement) {
        const priceText = priceElement.textContent;
        const cleanText = priceText
          .replace("R$", "")
          .replace(/\./g, "")
          .replace(",", ".")
          .trim();
        total += safeNumber(cleanText);
      }
    });

  return total;
}

function updateAllMachinesTotal(roomId) {
  const total = calculateAllMachinesTotal(roomId);
  const display = document.getElementById(`total-all-machines-price-${roomId}`);
  if (display) {
    display.textContent = `R$ ${safeNumber(total).toLocaleString("pt-BR")}`;

    // Disparar evento
    const roomElement = document.querySelector(`[data-room-id="${roomId}"]`);
    if (roomElement) {
      const projectId = roomElement.dataset.projectId;
      if (projectId) {
        document.dispatchEvent(
          new CustomEvent("valorAtualizado", {
            detail: { tipo: "maquina", roomId, projectId, valor: total },
          }),
        );
      }
    }
  }
}

function updateAllMachineNamesInRoom(roomId) {
  const container = document.getElementById(`machines-${roomId}`);
  if (!container) return;

  const machines = Array.from(
    container.querySelectorAll(".climatization-machine"),
  );
  const machineTypes = new Set();

  machines.forEach((machine) => {
    const typeSelect = machine.querySelector(".machine-type-select");
    if (typeSelect && typeSelect.value) {
      machineTypes.add(typeSelect.value);
    }
  });

  machineTypes.forEach((type) => {
    generateMachineName(type, roomId);
  });
}

// =============================================================================
// EXPORTAÇÕES E GLOBAIS
// =============================================================================

export {
  buildMachinesSection,
  loadMachinesData,
  addMachine,
  buildMachineHTML,
  downloadMachineExcel,
  toggleMachineSection,
  updateMachineTitle,
  updateMachineOptions,
  updateMachineUI,
  resetMachineFields,
  calculateMachinePrice,
  deleteMachine,
  toggleOption,
  updateOptionSelection,
  updateOptionValues,
  handlePowerChange,
  calculateAllMachinesTotal,
  updateAllMachinesTotal,
  generateMachineId,
  buildConfigHTML,
  toggleConfig,
  updateConfigSelection,
  handleConfigChange,
  deselectOtherBocalOptions,
  buildOptionsHTML,
  updateSelectUI,
  showEmptyMessage,
  removeEmptyMessage,
  updateQuantity,
  generateMachineName,
  getGenericCapacityValue,
  updateAllMachineNamesInRoom,
  handleAplicacaoChange,
  notifyMachineFieldChange,
  syncClimatizationMachineQuantitiesFromCapacity,
};

// Disponibilização global
if (typeof window !== "undefined") {
  window.handleAplicacaoChange = handleAplicacaoChange;
  window.updateMachineOptions = updateMachineOptions;
  window.calculateMachinePrice = calculateMachinePrice;
  window.updateQuantity = updateQuantity;
  window.deleteMachine = deleteMachine;
  window.downloadMachineExcel = downloadMachineExcel;
  window.addMachine = addMachine;
  window.toggleMachineSection = toggleMachineSection;
  window.handlePowerChange = handlePowerChange;
  window.generateMachineName = generateMachineName;
  window.notifyMachineFieldChange = notifyMachineFieldChange;
  window.updateMachineTitle = updateMachineTitle;
  window.handleConfigChange = handleConfigChange;
  window.updateOptionSelection = updateOptionSelection;
  window.toggleConfig = toggleConfig;
  window.syncClimatizationMachineQuantitiesFromCapacity =
    syncClimatizationMachineQuantitiesFromCapacity;
  window.syncVentilationMachineCapacities = syncVentilationMachineCapacities;

  console.log(" Funções principais carregadas no escopo global");
}
