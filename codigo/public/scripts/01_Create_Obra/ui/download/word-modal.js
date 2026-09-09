// word-modal.js (atualizado para usar a API do servidor)

import { showSystemStatus } from "../interface.js";

const BACKGROUND_JOB_POLL_INTERVAL_MS = 700;
const BACKGROUND_JOB_TIMEOUT_MS = 180000;

/**
 * Exibe modal para seleção do modelo Word
 * @param {string} obraId - ID da obra
 * @param {string} obraName - Nome da obra
 * @returns {void}
 */
export function showWordModelModal(obraId, obraName) {
  // Criar overlay
  const overlay = document.createElement("div");
  overlay.className = "word-modal-overlay";

  // Criar modal
  const modal = document.createElement("div");
  modal.className = "word-modal";

  // Guardar conteúdo original para possível restauração
  let originalModalContent = "";

  // HTML do modal
  modal.innerHTML = `
 <div class="word-modal-header">
 <h2 class="word-modal-title">
 <i></i>
 Selecione os Modelos para Download
 </h2>
 <button class="word-modal-close">&times;</button>
 </div>
 
 <div class="word-modal-content">
 <p class="word-modal-subtitle">Selecione quais modelos deseja baixar para a obra: <strong>${obraName}</strong></p>
 
 <div class="word-model-options">
 <div class="model-option" data-model="pc">
 <input type="checkbox" id="model-pc" class="model-option-checkbox">
 <div class="model-option-icon"></div>
 <div class="model-option-details">
 <div class="model-option-title">Proposta Comercial</div>
 <div class="model-option-description">Documento comercial com valores, condições de pagamento e informações para o cliente.</div>
 </div>
 </div>
 
 <div class="model-option" data-model="pt">
 <input type="checkbox" id="model-pt" class="model-option-checkbox">
 <div class="model-option-icon"></div>
 <div class="model-option-details">
 <div class="model-option-title">Proposta Técnica</div>
 <div class="model-option-description">Documento técnico detalhado com especificações, cálculos e memórias de cálculo.</div>
 </div>
 </div>
 </div>
 
 <div class="model-select-all">
 <input type="checkbox" id="select-all" class="model-select-all-checkbox">
 <label for="select-all">Selecionar Todos os Modelos</label>
 </div>
 
 <div class="word-modal-footer">
 <button class="word-modal-btn word-modal-btn-cancel">
 <i>✕</i>
 Cancelar
 </button>
 <button class="word-modal-btn word-modal-btn-download" disabled>
 <i></i>
 Baixar Documento(s)
 </button>
 </div>
 </div>
 `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Guardar conteúdo original
  originalModalContent = modal.querySelector(".word-modal-content").innerHTML;

  // Adicionar eventos
  setupModalEvents(overlay, modal, obraId, obraName, originalModalContent);

  // Prevenir scroll no body
  document.body.style.overflow = "hidden";
}

async function fetchBackgroundJob(jobId) {
  const response = await fetch(`/api/jobs/status?id=${encodeURIComponent(jobId)}`);
  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success || !result.job) {
    throw new Error(result.error || "Não foi possível consultar o processamento.");
  }

  return result.job;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function waitForBackgroundJob(jobId, options = {}) {
  const {
    intervalMs = BACKGROUND_JOB_POLL_INTERVAL_MS,
    timeoutMs = BACKGROUND_JOB_TIMEOUT_MS,
    onProgress = null,
  } = options;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const job = await fetchBackgroundJob(jobId);

    if (typeof onProgress === "function") {
      onProgress(job);
    }

    if (job.status === "completed") {
      return job;
    }

    if (job.status === "failed") {
      throw new Error(job.error || "Falha ao processar a solicitação.");
    }

    await wait(intervalMs);
  }

  throw new Error("O processamento demorou mais do que o esperado.");
}

function normalizeDownloadIds(result) {

  async function registerDownloadHistory(obraId, result) {
    if (result?.history_id) {
      window.dispatchEvent(new CustomEvent("obra-history-updated"));
      return;
    }
    const downloadIds = normalizeDownloadIds(result);
    if (!downloadIds.length) return;
    const response = await fetch("/api/obras/historico/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ obraId, downloadIds, formato: result?.template_type || "ambos" }),
    });
    if (!response.ok) {
      console.warn("[HISTÓRICO DE OBRAS] Registro não confirmado", await response.text());
      return;
    }
    window.dispatchEvent(new CustomEvent("obra-history-updated"));
  }
  if (Array.isArray(result?.download_ids) && result.download_ids.length) {
    return result.download_ids.filter(Boolean);
  }

  if (Array.isArray(result?.downloads) && result.downloads.length) {
    return result.downloads
      .map((download) => download?.download_id)
      .filter(Boolean);
  }

  if (result?.download_id) {
    return [result.download_id];
  }

  return [];
}

function updateWordLoadingState(modal, job) {
  const loadingText = modal.querySelector(".word-modal-loading-text");
  const loadingHint = modal.querySelector(".word-modal-loading p");
  if (!loadingText || !loadingHint || !job) {
    return;
  }

  if (job.stage === "preparing_download") {
    loadingText.textContent = "Preparando download...";
    loadingHint.textContent =
      "Os arquivos já foram gerados e o download será iniciado em instantes...";
    return;
  }

  loadingText.textContent = "Gerando documento(s)...";
  loadingHint.textContent = "Isso pode levar alguns instantes...";
}

/**
 * Configura os eventos do modal
 */
function setupModalEvents(
  overlay,
  modal,
  obraId,
  obraName,
  originalModalContent,
) {
  const closeBtn = modal.querySelector(".word-modal-close");
  const cancelBtn = modal.querySelector(".word-modal-btn-cancel");
  const downloadBtn = modal.querySelector(".word-modal-btn-download");
  const options = modal.querySelectorAll(".model-option");
  const selectAllContainer = modal.querySelector(".model-select-all");
  const selectAllCheckbox = modal.querySelector("#select-all");

  // Fechar modal ao clicar no overlay
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      closeModal(overlay);
    }
  });

  // Fechar modal ao clicar no botão de fechar
  closeBtn.addEventListener("click", () => closeModal(overlay));

  // Fechar modal ao clicar no botão cancelar
  cancelBtn.addEventListener("click", () => closeModal(overlay));

  // Evento para cada opção de modelo
  options.forEach((option) => {
    const checkbox = option.querySelector(".model-option-checkbox");

    // Clique na opção
    option.addEventListener("click", (e) => {
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }

      updateOptionSelection(option, checkbox.checked);
      updateSelectAllCheckbox(options, selectAllCheckbox);
      updateDownloadButton(options, downloadBtn);
    });

    // Clique direto no checkbox
    checkbox.addEventListener("click", (e) => {
      e.stopPropagation();
      updateOptionSelection(option, checkbox.checked);
      updateSelectAllCheckbox(options, selectAllCheckbox);
      updateDownloadButton(options, downloadBtn);
    });
  });

  // Selecionar todos
  selectAllContainer.addEventListener("click", (e) => {
    if (e.target !== selectAllCheckbox) {
      selectAllCheckbox.checked = !selectAllCheckbox.checked;
    }

    toggleAllOptions(options, selectAllCheckbox.checked);
    updateDownloadButton(options, downloadBtn);

    // Atualizar aparência do container
    selectAllContainer.classList.toggle("selected", selectAllCheckbox.checked);
  });

  // Clique direto no checkbox "Selecionar Todos"
  selectAllCheckbox.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleAllOptions(options, selectAllCheckbox.checked);
    updateDownloadButton(options, downloadBtn);
    selectAllContainer.classList.toggle("selected", selectAllCheckbox.checked);
  });

  // Baixar documentos - AGORA USA A API DO SERVIDOR
  downloadBtn.addEventListener("click", async () => {
    const selectedModels = getSelectedModels(options);

    if (selectedModels.length === 0) return;

    // Mostrar loading no modal
    showLoading(modal);

    try {
      let endpoint, modelType;

      // Determinar qual endpoint chamar
      if (selectedModels.length === 2) {
        endpoint = "/api/word/generate/ambos";
        modelType = "ambos";
      } else if (selectedModels.includes("pc")) {
        endpoint = "/api/word/generate/proposta-comercial";
        modelType = "comercial";
      } else {
        endpoint = "/api/word/generate/proposta-tecnica";
        modelType = "tecnica";
      }

      // Chamar API do servidor
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ obra_id: obraId }),
      });

      const result = await response.json();
      const finalResult = result.job_id
        ? await waitForBackgroundJob(result.job_id, {
            onProgress: (job) => updateWordLoadingState(modal, job),
          })
        : result;

      if (!result.success) {
        throw new Error(result.error || "Erro na geração do documento");
      }

      // Baixar os arquivos em sequência
      // Registrar antes do download consumir os arquivos temporários do servidor.
      await registerDownloadHistory(obraId, finalResult);
      await downloadGeneratedFiles(normalizeDownloadIds(finalResult));

      if (finalResult.notification_error) {
        showSystemStatus(
          "Download concluído, mas o email ao ADM não foi enviado.",
          "warning",
        );
      }

      // Mostrar sucesso
      showSuccess(modal, selectedModels.length);

      // Fechar modal após 2 segundos
      setTimeout(() => {
        closeModal(overlay);
        showSystemStatus(
          finalResult.notification_error
            ? "Documento(s) gerado(s) com sucesso, mas o email ao ADM não foi enviado."
            : `Documento(s) Word gerado(s) com sucesso!`,
          finalResult.notification_error ? "warning" : "success",
        );
      }, 2000);
    } catch (error) {
      console.error(" Erro ao gerar documento(s):", error);

      // Mostrar erro
      showError(modal, error.message);

      // Restaurar conteúdo original após 3 segundos
      setTimeout(() => {
        const content = modal.querySelector(".word-modal-content");
        if (content) {
          content.innerHTML = originalModalContent;
          // Reconfigurar eventos
          setupModalEvents(
            overlay,
            modal,
            obraId,
            obraName,
            originalModalContent,
          );
        }
      }, 3000);
    }
  });
}

/**
 * Baixa arquivo gerado usando a API de download
 */
export async function downloadGeneratedFile(downloadId) {
  try {
    const response = await fetch(`/api/word/download?id=${downloadId}`);

    if (!response.ok) {
      throw new Error("Erro no download do documento");
    }

    // Obter blob do arquivo
    const blob = await response.blob();

    // Obter nome do arquivo do header
    const contentDisposition = response.headers.get("Content-Disposition");
    let filename = "documento.docx";

    if (contentDisposition) {
      const filenameMatch = contentDisposition.match(/filename="(.+)"/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      }
    }

    // Criar link de download
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error(" Erro no download:", error);
    throw error;
  }
}

export async function downloadGeneratedFiles(downloadIds) {
  const normalizedIds = Array.isArray(downloadIds)
    ? downloadIds.filter(Boolean)
    : [downloadIds].filter(Boolean);

  if (!normalizedIds.length) {
    throw new Error("Nenhum arquivo foi disponibilizado para download.");
  }

  for (const downloadId of normalizedIds) {
    await downloadGeneratedFile(downloadId);
    await wait(180);
  }
}

/**
 * Fecha o modal
 */
function closeModal(overlay) {
  overlay.style.opacity = "0";

  setTimeout(() => {
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    document.body.style.overflow = "";
  }, 37);
}

/**
 * Atualiza a aparência de uma opção
 */
function updateOptionSelection(option, isSelected) {
  option.classList.toggle("selected", isSelected);
}

/**
 * Atualiza o checkbox "Selecionar Todos"
 */
function updateSelectAllCheckbox(options, selectAllCheckbox) {
  const allChecked = Array.from(options).every(
    (option) => option.querySelector(".model-option-checkbox").checked,
  );

  selectAllCheckbox.checked = allChecked;
  const selectAllContainer = selectAllCheckbox.closest(".model-select-all");
  selectAllContainer.classList.toggle("selected", allChecked);
}

/**
 * Atualiza o estado do botão de download
 */
function updateDownloadButton(options, downloadBtn) {
  const hasSelection = Array.from(options).some(
    (option) => option.querySelector(".model-option-checkbox").checked,
  );

  downloadBtn.disabled = !hasSelection;

  if (hasSelection) {
    const selectedCount = Array.from(options).filter(
      (option) => option.querySelector(".model-option-checkbox").checked,
    ).length;

    const text = selectedCount === 2 ? "Baixar Ambos" : "Baixar Documento";
    downloadBtn.innerHTML = `<i></i> ${text}`;
  }
}

/**
 * Seleciona ou desseleciona todas as opções
 */
function toggleAllOptions(options, selectAll) {
  options.forEach((option) => {
    const checkbox = option.querySelector(".model-option-checkbox");
    checkbox.checked = selectAll;
    updateOptionSelection(option, selectAll);
  });
}

/**
 * Obtém os modelos selecionados
 */
function getSelectedModels(options) {
  return Array.from(options)
    .filter((option) => option.querySelector(".model-option-checkbox").checked)
    .map((option) => option.dataset.model);
}

/**
 * Mostra estado de loading no modal
 */
function showLoading(modal) {
  const content = modal.querySelector(".word-modal-content");
  content.innerHTML = `
 <div class="word-modal-loading">
 <div class="word-modal-loading-spinner"></div>
 <div class="word-modal-loading-text">Gerando documento(s)...</div>
 <p style="color: var(--color-gray-600); margin-top: var(--spacing-sm);">
 Isso pode levar alguns instantes...
 </p>
 </div>
 `;
}

/**
 * Mostra estado de sucesso no modal
 */
function showSuccess(modal, count) {
  const content = modal.querySelector(".word-modal-content");
  content.innerHTML = `
 <div class="word-modal-success">
 <div class="word-modal-success-icon">✓</div>
 <div class="word-modal-success-text">
 ${count === 2 ? "Ambos documentos foram gerados com sucesso!" : "Documento gerado com sucesso!"}
 </div>
 <p style="color: var(--color-gray-600); margin-top: var(--spacing-sm);">
 O download começou automaticamente. O modal será fechado em instantes...
 </p>
 </div>
 `;
}

/**
 * Mostra estado de erro no modal
 */
function showError(modal, errorMessage) {
  const content = modal.querySelector(".word-modal-content");
  content.innerHTML = `
 <div class="word-modal-error">
 <div class="word-modal-error-icon"></div>
 <div class="word-modal-error-text">
 Erro ao gerar documento
 </div>
 <p style="color: var(--color-gray-600); margin-top: var(--spacing-sm); font-size: 0.9rem;">
 ${errorMessage}
 </p>
 <p style="color: var(--color-gray-500); margin-top: var(--spacing-sm); font-size: 0.8rem;">
 Tentando restaurar o modal...
 </p>
 </div>
 `;
}
