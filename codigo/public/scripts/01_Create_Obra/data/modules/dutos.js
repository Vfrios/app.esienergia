/**
 * dutos.js - Sistema de seleção de Dutos para Climatização
 * Opcional depende do tipo MAS é opcional na seleção
 */

// Variável global para armazenar a descrição do material
let descricaoMaterialDuto = "Material do Duto";

/**
 * Função para preenchimento de dados
 */
function fillDutosData(roomElement, dutosData) {
  if (!roomElement || !dutosData) {
    return;
  }

  const roomId = roomElement.dataset.roomId;
  const dutosSection = roomElement.querySelector(
    `#section-content-${roomId}dutos`,
  );

  if (!dutosSection) {
    return;
  }

  if (!Array.isArray(dutosData) || dutosData.length === 0) {
    return;
  }

  const tbodyId = `dutos-list-${roomId}`;
  let tbody = document.getElementById(tbodyId);

  if (!tbody) {
    const tableContainer = dutosSection.querySelector(".dutos-table-container");
    if (tableContainer) {
      const tableHTML = `
 <table class="dutos-table" id="dutos-table-${roomId}">
 <thead>
 <tr>
 <th width="18%">Tipo de Duto</th>
 <th width="18%">Opcional</th>
 <th width="12%">Aplicação</th>
 <th width="10%">KG</th>
 <th width="8%">Qtd</th>
 <th width="10%">Valor Tipo</th>
 <th width="10%">Valor Opcional</th>
 <th width="10%">Valor Total</th>
 <th width="10%">Ações</th>
 </tr>
 </thead>
 <tbody id="${tbodyId}"></tbody>
 <tfoot>
 <tr>
 <td colspan="8" style=" font-weight: bold;">TOTAL:</td>
 <td id="dutos-total-${roomId}" style="font-weight: bold;">R$ 0,00</td>
 </tr>
 </tfoot>
 </table>
 `;

      tableContainer.innerHTML = tableHTML;
      tbody = document.getElementById(tbodyId);
    }
  }

  if (tbody) {
    tbody.innerHTML = "";

    dutosData.forEach((duto) => {
      adicionarDutoNaTabela(roomId, duto);
    });

    atualizarTotalDutos(roomId);
  }
}

/**
 * Constrói a seção de Dutos para Climatização
 */
function buildDutosSection(obraId, projectId, roomName, finalRoomId) {
  if (!finalRoomId) return "";

  const roomId = finalRoomId;

  const html = `
 <div class="section-block" data-client-section="dutos">
 <div class="section-header">
 <button class="minimizer" onclick="toggleSection('${roomId}dutos')">+</button>
 <h4 class="section-title">Dutos para Climatização</h4>
 </div>

 <div class="section-content collapsed" id="section-content-${roomId}dutos">
 <div class="form-grid">

 <!-- LINHA SUPERIOR: ADICIONAR DUTO + VALOR DO MATERIAL DO DUTO -->
 <div class="form-group full-width duto-header-line">

 <label class="acess-label duto-header-label">
 Adicionar duto:
 </label>

 <div class="material-inline">
 <span class="material-label" id="material-label-${roomId}">Valor do Material do Duto (por KG):</span>

 <div class="material-container">
 <input type="number"
 id="valor-material-duto-${roomId}"
 class="material-input"
 value="0"
 min="0"
 step="0.01"
 onchange="atualizarValorMaterialDuto('${roomId}')">

 <button class="btn-material-default"
 onclick="carregarValorMaterialDutoPadrao('${roomId}')"
 title="Carregar valor padrão da API">
 Restaurar
 </button>
 </div>
 </div>

 </div>

 <!-- SELECTOR DE DUTO -->
 <div class="form-group full-width">
 <div class="duto-selector">
 <div class="selector-grid">
 
 <div class="selector-item">
 <label for="aplicacao-duto-${roomId}">Aplicação:</label>
 <select id="aplicacao-duto-${roomId}" class="duto-select">
 <option value="">Selecione uma aplicação...</option>
 <option value="climatizacao">Climatização</option>
 <option value="pressurizacao">Pressurização</option>
 <option value="exaustao_bateria">Exaustão da sala de bateria</option>
 <option value="exaustao_baia_trafo">Exaustão da sala baia de trafo</option>
 </select>
 </div>

 <div class="selector-item">
 <label for="duto-tipo-${roomId}">Tipo:</label>
 <select id="duto-tipo-${roomId}"
 class="duto-select"
 onchange="carregarOpcionaisPorTipo('${roomId}')">
 <option value="">Selecione um tipo...</option>
 </select>
 </div>

 <div class="selector-item">
 <label for="duto-opcional-${roomId}">Opcional:</label>
 <select id="duto-opcional-${roomId}"
 class="duto-select"
 disabled
 onchange="atualizarValorOpcionalSelecionado('${roomId}')">
 <option value="">Nenhum opcional</option>
 </select>
 </div>

 <div class="selector-item">
 <label for="duto-kg-${roomId}">KG:</label>
 <input type="number"
 id="duto-kg-${roomId}"
 class="duto-input"
 value="1"
 min="0.1"
 max="1000"
 step="0.1"
 onchange="calcularValorDuto('${roomId}')">
 </div>

 <div class="selector-item">
 <label for="duto-quantidade-${roomId}">Qtd:</label>
 <input type="number"
 id="duto-quantidade-${roomId}"
 class="duto-input"
 value="1"
 min="1"
 max="1000"
 onchange="calcularValorDuto('${roomId}')">
 </div>

 <div class="selector-item">
 <label for="duto-valor-tipo-${roomId}">Valor Tipo:</label>
 <input type="text"
 id="duto-valor-tipo-${roomId}"
 class="duto-input"
 readonly>
 </div>

 <div class="selector-item">
 <label for="duto-valor-opcional-${roomId}">Valor Opcional:</label>
 <input type="text"
 id="duto-valor-opcional-${roomId}"
 class="duto-input"
 readonly>
 </div>

 <div class="selector-item">
 <label for="duto-valor-total-${roomId}">Valor Total:</label>
 <input type="text"
 id="duto-valor-total-${roomId}"
 class="duto-input total-input"
 readonly>
 </div>

 <div class="selector-item">
 <button class="btn-add-duto"
 onclick="adicionarDuto('${roomId}')">
 <span class="btn-icon">+</span> Adicionar
 </button>
 </div>

 </div>
 </div>
 </div>

 <!-- TABELA -->
 <div class="form-group full-width">
 <label class="acess-label">Dutos Selecionados:</label>

 <div class="dutos-table-container">
 <table class="dutos-table" id="dutos-table-${roomId}">
 <thead>
 <tr>
 <th width="18%">Tipo de Duto</th>
 <th width="18%">Opcional</th>
 <th width="12%">Aplicação</th>
 <th width="10%">KG</th>
 <th width="8%">Qtd</th>
 <th width="10%">Valor Tipo</th>
 <th width="10%">Valor Opcional</th>
 <th width="10%">Valor Total</th>
 <th width="10%">Ações</th>
 </tr>
 </thead>

 <tbody id="dutos-list-${roomId}">
 <tr class="empty-row">
 <td colspan="9">Nenhum duto adicionado</td>
 </tr>
 </tbody>

 <tfoot>
 <tr>
 <td colspan="8" style="font-weight: bold;">TOTAL:</td>
 <td id="dutos-total-${roomId}" style="font-weight: bold;">R$ 0,00</td>
 </tr>
 </tfoot>
 </table>
 </div>
 </div>

 <!-- BOTÕES INFERIORES -->
 <div class="form-group full-width text-center">
 <button class="btn-clear-dutos"
 onclick="limparDutos('${roomId}')">
 Limpar Tudo
 </button>
 </div>

 </div>
 </div>
 </div>
 `;

  // Inicialização pós-render
  setTimeout(() => {
    initDutosSystem(roomId);
  }, 12);

  return html;
}

/**
 * Inicializa o sistema de dutos
 */
async function initDutosSystem(roomId) {
  console.log(` Inicializando dutos para sala: ${roomId}`);

  // Verificar se os elementos existem
  const tipoSelect = document.getElementById(`duto-tipo-${roomId}`);
  const opcionalSelect = document.getElementById(`duto-opcional-${roomId}`);

  if (!tipoSelect || !opcionalSelect) {
    console.error(` Elementos não encontrados para sala: ${roomId}`);
    return;
  }

  // Opcional começa desabilitado (espera selecionar tipo)
  opcionalSelect.disabled = true;
  opcionalSelect.innerHTML = '<option value="">Nenhum opcional</option>';

  // Carregar tipos de dutos
  await carregarTiposDutos(roomId);

  // Carregar valor do material do duto
  await carregarValorMaterialDuto(roomId);

  console.log(` Dutos inicializados para sala ${roomId}`);
}

/**
 * Carrega os tipos de dutos da API /api/dutos
 */
async function carregarTiposDutos(roomId) {
  try {
    const select = document.getElementById(`duto-tipo-${roomId}`);
    if (!select) return;

    console.log(" Buscando tipos de dutos da API...");
    const response = await fetch("/api/dutos");

    if (!response.ok) {
      console.error(` Erro na API: ${response.status}`);
      return;
    }

    const data = await response.json();

    // Verificar estrutura da resposta
    let tiposDutos = [];

    if (Array.isArray(data)) {
      tiposDutos = data;
    } else if (data.dutos && Array.isArray(data.dutos)) {
      tiposDutos = data.dutos;
    } else if (data.types && Array.isArray(data.types)) {
      tiposDutos = data.types;
    } else {
      console.error(" Estrutura de dados não reconhecida:", data);
      return;
    }

    if (tiposDutos.length === 0) {
      console.warn(" Nenhum tipo de duto retornado pela API");
      return;
    }

    // Limpar opções existentes (exceto a primeira)
    while (select.options.length > 1) {
      select.remove(1);
    }

    // Adicionar opções
    tiposDutos.forEach((tipo) => {
      const option = document.createElement("option");
      option.value = tipo.id || tipo.type || tipo.value || "";
      option.textContent =
        tipo.nome || tipo.type || tipo.label || tipo.value || "";
      // Armazenar dados completos do tipo
      option.setAttribute("data-duto", JSON.stringify(tipo));
      select.appendChild(option);
    });

    console.log(` ${tiposDutos.length} tipos carregados para sala ${roomId}`);
  } catch (error) {
    console.error(" Erro ao carregar tipos de dutos:", error);
  }
}

/**
 * Carrega os opcionais para o tipo selecionado
 */
async function carregarOpcionaisPorTipo(roomId) {
  const tipoSelect = document.getElementById(`duto-tipo-${roomId}`);
  const opcionalSelect = document.getElementById(`duto-opcional-${roomId}`);
  const valorTipoInput = document.getElementById(`duto-valor-tipo-${roomId}`);
  const valorOpcionalInput = document.getElementById(
    `duto-valor-opcional-${roomId}`,
  );
  const valorTotalInput = document.getElementById(`duto-valor-total-${roomId}`);

  const tipoSelecionado = tipoSelect.value;

  // Resetar quando não há tipo selecionado
  if (!tipoSelecionado) {
    opcionalSelect.innerHTML = '<option value="">Nenhum opcional</option>';
    opcionalSelect.disabled = true;
    valorTipoInput.value = "R$ 0,00";
    valorOpcionalInput.value = "R$ 0,00";
    valorTotalInput.value = "R$ 0,00";
    return;
  }

  try {
    // Obter dados do tipo selecionado
    const selectedOption = tipoSelect.options[tipoSelect.selectedIndex];
    const tipoData = JSON.parse(selectedOption.getAttribute("data-duto"));

    // Atualizar valor do tipo
    const valorTipo = tipoData.valor || tipoData.value || 0;
    valorTipoInput.value = `R$ ${formatarMoeda(valorTipo)}`;

    // Limpar e carregar opcionais deste tipo
    opcionalSelect.innerHTML = '<option value="">Nenhum opcional</option>';
    opcionalSelect.disabled = false;

    // Verificar se o tipo tem opcionais
    if (
      tipoData.opcionais &&
      Array.isArray(tipoData.opcionais) &&
      tipoData.opcionais.length > 0
    ) {
      tipoData.opcionais.forEach((opcional) => {
        const option = document.createElement("option");
        option.value = opcional.id || "";
        option.textContent = opcional.nome || `Opcional ${opcional.id}`;
        option.setAttribute(
          "data-valor",
          opcional.valor || opcional.value || 0,
        );
        opcionalSelect.appendChild(option);
      });
      console.log(
        ` ${tipoData.opcionais.length} opcionais carregados para tipo "${tipoSelecionado}"`,
      );
    } else {
      console.log(` Tipo "${tipoSelecionado}" não possui opcionais`);
      // Opcional continua habilitado, mas só tem "Nenhum opcional"
    }

    // Resetar valores do opcional e total
    valorOpcionalInput.value = "R$ 0,00";
    valorTotalInput.value = "R$ 0,00";

    // Recalcular
    calcularValorDuto(roomId);
  } catch (error) {
    console.error(" Erro ao carregar opcionais:", error);
    opcionalSelect.innerHTML = '<option value="">Nenhum opcional</option>';
    opcionalSelect.disabled = false;
    valorTipoInput.value = "R$ 0,00";
    valorOpcionalInput.value = "R$ 0,00";
    valorTotalInput.value = "R$ 0,00";
  }
}

/**
 * Atualiza valor do opcional selecionado
 */
function atualizarValorOpcionalSelecionado(roomId) {
  const opcionalSelect = document.getElementById(`duto-opcional-${roomId}`);
  const valorOpcionalInput = document.getElementById(
    `duto-valor-opcional-${roomId}`,
  );

  if (!opcionalSelect.value) {
    valorOpcionalInput.value = "R$ 0,00";
  } else {
    const selectedOption = opcionalSelect.options[opcionalSelect.selectedIndex];
    const valorOpcional =
      parseFloat(selectedOption.getAttribute("data-valor")) || 0;
    valorOpcionalInput.value = `R$ ${formatarMoeda(valorOpcional)}`;
  }

  calcularValorDuto(roomId);
}

/**
 * Carrega valor do material do duto da API e atualiza a descrição
 */
async function carregarValorMaterialDuto(roomId) {
  try {
    console.log(" Buscando valor do material do duto da API...");
    const response = await fetch("/api/materials");
    const data = await response.json();

    let valorMaterialDuto = 0;
    let descricao = "Material do Duto";

    // Procurar por Material_Duto nos dados
    if (data.materials) {
      if (Array.isArray(data.materials)) {
        const materialDuto = data.materials.find(
          (m) => m.codigo === "Material_Duto",
        );
        if (materialDuto) {
          valorMaterialDuto = materialDuto.valor || 0;
          descricao =
            materialDuto.descricao ||
            materialDuto.description ||
            materialDuto.nome ||
            "Material do Duto";
        }
      } else if (
        typeof data.materials === "object" &&
        data.materials.Material_Duto
      ) {
        valorMaterialDuto = data.materials.Material_Duto.value || 0;
        descricao =
          data.materials.Material_Duto.description ||
          data.materials.Material_Duto.descricao ||
          "Material do Duto";
      }
    } else if (data.Material_Duto) {
      valorMaterialDuto = data.Material_Duto.value || 0;
      descricao =
        data.Material_Duto.description ||
        data.Material_Duto.descricao ||
        "Material do Duto";
    }

    // Atualizar a variável global com a descrição
    descricaoMaterialDuto = descricao;

    // Atualizar o label do material
    const materialLabel = document.getElementById(`material-label-${roomId}`);
    if (materialLabel) {
      materialLabel.textContent = `Valor do ${descricao} (por KG):`;
    }

    if (valorMaterialDuto > 0) {
      window.valorMaterialDutoPorKg = valorMaterialDuto;

      const materialInput = document.getElementById(
        `valor-material-duto-${roomId}`,
      );
      if (materialInput) {
        materialInput.value = valorMaterialDuto.toFixed(2);
      }
    } else {
      window.valorMaterialDutoPorKg = 0;
    }

    console.log(` Material do duto: ${descricao} - R$ ${valorMaterialDuto}/kg`);
  } catch (error) {
    console.error(" Erro ao carregar material do duto:", error);
    window.valorMaterialDutoPorKg = 0;
  }
}

/**
 * Carrega o valor padrão do material do duto
 */
async function carregarValorMaterialDutoPadrao(roomId) {
  try {
    console.log(" Restaurando valor padrão do material do duto...");
    const response = await fetch("/api/materials");
    const data = await response.json();

    let valorMaterialDuto = 0;
    let descricao = "Material do Duto";

    // Procurar por Material_Duto nos dados
    if (data.materials) {
      if (Array.isArray(data.materials)) {
        const materialDuto = data.materials.find(
          (m) => m.codigo === "Material_Duto",
        );
        if (materialDuto) {
          valorMaterialDuto = materialDuto.valor || 0;
          descricao =
            materialDuto.descricao ||
            materialDuto.description ||
            materialDuto.nome ||
            "Material do Duto";
        }
      } else if (
        typeof data.materials === "object" &&
        data.materials.Material_Duto
      ) {
        valorMaterialDuto = data.materials.Material_Duto.value || 0;
        descricao =
          data.materials.Material_Duto.description ||
          data.materials.Material_Duto.descricao ||
          "Material do Duto";
      }
    } else if (data.Material_Duto) {
      valorMaterialDuto = data.Material_Duto.value || 0;
      descricao =
        data.Material_Duto.description ||
        data.Material_Duto.descricao ||
        "Material do Duto";
    }

    // Atualizar a variável global com a descrição
    descricaoMaterialDuto = descricao;

    // Atualizar o label do material
    const materialLabel = document.getElementById(`material-label-${roomId}`);
    if (materialLabel) {
      materialLabel.textContent = `Valor do ${descricao} (por KG):`;
    }

    if (valorMaterialDuto > 0) {
      window.valorMaterialDutoPorKg = valorMaterialDuto;

      const materialInput = document.getElementById(
        `valor-material-duto-${roomId}`,
      );
      if (materialInput) {
        materialInput.value = valorMaterialDuto.toFixed(2);

        materialInput.style.borderColor = "#48BB78";
        materialInput.style.boxShadow = "0 0 0 3px rgba(72, 187, 120, 0.1)";

        setTimeout(() => {
          materialInput.style.borderColor = "";
          materialInput.style.boxShadow = "";
        }, 187);
      }

      recalcDutosComNovoMaterial(roomId);

      alert(
        ` Valor do ${descricao} restaurado para R$ ${valorMaterialDuto.toFixed(2)}/kg`,
      );
    } else {
      alert(` Valor do ${descricao} não encontrado na API`);
    }
  } catch (error) {
    console.error(" Erro ao carregar material do duto padrão:", error);
    alert(" Erro ao carregar valor padrão do material do duto");
  }
}

/**
 * Atualiza o valor do material do duto manualmente
 */
function atualizarValorMaterialDuto(roomId) {
  const materialInput = document.getElementById(
    `valor-material-duto-${roomId}`,
  );
  if (!materialInput) return;

  const novoValor = parseFloat(materialInput.value);

  if (isNaN(novoValor) || novoValor < 0) {
    alert(` Por favor, insira um valor válido para o ${descricaoMaterialDuto}`);
    materialInput.value = window.valorMaterialDutoPorKg
      ? window.valorMaterialDutoPorKg.toFixed(2)
      : "0.00";
    return;
  }

  window.valorMaterialDutoPorKg = novoValor;
  recalcDutosComNovoMaterial(roomId);
  calcularValorDuto(roomId);
}

/**
 * Recalcula todos os dutos com o novo valor do material do duto
 */
function recalcDutosComNovoMaterial(roomId) {
  const tbody = document.getElementById(`dutos-list-${roomId}`);
  if (!tbody) return;

  const rows = tbody.querySelectorAll(".duto-row");

  rows.forEach((row) => {
    try {
      const duto = JSON.parse(row.getAttribute("data-duto"));

      const valorMaterial = window.valorMaterialDutoPorKg || 0;
      const valorKg = duto.kg * valorMaterial;
      const valorUnitario = duto.valor_tipo + duto.valor_opcional + valorKg;
      const valorTotal = valorUnitario * duto.quantidade;

      duto.valor_total = valorTotal;
      duto.valor_material_por_kg = valorMaterial; // Atualizar o valor do material
      row.setAttribute("data-duto", JSON.stringify(duto));

      const cells = row.cells;
      if (cells.length >= 8) {
        cells[7].textContent = `R$ ${formatarMoeda(valorTotal)}`;
      }
    } catch (error) {
      console.error("Erro ao recalcular duto:", error);
    }
  });

  atualizarTotalDutos(roomId);
}

/**
 * Calcula o valor do duto
 */
function calcularValorDuto(roomId) {
  const tipoSelect = document.getElementById(`duto-tipo-${roomId}`);
  const opcionalSelect = document.getElementById(`duto-opcional-${roomId}`);
  const kgInput = document.getElementById(`duto-kg-${roomId}`);
  const quantidadeInput = document.getElementById(`duto-quantidade-${roomId}`);
  const valorTipoInput = document.getElementById(`duto-valor-tipo-${roomId}`);
  const valorOpcionalInput = document.getElementById(
    `duto-valor-opcional-${roomId}`,
  );
  const valorTotalInput = document.getElementById(`duto-valor-total-${roomId}`);
  const materialInput = document.getElementById(
    `valor-material-duto-${roomId}`,
  );

  if (!tipoSelect.value) {
    valorTotalInput.value = "R$ 0,00";
    return;
  }

  const kg = parseFloat(kgInput.value) || 0;
  const quantidade = parseInt(quantidadeInput.value) || 1;

  // Obter valor do tipo
  const valorTipoTexto = valorTipoInput.value
    .replace("R$ ", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const valorTipo = parseFloat(valorTipoTexto) || 0;

  // Obter valor do opcional (pode ser zero)
  let valorOpcional = 0;
  if (opcionalSelect.value) {
    const opcionalOption = opcionalSelect.options[opcionalSelect.selectedIndex];
    valorOpcional = parseFloat(opcionalOption.getAttribute("data-valor")) || 0;
  }

  // Obter valor do material do duto
  const valorMaterial = materialInput
    ? parseFloat(materialInput.value) || 0
    : 0;

  const valorKg = kg * valorMaterial;
  const valorUnitario = valorTipo + valorOpcional + valorKg;
  const valorTotal = valorUnitario * quantidade;

  valorOpcionalInput.value = `R$ ${formatarMoeda(valorOpcional)}`;
  valorTotalInput.value = `R$ ${formatarMoeda(valorTotal)}`;
}

/**
 * Adiciona duto à lista - OPCIONAL É REALMENTE OPCIONAL
 */
function adicionarDuto(roomId) {
  const tipoSelect = document.getElementById(`duto-tipo-${roomId}`);
  const opcionalSelect = document.getElementById(`duto-opcional-${roomId}`);
  const aplicacaoSelect = document.getElementById(`aplicacao-duto-${roomId}`);
  const kgInput = document.getElementById(`duto-kg-${roomId}`);
  const quantidadeInput = document.getElementById(`duto-quantidade-${roomId}`);
  const valorTipoInput = document.getElementById(`duto-valor-tipo-${roomId}`);
  const valorOpcionalInput = document.getElementById(
    `duto-valor-opcional-${roomId}`,
  );
  const materialInput = document.getElementById(
    `valor-material-duto-${roomId}`,
  );

  // Apenas tipo é obrigatório
  if (!tipoSelect.value) {
    alert("Selecione um tipo de duto");
    return;
  }

  // Aplicação é opcional - pega o valor diretamente
  const aplicacao_Dutos = aplicacaoSelect.value || "";

  const kg = parseFloat(kgInput.value) || 0;
  const quantidade = parseInt(quantidadeInput.value) || 1;
  const valorMaterial = materialInput
    ? parseFloat(materialInput.value) || 0
    : 0;

  if (kg <= 0 || quantidade <= 0) {
    alert("KG e Quantidade devem ser maiores que zero");
    return;
  }

  // Extrair valor do tipo
  const valorTipoTexto = valorTipoInput.value
    .replace("R$ ", "")
    .replace(/\./g, "")
    .replace(",", ".");
  const valorTipo = parseFloat(valorTipoTexto) || 0;

  // Obter dados do opcional (pode ser vazio)
  let valorOpcional = 0;
  let opcionalNome = "Nenhum opcional";
  let opcionalId = "";

  if (opcionalSelect.value) {
    const opcionalOption = opcionalSelect.options[opcionalSelect.selectedIndex];
    valorOpcional = parseFloat(opcionalOption.getAttribute("data-valor")) || 0;
    opcionalNome = opcionalOption.textContent;
    opcionalId = opcionalOption.value;
  }

  // Calcular valor total
  const valorKg = kg * valorMaterial;
  const valorUnitario = valorTipo + valorOpcional + valorKg;
  const valorTotal = valorUnitario * quantidade;
  const isClientMode =
    typeof document !== "undefined" &&
    document.body?.classList.contains("client-mode");

  if (valorTotal <= 0 && !isClientMode) {
    alert("Valor inválido");
    return;
  }

  // Obter descrição do tipo
  const tipoOption = tipoSelect.options[tipoSelect.selectedIndex];
  const tipoDescricao = tipoOption.textContent;

  // Obter texto da aplicação para exibição
  const aplicacaoTexto = aplicacao_Dutos
    ? aplicacaoSelect.options[aplicacaoSelect.selectedIndex].textContent
    : "Não especificada";

  // Criar objeto do duto
  const duto = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    tipo: tipoSelect.value,
    tipo_descricao: tipoDescricao,
    opcional_id: opcionalId,
    opcional_nome: opcionalNome,
    aplicacao_Dutos: aplicacao_Dutos,
    kg: kg,
    quantidade: quantidade,
    valor_tipo: valorTipo,
    valor_opcional: valorOpcional,
    valor_material_por_kg: valorMaterial,
    valor_unitario: valorUnitario,
    valor_total: valorTotal,
  };

  // Adicionar à tabela
  adicionarDutoNaTabela(roomId, duto);

  // Limpar campos
  kgInput.value = "1";
  quantidadeInput.value = "1";
  tipoSelect.selectedIndex = 0;
  opcionalSelect.innerHTML = '<option value="">Nenhum opcional</option>';
  opcionalSelect.disabled = true;
  aplicacaoSelect.selectedIndex = 0;
  valorTipoInput.value = "R$ 0,00";
  valorOpcionalInput.value = "R$ 0,00";
  document.getElementById(`duto-valor-total-${roomId}`).value = "R$ 0,00";

  console.log(` Duto adicionado na sala ${roomId}`);
}

/**
 * Adiciona duto na tabela
 */
function adicionarDutoNaTabela(roomId, duto) {
  const tbody = document.getElementById(`dutos-list-${roomId}`);
  if (!tbody) return;

  const emptyRow = tbody.querySelector(".empty-row");
  if (emptyRow) emptyRow.remove();

  // Obter texto da aplicação para exibição
  let aplicacaoTexto = "Não especificada";
  if (duto.aplicacao_Dutos) {
    const aplicacaoSelect = document.getElementById(`aplicacao-duto-${roomId}`);
    if (aplicacaoSelect) {
      for (let i = 0; i < aplicacaoSelect.options.length; i++) {
        if (aplicacaoSelect.options[i].value === duto.aplicacao_Dutos) {
          aplicacaoTexto = aplicacaoSelect.options[i].textContent;
          break;
        }
      }
    }
  }

  const row = document.createElement("tr");
  row.id = `duto-${duto.id}`;
  row.className = "duto-row";
  row.setAttribute("data-duto", JSON.stringify(duto));

  row.innerHTML = `
 <td>${duto.tipo_descricao}</td>
 <td class="td-scroll-horizontal">${duto.opcional_nome}</td>
 <td>${aplicacaoTexto}</td>
 <td>${duto.kg.toFixed(2)} kg</td>
 <td>${duto.quantidade}</td>
 <td>R$ ${formatarMoeda(duto.valor_tipo)}</td>
 <td>R$ ${formatarMoeda(duto.valor_opcional)}</td>
 <td>R$ ${formatarMoeda(duto.valor_total)}</td>
 <td>
 <button class="btn-remove-duto" onclick="removerDuto('${roomId}', '${duto.id}')">
 
 </button>
 <button class="btn-edit-duto" onclick="editarDuto('${roomId}', '${duto.id}')">
 
 </button>
 </td>
 `;

  tbody.appendChild(row);
  atualizarTotalDutos(roomId);
}

/**
 * Edita um duto existente
 */
async function editarDuto(roomId, dutoId) {
  const row = document.getElementById(`duto-${dutoId}`);
  if (!row) return;

  try {
    const duto = JSON.parse(row.getAttribute("data-duto"));

    // Preencher os campos do formulário
    const tipoSelect = document.getElementById(`duto-tipo-${roomId}`);
    const opcionalSelect = document.getElementById(`duto-opcional-${roomId}`);
    const aplicacaoSelect = document.getElementById(`aplicacao-duto-${roomId}`);
    const kgInput = document.getElementById(`duto-kg-${roomId}`);
    const quantidadeInput = document.getElementById(
      `duto-quantidade-${roomId}`,
    );

    // Encontrar e selecionar o tipo
    for (let i = 0; i < tipoSelect.options.length; i++) {
      if (tipoSelect.options[i].value === duto.tipo) {
        tipoSelect.selectedIndex = i;
        break;
      }
    }

    // Carregar opcionais para o tipo selecionado
    await carregarOpcionaisPorTipo(roomId);

    // Aguardar carregamento dos opcionais
    setTimeout(() => {
      // Encontrar e selecionar o opcional
      if (duto.opcional_id) {
        for (let i = 0; i < opcionalSelect.options.length; i++) {
          if (opcionalSelect.options[i].value == duto.opcional_id) {
            opcionalSelect.selectedIndex = i;
            break;
          }
        }
      }

      // Selecionar aplicação
      if (duto.aplicacao_Dutos) {
        for (let i = 0; i < aplicacaoSelect.options.length; i++) {
          if (aplicacaoSelect.options[i].value == duto.aplicacao_Dutos) {
            aplicacaoSelect.selectedIndex = i;
            break;
          }
        }
      }

      // Preencher outros campos
      kgInput.value = duto.kg;
      quantidadeInput.value = duto.quantidade;

      // Calcular valores
      calcularValorDuto(roomId);

      // Remover o duto da lista
      removerDuto(roomId, dutoId);

      alert(
        " Duto carregado para edição. Ajuste os valores e clique em Adicionar para salvar.",
      );
    }, 300);
  } catch (error) {
    console.error("Erro ao editar duto:", error);
    alert("Erro ao carregar duto para edição");
  }
}

/**
 * Obtém todos os dados dos dutos para salvar
 */
function getDutosData(roomId) {
  const tbody = document.getElementById(`dutos-list-${roomId}`);
  if (!tbody) return [];

  const rows = tbody.querySelectorAll(".duto-row");
  const dutosData = [];

  rows.forEach((row) => {
    try {
      const duto = JSON.parse(row.getAttribute("data-duto"));
      // Garantir que só temos aplicacao_Dutos
      const dutoParaSalvar = {
        id: duto.id,
        tipo: duto.tipo,
        tipo_descricao: duto.tipo_descricao,
        opcional_id: duto.opcional_id,
        opcional_nome: duto.opcional_nome,
        aplicacao_Dutos: duto.aplicacao_Dutos, // APENAS ESTE CAMPO
        kg: duto.kg,
        quantidade: duto.quantidade,
        valor_tipo: duto.valor_tipo,
        valor_opcional: duto.valor_opcional,
        valor_material_por_kg: duto.valor_material_por_kg,
        valor_unitario: duto.valor_unitario,
        valor_total: duto.valor_total,
      };
      dutosData.push(dutoParaSalvar);
    } catch (error) {
      console.error("Erro ao obter dados do duto:", error);
    }
  });

  return dutosData;
}

/**
 * Remove duto
 */
function removerDuto(roomId, dutoId) {
  const row = document.getElementById(`duto-${dutoId}`);
  if (!row) return;

  row.remove();

  const tbody = document.getElementById(`dutos-list-${roomId}`);
  if (tbody.children.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.className = "empty-row";
    emptyRow.innerHTML = '<td colspan="9">Nenhum duto adicionado</td>';
    tbody.appendChild(emptyRow);
  }

  atualizarTotalDutos(roomId);
}

/**
 * Atualiza total
 */
function atualizarTotalDutos(roomId) {
  const tbody = document.getElementById(`dutos-list-${roomId}`);
  if (!tbody) return;

  const rows = tbody.querySelectorAll(".duto-row");
  let total = 0;

  rows.forEach((row) => {
    try {
      const duto = JSON.parse(row.getAttribute("data-duto"));
      total += duto.valor_total;
    } catch (error) {
      console.error("Erro ao calcular total:", error);
    }
  });

  const totalElement = document.getElementById(`dutos-total-${roomId}`);
  if (totalElement) {
    totalElement.textContent = `R$ ${formatarMoeda(total)}`;

    // Dispara evento de atualização
    const roomElement = document.querySelector(`[data-room-id="${roomId}"]`);
    if (roomElement) {
      const projectId = roomElement.dataset.projectId;
      if (projectId) {
        document.dispatchEvent(
          new CustomEvent("valorAtualizado", {
            detail: {
              tipo: "duto",
              roomId,
              projectId,
              valor: total,
            },
          }),
        );
      }
    }
  }
}

/**
 * Limpa tudo
 */
function limparDutos(roomId) {
  if (!confirm("Limpar todos os dutos?")) return;

  const tbody = document.getElementById(`dutos-list-${roomId}`);
  if (!tbody) return;

  tbody.innerHTML = "";

  const emptyRow = document.createElement("tr");
  emptyRow.className = "empty-row";
  emptyRow.innerHTML = '<td colspan="9">Nenhum duto adicionado</td>';
  tbody.appendChild(emptyRow);

  atualizarTotalDutos(roomId);
}

/**
 * Formata moeda
 */
function formatarMoeda(valor) {
  const numericValue = Number(valor);
  return (Number.isFinite(numericValue) ? numericValue : 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// Exportar
export {
  buildDutosSection,
  fillDutosData,
  initDutosSystem,
  carregarTiposDutos,
  carregarOpcionaisPorTipo,
  atualizarValorOpcionalSelecionado,
  carregarValorMaterialDuto,
  carregarValorMaterialDutoPadrao,
  atualizarValorMaterialDuto,
  calcularValorDuto,
  adicionarDuto,
  adicionarDutoNaTabela,
  removerDuto,
  editarDuto,
  atualizarTotalDutos,
  limparDutos,
  getDutosData,
  formatarMoeda,
};

// Global
if (typeof window !== "undefined") {
  window.buildDutosSection = buildDutosSection;
  window.fillDutosData = fillDutosData;
  window.initDutosSystem = initDutosSystem;
  window.carregarTiposDutos = carregarTiposDutos;
  window.carregarValorMaterialDuto = carregarValorMaterialDuto;
  window.carregarValorMaterialDutoPadrao = carregarValorMaterialDutoPadrao;
  window.carregarOpcionaisPorTipo = carregarOpcionaisPorTipo;
  window.atualizarValorOpcionalSelecionado = atualizarValorOpcionalSelecionado;
  window.atualizarValorMaterialDuto = atualizarValorMaterialDuto;
  window.calcularValorDuto = calcularValorDuto;
  window.adicionarDuto = adicionarDuto;
  window.editarDuto = editarDuto;
  window.limparDutos = limparDutos;
  window.removerDuto = removerDuto;
  window.getDutosData = getDutosData;
  window.formatarMoeda = formatarMoeda;
}
