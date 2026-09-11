import {
    APP_CONFIG,
    isClientMode,
    isFeatureEnabled,
    getEmpresaContext
} from '../core/config.js';
import { ensureClientAccess } from '../core/auth.js';

function getEmpresaDisplayName() {
    const empresaContext = getEmpresaContext();
    if (!empresaContext) {
        return '';
    }

    return empresaContext.nome || empresaContext.codigo || empresaContext.sigla || '';
}

function hideElement(selector) {
    const element = document.querySelector(selector);
    if (!element) return;

    element.style.display = 'none';
    element.setAttribute('aria-hidden', 'true');
}

function setDisabled(input, disabled = true) {
    if (!input) return;

    input.disabled = disabled;
    input.readOnly = disabled;
    input.setAttribute('aria-disabled', String(disabled));
    input.style.cursor = disabled ? 'not-allowed' : 'text';
}

const CLIENT_FINANCIAL_NODE_SELECTORS = [
    '.option-price',
    '.room-total-container',
    '.project-total-value',
    '.obra-total-value',
    '.all-machines-total-price',
    '.tubos-total-geral',
    '[id^="total-all-machines-price-"]',
    '[id^="total-geral-valor-"]',
    '[id^="total-obra-valor-"]',
    '[id^="total-projeto-valor-"]',
    '[id^="room-total-"]',
    '[id^="acessorios-total-"]',
    '[id^="dutos-total-"]',
    '[id^="base-price-"]',
    '[id^="total-price-"]',
    '[id^="acessorio-valor-"]',
    '[id^="duto-valor-tipo-"]',
    '[id^="duto-valor-opcional-"]',
    '[id^="duto-valor-total-"]',
    '[id^="valor-material-duto-"]'
];

let clientFinancialUiObserver = null;
let financialScrubQueued = false;

function removeElement(element) {
    if (!element || !element.parentNode) {
        return;
    }

    element.parentNode.removeChild(element);
}

function removeClosest(element, selector) {
    if (!element) {
        return;
    }

    const target = element.closest(selector);
    if (target) {
        removeElement(target);
        return;
    }

    removeElement(element);
}

function scrubSelectorMatches(root) {
    CLIENT_FINANCIAL_NODE_SELECTORS.forEach((selector) => {
        root.querySelectorAll(selector).forEach((element) => {
            if (
                selector.startsWith('[id^="base-price-"') ||
                selector.startsWith('[id^="total-price-"')
            ) {
                removeClosest(element, '.form-group');
                return;
            }

            if (
                selector.startsWith('[id^="acessorio-valor-"') ||
                selector.startsWith('[id^="duto-valor-"')
            ) {
                removeClosest(element, '.selector-item');
                return;
            }

            if (selector.startsWith('[id^="valor-material-duto-"')) {
                removeClosest(element, '.material-inline');
                return;
            }

            removeElement(element);
        });
    });
}

function scrubFinancialAttributes(root) {
    root.querySelectorAll('[data-valor]').forEach((element) => {
        element.removeAttribute('data-valor');
    });

    root.querySelectorAll('.option-checkbox input[type="checkbox"][value]').forEach((input) => {
        input.value = '0';
    });
}

function stripTableColumns(table, indices) {
    if (!table) {
        return;
    }

    table.querySelectorAll('tr').forEach((row) => {
        const cells = Array.from(row.children);
        indices
            .slice()
            .sort((a, b) => b - a)
            .forEach((index) => {
                if (cells[index]) {
                    removeElement(cells[index]);
                }
            });
    });

    table.querySelectorAll('tfoot').forEach((tfoot) => {
        removeElement(tfoot);
    });
}

function scrubClientFinancialUi(root = document) {
    if (!isClientMode() || !root?.querySelectorAll) {
        return;
    }

    scrubSelectorMatches(root);
    scrubFinancialAttributes(root);

    root.querySelectorAll('.dutos-table').forEach((table) => {
        stripTableColumns(table, [5, 6, 7]);
    });

    root.querySelectorAll('.acessorios-table').forEach((table) => {
        stripTableColumns(table, [4, 5]);
    });
}

function applyClientModuleVisibility(root = document) {
    if (!isClientMode() || !root?.querySelectorAll) {
        return;
    }

    const constants = window.systemConstants || window.__SYSTEM_BOOTSTRAP__?.constants || {};
    const visibilityValue = constants.CLIENT_MODULE_VISIBILITY?.value;
    const visibilityMask = Number(visibilityValue);
    const moduleVisibility = Number.isFinite(visibilityMask)
        ? {
            acessorios: (visibilityMask & 1) !== 0,
            tubulacao: (visibilityMask & 2) !== 0,
            dutos: (visibilityMask & 4) !== 0
        }
        : {
            acessorios: visibilityValue?.acessorios !== false,
            tubulacao: visibilityValue?.tubulacao !== false,
            dutos: visibilityValue?.dutos !== false
        };
    const visibilityBySection = {
        acessorios: moduleVisibility.acessorios !== false,
        tubulacao: moduleVisibility.tubulacao !== false,
        dutos: moduleVisibility.dutos !== false
    };

    Object.entries(visibilityBySection).forEach(([sectionName, visible]) => {
        if (!visible) {
            root.querySelectorAll(`[data-client-section="${sectionName}"]`).forEach((section) => {
                section.style.display = 'none';
                section.setAttribute('aria-hidden', 'true');
            });
        }
    });
}

function queueClientFinancialScrub() {
    if (!isClientMode() || financialScrubQueued) {
        return;
    }

    financialScrubQueued = true;
    requestAnimationFrame(() => {
        financialScrubQueued = false;
        scrubClientFinancialUi(document);
        applyClientModuleVisibility(document);
    });
}

function applyStaticUiRestrictions() {
    if (!isClientMode()) {
        return;
    }

    document.body.classList.add('client-mode');

    if (!isFeatureEnabled('editDataNavigation')) {
        const editNavLink = document.getElementById('nav-editar-dados');
        if (editNavLink?.parentElement) {
            editNavLink.parentElement.style.display = 'none';
        } else {
            hideElement('#nav-editar-dados');
        }
    }

    if (!isFeatureEnabled('shutdown')) {
        hideElement('.shutdown-btn');
    }

    if (!isFeatureEnabled('filtros')) {
        hideElement('.filtro-bloco-altura');
    }

    applyClientModuleVisibility(document);

    queueClientFinancialScrub();
}

function updateClientPageTitle() {
    if (!isClientMode()) {
        return;
    }

    if (typeof window.updateCreateObrasPageTitle === 'function') {
        window.updateCreateObrasPageTitle(false);
        return;
    }

    const pageTitle = document.getElementById('page-title');
    const empresaDisplayName = getEmpresaDisplayName();

    if (pageTitle && empresaDisplayName) {
        const finalTitle = `Criação de Obras - ${empresaDisplayName}`;
        pageTitle.textContent = finalTitle;
        document.title = `${finalTitle} | Sistema ESI`;
    }
}

function parsePositiveInteger(value) {
    if (value === undefined || value === null) {
        return null;
    }

    const parsed = parseInt(String(value).trim(), 10);
    return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
}

function normalizeDisplayDate(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
        return '';
    }

    if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawValue)) {
        return rawValue;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
        const [ano, mes, dia] = rawValue.split('-');
        return `${dia}/${mes}/${ano}`;
    }

    const parsedDate = new Date(rawValue);
    if (Number.isNaN(parsedDate.getTime())) {
        return rawValue;
    }

    const dia = String(parsedDate.getDate()).padStart(2, '0');
    const mes = String(parsedDate.getMonth() + 1).padStart(2, '0');
    const ano = parsedDate.getFullYear();
    return `${dia}/${mes}/${ano}`;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractNumeroFromIdentifier(value, empresaSigla = '') {
    const text = String(value || '').trim();
    if (!text) {
        return null;
    }

    if (empresaSigla) {
        const escapedSigla = escapeRegExp(empresaSigla);
        const matchBySigla = text.match(new RegExp(`${escapedSigla}-(\\d+)$`, 'i')) ||
            text.match(new RegExp(`obra_${escapedSigla}_(\\d+)$`, 'i'));

        if (matchBySigla) {
            return parsePositiveInteger(matchBySigla[1]);
        }
    }

    const genericMatch = text.match(/-(\d+)$/) || text.match(/obra_[A-Za-z0-9]+_(\d+)$/i);
    return genericMatch ? parsePositiveInteger(genericMatch[1]) : null;
}

function resolveNumeroClienteFinal(obraElement, obraData = null, empresaSigla = '') {
    return parsePositiveInteger(obraData?.numeroClienteFinal) ||
        parsePositiveInteger(obraElement.dataset.numeroClienteFinal) ||
        extractNumeroFromIdentifier(obraData?.identificadorObra, empresaSigla) ||
        extractNumeroFromIdentifier(obraData?.idGerado, empresaSigla) ||
        extractNumeroFromIdentifier(obraData?.nome, empresaSigla) ||
        extractNumeroFromIdentifier(obraElement.dataset.identificadorObra, empresaSigla) ||
        extractNumeroFromIdentifier(obraElement.dataset.idGerado, empresaSigla) ||
        extractNumeroFromIdentifier(obraElement.dataset.obraName, empresaSigla) ||
        extractNumeroFromIdentifier(obraElement.querySelector('.obra-title')?.textContent, empresaSigla);
}

function sincronizarIdentificadoresObra(obraElement, empresaSigla, numeroClienteFinal) {
    if (!obraElement || !empresaSigla || !numeroClienteFinal) {
        return;
    }

    obraElement.dataset.numeroClienteFinal = String(numeroClienteFinal);
    obraElement.dataset.idGerado = `obra_${empresaSigla}_${numeroClienteFinal}`;
    obraElement.dataset.identificadorObra = `${empresaSigla}-${numeroClienteFinal}`;
}

async function applyClientEmpresaRestrictions(obraId, obraData = null) {
    if (!isClientMode() || !APP_CONFIG.ui?.lockEmpresaField) {
        return false;
    }

    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    const empresaContext = getEmpresaContext();

    if (!obraElement || !empresaContext) {
        return false;
    }

    const empresaInput = document.getElementById(`empresa-input-${obraId}`);
    const numeroClienteInput = document.getElementById(`numero-cliente-${obraId}`);
    const emailEmpresaInput = document.getElementById(`email-empresa-${obraId}`);
    const dropdown = document.getElementById(`empresa-dropdown-${obraId}`);
    const formElement = obraElement.querySelector('.empresa-formulario-ativo');
    const empresaContainer = obraElement.querySelector('.projetc-header-record.very-dark');

    if (!empresaInput || !formElement) {
        return false;
    }

    const empresaSigla = (
        obraData?.empresaCodigo ||
        obraData?.empresaSigla ||
        obraElement.dataset.empresaCodigo ||
        obraElement.dataset.empresaSigla ||
        empresaContext.codigo ||
        empresaContext.sigla ||
        ''
    ).trim();
    const empresaNome = (obraData?.empresaNome || obraElement.dataset.empresaNome || empresaContext.nome || '').trim();
    const empresaEmail = (
        obraData?.emailEmpresa ||
        obraData?.empresaEmail ||
        obraElement.dataset.emailEmpresa ||
        obraElement.dataset.empresaEmail ||
        empresaContext.email ||
        empresaContext.empresaEmail ||
        ''
    ).trim();
    const empresaValue = [empresaSigla, empresaNome].filter(Boolean).join(' - ');

    if (!obraElement.dataset.empresaCodigo && empresaSigla) {
        obraElement.dataset.empresaCodigo = empresaSigla;
    }

    if (!obraElement.dataset.empresaSigla && empresaSigla) {
        obraElement.dataset.empresaSigla = empresaSigla;
    }

    if (!obraElement.dataset.empresaNome && empresaNome) {
        obraElement.dataset.empresaNome = empresaNome;
    }

    if (empresaEmail) {
        obraElement.dataset.emailEmpresa = empresaEmail;
        obraElement.dataset.empresaEmail = empresaEmail;
    }

    const dataCadastro = normalizeDisplayDate(
        obraData?.dataCadastro || obraElement.dataset.dataCadastro
    );

    if (dataCadastro) {
        obraElement.dataset.dataCadastro = dataCadastro;
    } else if (!obraElement.dataset.dataCadastro) {
        obraElement.dataset.dataCadastro = new Date().toLocaleDateString('pt-BR');
    }

    empresaInput.value = empresaValue;
    empresaInput.dataset.siglaSelecionada = empresaSigla;
    empresaInput.dataset.nomeSelecionado = empresaNome;

    const numeroExistente = resolveNumeroClienteFinal(obraElement, obraData, empresaSigla);

    if (numeroExistente) {
        sincronizarIdentificadoresObra(obraElement, empresaSigla, numeroExistente);
    } else if (typeof window.empresaCadastro?.calcularNumeroClienteFinal === 'function') {
        const novoNumero = await window.empresaCadastro.calcularNumeroClienteFinal(empresaSigla, obraId);
        if (novoNumero) {
            sincronizarIdentificadoresObra(obraElement, empresaSigla, novoNumero);
        }
    }

    if (numeroClienteInput && obraElement.dataset.numeroClienteFinal) {
        numeroClienteInput.value = obraElement.dataset.numeroClienteFinal;
    }

    const dataCadastroInput = document.getElementById(`data-cadastro-${obraId}`);
    if (dataCadastroInput && obraElement.dataset.dataCadastro) {
        dataCadastroInput.value = obraElement.dataset.dataCadastro;
    }

    if (emailEmpresaInput && empresaEmail) {
        emailEmpresaInput.value = empresaEmail;
    }

    setDisabled(empresaInput, true);
    setDisabled(numeroClienteInput, true);

    if (dropdown) {
        dropdown.style.display = 'none';
    }

    const clearButton = formElement.querySelector('.btn-limpar');
    if (clearButton) {
        clearButton.style.display = 'none';
    }

    const hideButton = formElement.querySelector('.btn-ocultar');
    if (hideButton) {
        hideButton.textContent = 'Fechar';
    }

    if (empresaContainer) {
        empresaContainer.querySelectorAll('.btn-empresa-cadastro, .btn-empresa-visualizar').forEach((button) => {
            button.style.display = 'none';
        });
    }

    if (typeof window.empresaCadastro?.atualizarHeaderObra === 'function' && obraElement.dataset.numeroClienteFinal) {
        window.empresaCadastro.atualizarHeaderObra(obraElement, {
            empresaSigla,
            empresaNome,
            numeroClienteFinal: obraElement.dataset.numeroClienteFinal,
            clienteFinal: obraElement.dataset.clienteFinal || '',
            codigoCliente: obraElement.dataset.codigoCliente || '',
            dataCadastro: obraElement.dataset.dataCadastro || '',
            orcamentistaResponsavel: obraElement.dataset.orcamentistaResponsavel || ''
        });
    }

    return true;
}

function ensureClientEmpresaForm(obraId, obraData = null) {
    if (!isClientMode()) {
        return false;
    }

    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraElement) {
        return false;
    }

    const formElement = obraElement.querySelector('.empresa-formulario-ativo');
    if (!formElement && typeof window.ativarCadastroEmpresa === 'function') {
        window.ativarCadastroEmpresa(obraId);
    }

    return applyClientEmpresaRestrictions(obraId, obraData);
}

function setupClientObservers() {
    if (!isClientMode()) {
        return;
    }

    if (!clientFinancialUiObserver && document.body) {
        clientFinancialUiObserver = new MutationObserver(() => {
            queueClientFinancialScrub();
        });
        clientFinancialUiObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    document.addEventListener('obraCreated', (event) => {
        const obraId = event.detail?.obraId;
        const isFromServer = Boolean(event.detail?.isFromServer);
        if (!obraId) return;

        if (isFromServer) {
            return;
        }

        setTimeout(() => {
            ensureClientEmpresaForm(obraId);
            queueClientFinancialScrub();
        }, 120);
    });
}

function bootstrapClientMode() {
    if (!isClientMode()) {
        return {
            allowed: true,
            session: null
        };
    }

    const access = ensureClientAccess();
    if (!access.allowed) {
        return access;
    }

    applyStaticUiRestrictions();
    updateClientPageTitle();
    setupClientObservers();
    queueClientFinancialScrub();

    return access;
}

if (typeof window !== 'undefined') {
    window.applyClientEmpresaRestrictions = applyClientEmpresaRestrictions;
}

export {
    bootstrapClientMode,
    applyStaticUiRestrictions,
    updateClientPageTitle,
    applyClientEmpresaRestrictions,
    ensureClientEmpresaForm,
    getEmpresaDisplayName
};
