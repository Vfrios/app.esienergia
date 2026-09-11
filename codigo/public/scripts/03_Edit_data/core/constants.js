// scripts/03_Edit_data/constants.js
// Gerenciamento de constantes

import { systemData, addPendingChange, CLIENT_MODULE_VISIBILITY_KEY, getClientModuleVisibility } from '../config/state.js';
import { escapeHtml, showError, showInfo } from '../config/ui.js';

export function loadConstants() {
    const tbody = document.getElementById('constantsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (!systemData.constants) {
        systemData.constants = {};
    }
    
    renderClientModuleVisibilityControls();

    Object.entries(systemData.constants).forEach(([key, constantData]) => {
        if (key === CLIENT_MODULE_VISIBILITY_KEY) return;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="text" value="${escapeHtml(key)}" 
                       readonly
                       placeholder="Nome da constante"
                       class="form-input readonly-input"
                       style="background-color: #f5f5f5; cursor: default; color: #666;">
            </td>
            <td>
                <input type="text" value="${escapeHtml(constantData.description || '')}" 
                       onchange="updateConstantDescription('${key}', this.value)"
                       placeholder="Descrição"
                       class="form-input">
            </td>
            <td>
                <input type="number" value="${constantData.value}" step="0.1"
                       onchange="updateConstantValue('${key}', this.value)"
                       class="form-input">
            </td>
        `;
        tbody.appendChild(row);
    });
    
    const emptyRow = document.createElement('tr');
    emptyRow.innerHTML = `
        <td colspan="3" style="text-align: center; padding: 20px; color: #666; font-style: italic;">
            Constantes do sistema - Somente alteração
        </td>
    `;
    tbody.appendChild(emptyRow);
}

function renderClientModuleVisibilityControls() {
    const container = document.getElementById('clientModulesVisibility');
    if (!container) return;

    const visibility = getClientModuleVisibility();
    container.querySelectorAll('input[data-client-module]').forEach((input) => {
        input.checked = visibility[input.dataset.clientModule] !== false;
        input.onchange = () => updateClientModuleVisibility(input.dataset.clientModule, input.checked);
    });
}

export function updateClientModuleVisibility(moduleName, enabled) {
    const allowedModules = ['acessorios', 'tubulacao', 'dutos'];
    if (!allowedModules.includes(moduleName)) return;

    if (!systemData.constants) systemData.constants = {};
    const currentVisibility = getClientModuleVisibility();
    currentVisibility[moduleName] = Boolean(enabled);
    const visibilityMask = (currentVisibility.acessorios ? 1 : 0)
        | (currentVisibility.tubulacao ? 2 : 0)
        | (currentVisibility.dutos ? 4 : 0);
    systemData.constants[CLIENT_MODULE_VISIBILITY_KEY] = {
        value: visibilityMask,
        description: 'Módulos exibidos na tela geral dos clientes'
    };
    addPendingChange('constants');
}

export function updateConstantDescription(key, description) {
    if (systemData.constants[key]) {
        if (systemData.constants[key].description !== description) {
            systemData.constants[key].description = description;
            addPendingChange('constants');
        }
    } else {
        showError(`Constante "${key}" não encontrada!`);
    }
}

export function updateConstantValue(key, value) {
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
        showError(`Valor inválido para "${key}": ${value}`);
        return;
    }
    
    if (systemData.constants[key] && systemData.constants[key].value !== numValue) {
        systemData.constants[key].value = numValue;
        addPendingChange('constants');
        showInfo(`Valor da constante "${key}" atualizado para ${numValue}`);
    }
}

// Exportar funções globalmente
window.loadConstants = loadConstants;
window.updateConstantDescription = updateConstantDescription;
window.updateConstantValue = updateConstantValue;
window.updateClientModuleVisibility = updateClientModuleVisibility;
