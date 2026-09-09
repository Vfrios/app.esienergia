import "../../03_Edit_data/config/request-bridge.js";
import { normalizeEmpresa } from "../core/shared-utils.js";
import { carregarEmpresasComCache } from "../data/empresa-system/empresa-core.js";

const listElement = document.getElementById("obra-history-list");
const historyPanel = document.getElementById("obra-history-panel");
const openHistoryButton = document.getElementById("open-obra-history");
const backButton = document.getElementById("back-to-managed-obras");
const savedObrasTitle = document.getElementById("saved-obras-title");
const savedObrasFilter = document.querySelector(".manage-obras-filter");
const savedObrasContainer = document.getElementById("projects-container");
const companyInput = document.getElementById("obra-history-filter-empresa");
const companyDropdown = document.getElementById("obra-history-filter-empresa-dropdown");
let empresas = [];
let historico = [];

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value == null ? "" : String(value);
    return element.innerHTML;
}

function normalize(value) {
    return String(value || "").trim().toLocaleLowerCase("pt-BR")
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data não informada" : date.toLocaleString("pt-BR");
}

function selectedCompany() {
    return normalize(companyInput?.value || "");
}

function getCompanyCode(item) {
    const obraTag = String(item.obra_tag || "").trim();
    if (obraTag.includes("-")) return obraTag.split("-", 1)[0].trim();
    return String(item.empresa_codigo || "").trim().replace(/-\d+$/, "");
}

function renderCompanyOptions() {
    if (!companyDropdown || !companyInput) return;
    const search = normalize(companyInput.value);
    const matches = empresas.filter((empresa) => normalize(`${empresa.codigo} ${empresa.nome}`).includes(search));
    companyDropdown.innerHTML = matches.length
        ? matches.map((empresa) => `<button type="button" class="manage-obras-company-option" data-company="${encodeURIComponent(`${empresa.codigo} - ${empresa.nome}`)}">${escapeHtml(`${empresa.codigo} - ${empresa.nome}`)}</button>`).join("")
        : '<div class="manage-obras-company-option">Nenhuma empresa encontrada</div>';
    companyDropdown.style.display = "block";
    companyDropdown.querySelectorAll("[data-company]").forEach((option) => option.addEventListener("click", () => {
        companyInput.value = decodeURIComponent(option.dataset.company);
        companyDropdown.style.display = "none";
        renderHistory();
    }));
}

function renderHistory() {
    if (!listElement) return;
    const search = selectedCompany();
    const filtered = historico.filter((item) => !search || normalize(`${getCompanyCode(item)} ${item.empresa_nome}`).includes(search));
    if (!filtered.length) {
        listElement.innerHTML = '<p class="management-status">Nenhuma obra baixada encontrada.</p>';
        return;
    }

    const grouped = filtered.reduce((groups, item) => {
        const companyCode = getCompanyCode(item);
        const companyName = String(item.empresa_nome || "").trim();
        const company = companyCode && companyName
            ? `${companyCode} - ${companyName}`
            : companyCode || companyName || "Empresa não informada";
        const companyGroup = (groups[company] ||= { items: [], obras: {} });
        const obraTag = String(item.obra_tag || item.obra_nome || item.obra_id || "Obra não identificada").trim();
        (companyGroup.obras[obraTag] ||= []).push(item);
        return groups;
    }, {});

    listElement.innerHTML = Object.entries(grouped).map(([company, companyGroup], groupIndex) => {
        const groupId = `obra-history-company-${groupIndex}`;
        const obraSections = Object.entries(companyGroup.obras).map(([obraTag, items], obraIndex) => {
            const obraGroupId = `${groupId}-obra-${obraIndex}`;
                const obraName = String(items[0]?.obra_nome || "").trim();
                const obraLabel = obraName && obraName !== obraTag
                    ? `${obraTag} (${obraName})`
                    : obraTag;
            return `
                <section class="obra-history-obra-group">
                    <button type="button" class="obra-history-obra" data-history-group="${obraGroupId}" aria-expanded="false">
                        <span class="obra-history-obra-toggle" aria-hidden="true">+</span>
                            <span>${escapeHtml(obraLabel)}</span>
                    </button>
                    <div class="obra-history-versions" id="${obraGroupId}" hidden>
                        ${items.map((item) => `
                            <article class="obra-history-item" data-history-id="${escapeHtml(item.id)}">
                                <div class="obra-history-item-info">
                                    <p class="obra-history-item-name">${escapeHtml(item.machine_name || "Versão da obra")}</p>
                                    <p class="obra-history-item-meta">Versão da obra · ${escapeHtml(formatDate(item.created_at))}</p>
                                </div>
                                <div class="obra-history-files">
                                    <a class="obra-history-file" href="/api/obras/historico/${encodeURIComponent(item.id)}/download">Baixar Excel</a>
                                    <button type="button" class="obra-history-delete" data-delete-history="${escapeHtml(item.id)}">Excluir</button>
                                </div>
                            </article>
                        `).join("")}
                    </div>
                </section>
            `;
        }).join("");
        return `
        <section class="obra-history-group">
            <button type="button" class="obra-history-company" data-history-group="${groupId}" aria-expanded="false">
                <span class="obra-history-company-toggle" aria-hidden="true">+</span>
                <span>${escapeHtml(company)}</span>
            </button>
            <div class="obra-history-company-items" id="${groupId}" hidden>
            ${obraSections}
            </div>
        </section>
    `;
    }).join("");

    listElement.querySelectorAll("[data-history-group]").forEach((button) => button.addEventListener("click", () => {
        const group = document.getElementById(button.dataset.historyGroup);
        if (!group) return;
        const collapsed = group.hidden;
        group.hidden = !collapsed;
        button.setAttribute("aria-expanded", String(collapsed));
        const toggle = button.querySelector(".obra-history-company-toggle, .obra-history-obra-toggle");
        if (toggle) toggle.textContent = collapsed ? "−" : "+";
    }));

    listElement.querySelectorAll("[data-delete-history]").forEach((button) => button.addEventListener("click", async () => {
        if (!window.confirm("Excluir este histórico de obra?")) return;
        const response = await fetch(`/api/obras/historico/${encodeURIComponent(button.dataset.deleteHistory)}/delete`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
        });
        if (response.ok) {
            historico = historico.filter((item) => item.id !== button.dataset.deleteHistory);
            renderHistory();
        }
    }));
}

async function loadHistory() {
    if (!listElement) return;
    listElement.innerHTML = '<p class="management-status">Carregando histórico...</p>';
    try {
        const response = await fetch("/api/obras/historico");
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || "Falha ao carregar histórico");
        historico = Array.isArray(payload.historico) ? payload.historico : [];
        renderHistory();
    } catch (error) {
        listElement.innerHTML = '<p class="management-status">Não foi possível carregar o histórico.</p>';
        console.error("[HISTÓRICO DE OBRAS]", error);
    }
}

async function initialize() {
    if (!listElement) return;
    try {
        empresas = (await carregarEmpresasComCache()).map(normalizeEmpresa).filter(Boolean);
    } catch (error) {
        console.error("[HISTÓRICO DE OBRAS] Empresas", error);
    }
    companyInput?.addEventListener("focus", renderCompanyOptions);
    companyInput?.addEventListener("input", renderHistory);
    companyInput?.addEventListener("keydown", (event) => {
        if (event.key === "Escape") companyDropdown.style.display = "none";
    });
    companyInput?.addEventListener("blur", () => setTimeout(() => { companyDropdown.style.display = "none"; }, 120));
    const setHistoryView = (showHistory) => {
        openHistoryButton.hidden = showHistory;
        openHistoryButton.style.display = showHistory ? "none" : "inline-flex";
        savedObrasTitle.hidden = showHistory;
        savedObrasFilter.hidden = showHistory;
        savedObrasContainer.hidden = showHistory;
        historyPanel.hidden = !showHistory;
        historyPanel.style.display = showHistory ? "block" : "none";
    };

    openHistoryButton?.addEventListener("click", () => {
        setHistoryView(true);
        loadHistory();
    });
    backButton?.addEventListener("click", () => {
        setHistoryView(false);
    });
    window.addEventListener("obra-history-updated", () => {
        if (!historyPanel.hidden) loadHistory();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
} else {
    initialize();
}
