import { APP_CONFIG } from '../core/config.js';

const DEFAULT_CREATE_TITLE = 'Criação de Obras';
const DEFAULT_EDIT_TITLE = 'Edicao de Obras';
const dashboardViewParams = new URLSearchParams(window.location.search);
const EMBED_LOADING_OVERLAY_ID = 'obraEmbedLoadingOverlay';
const EMBED_LOADING_STYLE_ID = 'obraEmbedLoadingStyle';
const EMBED_LOADING_RELEASE_DELAY_MS = 1500;

let embeddedObraLoadCompleted = false;
let embeddedOverlayHideTimeout = null;
window.obrasCarregamentoCompleto = false;
const autoSaveTimers = new Map();
const autoSaveRevisions = new Map();
const autoSaveInFlight = new Map();

function getModeBaseTitle(modoEdicao) {
    if (window.location.pathname.toLowerCase().startsWith('/admin/obras/manage')) {
        return 'Gerenciar Obras';
    }

    return modoEdicao ? DEFAULT_EDIT_TITLE : DEFAULT_CREATE_TITLE;
}

function getEmpresaTitleSuffix() {
    if (APP_CONFIG.mode !== 'client') {
        return '';
    }

    return APP_CONFIG.empresaContext?.nome || APP_CONFIG.empresaAtual || '';
}

function getPageTitleText(modoEdicao = false) {
    const baseTitle = getModeBaseTitle(modoEdicao);
    const empresaTitle = getEmpresaTitleSuffix();

    return empresaTitle ? `${baseTitle} - ${empresaTitle}` : baseTitle;
}

function updatePageTitle(modoEdicao = false) {
    const pageTitle = document.getElementById('page-title');
    const finalTitle = getPageTitleText(modoEdicao);

    if (pageTitle) {
        pageTitle.textContent = finalTitle;
    }

    document.title = `${finalTitle} | Sistema ESI`;
}

function shouldAutoEnableFilterMode() {
    if (isEmbeddedObraView()) {
        return false;
    }

    return (
        dashboardViewParams.get('filtro') === '1' ||
        Boolean(
            dashboardViewParams.get('obra') ||
            dashboardViewParams.get('obraId') ||
            dashboardViewParams.get('empresa') ||
            dashboardViewParams.get('numero')
        )
    );
}

function clearAutoFilterParam() {
    const url = new URL(window.location.href);
    url.searchParams.delete('filtro');
    window.history.replaceState({}, '', url.toString());
}

function isEmbeddedObraView() {
    return dashboardViewParams.get('embed') === '1';
}

function ensureEmbeddedLoadingStyles() {
    if (document.getElementById(EMBED_LOADING_STYLE_ID)) {
        return;
    }

    const style = document.createElement('style');
    style.id = EMBED_LOADING_STYLE_ID;
    style.textContent = `
body.obra-embed-loading {
    overflow: hidden;
}

body.obra-embed-loading .main-content,
body.obra-embed-loading #projects-container {
    filter: blur(18px);
    transform: scale(1.01);
    transition: filter 0.28s ease, transform 0.28s ease;
    pointer-events: none;
    user-select: none;
}

.obra-embed-loading-overlay {
    position: fixed;
    inset: 0;
    z-index: 200000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(241, 245, 249, 0.72);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
    opacity: 1;
    transition: opacity 0.28s ease, visibility 0.28s ease;
}

.obra-embed-loading-overlay.is-hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
}

.obra-embed-loading-card {
    min-width: 240px;
    max-width: 320px;
    padding: 22px 24px;
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.84);
    border: 1px solid rgba(148, 163, 184, 0.28);
    box-shadow: 0 18px 45px rgba(15, 23, 42, 0.14);
    color: #0f172a;
    text-align: center;
}

.obra-embed-loading-spinner {
    width: 42px;
    height: 42px;
    margin: 0 auto 14px;
    border-radius: 999px;
    border: 4px solid rgba(148, 163, 184, 0.28);
    border-top-color: #1d4ed8;
    animation: obra-embed-spin 0.8s linear infinite;
}

.obra-embed-loading-title {
    font-size: 0.98rem;
    font-weight: 700;
    letter-spacing: 0.01em;
}

.obra-embed-loading-subtitle {
    margin-top: 6px;
    font-size: 0.82rem;
    color: #475569;
}

@keyframes obra-embed-spin {
    to {
        transform: rotate(360deg);
    }
}
`;

    document.head.appendChild(style);
}

function ensureEmbeddedLoadingOverlay() {
    if (!isEmbeddedObraView() || !document.body) {
        return;
    }

    ensureEmbeddedLoadingStyles();
    document.body.classList.add('obra-embed-loading');

    if (document.getElementById(EMBED_LOADING_OVERLAY_ID)) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = EMBED_LOADING_OVERLAY_ID;
    overlay.className = 'obra-embed-loading-overlay';
    overlay.innerHTML = `
        <div class="obra-embed-loading-card">
            <div class="obra-embed-loading-spinner" aria-hidden="true"></div>
            <div class="obra-embed-loading-title">Preparando visualizacao da obra</div>
            <div class="obra-embed-loading-subtitle">Aplicando foco e carregando os dados da empresa.</div>
        </div>
    `;

    document.body.appendChild(overlay);
}

function hideEmbeddedLoadingOverlay() {
    const overlay = document.getElementById(EMBED_LOADING_OVERLAY_ID);
    document.body?.classList.remove('obra-embed-loading');

    if (!overlay) {
        return;
    }

    overlay.classList.add('is-hidden');
}

function completeEmbeddedLoadingIfReady() {
    if (!isEmbeddedObraView()) {
        return false;
    }

    const focused = enforceFocusedObra();
    if (!focused || !embeddedObraLoadCompleted) {
        return false;
    }

    if (embeddedOverlayHideTimeout) {
        return true;
    }

    embeddedOverlayHideTimeout = window.setTimeout(() => {
        embeddedOverlayHideTimeout = null;
        window.requestAnimationFrame(() => {
            hideEmbeddedLoadingOverlay();
        });
    }, EMBED_LOADING_RELEASE_DELAY_MS);

    return true;
}

function applyEmbeddedObraView() {
    if (!isEmbeddedObraView()) {
        return;
    }

    document.body.classList.add('obra-embed-mode');
    ensureEmbeddedLoadingOverlay();
}

function applyRequestedFilters() {
    const empresa = dashboardViewParams.get('empresa')?.trim() || '';
    const numero = dashboardViewParams.get('numero')?.trim() || '';
    const obra = dashboardViewParams.get('obra')?.trim() || '';

    if (!empresa && !numero && !obra) {
        return;
    }

    const empresaInput = document.getElementById('filter-empresa');
    const numeroInput = document.getElementById('filter-numero-cliente');
    const nomeInput = document.getElementById('filter-nome-obra');

    if (empresaInput && empresa) {
        empresaInput.value = empresa;
        window.FilterSystem?.updateFilterValue('empresa', empresa);
    }

    if (numeroInput && numero) {
        numeroInput.value = numero;
        const parsedNumero = parseInt(numero, 10);
        window.FilterSystem?.updateFilterValue('numeroCliente', Number.isNaN(parsedNumero) ? null : parsedNumero);
    }

    if (nomeInput && obra) {
        nomeInput.value = obra;
        window.FilterSystem?.updateFilterValue('nomeObra', obra);
    }

    clearTimeout(window._dashboardRequestedFilterTimeout);
    window._dashboardRequestedFilterTimeout = setTimeout(() => {
        window.FilterSystem?.reloadObras?.();
    }, 120);
}

function enforceFocusedObra() {
    const obraId = dashboardViewParams.get('obraId')?.trim();
    if (!obraId) {
        return false;
    }

    const obraBlocks = Array.from(document.querySelectorAll('.obra-block[data-obra-id]'));
    if (obraBlocks.length === 0) {
        return false;
    }

    const targetBlock = obraBlocks.find((obraBlock) => String(obraBlock.dataset.obraId || '').trim() === obraId);
    if (!targetBlock) {
        return false;
    }

    obraBlocks.forEach((obraBlock) => {
        const isTarget = obraBlock === targetBlock;
        obraBlock.style.display = isTarget ? '' : 'none';
        obraBlock.setAttribute('aria-hidden', String(!isTarget));
    });

    return true;
}

function setupFocusedObraObserver() {
    if (!dashboardViewParams.get('obraId')) {
        embeddedObraLoadCompleted = true;
        hideEmbeddedLoadingOverlay();
        return;
    }

    const projectsContainer = document.getElementById('projects-container');
    if (!projectsContainer) {
        return;
    }

    const applyFocus = () => {
        window.requestAnimationFrame(() => {
            completeEmbeddedLoadingIfReady();
        });
    };

    applyFocus();

    const observer = new MutationObserver(applyFocus);
    observer.observe(projectsContainer, {
        childList: true,
        subtree: true
    });
}

function autoEnableFilterMode() {
    if (!shouldAutoEnableFilterMode()) {
        return;
    }

    let attempts = 0;
    const maxAttempts = 40;

    const enableFilterOnReady = () => {
        attempts += 1;

        const toggleSwitch = document.getElementById('filter-toggle');
        if (!toggleSwitch) {
            if (attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
            return;
        }

        if (toggleSwitch.disabled || !window.FilterSystem) {
            if (attempts >= maxAttempts) {
                clearInterval(intervalId);
            }
            return;
        }

        clearInterval(intervalId);

        if (!toggleSwitch.checked) {
            toggleSwitch.checked = true;
            toggleSwitch.dispatchEvent(new Event('change', { bubbles: true }));
        }

        applyRequestedFilters();
        enforceFocusedObra();
        updatePageTitle(true);
        clearAutoFilterParam();
    };

    const intervalId = setInterval(enableFilterOnReady, 200);
    enableFilterOnReady();
}

function resolveActiveLink() {
    const currentPath = window.location.pathname.toLowerCase();

    if (currentPath.startsWith('/obras/create') || currentPath.startsWith('/admin/obras/create')) {
        return document.getElementById('nav-criar-obras');
    }

    if (currentPath.startsWith('/admin/obras/manage')) {
        return document.getElementById('nav-gerenciar-obras');
    }

    if (currentPath.startsWith('/admin/data')) {
        return document.getElementById('nav-editar-dados');
    }

    return document.querySelector('.nav-list li a');
}

function highlightAndLockActivePage() {
    document.querySelectorAll('.nav-list li a').forEach((link) => {
        link.classList.remove('active');
    });

    const activeLink = resolveActiveLink();
    if (!activeLink) {
        return;
    }

    activeLink.classList.add('active');
    activeLink.setAttribute('data-current-page', 'true');

    activeLink.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        return false;
    }, true);
}

function bindFilterTitleUpdates() {
    const toggleSwitch = document.getElementById('filter-toggle');
    if (!toggleSwitch) {
        return;
    }

    toggleSwitch.addEventListener('change', function onToggleChange() {
        updatePageTitle(this.checked);
    });
}

function getVisibleObraIds() {
    return Array.from(document.querySelectorAll('.obra-block[data-obra-id]'))
        .filter((obraBlock) => obraBlock.isConnected && obraBlock.getAttribute('aria-hidden') !== 'true')
        .map((obraBlock) => String(obraBlock.dataset.obraId || '').trim())
        .filter(Boolean);
}

async function autoSaveVisibleObrasBeforeContextSwitch({ reason = 'context-switch' } = {}) {
    const visibleObras = getVisibleObraIds()
        .map((obraId) => document.querySelector(`[data-obra-id="${obraId}"]`))
        .filter((obraBlock) => obraBlock?.dataset.autoSaveDirty === 'true');

    if (visibleObras.length === 0) {
        return { success: true, skipped: true, reason };
    }

    const results = await Promise.all(visibleObras.map((obraBlock) => saveChangedObra(obraBlock)));
    return { success: results.every(Boolean), saved: results.filter(Boolean).length, reason };
}

async function saveChangedObra(obraBlock) {
    const obraId = String(obraBlock?.dataset.obraId || '').trim();
    if (!obraBlock || !obraId || !obraBlock.querySelector('.obra-actions-footer .btn-update')) {
        return true;
    }

    const ongoingSave = autoSaveInFlight.get(obraId);
    if (ongoingSave) {
        await ongoingSave;
        return obraBlock.dataset.autoSaveDirty === 'true'
            ? saveChangedObra(obraBlock)
            : true;
    }

    const revision = autoSaveRevisions.get(obraId) || 0;
    if (autoSaveTimers.has(obraId)) {
        clearTimeout(autoSaveTimers.get(obraId));
        autoSaveTimers.delete(obraId);
    }

    const savePromise = Promise.resolve(
        typeof window.saveObra === 'function'
            ? window.saveObra(obraId, undefined, { autosave: true })
            : false,
    );
    autoSaveInFlight.set(obraId, savePromise);
    let saved = false;
    try {
        saved = await savePromise;
    } finally {
        autoSaveInFlight.delete(obraId);
    }
    if (saved && autoSaveRevisions.get(obraId) === revision) {
        delete obraBlock.dataset.autoSaveDirty;
    }
    return saved !== false;
}

function scheduleAutoSave(obraBlock) {
    const obraId = String(obraBlock.dataset.obraId || '').trim();
    if (
        !obraId ||
        window.obrasCarregamentoCompleto !== true ||
        obraBlock.dataset.autoSaveReady !== 'true' ||
        !obraBlock.querySelector('.obra-actions-footer .btn-update')
    ) {
        return;
    }

    obraBlock.dataset.autoSaveDirty = 'true';
    autoSaveRevisions.set(obraId, (autoSaveRevisions.get(obraId) || 0) + 1);

    if (autoSaveTimers.has(obraId)) {
        clearTimeout(autoSaveTimers.get(obraId));
    }

    const timer = window.setTimeout(() => {
        autoSaveTimers.delete(obraId);
        saveChangedObra(obraBlock).catch((error) => {
            console.error('[AUTOSAVE] Falha ao atualizar obra:', error);
        });
    }, 700);
    autoSaveTimers.set(obraId, timer);
}

function resolveAutoSaveNavigationTarget(target) {
    const link = target.closest?.('a[href]');
    if (!link || link.target || link.hasAttribute('download')) {
        return null;
    }

    const targetUrl = new URL(link.href, window.location.origin);
    const currentUrl = new URL(window.location.href);

    targetUrl.hash = '';
    currentUrl.hash = '';

    if (targetUrl.toString() === currentUrl.toString()) {
        return null;
    }

    return targetUrl.toString();
}

function bindAutoSaveNavigation() {
    document.addEventListener('change', (event) => {
        if (!event.isTrusted) {
            return;
        }

        const field = event.target.closest?.('input, select, textarea');
        const obraBlock = field?.closest('.obra-block[data-obra-id]');
        if (obraBlock) {
            scheduleAutoSave(obraBlock);
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    window.updateCreateObrasPageTitle = updatePageTitle;
    window.updatePageTitle = updatePageTitle;
    window.autoSaveVisibleObrasBeforeContextSwitch = autoSaveVisibleObrasBeforeContextSwitch;

    applyEmbeddedObraView();
    highlightAndLockActivePage();
    bindAutoSaveNavigation();
    bindFilterTitleUpdates();
    updatePageTitle(false);
    autoEnableFilterMode();
    setupFocusedObraObserver();
    completeEmbeddedLoadingIfReady();

    window.addEventListener('embeddedObraLoaded', () => {
        embeddedObraLoadCompleted = true;
        setTimeout(() => {
            completeEmbeddedLoadingIfReady();
        }, 80);
    });

    setTimeout(highlightAndLockActivePage, 50);
});

if (isEmbeddedObraView()) {
    ensureEmbeddedLoadingOverlay();
}
