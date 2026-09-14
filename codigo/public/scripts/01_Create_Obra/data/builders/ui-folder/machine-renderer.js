import {
  buildMachinesSection,
  addMachine,
  calculateMachinePrice,
  updateOptionValues,
} from "../../modules/machines/machines-core.js";

function safePriceNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Encontra seção de máquinas pelo título
 */
function findMachinesSection(roomElement) {
  if (!roomElement) return null;

  // Buscar todas as seções .section-block
  const allSections = roomElement.querySelectorAll(".section-block");

  // Encontrar a que tem "Máquinas" no título
  for (let section of allSections) {
    const title = section.querySelector(".section-title");
    if (title && title.textContent.includes("Máquinas")) {
      return section;
    }
  }

  return null;
}

/**
 * Encontrar seção por título
 */
function findSectionByTitle(roomElement, titleText) {
  if (!roomElement) return null;

  const allSections = roomElement.querySelectorAll(".section-block");

  for (let section of allSections) {
    const title = section.querySelector(".section-title");
    if (title && title.textContent.includes(titleText)) {
      return section;
    }
  }

  return null;
}

/**
 * Garante que a seção de máquinas existe e está inicializada
 */
async function ensureMachinesSection(roomElement) {
  if (!roomElement) {
    console.error(" Elemento da sala inválido");
    return null;
  }

  const obraId = roomElement.dataset.obraId;
  const projectId = roomElement.dataset.projectId;
  const roomName = roomElement.dataset.roomName;
  const roomId = roomElement.dataset.roomId;

  if (!roomId || roomId === "undefined" || roomId === "null") {
    console.error(` Room ID inválido: "${roomId}" para sala ${roomName}`);
    return null;
  }

  console.log(
    ` Garantindo seção de máquinas para sala ${roomName} (ID: ${roomId})`,
  );

  // Primeiro garantir que todas as seções existem
  const sectionsReady = await ensureAllRoomSections(roomElement);
  if (!sectionsReady) {
    console.error(
      ` Não foi possível garantir todas as seções para sala ${roomName}`,
    );
    return null;
  }

  // Buscar por .section-block que contenha "Máquinas" no título
  let machinesSection = findMachinesSection(roomElement);

  if (machinesSection) {
    console.log(` Seção de máquinas encontrada para sala ${roomName}`);
    return machinesSection;
  }

  // Se ainda não existe, tentar criar apenas a seção de máquinas
  console.log(` Tentando criar apenas seção de máquinas para sala ${roomName}`);

  // Encontrar a última seção para inserir após ela
  const lastSection =
    roomElement.querySelector(".section-block:last-child") ||
    roomElement.querySelector(".room-content > :last-child");

  if (!lastSection) {
    console.error(` Nenhuma seção encontrada para inserir máquinas`);
    return null;
  }

  if (typeof buildMachinesSection !== "function") {
    console.error(" Função buildMachinesSection não disponível");
    return null;
  }

  try {
    const machinesHTML = await buildMachinesSection(
      obraId,
      projectId,
      roomName,
      roomId,
    );
    if (!machinesHTML) {
      console.error(" HTML da seção de máquinas não gerado");
      return null;
    }

    lastSection.insertAdjacentHTML("afterend", machinesHTML);
    await new Promise((resolve) => setTimeout(resolve, 12));

    // Usar a nova função para encontrar a seção
    machinesSection = findMachinesSection(roomElement);
    if (machinesSection) {
      console.log(
        ` Seção de máquinas criada com sucesso para sala ${roomName}`,
      );
      return machinesSection;
    } else {
      console.error(` Seção de máquinas não encontrada após criação`);
      return null;
    }
  } catch (error) {
    console.error(` Erro ao criar seção de máquinas:`, error);
    return null;
  }
}

/**
 * Preenche os dados das máquinas de uma sala
 */
async function fillMachinesData(roomElement, machinesData) {
  if (!roomElement || !machinesData || !Array.isArray(machinesData)) {
    console.error(" Elemento da sala ou dados de máquinas inválidos");
    return false;
  }

  const roomId = roomElement.dataset.roomId;
  const roomName = roomElement.dataset.roomName;

  console.log(
    ` Preenchendo ${machinesData.length} máquina(s) para sala ${roomName} (ID: ${roomId})`,
  );

  // Verificar se há máquinas para preencher
  if (machinesData.length === 0) {
    console.log(` Nenhuma máquina para preencher na sala ${roomName}`);
    return true; // Retorna true porque não há erro, só não há máquinas
  }

  try {
    const machinesSection = await ensureMachinesSection(roomElement);
    if (!machinesSection) {
      console.error(
        ` Não foi possível criar/obter seção de máquinas para sala ${roomName}`,
      );
      return false;
    }

    const machinesContainer = machinesSection.querySelector(
      ".machines-container",
    );
    if (!machinesContainer) {
      console.error(
        ` Container de máquinas não encontrado para sala ${roomName}`,
      );
      return false;
    }

    console.log(` Container de máquinas encontrado`);

    // Limpar máquinas existentes
    const existingMachines = machinesContainer.querySelectorAll(
      ".climatization-machine, .machine-block",
    );
    if (existingMachines.length > 0) {
      console.log(
        ` Removendo ${existingMachines.length} máquina(s) existente(s)`,
      );
      existingMachines.forEach((machine) => machine.remove());
    }

    let successCount = 0;

    // Adicionar cada máquina
    for (let i = 0; i < machinesData.length; i++) {
      const machineData = machinesData[i];

      if (!machineData || !machineData.tipo) {
        console.warn(` Dados da máquina ${i} inválidos:`, machineData);
        continue;
      }

      console.log(
        ` [${i + 1}/${machinesData.length}] Adicionando máquina: ${machineData.tipo}`,
      );

      try {
        // Usar addMachine com retry
        let machineAdded = false;
        let retryCount = 0;

        while (!machineAdded && retryCount < 3) {
          machineAdded = await addMachine(roomId, machineData.tipo);

          if (!machineAdded) {
            retryCount++;
            console.log(
              ` Tentativa ${retryCount}/3 para adicionar máquina ${machineData.tipo}`,
            );
            await new Promise((resolve) => setTimeout(resolve, 12));
          }
        }

        if (!machineAdded) {
          console.error(
            ` Falha ao adicionar máquina ${machineData.tipo} após ${retryCount} tentativas`,
          );
          continue;
        }

        console.log(
          ` Máquina ${machineData.tipo} adicionada, aguardando renderização...`,
        );

        // Aguardar renderização completa
        await new Promise((resolve) => setTimeout(resolve, 18));

        // Encontrar a máquina mais recente
        const machineElements = machinesContainer.querySelectorAll(
          ".climatization-machine",
        );
        const lastMachine = machineElements[machineElements.length - 1];

        if (!lastMachine) {
          console.error(` Elemento da máquina não encontrado após adição`);
          continue;
        }

        console.log(` Elemento da máquina encontrado, preenchendo dados...`);

        // Preencher dados da máquina
        const populated = await populateMachineData(lastMachine, machineData);
        if (populated) {
          successCount++;
          console.log(` Máquina ${machineData.tipo} preenchida com sucesso`);
        } else {
          console.error(
            ` Falha ao preencher dados da máquina ${machineData.tipo}`,
          );
        }
      } catch (error) {
        console.error(` Erro ao processar máquina ${machineData.tipo}:`, error);
      }

      // Pequena pausa entre máquinas
      await new Promise((resolve) => setTimeout(resolve, 12));
    }

    console.log(
      ` ${successCount}/${machinesData.length} máquina(s) preenchida(s) com sucesso para sala ${roomName}`,
    );

    // Retorna true se pelo menos uma máquina foi preenchida, ou se não havia máquinas
    return successCount > 0 || machinesData.length === 0;
  } catch (error) {
    console.error(
      ` Erro crítico ao preencher máquinas para sala ${roomName}:`,
      error,
    );
    return false;
  }
}

/**
 * Preenche os dados individuais de uma máquina
 */
async function populateMachineData(machineElement, machineData) {
  if (!machineElement || !machineData) {
    console.error(" Elemento da máquina ou dados inválidos");
    return false;
  }

  console.log(` Preenchendo dados da máquina:`, machineData);

  const roomId = machineElement.dataset.roomId;

  if (roomId && window.startRoomLoading) {
    window.startRoomLoading(roomId);
  }

  try {
    const machineId = machineElement.dataset.machineId;

    // =========================================================
    // PASSO 1: QUANTIDADE
    // =========================================================
    const qntInput = machineElement.querySelector(".machine-qnt-input");
    if (qntInput && machineData.quantidade !== undefined) {
      qntInput.setAttribute("data-user-edited", "true");
      qntInput.value = Math.max(1, parseInt(machineData.quantidade) || 1);
      qntInput.setAttribute("data-last-params", "loading");
      console.log(` Quantidade definida: ${qntInput.value}`);
    }

    // =========================================================
    // PASSO 2: TIPO
    // =========================================================
    const typeSelect = machineElement.querySelector(".machine-type-select");
    if (typeSelect && machineData.tipo) {
      typeSelect.value = machineData.tipo;
      console.log(` Tipo definido: ${machineData.tipo}`);

      const changeEvent = new Event("change", { bubbles: true });
      typeSelect.dispatchEvent(changeEvent);

      await new Promise((resolve) => setTimeout(resolve, 31));
    }

    // =========================================================
    // PASSO 3: APLICAÇÃO
    // =========================================================
    const aplicacaoSelect = machineElement.querySelector(
      ".machine-aplicacao-select",
    );
    if (aplicacaoSelect && machineData.aplicacao_machines !== undefined) {
      aplicacaoSelect.value = machineData.aplicacao_machines || "";
      console.log(` Aplicação definida: ${machineData.aplicacao_machines}`);

      const changeEvent = new Event("change", { bubbles: true });
      aplicacaoSelect.dispatchEvent(changeEvent);

      await new Promise((resolve) => setTimeout(resolve, 18));
    }

    // =========================================================
    // PASSO 4: CAPACIDADE
    // =========================================================
    const powerSelect = machineElement.querySelector(".machine-power-select");
    if (powerSelect && machineData.potencia) {
      console.log(` Procurando capacidade: "${machineData.potencia}"`);

      let attempts = 0;
      const maxAttempts = 10;

      while (powerSelect.disabled && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 18));
        attempts++;
      }

      if (!powerSelect.disabled) {
        const powerOption = Array.from(powerSelect.options).find((opt) => {
          const optText = opt.text.toLowerCase();
          const optValue = opt.value.toLowerCase();
          const searchText = machineData.potencia.toLowerCase();

          return (
            optText.includes(searchText) ||
            optValue.includes(searchText) ||
            optText === searchText
          );
        });

        if (powerOption) {
          powerSelect.value = powerOption.value;
          console.log(` Capacidade definida: ${powerOption.value}`);

          const powerEvent = new Event("change", { bubbles: true });
          powerSelect.dispatchEvent(powerEvent);

          await new Promise((resolve) => setTimeout(resolve, 31));
        }
      }
    }

    // =========================================================
    // PASSO 5: TENSÃO FORÇA
    // =========================================================
    const voltageSelect = machineElement.querySelector(
      ".machine-voltage-select",
    );
    if (voltageSelect && machineData.tensao) {
      console.log(` Procurando tensão: "${machineData.tensao}"`);

      let attempts = 0;
      const maxAttempts = 6;

      while (voltageSelect.disabled && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 15));
        attempts++;
      }

      if (!voltageSelect.disabled) {
        const voltageOption = Array.from(voltageSelect.options).find((opt) => {
          const optText = opt.text.toLowerCase();
          const optValue = opt.value.toLowerCase();
          const searchText = machineData.tensao.toLowerCase();

          return (
            optText.includes(searchText) ||
            optValue.includes(searchText) ||
            optText === searchText
          );
        });

        if (voltageOption) {
          voltageSelect.value = voltageOption.value;
          console.log(` Tensão definida: ${voltageOption.value}`);

          const voltageEvent = new Event("change", { bubbles: true });
          voltageSelect.dispatchEvent(voltageEvent);
        }
      }
    }

    // =========================================================
    // PASSO 6: TENSÃO COMANDO
    // =========================================================
    const commandVoltageSelect = machineElement.querySelector(
      ".machine-command-voltage-select",
    );
    if (commandVoltageSelect) {
      const tensaoComando = machineData.tensao_comando || "220V";
      console.log(` Definindo tensão comando: "${tensaoComando}"`);

      const commandOption = Array.from(commandVoltageSelect.options).find(
        (opt) => opt.value === tensaoComando,
      );

      if (commandOption) {
        commandVoltageSelect.value = tensaoComando;
        console.log(` Tensão comando definida: ${tensaoComando}`);
      } else {
        // Valor padrão se não encontrar
        commandVoltageSelect.value = "220V";
        console.log(` Valor "${tensaoComando}" não encontrado, usando 220V`);
      }
    }

    // =========================================================
    // PASSO 7: PARÂMETROS NO INPUT
    // =========================================================
    if (qntInput && machineData.aplicacao_machines && machineData.potencia) {
      const capacidadeMatch = machineData.potencia.match(/(\d+)/);
      const capacidadeValue = capacidadeMatch
        ? parseFloat(capacidadeMatch[1])
        : null;

      let vazaoNecessaria = 0;
      if (roomId && window.calculateVazaoByAplicacao) {
        try {
          const inputs = collectRoomInputs(roomId);
          vazaoNecessaria = Math.abs(
            window.calculateVazaoByAplicacao(
              machineData.aplicacao_machines,
              roomId,
              inputs,
            ) || 0,
          );
        } catch (e) {
          console.log(" Não foi possível calcular vazão agora");
        }
      }

      const currentParams = `${machineData.tipo}_${machineData.aplicacao_machines}_${capacidadeValue || ""}_${vazaoNecessaria}`;
      qntInput.setAttribute("data-last-params", currentParams);
    }

    // =========================================================
    // PASSO 8: OPÇÕES
    // =========================================================
    if (machineData.opcoesSelecionadas?.length) {
      await new Promise((resolve) => setTimeout(resolve, 31));

      const optionsContainer = machineElement.querySelector(".options-grid");
      if (optionsContainer) {
        const checkboxes = optionsContainer.querySelectorAll(
          'input[type="checkbox"]',
        );
        machineData.opcoesSelecionadas.forEach((optionObj) => {
          const optionName =
            typeof optionObj === "object" ? optionObj.name : optionObj;
          const checkbox = Array.from(checkboxes).find(
            (cb) => cb.getAttribute("data-option-name") === optionName,
          );

          if (checkbox) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
      }
    }

    // =========================================================
    // PASSO 9: CONFIGURAÇÕES
    // =========================================================
    if (machineData.configuracoesSelecionadas?.length) {
      await new Promise((resolve) => setTimeout(resolve, 31));

      const configContainer = machineElement.querySelector(".config-grid");
      if (configContainer) {
        const checkboxes = configContainer.querySelectorAll(
          'input[type="checkbox"]',
        );
        machineData.configuracoesSelecionadas.forEach((configObj) => {
          const configId =
            typeof configObj === "object" ? configObj.id : configObj;
          const checkbox = Array.from(checkboxes).find(
            (cb) => cb.getAttribute("data-config-id") === configId.toString(),
          );

          if (checkbox) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
      }
    }

    // =========================================================
    // PASSO 10: PREÇOS
    // =========================================================
    // Recalcula pelo catalogo atual; registros antigos podem conter precos 0.
    updateOptionValues(machineId);
    calculateMachinePrice(machineId);

    // =========================================================
    // PASSO 11: VERIFICAÇÃO DA QUANTIDADE
    // =========================================================
    if (qntInput && machineData.quantidade !== undefined) {
      setTimeout(() => {
        const currentValue = parseInt(qntInput.value);
        if (currentValue !== parseInt(machineData.quantidade)) {
          console.log(
            ` Quantidade alterada para ${currentValue}, revertendo para ${machineData.quantidade}`,
          );
          qntInput.value = machineData.quantidade;
          qntInput.setAttribute("data-user-edited", "true");
          if (window.updateQuantity) window.updateQuantity(machineId);
        } else {
          console.log(` Quantidade mantida: ${currentValue}`);
        }
      }, 150);
    }

    console.log(` Máquina preenchida com sucesso - dados:`, {
      nome: machineData.nome,
      tensao_comando: machineData.tensao_comando,
    });

    if (roomId && window.scheduleFinishRoomLoading) {
      window.scheduleFinishRoomLoading(roomId);
    }

    return true;
  } catch (error) {
    console.error(` Erro ao preencher dados da máquina:`, error);
    if (roomId && window.finishRoomLoading) {
      window.finishRoomLoading(roomId, false);
    }
    return false;
  }
}

export {
  findMachinesSection,
  findSectionByTitle,
  ensureMachinesSection,
  fillMachinesData,
  populateMachineData,
};
