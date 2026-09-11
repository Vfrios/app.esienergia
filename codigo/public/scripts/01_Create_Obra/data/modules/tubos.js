// data/modules/tubos.js
// Sistema de tubulação de cobre
// Integração completa com API de tubos e cálculo com valor do cobre

// ==============================================
// SISTEMA DE INTEGRAÇÃO COM API DE TUBOS
// ==============================================

let tubosCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 300000;

let valorCobrePorKg = 0;

// Função para buscar todos os tubos da API
async function fetchTubosFromAPI() {
  try {
    const response = await fetch("/api/tubos");
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Erro na resposta da API");
    }

    return data.tubos || [];
  } catch (error) {
    console.error(" Erro ao buscar tubos da API:", error);
    throw error;
  }
}

// Função para obter tubos (com cache)
async function getTubos() {
  const now = Date.now();

  if (tubosCache && cacheTimestamp && now - cacheTimestamp < CACHE_DURATION) {
    return tubosCache;
  }

  try {
    tubosCache = await fetchTubosFromAPI();
    cacheTimestamp = now;
    console.log(" Tubos carregados da API:", tubosCache.length);
    return tubosCache;
  } catch (error) {
    console.error(" Não foi possível carregar tubos da API");
    throw error;
  }
}

// Função para normalizar formatação de polegadas
function normalizarPolegada(polegadas) {
  if (!polegadas) return "";

  let normalizada = polegadas.trim();

  // Remove espaços extras e mantém o formato original
  normalizada = normalizada.replace(/\s+/g, "").trim();

  return normalizada;
}

// Função para obter um tubo específico por polegada
async function getTuboPorPolegada(polegadas) {
  try {
    const tubos = await getTubos();

    console.log(` Buscando tubo: "${polegadas}"`);
    console.log(
      ` Tubos disponíveis:`,
      tubos.map((t) => `"${t.polegadas}"`),
    );

    // Tenta diferentes formatos
    let tubo = null;

    // 1. Busca exata
    tubo = tubos.find((t) => t.polegadas === polegadas);

    // 2. Remove espaços (caso o input tenha)
    if (!tubo) {
      const polegadaSemEspacos = polegadas.replace(/\s+/g, "");
      tubo = tubos.find((t) => t.polegadas === polegadaSemEspacos);
      if (tubo)
        console.log(
          ` Encontrado após remover espaços: "${polegadaSemEspacos}"`,
        );
    }

    // 3. Converte ponto para espaço (seu formato original)
    if (!tubo) {
      const polegadaComEspaco = polegadas.replace(/\./g, " ").trim();
      tubo = tubos.find((t) => t.polegadas === polegadaComEspaco);
      if (tubo)
        console.log(
          ` Encontrado após converter . para espaço: "${polegadaComEspaco}"`,
        );
    }

    // 4. Converte espaço para ponto
    if (!tubo) {
      const polegadaComPonto = polegadas.replace(/\s+/g, ".");
      tubo = tubos.find((t) => t.polegadas === polegadaComPonto);
      if (tubo)
        console.log(
          ` Encontrado após converter espaço para .: "${polegadaComPonto}"`,
        );
    }

    // 5. Tenta normalizar ambos os lados
    if (!tubo) {
      const polegadaNormalizada = normalizarPolegada(polegadas);
      for (const t of tubos) {
        if (normalizarPolegada(t.polegadas) === polegadaNormalizada) {
          tubo = t;
          console.log(` Encontrado após normalização: "${t.polegadas}"`);
          break;
        }
      }
    }

    if (!tubo) {
      console.warn(
        ` Tubo "${polegadas}" não encontrado após todas as tentativas`,
      );

      // Fallback: retorna um tubo padrão para não quebrar o sistema
      return {
        id: "default-" + Date.now(),
        polegadas: polegadas,
        valor: 0,
        mm: 0,
        descricao: `Tubo ${polegadas} (não encontrado - usando padrão)`,
      };
    }

    console.log(` Tubo encontrado: "${tubo.polegadas}" - R$ ${tubo.valor}/m`);
    return tubo;
  } catch (error) {
    console.error(` Erro ao buscar tubo ${polegadas}":`, error);

    // Fallback em caso de erro
    return {
      id: "error-" + Date.now(),
      polegadas: polegadas,
      valor: 0,
      mm: 0,
      descricao: `Erro ao buscar tubo ${polegadas}`,
    };
  }
}

// Função para obter preço por metro de um tubo
async function getPrecoPorMetro(polegadas) {
  try {
    const tubo = await getTuboPorPolegada(polegadas);

    // Se for um tubo de fallback (valor 0), tenta encontrar um valor aproximado
    if (tubo.valor === 0 && tubo.id.startsWith("default-")) {
      console.warn(
        ` Usando valor zero para ${polegadas}. Tentando encontrar similar...`,
      );

      const tubos = await getTubos();
      const polegadaNumerica = parseFloat(polegadas.replace(/[^\d\.\/]/g, ""));

      // Tenta encontrar tubo com diâmetro próximo
      const tuboProximo = tubos.find((t) => {
        const tNum = parseFloat(t.polegadas.replace(/[^\d\.\/]/g, ""));
        return Math.abs(tNum - polegadaNumerica) < 0.1;
      });

      if (tuboProximo) {
        console.log(` Usando valor do tubo similar "${tuboProximo.polegadas}"`);
        return tuboProximo.valor;
      }
    }

    return tubo.valor;
  } catch (error) {
    console.error(` Não foi possível obter preço para ${polegadas}":`, error);
    return 0; // Retorna 0 para não quebrar cálculos
  }
}

// Função para obter todas as polegadas disponíveis da API
async function getPolegadasDisponiveis() {
  try {
    const response = await fetch("/api/tubos/polegadas");
    if (!response.ok) {
      throw new Error(`Erro HTTP: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.error || "Erro na resposta da API");
    }

    console.log(" Polegadas disponíveis da API:", data.polegadas);
    return data.polegadas || [];
  } catch (error) {
    console.error(" Erro ao buscar polegadas:", error);

    // Fallback para polegadas padrão
    return [
      { value: "1/2", label: '1/2"' },
      { value: "5/8", label: '5/8"' },
      { value: "3/4", label: '3/4"' },
      { value: "7/8", label: '7/8"' },
      { value: "1", label: '1"' },
      { value: "1.1/8", label: '1 1/8"' },
      { value: "1.1/4", label: '1 1/4"' },
      { value: "1.3/8", label: '1 3/8"' },
      { value: "1.1/2", label: '1 1/2"' },
      { value: "1.5/8", label: '1 5/8"' },
      { value: "1.3/4", label: '1 3/4"' },
      { value: "2", label: '2"' },
    ];
  }
}

// ==============================================
// CONSTRUÇÃO DA SEÇÃO (COM TOTAL GERAL)
// ==============================================

function buildTubosSection(obraId, projectId, roomName, finalRoomId) {
  if (!finalRoomId || finalRoomId === "undefined" || finalRoomId === "null") {
    console.error(
      `ERRO (buildTubosSection) [Room ID inválido: ${finalRoomId}]`,
    );
    return "";
  }

  const roomId = finalRoomId;

  return `
 <div class="section-block" data-client-section="tubulacao">
 <div class="section-header">
 <button class="minimizer" onclick="toggleSection('${roomId}tubos')">+</button>
 <h4 class="section-title">Tubulação de Cobre</h4>
 </div>

 <div class="section-content collapsed" id="section-content-${roomId}tubos">
 <div class="tubos-container">
 <div class="tubos-empty-message" id="tubos-empty-${roomId}">
 <p>Adicione um sistema de tubulação para começar</p>
 </div>
 </div>
 
 <!-- Total Geral -->
 <div class="tubos-total-geral" id="tubos-total-geral-${roomId}" style="display: none;">
 <div class="total-geral-header">
 <h5>Total Geral da Sala</h5>
 </div>
 <div class="total-geral-content">
 <div class="total-geral-item">
 <span class="total-geral-label">Valor Total Geral:</span>
 <span class="total-geral-value" id="total-geral-valor-${roomId}">R$ 0,00</span>
 </div>
 <div class="total-geral-item">
 <span class="total-geral-label">Total Geral (kg):</span>
 <span class="total-geral-value" id="total-geral-kg-${roomId}">0,00</span>
 </div>
 </div>
 </div>
 
 <div class="tubos-actions">
 <button class="btn btn-add-secondary" onclick="addTubulacaoConjuntoComAPI('${roomId}')">+ Adicionar Conjunto</button>
 <button class="btn btn-clear" onclick="limparTubulacao('${roomId}')"> Limpar Tudo</button>
 </div>
 </div>
 </div>
 `;
}

// ==============================================
// TABELAS BASE (APENAS LOOKUP)
// ==============================================

// Tabela kg/m - Espessura 0,80 mm
const kgm_080mm = [
  0.123, 0.193, 0.263, 0.333, 0.403, 0.473, 0.544, 0.684, 0.754, 0.824, 0.894,
  1.034,
];

// Tabela kg/m - Espessura 1,59 mm
const kgm_159mm = [
  0.212, 0.353, 0.494, 0.635, 0.776, 0.917, 1.059, 1.341, 1.482, 1.623, 1.764,
  2.046,
];

// Função para obter kg/m (APENAS LOOKUP)
async function getKgPorMetro(polegadas, espessura) {
  try {
    const polegadasDisponiveis = await getPolegadasDisponiveis();
    const polegadaNormalizada = normalizarPolegada(polegadas);

    const index = polegadasDisponiveis.findIndex(
      (p) => normalizarPolegada(p.value) === polegadaNormalizada,
    );

    if (index === -1) {
      console.warn(` Polegada "${polegadas}" não encontrada na tabela kg/m`);
      return null;
    }

    if (espessura === "0,80") {
      return kgm_080mm[Math.min(index, kgm_080mm.length - 1)];
    } else if (espessura === "1,59") {
      return kgm_159mm[Math.min(index, kgm_159mm.length - 1)];
    }

    console.warn(` Espessura "${espessura}" não suportada`);
    return null;
  } catch (error) {
    console.error(" Erro ao obter kg/m:", error);
    return null;
  }
}

// ==============================================
// FUNÇÕES DE CÁLCULO (EXATAMENTE COMO NA PLANILHA)
// ==============================================

function calcularLSmetros(
  comprimentoInterligacao,
  numCircuitos,
  numCurvas,
  comprimentoEquivalenteCurva,
) {
  const parte1 = (comprimentoInterligacao || 0) * (numCircuitos || 0);
  const parte2 = (numCurvas || 0) * (comprimentoEquivalenteCurva || 0);
  return parte1 + parte2;
}

function calcularLLmetros(LSmetros) {
  return LSmetros;
}

async function calcularLSkg(LSmetros, polegadasLS, espessuraLS) {
  if (!polegadasLS || !espessuraLS || !LSmetros) return 0;

  const kgPorMetro = await getKgPorMetro(polegadasLS, espessuraLS);
  if (!kgPorMetro) {
    console.warn(
      ` Não foi possível calcular kg para ${polegadasLS} ${espessuraLS}`,
    );
    return 0;
  }

  return LSmetros * kgPorMetro;
}

async function calcularLLkg(LLmetros, polegadasLL, espessuraLL) {
  if (!polegadasLL || !espessuraLL || !LLmetros) return 0;

  const kgPorMetro = await getKgPorMetro(polegadasLL, espessuraLL);
  if (!kgPorMetro) {
    console.warn(
      ` Não foi possível calcular kg para ${polegadasLL} ${espessuraLL}`,
    );
    return 0;
  }

  return LLmetros * kgPorMetro;
}

function calcularCabos(comprimentoInterligacao) {
  return (comprimentoInterligacao || 0) + 6;
}

function calcularLuvas(LSmetros) {
  if (!LSmetros) return 0;
  return (LSmetros / 5) * 2;
}

function calcularReducoes(numCircuitos) {
  return (numCircuitos || 0) * 4;
}

// ==============================================
// SISTEMA DE SINCRONIZAÇÃO LS LL (CORRIGIDO)
// ==============================================

const sincronizacaoPorConjunto = {};

function configurarSincronizacaoLSLL(conjuntoId) {
  console.log(` Configurando sincronização LSLL para conjunto ${conjuntoId}`);

  sincronizacaoPorConjunto[conjuntoId] = {
    lsId: null,
    llId: null,
    adicionalLS: [],
    adicionalLL: [],
    syncEnabled: true,
  };
}

// Sincroniza os campos principais entre LS e LL
function sincronizarLSLL(linhaId, campo, valor) {
  const row = document.getElementById(`linha-${linhaId}`);
  if (!row) return;

  const conjuntoId = row.getAttribute("data-conjunto");
  const tipoLinha = row.getAttribute("data-tipo");
  const dadosConjunto = sincronizacaoPorConjunto[conjuntoId];

  if (!dadosConjunto || !dadosConjunto.syncEnabled) return;

  // Verificar se é linha principal
  const linhaData = JSON.parse(row.getAttribute("data-linha") || "{}");
  if (!linhaData.ehPrincipal) {
    console.log(
      ` Linha ${tipoLinha} ${linhaId} não é principal - sem sincronização`,
    );
    return;
  }

  // Determinar qual linha deve ser sincronizada
  let linhaDestinoId = null;
  if (tipoLinha === "L.S." && dadosConjunto.llId) {
    linhaDestinoId = dadosConjunto.llId;
  } else if (tipoLinha === "L.L." && dadosConjunto.lsId) {
    linhaDestinoId = dadosConjunto.lsId;
  }

  if (!linhaDestinoId) {
    console.log(` Linha destino não encontrada para sincronização`);
    return;
  }

  const linhaDestino = document.getElementById(`linha-${linhaDestinoId}`);
  if (!linhaDestino) {
    console.log(` Elemento linha destino ${linhaDestinoId} não encontrado`);
    return;
  }

  // Mapeia os campos para os seletores correspondentes
  const seletorPorCampo = {
    comprimento: ".comprimento-input",
    circuitos: ".circuitos-input",
    curvas: ".curvas-input",
    cecurva: ".ce-curva-input",
  };

  const seletor = seletorPorCampo[campo];
  if (!seletor) {
    console.warn(` Campo "${campo}" não mapeado para sincronização`);
    return;
  }

  const inputDestino = linhaDestino.querySelector(seletor);
  if (inputDestino) {
    // Verificar se o valor atual é diferente
    if (inputDestino.value !== valor) {
      console.log(
        ` Sincronizando ${campo}: ${tipoLinha} → ${tipoLinha === "L.S." ? "L.L." : "L.S."} [${valor}]`,
      );

      inputDestino.value = valor;

      // Disparar evento change para recalcular a linha
      const event = new Event("change", { bubbles: true });
      inputDestino.dispatchEvent(event);

      // Forçar cálculo imediato da linha sincronizada
      setTimeout(() => {
        calcularLinhaComAPI(linhaDestinoId);
      }, 6);
    }
  } else {
    console.warn(
      ` Input destino não encontrado para campo ${campo} no seletor ${seletor}`,
    );
  }
}

function atualizarControleLinhas(conjuntoId) {
  const tbody = document.getElementById(`tubos-list-${conjuntoId}`);
  if (!tbody) return;

  const linhas = tbody.querySelectorAll(".linha-tubulacao");
  const dadosConjunto = sincronizacaoPorConjunto[conjuntoId];

  if (!dadosConjunto) {
    // Inicializar se não existir
    configurarSincronizacaoLSLL(conjuntoId);
    return;
  }

  dadosConjunto.lsId = null;
  dadosConjunto.llId = null;
  dadosConjunto.adicionalLS = [];
  dadosConjunto.adicionalLL = [];

  // Encontrar linhas principais
  linhas.forEach((linha) => {
    const linhaData = JSON.parse(linha.getAttribute("data-linha") || "{}");
    const linhaId = linha.id.replace("linha-", "");

    if (linhaData.ehPrincipal) {
      if (linhaData.tipo === "L.S.") {
        dadosConjunto.lsId = linhaId;
      } else if (linhaData.tipo === "L.L.") {
        dadosConjunto.llId = linhaId;
      }
    } else {
      if (linhaData.tipo === "L.S.") {
        dadosConjunto.adicionalLS.push(linhaId);
      } else if (linhaData.tipo === "L.L.") {
        dadosConjunto.adicionalLL.push(linhaId);
      }
    }
  });

  console.log(` Controle atualizado para conjunto ${conjuntoId}:`, {
    lsPrincipal: dadosConjunto.lsId,
    llPrincipal: dadosConjunto.llId,
    adicionalLS: dadosConjunto.adicionalLS,
    adicionalLL: dadosConjunto.adicionalLL,
  });
}

// ==============================================
// FUNÇÕES DE CÁLCULO COMPLETAS
// ==============================================

// Função para calcular valor total de uma linha (LS ou LL)
async function calcularValorTotalLinha(linhaData) {
  try {
    let precoPorMetro = 0;
    if (linhaData.polegadas) {
      precoPorMetro = await getPrecoPorMetro(linhaData.polegadas);
    }

    let metros = 0;
    if (linhaData.tipo === "L.S.") {
      metros = linhaData.LSmetros || 0;
    } else if (linhaData.tipo === "L.L.") {
      metros = linhaData.LLmetros || 0;
    }

    const valorMetragem = metros * precoPorMetro;
    linhaData.valorTotal = valorMetragem;

    console.log(
      ` Cálculo linha ${linhaData.tipo}: ${metros}m × R$ ${precoPorMetro} = R$ ${valorMetragem}`,
    );

    return valorMetragem;
  } catch (error) {
    console.error(" Erro ao calcular valor total da linha:", error);
    linhaData.valorTotal = 0;
    return 0;
  }
}

// ==============================================
// FUNÇÕES DO SISTEMA
// ==============================================

// Função para preencher dados de tubulação
function fillTubulacaoData(roomElement, tubulacaoData) {
  if (!roomElement || !tubulacaoData) {
    console.error(" Elemento da sala ou dados de tubulação inválidos");
    return;
  }

  const roomId = roomElement.dataset.roomId;
  console.log(` Preenchendo tubulação para sala ${roomId}`, tubulacaoData);

  const emptyMessage = document.getElementById(`tubos-empty-${roomId}`);
  if (emptyMessage) {
    emptyMessage.style.display = "none";
  }

  const container = roomElement.querySelector(
    `#section-content-${roomId}tubos .tubos-container`,
  );
  if (container) {
    const conjuntosExistentes = container.querySelectorAll(".tubos-conjunto");
    conjuntosExistentes.forEach((conjunto) => conjunto.remove());

    Object.keys(sincronizacaoPorConjunto).forEach((key) => {
      if (key.startsWith(roomId)) {
        delete sincronizacaoPorConjunto[key];
      }
    });
  }

  if (
    tubulacaoData.conjuntos &&
    Array.isArray(tubulacaoData.conjuntos) &&
    tubulacaoData.conjuntos.length > 0
  ) {
    tubulacaoData.conjuntos.forEach((conjuntoData, index) => {
      setTimeout(() => {
        addTubulacaoConjuntoComAPI(roomId, conjuntoData);
      }, index * 200);
    });

    console.log(
      ` ${tubulacaoData.conjuntos.length} conjunto(s) de tubulação preenchido(s)`,
    );
  } else {
    if (emptyMessage) {
      emptyMessage.style.display = "block";
    }
    console.log(` Nenhum dado de tubulação para preencher na sala ${roomId}`);
  }
}

// Processa alterações nas colunas
async function handleColunaChangeComAPI(linhaId, coluna, valor) {
  const row = document.getElementById(`linha-${linhaId}`);
  if (!row || valor === "") return;

  // Sincronizar imediatamente ao alterar qualquer campo
  sincronizarLSLL(linhaId, coluna, valor);

  // Calcular a linha atual
  await calcularLinhaComAPI(linhaId);
}

// Função para adicionar linha na tabela usando dados da API
async function adicionarLinhaNaTabelaComAPI(conjuntoId, linha) {
  const tbody = document.getElementById(`tubos-list-${conjuntoId}`);

  if (!tbody) {
    console.error(` TBody não encontrado: tubos-list-${conjuntoId}`);
    return;
  }

  try {
    const polegadasDisponiveis = await getPolegadasDisponiveis();

    const opcoesBitola =
      '<option value="">-</option>' +
      polegadasDisponiveis
        .map((p) => {
          const selected =
            normalizarPolegada(linha.polegadas) === normalizarPolegada(p.value)
              ? "selected"
              : "";
          return `<option value="${p.value}" ${selected}>${p.label}</option>`;
        })
        .join("");

    const row = document.createElement("tr");
    row.id = `linha-${linha.id}`;
    row.className = "linha-tubulacao";
    if (linha.ehPrincipal) {
      row.classList.add("linha-principal");
    } else {
      row.classList.add("linha-extra");
    }
    row.setAttribute("data-linha", JSON.stringify(linha));
    row.setAttribute("data-conjunto", conjuntoId);
    row.setAttribute("data-tipo", linha.tipo);

    const opcoesEspessura = `
 <option value="">-</option>
 <option value="0,80" ${linha.espessura === "0,80" ? "selected" : ""}>0,80 mm</option>
 <option value="1,59" ${linha.espessura === "1,59" ? "selected" : ""}>1,59 mm</option>
 `;

    // Adiciona sincronização em todos os campos da linha
    row.innerHTML = `
 <td>${linha.tipo} ${linha.ehPrincipal ? "" : "(Extra)"}</td>
 <td>
 <select class="polegadas-select" onchange="calcularLinhaComAPI('${linha.id}')">
 ${opcoesBitola}
 </select>
 </td>
 <td>
 <select class="espessura-select" onchange="calcularLinhaComAPI('${linha.id}')">
 ${opcoesEspessura}
 </select>
 </td>
 <td>
 <input type="number" class="comprimento-input" min="0" step="0.1" value="${linha.comprimentoInterligacao || ""}" 
 onchange="handleColunaChangeComAPI('${linha.id}', 'comprimento', this.value)" 
 placeholder="0.0" style="width: 80px;">
 </td>
 <td>
 <input type="number" class="circuitos-input" min="0" value="${linha.numCircuitos || ""}" 
 onchange="handleColunaChangeComAPI('${linha.id}', 'circuitos', this.value)" 
 placeholder="0" style="width: 60px;">
 </td>
 <td>
 <input type="number" class="curvas-input" min="0" value="${linha.numCurvas || ""}" 
 onchange="handleColunaChangeComAPI('${linha.id}', 'curvas', this.value)" 
 placeholder="0" style="width: 60px;">
 </td>
 <td>
 <input type="number" class="ce-curva-input" min="0" step="0.1" value="${linha.comprimentoEquivalenteCurva || ""}" 
 onchange="handleColunaChangeComAPI('${linha.id}', 'cecurva', this.value)" 
 placeholder="0.0" style="width: 70px;">
 </td>
 <td>
 <button class="btn-remove" onclick="removerLinha('${linha.id}')" title="Remover"></button>
 </td>
 `;

    tbody.appendChild(row);

    // Para linhas principais, configurar sincronização
    if (linha.ehPrincipal) {
      // Atualizar controle de sincronização após adicionar a linha
      setTimeout(() => {
        atualizarControleLinhas(conjuntoId);

        // Se já existir a linha parceira, copiar os valores
        const dadosConjunto = sincronizacaoPorConjunto[conjuntoId];
        if (dadosConjunto) {
          let linhaParceiraId = null;
          if (linha.tipo === "L.S." && dadosConjunto.llId) {
            linhaParceiraId = dadosConjunto.llId;
          } else if (linha.tipo === "L.L." && dadosConjunto.lsId) {
            linhaParceiraId = dadosConjunto.lsId;
          }

          if (linhaParceiraId) {
            const linhaParceira = document.getElementById(
              `linha-${linhaParceiraId}`,
            );
            if (linhaParceira) {
              // Copiar valores dos campos
              const campos = ["comprimento", "circuitos", "curvas", "cecurva"];
              campos.forEach((campo) => {
                const seletor = `.${campo === "cecurva" ? "ce-curva-input" : campo + "-input"}`;
                const inputOrigem = linhaParceira.querySelector(seletor);
                if (inputOrigem && inputOrigem.value) {
                  const inputDestino = row.querySelector(seletor);
                  if (
                    inputDestino &&
                    inputDestino.value !== inputOrigem.value
                  ) {
                    inputDestino.value = inputOrigem.value;
                  }
                }
              });
            }
          }
        }
      }, 100);
    }

    // Calcular a linha se houver dados
    if (
      linha.comprimentoInterligacao ||
      linha.numCircuitos ||
      linha.numCurvas ||
      linha.comprimentoEquivalenteCurva
    ) {
      setTimeout(() => {
        calcularLinhaComAPI(linha.id);
      }, 18);
    }
  } catch (error) {
    console.error(" Erro ao adicionar linha com dados da API:", error);

    const row = document.createElement("tr");
    row.id = `linha-${linha.id}`;
    row.className = "linha-tubulacao";
    row.innerHTML = `
 <td colspan="8" style="color: red;">
 Erro ao carregar dados da API: ${error.message}
 </td>
 `;
    tbody.appendChild(row);
  }
}

// ==============================================
// FUNÇÃO PARA CALCULAR LINHA
// ==============================================

// Calcula a linha usando a API
async function calcularLinhaComAPI(linhaId) {
  const row = document.getElementById(`linha-${linhaId}`);
  if (!row) return;

  try {
    const linhaData = JSON.parse(row.getAttribute("data-linha"));
    const conjuntoId = row.getAttribute("data-conjunto");
    const tipo = linhaData.tipo;

    const polegadas = row.querySelector(".polegadas-select")?.value || "";
    const espessura = row.querySelector(".espessura-select")?.value || "";
    const comprimentoInterligacao =
      row.querySelector(".comprimento-input")?.value || "";
    const numCircuitos = row.querySelector(".circuitos-input")?.value || "";
    const numCurvas = row.querySelector(".curvas-input")?.value || "";
    const ceCurva = row.querySelector(".ce-curva-input")?.value || "";

    linhaData.polegadas = polegadas;
    linhaData.espessura = espessura;
    linhaData.comprimentoInterligacao = comprimentoInterligacao;
    linhaData.numCircuitos = numCircuitos;
    linhaData.numCurvas = numCurvas;
    linhaData.comprimentoEquivalenteCurva = ceCurva;

    const compIntNum = comprimentoInterligacao
      ? parseFloat(comprimentoInterligacao)
      : 0;
    const numCircNum = numCircuitos ? parseInt(numCircuitos) : 0;
    const numCurvNum = numCurvas ? parseInt(numCurvas) : 0;
    const ceCurvaNum = ceCurva ? parseFloat(ceCurva) : 0;

    if (tipo === "L.S.") {
      const LSmetros = calcularLSmetros(
        compIntNum,
        numCircNum,
        numCurvNum,
        ceCurvaNum,
      );
      const LSkg = await calcularLSkg(LSmetros, polegadas, espessura);
      const cabos = calcularCabos(compIntNum);
      const luvas = calcularLuvas(LSmetros);
      const reducoes = calcularReducoes(numCircNum);

      linhaData.LSmetros = LSmetros;
      linhaData.LSkg = LSkg;
      linhaData.cabos = cabos;
      linhaData.luvas = luvas;
      linhaData.reducoes = reducoes;

      console.log(
        ` LS ${linhaId}: ${LSmetros}m, ${LSkg}kg, ${cabos}cabos, ${luvas}luvas, ${reducoes}reduções`,
      );
    } else {
      const LSmetros = calcularLSmetros(
        compIntNum,
        numCircNum,
        numCurvNum,
        ceCurvaNum,
      );
      const LLmetros = calcularLLmetros(LSmetros);
      const LLkg = await calcularLLkg(LLmetros, polegadas, espessura);

      linhaData.LLmetros = LLmetros;
      linhaData.LLkg = LLkg;

      console.log(` LL ${linhaId}: ${LLmetros}m, ${LLkg}kg`);
    }

    await calcularValorTotalLinha(linhaData);

    row.setAttribute("data-linha", JSON.stringify(linhaData));

    // Atualizar totais do conjunto
    await atualizarTotaisConjuntoComAPI(conjuntoId);
  } catch (error) {
    console.error(` Erro ao calcular linha ${linhaId}:`, error);
  }
}

// ==============================================
// FUNÇÕES PARA LINHAS EXTRAS
// ==============================================

// Função para adicionar linha LS EXTRA (não principal)
async function addLinhaExtraLSComAPI(conjuntoId) {
  try {
    const polegadasDisponiveis = await getPolegadasDisponiveis();
    const polegadaPadrao =
      polegadasDisponiveis.find((p) => p.value === "1.1/4") ||
      polegadasDisponiveis[0];

    const linha = {
      id: `LS-extra-${conjuntoId}-${Date.now()}`,
      tipo: "L.S.",
      polegadas: polegadaPadrao?.value || "",
      espessura: "1,59",
      comprimentoInterligacao: "",
      numCircuitos: "",
      numCurvas: "",
      comprimentoEquivalenteCurva: "",
      LSmetros: 0,
      LSkg: 0,
      cabos: 0,
      luvas: 0,
      reducoes: 0,
      valorTotal: 0,
      ehPrincipal: false, // Indica que é linha extra
    };

    await adicionarLinhaNaTabelaComAPI(conjuntoId, linha);

    console.log(` Linha LS extra adicionada ao conjunto ${conjuntoId}`);
  } catch (error) {
    console.error(" Erro ao adicionar linha LS extra:", error);
    alert("Erro ao adicionar linha LS extra: " + error.message);
  }
}

// Função para adicionar linha LL EXTRA (não principal)
async function addLinhaExtraLLComAPI(conjuntoId) {
  try {
    const polegadasDisponiveis = await getPolegadasDisponiveis();
    const polegadaPadrao =
      polegadasDisponiveis.find((p) => p.value === "7/8") ||
      polegadasDisponiveis[0];

    const linha = {
      id: `LL-extra-${conjuntoId}-${Date.now()}`,
      tipo: "L.L.",
      polegadas: polegadaPadrao?.value || "",
      espessura: "0,80",
      comprimentoInterligacao: "",
      numCircuitos: "",
      numCurvas: "",
      comprimentoEquivalenteCurva: "",
      LLmetros: 0,
      LLkg: 0,
      valorTotal: 0,
      ehPrincipal: false, // Indica que é linha extra
    };

    await adicionarLinhaNaTabelaComAPI(conjuntoId, linha);

    console.log(` Linha LL extra adicionada ao conjunto ${conjuntoId}`);
  } catch (error) {
    console.error(" Erro ao adicionar linha LL extra:", error);
    alert("Erro ao adicionar linha LL extra: " + error.message);
  }
}

// ==============================================
// FUNÇÃO PARA ADICIONAR CONJUNTO COM LS E LL FIXOS
// ==============================================

// Adicionar novo conjunto usando API (COM LS E LL FIXOS)
async function addTubulacaoConjuntoComAPI(roomId, conjuntoData = null) {
  const conjuntos = document.querySelectorAll(
    `[data-conjunto-id^="${roomId}-"]`,
  );
  const novoNum = conjuntos.length + 1;
  const novoConjuntoId = `${roomId}-${novoNum}`;

  const emptyMessage = document.getElementById(`tubos-empty-${roomId}`);
  if (emptyMessage) {
    emptyMessage.style.display = "none";
  }

  const tubosContainer = document.querySelector(
    `#section-content-${roomId}tubos .tubos-container`,
  );

  const novoConjunto = document.createElement("div");
  novoConjunto.className = "tubos-conjunto";
  novoConjunto.id = `conjunto-${novoConjuntoId}`;
  novoConjunto.setAttribute("data-conjunto-id", novoConjuntoId);
  novoConjunto.setAttribute("data-conjunto-num", novoNum);

  try {
    const polegadasDisponiveis = await getPolegadasDisponiveis();

    // Configurar polegadas padrão para LS e LL
    const polegadaLS =
      polegadasDisponiveis.find((p) => p.value === "1.1/4") ||
      polegadasDisponiveis[0];
    const polegadaLL =
      polegadasDisponiveis.find((p) => p.value === "7/8") ||
      polegadasDisponiveis[0];

    // Criar IDs únicos para as linhas LS e LL FIXAS
    const linhaLSId = `LS-${novoConjuntoId}-${Date.now()}`;
    const linhaLLId = `LL-${novoConjuntoId}-${Date.now()}`;

    novoConjunto.innerHTML = `
 <div class="conjunto-header">
 <div class="conjunto-title-container">
 <h5>Conjunto ${novoNum}</h5>
 <button class="btn-remove-conjunto" onclick="removerConjunto('${novoConjuntoId}', '${roomId}')" title="Remover Conjunto">
 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
 <path d="M3 6h18"></path>
 <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
 <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
 <line x1="10" y1="11" x2="10" y2="17"></line>
 <line x1="14" y1="11" x2="14" y2="17"></line>
 </svg>
 </button>
 </div>
 <div class="conjunto-info">
 <div class="selector-conj">
 <label for="tubulacao-quantidade-${novoConjuntoId}">Qtd:</label>
 <input type="number" id="tubulacao-quantidade-${novoConjuntoId}" class="quantidade-input" value="${conjuntoData?.quantidade || 1}" min="1" max="100" onchange="atualizarTotaisConjuntoComAPI('${novoConjuntoId}')">
 </div>
 <div class="conjunto-buttons">
 <button type="button" class="btn btn-small btn-ls" onclick="addLinhaExtraLSComAPI('${novoConjuntoId}')">+ L.S.</button>
 <button type="button" class="btn btn-small btn-ll" onclick="addLinhaExtraLLComAPI('${novoConjuntoId}')">+ L.L.</button>
 </div>
 </div>
 </div>
 
 <div class="tabela-container">
 <table class="tubos-table" id="tubos-table-${novoConjuntoId}">
 <thead>
 <tr>
 <th>Tipo</th>
 <th>Bitola</th>
 <th>Espessura</th>
 <th>Comp. Inter.</th>
 <th>N° Circ.</th>
 <th>N° Curvas</th>
 <th>C.E. Curva</th>
 <th>Ações</th>
 </tr>
 </thead>
 <tbody id="tubos-list-${novoConjuntoId}">
 <!-- LINHA L.S. FIXA (PRINCIPAL) -->
 <tr id="linha-${linhaLSId}" class="linha-tubulacao linha-principal" data-linha='{"id":"${linhaLSId}","tipo":"L.S.","ehPrincipal":true}' data-conjunto="${novoConjuntoId}" data-tipo="L.S.">
 <td>L.S.</td>
 <td>
 <select class="polegadas-select" onchange="calcularLinhaComAPI('${linhaLSId}')">
 <option value="">-</option>
 ${polegadasDisponiveis
   .map(
     (p) =>
       `<option value="${p.value}" ${p.value === (polegadaLS?.value || "") ? "selected" : ""}>${p.label}</option>`,
   )
   .join("")}
 </select>
 </td>
 <td>
 <select class="espessura-select" onchange="calcularLinhaComAPI('${linhaLSId}')">
 <option value="">-</option>
 <option value="0,80">0,80 mm</option>
 <option value="1,59" selected>1,59 mm</option>
 </select>
 </td>
 <td>
 <input type="number" class="comprimento-input" min="0" step="0.1" value="${conjuntoData?.linhas?.find((l) => l.tipo === "L.S." && l.ehPrincipal)?.compr || ""}" 
 onchange="handleColunaChangeComAPI('${linhaLSId}', 'comprimento', this.value)" 
 placeholder="0.0" style="width: 80px;">
 </td>
 <td>
 <input type="number" class="circuitos-input" min="0" value="${conjuntoData?.linhas?.find((l) => l.tipo === "L.S." && l.ehPrincipal)?.numC || ""}" 
 onchange="handleColunaChangeComAPI('${linhaLSId}', 'circuitos', this.value)" 
 placeholder="0" style="width: 60px;">
 </td>
 <td>
 <input type="number" class="curvas-input" min="0" value="${conjuntoData?.linhas?.find((l) => l.tipo === "L.S." && l.ehPrincipal)?.numCu || ""}" 
 onchange="handleColunaChangeComAPI('${linhaLSId}', 'curvas', this.value)" 
 placeholder="0" style="width: 60px;">
 </td>
 <td>
 <input type="number" class="ce-curva-input" min="0" step="0.1" value="${conjuntoData?.linhas?.find((l) => l.tipo === "L.S." && l.ehPrincipal)?.Cee || ""}" 
 onchange="handleColunaChangeComAPI('${linhaLSId}', 'cecurva', this.value)" 
 placeholder="0.0" style="width: 70px;">
 </td>
 <td>
 <button class="btn-remove" onclick="removerLinha('${linhaLSId}')" title="Remover"></button>
 </td>
 </tr>
 
 <!-- LINHA L.L. FIXA (PRINCIPAL) -->
 <tr id="linha-${linhaLLId}" class="linha-tubulacao linha-principal" data-linha='{"id":"${linhaLLId}","tipo":"L.L.","ehPrincipal":true}' data-conjunto="${novoConjuntoId}" data-tipo="L.L.">
 <td>L.L.</td>
 <td>
 <select class="polegadas-select" onchange="calcularLinhaComAPI('${linhaLLId}')">
 <option value="">-</option>
 ${polegadasDisponiveis
   .map(
     (p) =>
       `<option value="${p.value}" ${p.value === (polegadaLL?.value || "") ? "selected" : ""}>${p.label}</option>`,
   )
   .join("")}
 </select>
 </td>
 <td>
 <select class="espessura-select" onchange="calcularLinhaComAPI('${linhaLLId}')">
 <option value="">-</option>
 <option value="0,80" selected>0,80 mm</option>
 <option value="1,59">1,59 mm</option>
 </select>
 </td>
 <td>
 <input type="number" class="comprimento-input" min="0" step="0.1" value="${conjuntoData?.linhas?.find((l) => l.tipo === "L.L." && l.ehPrincipal)?.compr || ""}" 
 onchange="handleColunaChangeComAPI('${linhaLLId}', 'comprimento', this.value)" 
 placeholder="0.0" style="width: 80px;">
 </td>
 <td>
 <input type="number" class="circuitos-input" min="0" value="${conjuntoData?.linhas?.find((l) => l.tipo === "L.L." && l.ehPrincipal)?.numC || ""}" 
 onchange="handleColunaChangeComAPI('${linhaLLId}', 'circuitos', this.value)" 
 placeholder="0" style="width: 60px;">
 </td>
 <td>
 <input type="number" class="curvas-input" min="0" value="${conjuntoData?.linhas?.find((l) => l.tipo === "L.L." && l.ehPrincipal)?.numCu || ""}" 
 onchange="handleColunaChangeComAPI('${linhaLLId}', 'curvas', this.value)" 
 placeholder="0" style="width: 60px;">
 </td>
 <td>
 <input type="number" class="ce-curva-input" min="0" step="0.1" value="${conjuntoData?.linhas?.find((l) => l.tipo === "L.L." && l.ehPrincipal)?.Cee || ""}" 
 onchange="handleColunaChangeComAPI('${linhaLLId}', 'cecurva', this.value)" 
 placeholder="0.0" style="width: 70px;">
 </td>
 <td>
 <button class="btn-remove" onclick="removerLinha('${linhaLLId}')" title="Remover"></button>
 </td>
 </tr>
 </tbody>
 </table>
 </div>
 
 <div class="tubos-totais">
 <div class="totais-resumo">
 <div class="total-item">
 <span class="total-label">Total L.S. (m):</span>
 <span class="total-value" id="total-ls-metros-${novoConjuntoId}">0.00</span>
 </div>
 <div class="total-item">
 <span class="total-label">Total L.S. (kg):</span>
 <span class="total-value" id="total-ls-kg-${novoConjuntoId}">0.00</span>
 </div>
 <div class="total-item">
 <span class="total-label">Total L.L. (m):</span>
 <span class="total-value" id="total-ll-metros-${novoConjuntoId}">0.00</span>
 </div>
 <div class="total-item">
 <span class="total-label">Total L.L. (kg):</span>
 <span class="total-value" id="total-ll-kg-${novoConjuntoId}">0.00</span>
 </div>
 <div class="total-item">
 <span class="total-label">Total Cabos:</span>
 <span class="total-value" id="total-cabos-${novoConjuntoId}">0</span>
 </div>
 <div class="total-item">
 <span class="total-label">Total Luvas:</span>
 <span class="total-value" id="total-luvas-${novoConjuntoId}">0.00</span>
 </div>
 <div class="total-item">
 <span class="total-label">Total Reduções:</span>
 <span class="total-value" id="total-reducoes-${novoConjuntoId}">0</span>
 </div>
 <div class="total-item">
 <span class="total-label">Total Geral (kg):</span>
 <span class="total-value" id="total-geral-kg-${novoConjuntoId}">0.00</span>
 </div>
 <div class="total-item total-item-valor">
 <span class="total-label">Valor Total:</span>
 <span class="total-value" id="total-valor-${novoConjuntoId}">R$ 0,00</span>
 </div>
 </div>
 </div>
 `;

    tubosContainer.appendChild(novoConjunto);

    // Configurar sincronização apenas para as linhas principais
    configurarSincronizacaoLSLL(novoConjuntoId);

    // Aguardar a renderização e configurar controle
    setTimeout(() => {
      atualizarControleLinhas(novoConjuntoId);

      // Carregar dados existentes se houver
      if (conjuntoData?.linhas) {
        conjuntoData.linhas.forEach((linhaData, index) => {
          const linhaElement = document.getElementById(`linha-${linhaData.id}`);
          if (linhaElement) {
            linhaElement.setAttribute("data-linha", JSON.stringify(linhaData));

            // Atualizar campos do formulário com dados existentes
            if (linhaData.compr) {
              const comprInput =
                linhaElement.querySelector(".comprimento-input");
              if (comprInput) comprInput.value = linhaData.compr;
            }
            if (linhaData.numC) {
              const circInput = linhaElement.querySelector(".circuitos-input");
              if (circInput) circInput.value = linhaData.numC;
            }
            if (linhaData.numCu) {
              const curvInput = linhaElement.querySelector(".curvas-input");
              if (curvInput) curvInput.value = linhaData.numCu;
            }
            if (linhaData.Cee) {
              const ceeInput = linhaElement.querySelector(".ce-curva-input");
              if (ceeInput) ceeInput.value = linhaData.Cee;
            }

            // Calcular a linha
            setTimeout(() => {
              calcularLinhaComAPI(linhaData.id);
            }, 50 * index);
          }
        });
      }

      // Atualizar totais
      setTimeout(() => {
        atualizarTotaisConjuntoComAPI(novoConjuntoId);
        atualizarTotalGeralTubulacao(roomId);
      }, 25);
    }, 100);
  } catch (error) {
    console.error(" Erro ao criar conjunto:", error);
    novoConjunto.innerHTML = `
 <div class="conjunto-header">
 <div class="conjunto-title-container">
 <h5 style="color: red;">Conjunto ${novoNum} Erro API</h5>
 </div>
 </div>
 <div style="padding: 10px; color: red;">
 Erro ao carregar dados da API: ${error.message}
 </div>
 `;
    tubosContainer.appendChild(novoConjunto);
  }

  console.log(` Conjunto ${novoConjuntoId} criado com LS e LL fixos`);
  return novoConjuntoId;
}

// ==============================================
// FUNÇÃO PARA ATUALIZAR TOTAIS DO CONJUNTO
// ==============================================

// Função para atualizar totais com API
async function atualizarTotaisConjuntoComAPI(conjuntoId) {
  const conjuntoElement = document.getElementById(`conjunto-${conjuntoId}`);
  if (!conjuntoElement) return;

  const linhas = conjuntoElement.querySelectorAll(".linha-tubulacao");

  let totalLSmetros = 0;
  let totalLSkg = 0;
  let totalLLmetros = 0;
  let totalLLkg = 0;
  let totalCabos = 0;
  let totalLuvas = 0;
  let totalReducoes = 0;
  let totalValor = 0;

  for (const row of linhas) {
    try {
      const linhaData = JSON.parse(row.getAttribute("data-linha"));

      if (linhaData.tipo === "L.S.") {
        totalLSmetros += linhaData.LSmetros || 0;
        totalLSkg += linhaData.LSkg || 0;
        totalCabos += linhaData.cabos || 0;
        totalLuvas += linhaData.luvas || 0;
        totalReducoes += linhaData.reducoes || 0;
      } else if (linhaData.tipo === "L.L.") {
        totalLLmetros += linhaData.LLmetros || 0;
        totalLLkg += linhaData.LLkg || 0;
      }

      totalValor += linhaData.valorTotal || 0;
    } catch (error) {
      console.error(" Erro ao processar linha:", error);
    }
  }

  const quantidadeInput = document.getElementById(
    `tubulacao-quantidade-${conjuntoId}`,
  );
  const quantidade = quantidadeInput ? parseInt(quantidadeInput.value) || 1 : 1;

  const totalGeralKg = (totalLSkg + totalLLkg) * quantidade;
  const totalCabosMulti = totalCabos * quantidade;
  const totalLuvasMulti = totalLuvas * quantidade;
  const totalReducoesMulti = totalReducoes * quantidade;
  const totalValorMulti = totalValor * quantidade;

  const atualizarElemento = (id, valor, isCurrency = false) => {
    const element = document.getElementById(id);
    if (element) {
      if (isCurrency) {
        element.textContent = `R$ ${valor.toFixed(2).replace(".", ",")}`;
      } else if (Number.isInteger(valor)) {
        element.textContent = Math.round(valor);
      } else {
        element.textContent = valor.toFixed(2).replace(".", ",");
      }
    }
  };

  atualizarElemento(
    `total-ls-metros-${conjuntoId}`,
    totalLSmetros * quantidade,
  );
  atualizarElemento(`total-ls-kg-${conjuntoId}`, totalLSkg * quantidade);
  atualizarElemento(
    `total-ll-metros-${conjuntoId}`,
    totalLLmetros * quantidade,
  );
  atualizarElemento(`total-ll-kg-${conjuntoId}`, totalLLkg * quantidade);
  atualizarElemento(`total-cabos-${conjuntoId}`, totalCabosMulti);
  atualizarElemento(`total-luvas-${conjuntoId}`, totalLuvasMulti);
  atualizarElemento(`total-reducoes-${conjuntoId}`, totalReducoesMulti);
  atualizarElemento(`total-geral-kg-${conjuntoId}`, totalGeralKg);
  atualizarElemento(`total-valor-${conjuntoId}`, totalValorMulti, true);

  console.log(
    ` Totais conjunto ${conjuntoId}: R$ ${totalValorMulti.toFixed(2)}`,
  );

  // Atualizar total geral da sala
  const roomId = conjuntoId.split("-")[0];
  atualizarTotalGeralTubulacao(roomId);
}

// ==============================================
// FUNÇÃO PARA CALCULAR TOTAL GERAL DA SALA
// ==============================================

// Função para calcular e atualizar o total geral de tubulação da sala
function atualizarTotalGeralTubulacao(roomId) {
  const conjuntos = document.querySelectorAll(
    `[data-conjunto-id^="${roomId}-"]`,
  );

  if (conjuntos.length === 0) {
    const totalGeralElement = document.getElementById(
      `tubos-total-geral-${roomId}`,
    );
    if (totalGeralElement) {
      totalGeralElement.style.display = "none";
    }
    return;
  }

  let totalValorGeral = 0;
  let totalKgGeral = 0;

  conjuntos.forEach((conjuntoElement) => {
    const conjuntoId = conjuntoElement.getAttribute("data-conjunto-id");

    // Extrair valor total do conjunto
    const valorElement = document.getElementById(`total-valor-${conjuntoId}`);
    if (valorElement) {
      const valorText = valorElement.textContent || "R$ 0,00";
      const valor = parseFloat(
        valorText.replace("R$", "").replace(",", ".").trim(),
      );
      if (!isNaN(valor)) {
        totalValorGeral += valor;
      }
    }

    // Extrair total kg do conjunto
    const kgElement = document.getElementById(`total-geral-kg-${conjuntoId}`);
    if (kgElement) {
      const kgText = kgElement.textContent || "0,00";
      const kg = parseFloat(kgText.replace(",", ".").trim());
      if (!isNaN(kg)) {
        totalKgGeral += kg;
      }
    }
  });

  // Atualizar os elementos de total geral
  const totalGeralElement = document.getElementById(
    `tubos-total-geral-${roomId}`,
  );
  if (totalGeralElement) {
    totalGeralElement.style.display = "block";

    const valorElement = document.getElementById(`total-geral-valor-${roomId}`);
    if (valorElement) {
      valorElement.textContent = `R$ ${totalValorGeral.toFixed(2).replace(".", ",")}`;
    }

    const kgElement = document.getElementById(`total-geral-kg-${roomId}`);
    if (kgElement) {
      kgElement.textContent = totalKgGeral.toFixed(2).replace(".", ",");
    }
  }

  console.log(
    ` Total geral da sala ${roomId}: R$ ${totalValorGeral.toFixed(2)} | ${totalKgGeral.toFixed(2)} kg`,
  );

  // Dispara evento de atualização
  const roomElement = document.querySelector(`[data-room-id="${roomId}"]`);
  if (roomElement) {
    const projectId = roomElement.dataset.projectId;
    if (projectId) {
      document.dispatchEvent(
        new CustomEvent("valorAtualizado", {
          detail: {
            tipo: "tubulacao",
            roomId,
            projectId,
            valor: totalValorGeral,
          },
        }),
      );
    }
  }

  return {
    valorTotal: totalValorGeral,
    kgTotal: totalKgGeral,
  };
}

// ==============================================
// FUNÇÕES DE REMOÇÃO
// ==============================================

// Remover linha com proteção para linhas principais
function removerLinha(linhaId) {
  const row = document.getElementById(`linha-${linhaId}`);
  if (!row) return;

  const linhaData = JSON.parse(row.getAttribute("data-linha") || "{}");
  const conjuntoId = row.getAttribute("data-conjunto");

  // Verificar se é linha principal
  if (linhaData.ehPrincipal) {
    alert("As linhas L.S. e L.L. principais não podem ser removidas!");
    return;
  }

  if (confirm("Tem certeza que deseja remover esta linha extra?")) {
    row.remove();

    // Atualizar controle de sincronização
    atualizarControleLinhas(conjuntoId);

    setTimeout(() => {
      atualizarTotaisConjuntoComAPI(conjuntoId);

      // Atualizar total geral da sala
      const roomId = conjuntoId.split("-")[0];
      atualizarTotalGeralTubulacao(roomId);
    }, 6);

    console.log(` Linha extra removida: ${linhaId}`);
  }
}

// Limpar toda a tubulação
function limparTubulacao(roomId) {
  if (confirm("Tem certeza que deseja limpar toda a tubulação desta sala?")) {
    const container = document.querySelector(
      `#section-content-${roomId}tubos .tubos-container`,
    );
    if (container) {
      const conjuntos = container.querySelectorAll(".tubos-conjunto");
      conjuntos.forEach((conjunto) => {
        const conjuntoId = conjunto.getAttribute("data-conjunto-id");
        delete sincronizacaoPorConjunto[conjuntoId];
        conjunto.remove();
      });

      const emptyMessage = document.getElementById(`tubos-empty-${roomId}`);
      if (emptyMessage) {
        emptyMessage.style.display = "block";
      }
    }

    // Esconder total geral após limpar
    const totalGeralElement = document.getElementById(
      `tubos-total-geral-${roomId}`,
    );
    if (totalGeralElement) {
      totalGeralElement.style.display = "none";
    }

    console.log(` Todas as tubulações removidas da sala ${roomId}`);
  }
}

// ==============================================
// FUNÇÕES DE INICIALIZAÇÃO E EXTRACÇÃO
// ==============================================

// Inicializar sistema de tubulação
async function initTubulacaoSystem(roomId) {
  console.log(` Inicializando sistema de tubulação para sala: ${roomId}`);

  try {
    await getTubos();
    console.log(` API de tubos conectada para sala ${roomId}`);
  } catch (error) {
    console.warn(` Erro ao conectar com API para sala ${roomId}:`, error);
  }
}

// Função para extrair dados
function extractTubulacaoData(roomElement) {
  const resultado = {
    conjuntos: [],
    valorTotal: 0,
    kgTotal: 0,
    totalGeral: 0,
  };

  if (!roomElement?.dataset.roomId) {
    return resultado;
  }

  const roomId = roomElement.dataset.roomId;

  // Extrair total geral da interface
  const totalGeralElement = document.getElementById(
    `total-geral-valor-${roomId}`,
  );
  if (totalGeralElement) {
    const totalGeralText = totalGeralElement.textContent || "R$ 0,00";
    const totalGeral = parseFloat(
      totalGeralText.replace("R$", "").replace(",", ".").trim(),
    );
    resultado.totalGeral = isNaN(totalGeral) ? 0 : totalGeral;
  }

  // Extrair total kg da interface
  const totalKgElement = document.getElementById(`total-geral-kg-${roomId}`);
  if (totalKgElement) {
    const totalKgText = totalKgElement.textContent || "0,00";
    const totalKg = parseFloat(totalKgText.replace(",", ".").trim());
    resultado.kgTotal = isNaN(totalKg) ? 0 : totalKg;
  }

  const conjuntos = roomElement.querySelectorAll(
    `[data-conjunto-id^="${roomId}-"]`,
  );

  conjuntos.forEach((conjuntoElement, index) => {
    const conjuntoId = conjuntoElement.getAttribute("data-conjunto-id");
    const conjuntoNum =
      conjuntoElement.getAttribute("data-conjunto-num") ||
      (index + 1).toString();

    const quantidadeInput = document.getElementById(
      `tubulacao-quantidade-${conjuntoId}`,
    );
    const quantidade = quantidadeInput
      ? parseInt(quantidadeInput.value) || 1
      : 1;

    const extrairNumero = (elementId) => {
      const element = document.getElementById(`${elementId}-${conjuntoId}`);
      if (!element) return 0;
      const text = element.textContent || "0";
      return parseFloat(text.replace(",", ".")) || 0;
    };

    const extrairValor = (elementId) => {
      const element = document.getElementById(elementId);
      if (!element) return 0;
      const text = element.textContent || "R$ 0,00";
      const valor = parseFloat(text.replace("R$", "").replace(",", ".").trim());
      return isNaN(valor) ? 0 : valor;
    };

    const conjuntoData = {
      id: conjuntoId,
      numero: parseInt(conjuntoNum),
      quantidade: quantidade,
      cabos: Math.round(extrairNumero("total-cabos")),
      luvas: extrairNumero("total-luvas"),
      reducoes: Math.round(extrairNumero("total-reducoes")),
      totalGeralKG: extrairNumero("total-geral-kg"),
      valorTotal: extrairValor(`total-valor-${conjuntoId}`),
      linhas: [],
    };

    resultado.valorTotal += conjuntoData.valorTotal;

    const tbody = document.getElementById(`tubos-list-${conjuntoId}`);
    if (tbody) {
      const linhas = tbody.querySelectorAll(".linha-tubulacao");

      linhas.forEach((row) => {
        try {
          const linhaData = JSON.parse(row.getAttribute("data-linha"));

          const linhaFormatada = {
            id: linhaData.id,
            tipo: linhaData.tipo,
            ehPrincipal: linhaData.ehPrincipal || false,
            pol: linhaData.polegadas || "",
            expe: linhaData.espessura || "",
            compr: parseFloat(linhaData.comprimentoInterligacao || 0),
            numC: parseInt(linhaData.numCircuitos || 0),
            numCu: parseInt(linhaData.numCurvas || 0),
            Cee: parseFloat(linhaData.comprimentoEquivalenteCurva || 0),
            Lsm: parseFloat(linhaData.LSmetros || linhaData.LLmetros || 0),
            LSkg: parseFloat(linhaData.LSkg || linhaData.LLkg || 0),
            cabos: linhaData.cabos || 0,
            luvas: linhaData.luvas || 0,
            reducoes: linhaData.reducoes || 0,
            precoPorMetro: parseFloat(
              linhaData.precoPorMetroLS || linhaData.precoPorMetroLL || 0,
            ),
            valorTotal: parseFloat(linhaData.valorTotal || 0),
          };

          conjuntoData.linhas.push(linhaFormatada);
        } catch (error) {
          console.error(" Erro ao extrair linha:", error);
        }
      });
    }

    resultado.conjuntos.push(conjuntoData);
  });

  return resultado;
}

// ==============================================
// FUNÇÕES AUXILIARES
// ==============================================

// Forçar atualização do cache da API
async function atualizarCacheTubos() {
  try {
    tubosCache = null;
    cacheTimestamp = null;
    await getTubos();
    console.log(" Cache de tubos atualizado");
    return true;
  } catch (error) {
    console.error(" Erro ao atualizar cache:", error);
    throw error;
  }
}

// Função de teste para verificar busca de tubos
async function testarBuscaTubos() {
  console.log(" TESTANDO BUSCA DE TUBOS");

  const testes = ["1.1/4", "1 1/4", "7/8", "1.1/2", "2"];

  for (const teste of testes) {
    try {
      const tubo = await getTuboPorPolegada(teste);
      console.log(` "${teste}" → "${tubo.polegadas}" - R$ ${tubo.valor}`);
    } catch (error) {
      console.log(` "${teste}" → ERRO: ${error.message}`);
    }
  }
}

// Função para remover um conjunto inteiro
function removerConjunto(conjuntoId, roomId) {
  const conjuntoElement = document.getElementById(`conjunto-${conjuntoId}`);
  if (!conjuntoElement) {
    console.error(` Conjunto ${conjuntoId} não encontrado`);
    return;
  }

  // Contar quantos conjuntos existem
  const conjuntosExistentes = document.querySelectorAll(
    `[data-conjunto-id^="${roomId}-"]`,
  );
  const totalConjuntos = conjuntosExistentes.length;

  if (totalConjuntos === 1) {
    // Se for o único conjunto, não permitir remoção
    if (
      confirm(
        "Este é o único conjunto da sala. Deseja realmente removê-lo?\nA sala ficará sem tubulação.",
      )
    ) {
      realizarRemocaoConjunto(conjuntoId, roomId);
    }
  } else {
    // Se houver mais de um conjunto, permitir remoção normal
    if (
      confirm(
        `Tem certeza que deseja remover este conjunto?\n\nEsta ação removerá todas as linhas do conjunto e não pode ser desfeita.`,
      )
    ) {
      realizarRemocaoConjunto(conjuntoId, roomId);
    }
  }
}

// Função auxiliar para realizar a remoção do conjunto
function realizarRemocaoConjunto(conjuntoId, roomId) {
  const conjuntoElement = document.getElementById(`conjunto-${conjuntoId}`);

  // Remover da sincronização
  delete sincronizacaoPorConjunto[conjuntoId];

  // Remover elemento do DOM
  conjuntoElement.remove();

  // Atualizar números dos conjuntos restantes
  atualizarNumeracaoConjuntos(roomId);

  // Atualizar total geral
  atualizarTotalGeralTubulacao(roomId);

  // Verificar se ficou sem conjuntos
  const conjuntosRestantes = document.querySelectorAll(
    `[data-conjunto-id^="${roomId}-"]`,
  );
  if (conjuntosRestantes.length === 0) {
    const emptyMessage = document.getElementById(`tubos-empty-${roomId}`);
    if (emptyMessage) {
      emptyMessage.style.display = "block";
    }
  }

  console.log(` Conjunto removido: ${conjuntoId}`);
}

// Função para atualizar a numeração dos conjuntos após remoção
function atualizarNumeracaoConjuntos(roomId) {
  const conjuntos = document.querySelectorAll(
    `[data-conjunto-id^="${roomId}-"]`,
  );

  conjuntos.forEach((conjunto, index) => {
    const novoNum = index + 1;
    const conjuntoId = conjunto.getAttribute("data-conjunto-id");
    const conjuntoNum = conjunto.getAttribute("data-conjunto-num");

    // Atualizar atributos
    conjunto.setAttribute("data-conjunto-num", novoNum);

    // Atualizar título
    const tituloElement = conjunto.querySelector(
      ".conjunto-title-container h5",
    );
    if (tituloElement) {
      tituloElement.textContent = `Conjunto ${novoNum}`;
    }

    console.log(` Conjunto ${conjuntoId} renumerado para ${novoNum}`);
  });
}

// ==============================================
// EXPORTAÇÕES
// ==============================================

if (typeof window !== "undefined") {
  window.fillTubulacaoData = fillTubulacaoData;
  window.addTubulacaoConjuntoComAPI = addTubulacaoConjuntoComAPI;
  window.calcularLinhaComAPI = calcularLinhaComAPI;
  window.handleColunaChangeComAPI = handleColunaChangeComAPI;
  window.atualizarTotaisConjuntoComAPI = atualizarTotaisConjuntoComAPI;
  window.removerLinha = removerLinha;
  window.removerConjunto = removerConjunto;
  window.atualizarNumeracaoConjuntos = atualizarNumeracaoConjuntos;
  window.limparTubulacao = limparTubulacao;
  window.initTubulacaoSystem = initTubulacaoSystem;
  window.buildTubosSection = buildTubosSection;
  window.extractTubulacaoData = extractTubulacaoData;
  window.sincronizarLSLL = sincronizarLSLL;
  window.atualizarControleLinhas = atualizarControleLinhas;
  window.configurarSincronizacaoLSLL = configurarSincronizacaoLSLL;
  window.getTubos = getTubos;
  window.getTuboPorPolegada = getTuboPorPolegada;
  window.getPrecoPorMetro = getPrecoPorMetro;
  window.getPolegadasDisponiveis = getPolegadasDisponiveis;
  window.atualizarCacheTubos = atualizarCacheTubos;
  window.testarBuscaTubos = testarBuscaTubos;
  window.atualizarTotalGeralTubulacao = atualizarTotalGeralTubulacao;
  window.adicionarLinhaNaTabelaComAPI = adicionarLinhaNaTabelaComAPI;
  window.addLinhaExtraLSComAPI = addLinhaExtraLSComAPI;
  window.addLinhaExtraLLComAPI = addLinhaExtraLLComAPI;
}

export {
  buildTubosSection,
  fillTubulacaoData,
  addTubulacaoConjuntoComAPI,
  calcularLinhaComAPI,
  calcularLSmetros,
  calcularLLmetros,
  calcularLSkg,
  calcularLLkg,
  calcularCabos,
  calcularLuvas,
  calcularReducoes,
  getKgPorMetro,
  atualizarTotaisConjuntoComAPI,
  removerLinha,
  removerConjunto,
  atualizarNumeracaoConjuntos,
  limparTubulacao,
  initTubulacaoSystem,
  extractTubulacaoData,
  handleColunaChangeComAPI,
  sincronizarLSLL,
  atualizarControleLinhas,
  configurarSincronizacaoLSLL,
  getTubos,
  getTuboPorPolegada,
  getPrecoPorMetro,
  getPolegadasDisponiveis,
  atualizarCacheTubos,
  testarBuscaTubos,
  atualizarTotalGeralTubulacao,
  adicionarLinhaNaTabelaComAPI,
  addLinhaExtraLSComAPI,
  addLinhaExtraLLComAPI,
};
