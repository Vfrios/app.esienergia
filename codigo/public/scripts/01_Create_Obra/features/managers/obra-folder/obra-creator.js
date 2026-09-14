import { getNextObraNumber } from '../../../data/utils/data-utils.js';
import { generateObraId } from '../../../data/utils/id-generator.js';
import { deleteObra } from './obra-utils.js';
import { parseCurrency,formatCurrency } from '../project-manager.js';
import { APP_CONFIG } from '../../../core/config.js';

let obraCreationQueue = Promise.resolve();

/**
 * ATUALIZA O TOTAL DA OBRA (NÍVEL 4)
 * Escuta eventos dos projetos
 */
function updateObraTotal(obraId) {
    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraElement) return;

    let total = 0;

    // Soma os totais dos projetos
    obraElement.querySelectorAll('.project-block').forEach(project => {
        const projectId = project.dataset.projectId;
        const projectTotal = document.getElementById(`total-projeto-valor-${projectId}`);
        if (projectTotal) {
            total += parseCurrency(projectTotal.textContent);
        }
    });

    const obraTotalSpan = document.getElementById(`total-obra-valor-${obraId}`);
    if (obraTotalSpan) {
        obraTotalSpan.textContent = formatCurrency(total);
    } else {
        const addProjectSection = obraElement.querySelector('.add-project-section');
        if (addProjectSection) {
            addProjectSection.insertAdjacentHTML('beforeend',
                `<span class="obra-total-value" id="total-obra-valor-${obraId}" 
                      data-obra-id="${obraId}" title="Valor total da obra">
                    ${formatCurrency(total)}
                </span>`
            );
        }
    }
}

// ESCUTA EVENTOS DOS PROJETOS (NÍVEL 3)
document.addEventListener('projetoAtualizado', (e) => {
    const { obraId } = e.detail;
    if (obraId) {
        setTimeout(() => updateObraTotal(obraId), 10);
    }
});

/**
 * Constrói o HTML de uma obra
 */
function buildObraHTML(obraName, obraId, hasId = false, isFromServer = false, obraData = null) {
    if (!obraId || obraId === 'undefined' || obraId === 'null') {
        obraId = generateObraId();
    }

    let buttonText = "Adicionar campos de cadastro de empresas";
    
    if (isFromServer && obraData) {
        const temDadosEmpresa = obraData.empresaSigla || obraData.empresa_id || obraData.numeroClienteFinal;
        if (temDadosEmpresa) {
            buttonText = "Visualizar campos de cadastro de empresas";
        }
    }

    return `
    <div class="obra-block" data-obra-id="${obraId}" data-obra-name="${obraName}">
        <div class="obra-header">
            <button class="minimizer" onclick="toggleObra('${obraId}', event)">+</button>
            <h2 class="obra-title compact-title editable-title" data-editable="true" onclick="makeEditable(this, 'obra')">${obraName}</h2>
            <div class="obra-header-spacer"></div>
            <div class="obra-actions">
                <button class="btn btn-delete" onclick="window.deleteObra('${obraName}', '${obraId}')">Remover Obra</button>
            </div>
        </div>

        <div class="obra-content collapsed" id="obra-content-${obraId}">
            <div class="projetc-header-record very-dark">
                <button class="btn-empresa-cadastro" onclick="window.ativarCadastroEmpresa('${obraId}')">
                    ${buttonText}
                </button>
            </div>
            <div class="projects-container" id="projects-${obraId}">
                <p class="empty-message">Nenhum projeto adicionado ainda. Adicione o primeiro projeto!</p>
            </div>
            
            <div class="add-project-section">
                <button class="btn btn-add-secondary" onclick="addNewProjectToObra('${obraId}')">+ Adicionar Projeto</button>
                <span class="obra-total-value" id="total-obra-valor-${obraId}" 
                      data-obra-id="${obraId}" 
                      title="Valor total da obra">
                    R$ 0,00
                </span>
            </div>
            
            ${buildObraActionsFooter(obraId, obraName, hasId)} 
        </div>
    </div>
    `;
}

function buildObraActionsFooter(obraId, _obraName, hasId = false) {
    const hasIdBool = Boolean(hasId) && hasId !== 'false' && hasId !== '0' && hasId !== '' && hasId !== null && hasId !== undefined;
    
    const buttonText = hasIdBool ? "Atualizar Obra" : "Salvar Obra";
    const buttonClass = hasIdBool ? "btn-update" : "btn-save";

    const exportButtonHtml = APP_CONFIG.mode === 'client'
        ? `<button class="btn btn-download" onclick="downloadWord('${obraId}')">Baixar Word</button>`
        : `<button class="btn btn-download" onclick="abrirModalExportacao('${obraId}')">Exportar Obra</button>`;

    return `
    <div class="obra-actions-footer">
        <button class="btn ${buttonClass}" onclick="event.preventDefault(); saveOrUpdateObra('${obraId}')">${buttonText}</button>
        ${hasIdBool ? `
        ${exportButtonHtml}
        ` : ''}
    </div>
    `;
}

async function insertObraIntoDOM(obraHTML, obraId, hasProjects = false) {
    let projectsContainer = document.getElementById("projects-container");

    if (!projectsContainer) {
        const mainContent = document.querySelector('main, body');
        if (mainContent) {
            projectsContainer = document.createElement('div');
            projectsContainer.id = 'projects-container';
            projectsContainer.innerHTML = '<!-- Hierarquia: Obra → Projeto → Sala -->';
            mainContent.appendChild(projectsContainer);
        } else {
            return false;
        }
    }

    try {
        projectsContainer.insertAdjacentHTML("beforeend", obraHTML);

        setTimeout(() => {
            const obraInserida = document.querySelector(`[data-obra-id="${obraId}"]`);
            if (obraInserida) {
                if (hasProjects) {
                    const emptyMessage = obraInserida.querySelector('.empty-message');
                    if (emptyMessage) emptyMessage.remove();
                }
                updateObraTotal(obraId);
            }
        }, 50);

        return true;
    } catch (error) {
        console.error('Erro ao inserir obra:', error);
        return false;
    }
}

async function createEmptyObra(obraName, obraId, isFromServer = false, hasProjects = false) {
    const finalObraId = obraId || generateObraId();
    const obraHTML = buildObraHTML(obraName, finalObraId, isFromServer, isFromServer);

    const inserted = await insertObraIntoDOM(obraHTML, finalObraId, hasProjects);

    if (inserted) {
        setTimeout(() => {
            document.dispatchEvent(new CustomEvent('obraCreated', {
                detail: {
                    obraId: finalObraId,
                    isFromServer
                }
            }));

            if (isFromServer && window.atualizarTextoBotaoEmpresa) {
                window.atualizarTextoBotaoEmpresa(finalObraId, "Visualizar campos de cadastro de empresas");
            }
        }, 100);
    }

    return inserted;
}

/**
 *  FUNÇÕES PRINCIPAIS DE GERENCIAMENTO
 */

function addNewObra() {
    const creation = obraCreationQueue.then(async () => {
        const obraNumber = getNextObraNumber();
        const obraName = `Obra${obraNumber}`;
        const obraId = generateObraId();

        await createEmptyObra(obraName, obraId, false, false);

        await new Promise((resolve) => setTimeout(resolve, 150));
        if (typeof window.addNewProjectToObra === 'function') {
            await window.addNewProjectToObra(obraId);
            updateObraTotal(obraId);
        }

        return { obraId, obraName };
    });

    obraCreationQueue = creation.catch((error) => {
        console.error("Erro ao criar nova obra:", error);
        alert("Erro ao criar nova obra.");
        return false;
    });

    return creation;
}

// Função para criação de obra a partir de dados do servidor
async function createObraFromServer(obraData) {
    try {
        const obraName = obraData.nome;
        const obraId = obraData.id;
        await createEmptyObra(obraName, obraId, true);
        return true;
    } catch (error) {
        console.error('Erro ao criar obra do servidor:', error);
        return false;
    }
}


function initializeExistingObraTotals() {
    document.querySelectorAll('.obra-block').forEach(obra => {
        const obraId = obra.dataset.obraId;
        if (obraId) {
            let totalElement = document.getElementById(`total-obra-valor-${obraId}`);
            if (!totalElement) {
                const addProjectSection = obra.querySelector('.add-project-section');
                if (addProjectSection) {
                    addProjectSection.insertAdjacentHTML('beforeend',
                        `<span class="obra-total-value" id="total-obra-valor-${obraId}" 
                              data-obra-id="${obraId}" title="Valor total da obra">
                            R$ 0,00
                        </span>`
                    );
                }
            }
            setTimeout(() => updateObraTotal(obraId), 125);
        }
    });
}

if (typeof window !== 'undefined') {
    window.addNewObra = addNewObra;
    window.deleteObra = deleteObra;
    window.createEmptyObra = createEmptyObra;
    window.buildObraHTML = buildObraHTML;
    window.initializeExistingObraTotals = initializeExistingObraTotals;
    window.updateObraTotal = updateObraTotal;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeExistingObraTotals, 125);
    });
} else {
    setTimeout(initializeExistingObraTotals, 125);
}

export {
    buildObraHTML,
    buildObraActionsFooter,
    insertObraIntoDOM,
    createEmptyObra,
    addNewObra,
    createObraFromServer,
    initializeExistingObraTotals
};
