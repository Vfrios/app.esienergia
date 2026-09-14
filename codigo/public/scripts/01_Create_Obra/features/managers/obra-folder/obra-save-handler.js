import { ensureStringId } from "../../../data/utils/id-generator.js";
import { buildObraData } from "../../../data/builders/data-builders.js";
import { showSystemStatus } from "../../../ui/components/status.js";
import { APP_CONFIG } from "../../../core/config.js";
import {
  isSessionActive,
  startSessionOnFirstSave,
} from "../../../data/adapters/session-adapter.js";
import {
  findObraBlockWithRetry,
  updateObraButtonAfterSave,
} from "./obra-dom-manager.js";
import { supportFrom_saveObra, atualizarObra } from "./obra-persistence.js";
import { prepararEmpresaParaSalvamento } from "../../../data/empresa-system/empresa-data-extractor.js";
import { collapseElement } from "../../../ui/helpers.js";

async function minimizarTogglesAposSalvamento(obraId) {
  console.log(` [TOGGLES] Minimizando todos os toggles para obra: ${obraId}`);

  try {
    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraElement) {
      console.error(` [TOGGLES] Obra ${obraId} nao encontrada`);
      return;
    }

    const obraContent = obraElement.querySelector(".obra-content");
    const obraMinimizer = obraElement.querySelector(".minimizer");
    if (obraContent && obraMinimizer) {
      collapseElement(obraContent, obraMinimizer);
    }

    const projetos = obraElement.querySelectorAll(".project-block");
    projetos.forEach((projeto) => {
      const projectContent = projeto.querySelector(".project-content");
      const projectMinimizer = projeto.querySelector(".minimizer");
      if (projectContent && projectMinimizer) {
        collapseElement(projectContent, projectMinimizer);
      }

      const salas = projeto.querySelectorAll(".room-block");
      salas.forEach((sala) => {
        const roomContent = sala.querySelector(".room-content");
        const roomMinimizer = sala.querySelector(".minimizer");
        if (roomContent && roomMinimizer) {
          collapseElement(roomContent, roomMinimizer);
        }
      });
    });

    console.log(` [TOGGLES] Todos os toggles minimizados para obra ${obraId}`);
  } catch (error) {
    console.error(" [TOGGLES] Erro ao minimizar toggles:", error);
  }
}

async function notificarAdminSobreObra(obraId) {
  if (APP_CONFIG.mode !== "client") {
    return;
  }

  const response = await fetch("/api/obra/notificar", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ obraId }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Falha ao enviar notificacao ao ADM.");
  }
}

function agendarTarefasPosSalvamento(obraId, { autosave = false } = {}) {
  setTimeout(() => {
    atualizarHeaderObraAposSalvamento(obraId).catch((error) => {
      console.error(" [HEADER] Falha no pos-salvamento:", error);
    });

    if (!autosave) {
      minimizarTogglesAposSalvamento(obraId).catch((error) => {
        console.error(" [TOGGLES] Falha no pos-salvamento:", error);
      });

      notificarAdminSobreObra(obraId).catch((notificationError) => {
        console.error(
          " [NOTIFICACAO] Falha ao enviar email ao ADM:",
          notificationError,
        );
      });
    }
  }, 0);
}

async function saveObra(obraId, event, { autosave = false } = {}) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }

  console.log(` SALVANDO OBRA pelo ID: "${obraId}"`);

  let obraBlock = await findObraBlockWithRetry(obraId, 15);

    if (!obraBlock) {
    console.error(
      " Obra nao encontrada no DOM apos multiplas tentativas:",
      obraId,
    );
        showSystemStatus("ERRO: Obra nao encontrada na interface", "error");
        return false;
  }

  const obraOriginalReference = obraBlock;
  const obraContainer = obraBlock.parentElement;

  console.log(" [SALVAMENTO] Preparando empresa para salvamento com obra...");
  await prepararEmpresaParaSalvamento(obraBlock);

  console.log(" REFERENCIA SALVA:", {
    obra: obraOriginalReference,
    container: obraContainer,
    obraNoContainer: obraContainer.contains(obraOriginalReference),
  });

  if (!isSessionActive()) {
    console.log(" Iniciando sessao para primeira obra...");
    await startSessionOnFirstSave();
  }

    if (!isSessionActive()) {
        console.warn(" Sessao nao esta ativa - obra nao sera salva");
        showSystemStatus("ERRO: Sessao nao esta ativa. Obra nao salva.", "error");
        return false;
  }

  console.log(" Obra confirmada no DOM:", {
    element: obraBlock,
    dataset: obraBlock.dataset,
    id: obraBlock.dataset.obraId,
    name: obraBlock.dataset.obraName,
  });

  console.log(" Construindo dados da obra...");
  const obraData = buildObraData(obraBlock);

  if (!obraData) {
    console.error(" Falha ao construir dados da obra");
    showSystemStatus("ERRO: Falha ao construir dados da obra", "error");
    return false;
  }

  const obraIdFromDOM = obraBlock.dataset.obraId;
  const obraIdFromData = obraData.id;
  const finalObraId = obraIdFromDOM || obraIdFromData;

  console.log(" VERIFICACAO DE OBRA MELHORADA:");
  console.log("- ID no DOM:", obraIdFromDOM);
  console.log("- ID nos dados:", obraIdFromData);
  console.log("- ID final para uso:", finalObraId);
  console.log("- E ID seguro?:", finalObraId?.startsWith("obra_"));

  const saveButton = obraBlock.querySelector(".obra-actions-footer .btn-save");
  const updateButton = obraBlock.querySelector(
    ".obra-actions-footer .btn-update",
  );
  const isNewObra = Boolean(saveButton) && !updateButton;

  console.log(`- Ja existe no servidor?: ${!isNewObra}`);
  console.log("- E nova obra?:", isNewObra);

  let novoFluxoResultado = null;

  if (isNewObra) {
    console.log(" SALVANDO COMO NOVA OBRA COM ID SEGURO:", finalObraId);

    obraData.id = finalObraId;

    if (!obraData.id || !obraData.id.startsWith("obra_")) {
        console.error(" Obra nao possui ID seguro valido para salvar");
        showSystemStatus("ERRO: Obra nao possui ID valido", "error");
        return false;
    }

    novoFluxoResultado = await supportFrom_saveObra(obraData);
  } else {
    console.log(" ATUALIZANDO OBRA EXISTENTE, ID SEGURO:", finalObraId);

    if (!finalObraId.startsWith("obra_")) {
      console.error(`ERRO: ID nao seguro para atualizacao: ${finalObraId}`);
      showSystemStatus("ERRO: ID da obra invalido para atualizacao", "error");
      return false;
    }

    novoFluxoResultado = await atualizarObra(finalObraId, obraData, { autosave });
  }

  if (!novoFluxoResultado) {
    console.error(" FALHA AO SALVAR OBRA NO SERVIDOR");
    showSystemStatus("ERRO: Falha ao salvar obra no servidor", "error");
    return false;
  }

  const novoFluxoFinalId = ensureStringId(novoFluxoResultado.id);

  let obraBlockAtualNovo = document.querySelector(
    `[data-obra-id="${novoFluxoFinalId}"]`,
  );

  if (!obraBlockAtualNovo) {
    console.error(" CRITICO: Obra desapareceu do DOM durante salvamento!");
    console.log(" Tentando recuperar da referencia original...");

    if (obraContainer && document.body.contains(obraContainer)) {
      const obrasNoContainer = obraContainer.querySelectorAll("[data-obra-id]");
      console.log(` Obras no container original: ${obrasNoContainer.length}`);

      if (obraContainer.contains(obraOriginalReference)) {
        obraBlockAtualNovo = obraOriginalReference;
        console.log(" Obra recuperada da referencia original");
      } else {
        console.error(" Obra nao esta mais no container original");
        showSystemStatus("ERRO: Obra perdida durante salvamento", "error");
        return false;
      }
    } else {
      console.error(" Container original nao encontrado");
      showSystemStatus("ERRO: Obra perdida durante salvamento", "error");
      return false;
    }
  }

  obraBlockAtualNovo.dataset.obraId = novoFluxoFinalId;
  obraBlockAtualNovo.dataset.obraName = obraData.nome;

  const titleElement = obraBlockAtualNovo.querySelector(".obra-title");
  if (titleElement && titleElement.textContent !== obraData.nome) {
    titleElement.textContent = obraData.nome;
  }

  if (
    typeof updateObraButtonAfterSave === "function" &&
    document.body.contains(obraBlockAtualNovo)
  ) {
    console.log(" Obra confirmada no DOM, atualizando botao...");
    updateObraButtonAfterSave(obraData.nome, novoFluxoFinalId);
  } else {
    console.error(" Obra nao esta no DOM para atualizar botao");
  }

  console.log(" OBRA SALVA/ATUALIZADA:", {
    id: novoFluxoFinalId,
    nome: obraData.nome,
    isNew: isNewObra,
  });

  if (typeof window.invalidateRuntimeBootstrap === "function") {
    window.invalidateRuntimeBootstrap();
  }

  console.log(" [POS-SAVE] Agendando tarefas secundarias apos o salvamento...");
  agendarTarefasPosSalvamento(novoFluxoFinalId, { autosave });

  console.log(
    ` OBRA SALVA/ATUALIZADA COM SUCESSO! ID SEGURO: ${novoFluxoFinalId}`,
  );

  const successMessage = isNewObra
    ? "Obra salva com sucesso!"
    : "Obra atualizada com sucesso!";

  if (!autosave) {
    showSystemStatus(successMessage, "success");
  }
  return true;
}

async function atualizarHeaderObraAposSalvamento(obraId) {
  try {
    console.log(
      ` [HEADER] Iniciando atualizacao do header para obra: ${obraId}`,
    );

    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraElement) {
      console.error(` [HEADER] Obra ${obraId} nao encontrada no DOM`);
      return;
    }

    const { extractEmpresaData } = await import(
      "../../../data/empresa-system/empresa-data-extractor.js"
    );
    const { atualizarInterfaceComEmpresa } = await import(
      "../../../data/empresa-system/empresa-form-manager.js"
    );

    console.log(" [HEADER] Extraindo dados da empresa...");
    const empresaData = extractEmpresaData(obraElement);

    console.log(" [HEADER] Dados extraidos:", empresaData);

    if (!empresaData.empresaSigla || !empresaData.empresaNome) {
      console.log(" [HEADER] Dados de empresa incompletos para atualizar header");
      return;
    }

    console.log(" [HEADER] Chamando atualizarInterfaceComEmpresa...");
    await atualizarInterfaceComEmpresa(obraElement, empresaData);

    console.log(" [HEADER] Header atualizado com sucesso!");
  } catch (error) {
    console.error(" [HEADER] Erro ao atualizar header:", error);
  }
}

export { saveObra, atualizarHeaderObraAposSalvamento };
