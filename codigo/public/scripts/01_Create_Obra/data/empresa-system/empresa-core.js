// empresa-core.js
/**
 * EMPRESA-CORE.JS - Núcleo do Sistema de Empresas
 * Responsabilidade: Inicialização, cache, funções fundamentais, classe principal
 */

/* ==== SEÇÃO 1: SISTEMA DE CACHE DE EMPRESAS ==== */

// Cache de empresas - evita múltiplas requisições
window.empresasCache = null;
window.cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

/**
 * CARREGAR EMPRESAS COM CACHE
 */
async function carregarEmpresasComCache() {
  const agora = Date.now();

  // Se tem cache válido, retorna do cache
  if (
    window.empresasCache &&
    window.cacheTimestamp &&
    agora - window.cacheTimestamp < CACHE_DURATION
  ) {
    console.log(" [CACHE] Retornando empresas do cache");
    return window.empresasCache;
  }

  try {
    console.log(" [CACHE] Carregando empresas do servidor...");
    const response = await fetch("/api/dados/empresas");

    if (response.ok) {
      const data = await response.json();
      const empresas = normalizeEmpresas(data.empresas || []);

      // Atualiza cache
      window.empresasCache = empresas;
      window.cacheTimestamp = agora;

      console.log(
        ` [CACHE] ${empresas.length} empresas carregadas e cacheadas`,
      );
      return empresas;
    } else {
      console.error(" [CACHE] Erro ao carregar empresas:", response.status);
      return [];
    }
  } catch (error) {
    console.error(" [CACHE] Erro no carregamento:", error);
    return window.empresasCache || []; // Retorna cache antigo se disponível
  }
}

/**
 * LIMPAR CACHE (para ser chamado quando novas empresas forem adicionadas)
 */
function limparCacheEmpresas() {
  window.empresasCache = null;
  window.cacheTimestamp = null;
  console.log(" [CACHE] Cache de empresas limpo");
}

async function obterProximoNumeroClienteDoServidor(sigla) {
  const response = await fetch(
    `/api/dados/empresas/numero/${encodeURIComponent(sigla)}`,
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  const numero = Number.parseInt(payload?.numero, 10);
  if (Number.isNaN(numero) || numero < 1) {
    throw new Error("Numero de cliente invalido retornado pelo servidor");
  }

  return numero;
}

function calcularProximoNumeroClienteLocal(obrasDaEmpresa, sigla, numeroAtual = 0) {
  let maiorNumero = Number.parseInt(numeroAtual, 10) || 0;

  obrasDaEmpresa.forEach((obra) => {
    if (obra.numeroClienteFinal) {
      const numero = parseInt(obra.numeroClienteFinal, 10);
      if (!isNaN(numero) && numero > maiorNumero) {
        maiorNumero = numero;
      }
    }

    if (obra.idGerado) {
      const match = obra.idGerado.match(new RegExp(`obra_${sigla}_(\\d+)`));
      if (match) {
        const numero = parseInt(match[1], 10);
        if (numero > maiorNumero) {
          maiorNumero = numero;
        }
      }
    }
  });

  return maiorNumero + 1;
}

/* ==== SEÇÃO 2: CLASSE PRINCIPAL - EMPRESA CADASTRO INLINE ==== */

import { showSystemStatus } from "../../ui/components/status.js";
import {
  normalizeEmpresa,
  normalizeEmpresas,
} from "../../core/shared-utils.js";
import { invalidateRuntimeBootstrap } from "../../core/runtime-data.js";

export class EmpresaCadastroInline {
  constructor() {
    this.empresas = [];
    this.obrasExistentes = [];
    this.container = null;
    this.isActive = false;

    this.init();
  }

  async init() {
    await this.carregarDados();
    this.vincularEventos();
  }

  async carregarDados() {
    try {
      // Carregar empresas do dados.json
      const responseEmpresas = await fetch("/api/dados/empresas");
      if (responseEmpresas.ok) {
        const dados = await responseEmpresas.json();
        this.empresas = normalizeEmpresas(dados.empresas || []);
      }

      // Carregar apenas o catalogo leve de obras
      const responseBackup = await fetch("/api/obras/catalog");
      if (responseBackup.ok) {
        const backup = await responseBackup.json();
        this.obrasExistentes = backup.obras || [];
      }

      console.log(
        ` Dados carregados: ${this.empresas.length} empresas, ${this.obrasExistentes.length} obras`,
      );
    } catch (error) {
      console.error(" Erro ao carregar dados:", error);
    }
  }

  vincularEventos() {
    // Encontrar todos os spans de cadastro de empresas e transformar em botões
    const spansCadastro = document.querySelectorAll(
      ".projetc-header-record.very-dark span",
    );

    spansCadastro.forEach((span) => {
      // Transformar span em botão
      const button = document.createElement("button");
      button.className = "btn-empresa-cadastro";
      button.textContent = span.textContent;
      button.setAttribute("type", "button");

      // Substituir span por botão
      span.parentNode.replaceChild(button, span);

      // Vincular eventos
      button.addEventListener("click", (e) => this.ativarCadastro(e));
      button.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          this.ativarCadastro(e);
        }
      });
    });
  }

  ativarCadastro(event) {
    if (this.isActive) return;

    const span = event.target;
    this.container = span.closest(".projetc-header-record");

    if (!this.container) {
      console.error(" Container não encontrado");
      return;
    }

    // Ocultar span e mostrar formulário inline
    span.style.display = "none";
    this.renderizarFormulario();
    this.isActive = true;

    // Inicializar campo de número do cliente
    const obraElement = this.container.closest(".obra-block");
    if (obraElement) {
      this.inicializarCampoNumeroCliente(obraElement);
    }

    console.log(" Cadastro inline ativado");
  }

  renderizarFormulario() {
    const formHTML = this.criarHTMLFormulario();
    this.container.insertAdjacentHTML("beforeend", formHTML);

    this.configurarEstadoCampos();
    this.vincularEventosFormulario();

    setTimeout(() => {
      const empresaInput = this.container.querySelector("#empresa-input");
      if (empresaInput) empresaInput.focus();
    }, 12);
  }

  configurarEstadoCampos() {
    const camposLiberados = [
      "empresa-input",
      "cliente-final",
      "codigo-cliente",
      "data-cadastro",
      "orcamentista-responsavel",
    ];

    camposLiberados.forEach((campoId) => {
      const campo = this.container.querySelector(`#${campoId}`);
      if (campo) {
        campo.removeAttribute("readonly");
        campo.removeAttribute("disabled");
        campo.readOnly = false;
        campo.disabled = false;
        campo.style.backgroundColor = "#ffffff";
        campo.style.borderColor = "#007bff";
        campo.style.cursor = "text";
        campo.style.color = "#000000";
      }
    });

    const camposBloqueados = ["numero-cliente-final"];

    camposBloqueados.forEach((campoId) => {
      const campo = this.container.querySelector(`#${campoId}`);
      if (campo) {
        campo.readOnly = true;
        campo.setAttribute("readonly", "true");
        campo.style.backgroundColor = "#f8f9fa";
        campo.style.borderColor = "#ced4da";
        campo.style.cursor = "not-allowed";
        campo.style.color = "#6c757d";
      }
    });

    this.configurarCampoData();
  }

  configurarCampoData() {
    const dataCampo = this.container.querySelector("#data-cadastro");
    if (dataCampo) {
      dataCampo.removeAttribute("readonly");
      dataCampo.readOnly = false;
      dataCampo.disabled = false;
      dataCampo.title = "Clique para editar a data (DD/MM/AAAA)";
      dataCampo.placeholder = "DD/MM/AAAA";
      dataCampo.style.backgroundColor = "#ffffff";
      dataCampo.style.borderColor = "#007bff";
      dataCampo.style.cursor = "text";
      dataCampo.style.color = "#000000";

      dataCampo.addEventListener("input", (e) => {
        this.aplicarMascaraData(e.target);
      });

      dataCampo.addEventListener("blur", (e) => {
        this.validarData(e.target);
      });
    }
  }

  aplicarMascaraData(input) {
    let value = input.value.replace(/\D/g, "");

    if (value.length > 8) {
      value = value.substring(0, 8);
    }

    if (value.length > 4) {
      value =
        value.substring(0, 2) +
        "/" +
        value.substring(2, 4) +
        "/" +
        value.substring(4);
    } else if (value.length > 2) {
      value = value.substring(0, 2) + "/" + value.substring(2);
    }

    input.value = value;
  }

  validarData(input) {
    const valor = input.value.trim();

    if (!valor) return true;

    const regexData = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = valor.match(regexData);

    if (!match) {
      showSystemStatus("Formato de data inválido. Use DD/MM/AAAA", "warning");
      input.focus();
      return false;
    }

    const dia = parseInt(match[1], 10);
    const mes = parseInt(match[2], 10);
    const ano = parseInt(match[3], 10);

    if (mes < 1 || mes > 12) {
      showSystemStatus("Mês deve estar entre 01 e 12", "warning");
      input.focus();
      return false;
    }

    if (dia < 1 || dia > 31) {
      showSystemStatus("Dia deve estar entre 01 e 31", "warning");
      input.focus();
      return false;
    }

    const data = new Date(ano, mes - 1, dia);
    if (
      data.getDate() !== dia ||
      data.getMonth() + 1 !== mes ||
      data.getFullYear() !== ano
    ) {
      showSystemStatus("Data inválida para o mês especificado", "warning");
      input.focus();
      return false;
    }

    return true;
  }

  criarHTMLFormulario() {
    const obraId =
      this.container?.closest(".obra-block")?.dataset?.obraId || "temp";

    return `
 <div class="empresa-formulario-ativo" id="empresa-formulario-${obraId}">
 <h4>Cadastro de Empresa</h4>

 <div class="empresa-form-grid-horizontal">
 <div class="form-group-horizontal">
 <label>Empresa *</label>
 <div class="empresa-input-container">
 <input type="text" 
 class="empresa-input-cadastro" 
 id="empresa-input-${obraId}"
 placeholder="Digite sigla ou nome ou selecione..."
 autocomplete="off">
 <div class="empresa-dropdown" id="empresa-dropdown-${obraId}">
 <div class="dropdown-options" id="empresa-options-${obraId}"></div>
 </div>
 </div>
 </div>

 <div class="form-group-horizontal">
 <label>Nº Cliente</label>
 <input type="text" 
 class="numero-cliente-final-cadastro" 
 id="numero-cliente-${obraId}"
 placeholder="Será calculado automaticamente (pode editar)">
 </div>

 <div class="form-group-horizontal">
 <label>Cliente Final</label>
 <input type="text" 
 class="cliente-final-cadastro" 
 id="cliente-final-${obraId}"
 placeholder="Nome do cliente final">
 </div>

 <div class="form-group-horizontal">
 <label>Código</label>
 <input type="text" 
 class="codigo-cliente-cadastro" 
 id="codigo-cliente-${obraId}"
 placeholder="Código do cliente">
 </div>

 <div class="form-group-horizontal">
 <label>Data</label>
 <div class="date-input-container">
 <input type="text" 
 class="data-cadastro-cadastro" 
 id="data-cadastro-${obraId}"
 placeholder="DD/MM/AAAA"
 value="${new Date().toLocaleDateString("pt-BR")}"
 maxlength="10">
 <span class="calendar-icon" onclick="window.alternarDatePicker('${obraId}', 'cadastro')"></span>
 </div>
 </div>

 <div class="form-group-horizontal">
 <label>Orçamentista</label>
 <input type="text" 
 class="orcamentista-responsavel-cadastro" 
 id="orcamentista-${obraId}"
 placeholder="Nome do orçamentista">
 </div>
 </div>

 <div class="empresa-form-actions">
 <button type="button" class="btn-cancel" 
 onclick="window.empresaCadastro.cancelarCadastro()">
 Cancelar
 </button>
 </div>
 </div>
 `;
  }

  vincularEventosFormulario() {
    const empresaInput = this.container.querySelector("#empresa-input");
    if (empresaInput) {
      empresaInput.addEventListener("input", (e) =>
        this.buscarEmpresas(e.target.value),
      );
      empresaInput.addEventListener("blur", () => {
        setTimeout(() => this.ocultarSugestoes(), 25);
      });
      empresaInput.addEventListener("keydown", (e) =>
        this.tratarTecladoAutocomplete(e),
      );
      this.observarMudancasEmpresa();
    }

    const dataCampo = this.container.querySelector("#data-cadastro");
    if (dataCampo) {
      dataCampo.addEventListener("change", () => {
        this.validarData(dataCampo);
      });
    }
  }

  async buscarEmpresas(termo) {
    if (!termo || termo.length < 2) {
      this.ocultarSugestoes();
      return;
    }

    const termoNormalizado = this.normalizarTermo(termo);
    const sugestoes = this.filtrarEmpresas(termoNormalizado);

    this.exibirSugestoes(sugestoes);
  }

  normalizarTermo(termo) {
    return termo
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  filtrarEmpresas(termo) {
    return this.empresas.filter((empresaObj) => {
      const empresa = normalizeEmpresa(empresaObj);
      if (!empresa || !empresa.codigo) return false;

      const sigla = empresa.codigo;
      const nome = empresa.nome || "";
      const nomeNormalizado = nome
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const primeiroNome = nome.split(" ")[0].toUpperCase();

      return (
        sigla === termo ||
        nomeNormalizado.includes(termo) ||
        primeiroNome.includes(termo)
      );
    });
  }

  exibirSugestoes(sugestoes) {
    const containerSugestoes = this.container.querySelector(
      "#empresa-suggestions",
    );
    if (!containerSugestoes) return;

    if (sugestoes.length === 0) {
      this.ocultarSugestoes();
      return;
    }

    const html = sugestoes
      .map((empresaObj) => {
        const empresa = normalizeEmpresa(empresaObj);
        if (!empresa || !empresa.codigo) return "";

        const sigla = empresa.codigo;
        const nome = empresa.nome || "";
        const primeiroNome = nome.split(" ")[0];

        return `
 <div class="dropdown-option" data-sigla="${sigla}" data-nome="${nome}">
 <strong>${sigla}</strong> - ${primeiroNome}
 </div>
 `;
      })
      .join("");

    containerSugestoes.innerHTML = html;
    containerSugestoes.style.display = "block";

    containerSugestoes.querySelectorAll(".dropdown-option").forEach((item) => {
      item.addEventListener("click", () => {
        const sigla = item.dataset.sigla;
        const nome = item.dataset.nome;
        this.selecionarEmpresa(sigla, nome);
      });
    });
  }

  ocultarSugestoes() {
    const containerSugestoes = this.container.querySelector(
      "#empresa-suggestions",
    );
    if (containerSugestoes) {
      containerSugestoes.style.display = "none";
    }
  }

  tratarTecladoAutocomplete(event) {
    const sugestoes = this.container.querySelectorAll(".dropdown-option");
    if (sugestoes.length === 0) return;

    const sugestaoAtiva = this.container.querySelector(
      ".dropdown-option.active",
    );

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.navegarSugestoes(sugestoes, sugestaoAtiva, 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.navegarSugestoes(sugestoes, sugestaoAtiva, -1);
        break;
      case "Enter":
        event.preventDefault();
        if (sugestaoAtiva) {
          const sigla = sugestaoAtiva.dataset.sigla;
          const nome = sugestaoAtiva.dataset.nome;
          this.selecionarEmpresa(sigla, nome);
        }
        break;
      case "Escape":
        this.ocultarSugestoes();
        break;
    }
  }

  navegarSugestoes(sugestoes, atual, direcao) {
    let index = Array.from(sugestoes).indexOf(atual);

    if (index === -1) index = direcao > 0 ? -1 : sugestoes.length;

    index = (index + direcao + sugestoes.length) % sugestoes.length;

    sugestoes.forEach((s) => s.classList.remove("active"));
    sugestoes[index].classList.add("active");
  }

  selecionarEmpresa(sigla, nome) {
    const empresaInput = this.container.querySelector("#empresa-input");
    if (empresaInput) {
      empresaInput.value = `${sigla} - ${nome}`;
      empresaInput.dataset.siglaSelecionada = sigla;
      empresaInput.dataset.nomeSelecionado = nome;
    }

    this.ocultarSugestoes();

    this.sincronizarTrocaEmpresa(sigla, empresaInput.dataset.siglaAnterior);

    empresaInput.dataset.siglaAnterior = sigla;
  }

  /**
   * CALCULAR NÚMERO DO CLIENTE FINAL PARA NOVA EMPRESA
   */
  calcularNumeroClienteFinal(sigla, obraId = null) {
    try {
      console.log(
        ` [EMPRESA] Calculando número para empresa: ${sigla}, obra: ${obraId}`,
      );

      if (!sigla) {
        console.log(" [EMPRESA] Sigla não fornecida");
        return 0;
      }

      // Buscar obras da empresa específica
      const obrasDaEmpresa = this.obrasExistentes.filter((obra) => {
        return (
          obra.empresaSigla === sigla ||
          obra.empresa_id === sigla ||
          (obra.idGerado && obra.idGerado.startsWith(`obra_${sigla}_`))
        );
      });

      console.log(
        ` [EMPRESA] Encontradas ${obrasDaEmpresa.length} obras para ${sigla}`,
      );

      let maiorNumero = 0;
      obrasDaEmpresa.forEach((obra) => {
        // Verificar númeroClienteFinal
        if (obra.numeroClienteFinal) {
          const numero = parseInt(obra.numeroClienteFinal);
          if (!isNaN(numero) && numero > maiorNumero) {
            maiorNumero = numero;
          }
        }

        // Verificar no idGerado (formato: obra_SIGLA_NUMERO)
        if (obra.idGerado) {
          const match = obra.idGerado.match(new RegExp(`obra_${sigla}_(\\d+)`));
          if (match) {
            const numero = parseInt(match[1]);
            if (numero > maiorNumero) maiorNumero = numero;
          }
        }
      });

      const novoNumero = maiorNumero + 1;

      if (obraId) {
        this.atualizarCampoNumeroCliente(obraId, novoNumero);

        // Atualizar o header da obra
        const obraElement = document.querySelector(
          `[data-obra-id="${obraId}"]`,
        );
        if (obraElement) {
          const dados = {
            empresaSigla: sigla,
            empresaNome: obraElement.dataset.empresaNome || "",
            numeroClienteFinal: novoNumero,
            clienteFinal: obraElement.dataset.clienteFinal,
            codigoCliente: obraElement.dataset.codigoCliente,
            dataCadastro: obraElement.dataset.dataCadastro,
            orcamentistaResponsavel:
              obraElement.dataset.orcamentistaResponsavel,
          };
          this.atualizarHeaderObra(obraElement, dados);
        }
      }

      return novoNumero;
    } catch (error) {
      console.error(
        " [EMPRESA] Erro ao calcular número do cliente final:",
        error,
      );
      return 1;
    }
  }

  atualizarCampoNumeroCliente(obraId, numero) {
    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraElement) return;

    // Tentar encontrar o campo de número do cliente em qualquer formato
    const numeroInput = obraElement.querySelector(
      ".numero-cliente-final-cadastro, " +
        ".numero-cliente-final-readonly, " +
        "#numero-cliente-" +
        obraId,
    );

    if (numeroInput) {
      // Garantir que o campo seja editável
      numeroInput.removeAttribute("readonly");
      numeroInput.readOnly = false;
      numeroInput.disabled = false;

      // Remover qualquer atributo value hardcoded
      numeroInput.removeAttribute("value");

      // Definir o novo valor
      numeroInput.value = numero;

      // Se for empresa nova (número 1), destacar visualmente
      if (numero === 1) {
        numeroInput.style.backgroundColor = "#e8f5e8";
        numeroInput.style.borderColor = "#4CAF50";
      } else {
        numeroInput.style.backgroundColor = "";
        numeroInput.style.borderColor = "";
      }

      console.log(` [EMPRESA] Campo número atualizado: ${numero} (editável)`);
    }
  }

  sincronizarTrocaEmpresa(novaSigla, siglaAnterior = null) {
    try {
      const obraElement = this.container?.closest(".obra-block");
      if (!obraElement) return;

      this.calcularNumeroClienteFinal(novaSigla);

      console.log(
        ` Empresa alterada de ${siglaAnterior || "nenhuma"} para ${novaSigla}`,
      );
    } catch (error) {
      console.error(" Erro ao sincronizar troca de empresa:", error);
    }
  }

  observarMudancasEmpresa() {
    const empresaInput = this.container?.querySelector("#empresa-input");
    if (!empresaInput) return;

    let valorAnterior = empresaInput.value;

    empresaInput.addEventListener("input", () => {
      const valorAtual = empresaInput.value;

      if (!valorAtual.trim() && valorAnterior.trim()) {
        this.limparDadosEmpresa();
      }

      valorAnterior = valorAtual;
    });

    empresaInput.addEventListener("blur", () => {
      if (!empresaInput.value.trim() && empresaInput.dataset.siglaSelecionada) {
        this.removerEmpresaSelecionada();
      }
    });
  }

  limparDadosEmpresa() {
    const obraElement = this.container?.closest(".obra-block");
    if (!obraElement) return;

    this.resetarNumeroClienteVisivel(obraElement);
    this.limparDadosTemporarios(obraElement);

    const headerSpacer = obraElement.querySelector(".obra-header-spacer span");
    if (headerSpacer) {
      this.resetHeaderObra(headerSpacer);
    }

    this.restaurarTituloOriginal(obraElement);
  }

  removerEmpresaSelecionada() {
    const empresaInput = this.container.querySelector("#empresa-input");
    if (empresaInput) {
      delete empresaInput.dataset.siglaSelecionada;
      delete empresaInput.dataset.nomeSelecionado;
      delete empresaInput.dataset.siglaAnterior;
    }

    this.limparDadosEmpresa();
  }

  inicializarCampoNumeroCliente(obraElement) {
    const numeroClienteInput = obraElement.querySelector(
      ".numero-cliente-final-readonly",
    );

    if (numeroClienteInput) {
      const empresaSigla = obraElement.dataset.empresaSigla;

      if (empresaSigla) {
        this.calcularNumeroClienteFinal(empresaSigla);
      } else {
        numeroClienteInput.value = "";
        numeroClienteInput.placeholder = "Selecione uma empresa";
      }

      numeroClienteInput.readOnly = false;
      numeroClienteInput.removeAttribute("readonly");
    }
  }

  atualizarHeaderObra(obraElement, dadosEmpresa) {
    try {
      const headerSpacer = obraElement.querySelector(".obra-header-spacer");
      if (!headerSpacer) {
        console.error(" Elemento .obra-header-spacer não encontrado");
        return;
      }

      headerSpacer.innerHTML = "";

      if (dadosEmpresa.empresaSigla && dadosEmpresa.numeroClienteFinal) {
        const span = document.createElement("span");
        span.className = "empresa-identifier-display";
        const textoHeader = `${dadosEmpresa.empresaSigla}-${dadosEmpresa.numeroClienteFinal}`;
        span.textContent = textoHeader;
        span.setAttribute(
          "data-tooltip",
          this.criarTooltipEmpresa(dadosEmpresa),
        );

        this.inicializarTooltipJavaScript(span);

        headerSpacer.appendChild(span);

        this.sincronizarTituloObra(obraElement, dadosEmpresa);

        console.log(` Header da obra atualizado: ${textoHeader}`);
      } else {
        this.resetHeaderObra(headerSpacer);
      }
    } catch (error) {
      console.error(" Erro ao atualizar header da obra:", error);
    }
  }

  sincronizarTituloObra(obraElement, dadosEmpresa) {
    try {
      const tituloElement = obraElement.querySelector(".obra-title");

      if (!tituloElement) {
        console.warn(" Elemento .obra-title não encontrado na obra");
        return;
      }

      const identificadorObra = `${dadosEmpresa.empresaSigla}-${dadosEmpresa.numeroClienteFinal}`;

      // APENAS [SIGLA-NUMERO] - conforme solicitado
      tituloElement.textContent = identificadorObra;

      if (tituloElement.hasAttribute("data-editable-content")) {
        tituloElement.setAttribute("data-editable-content", identificadorObra);
      }

      this.dispararEventoTituloAtualizado(
        obraElement,
        identificadorObra,
        identificadorObra,
      );

      console.log(` Título da obra sincronizado: ${identificadorObra}`);
    } catch (error) {
      console.error(" Erro ao sincronizar título da obra:", error);
    }
  }

  restaurarTituloOriginal(obraElement) {
    const tituloElement = obraElement.querySelector(".obra-title");
    if (!tituloElement) return;

    tituloElement.textContent = "Nova Obra";

    if (tituloElement.hasAttribute("data-editable-content")) {
      tituloElement.setAttribute("data-editable-content", "Nova Obra");
    }
  }

  dispararEventoTituloAtualizado(obraElement, novoTitulo, identificadorObra) {
    const evento = new CustomEvent("obra:titulo-atualizado", {
      bubbles: true,
      detail: {
        obraElement: obraElement,
        tituloCompleto: novoTitulo,
        identificadorObra: identificadorObra,
        timestamp: new Date().toISOString(),
      },
    });

    obraElement.dispatchEvent(evento);
  }

  criarTooltipEmpresa(dadosEmpresa) {
    const partes = [];

    if (dadosEmpresa.empresaNome) {
      partes.push(`Empresa: ${dadosEmpresa.empresaNome}`);
    }
    if (dadosEmpresa.clienteFinal) {
      partes.push(`Cliente: ${dadosEmpresa.clienteFinal}`);
    }
    if (dadosEmpresa.codigoCliente) {
      partes.push(`Código: ${dadosEmpresa.codigoCliente}`);
    }
    if (dadosEmpresa.dataCadastro) {
      const dataFormatada = this.formatarDataParaTooltip(
        dadosEmpresa.dataCadastro,
      );
      partes.push(`Data: ${dataFormatada}`);
    }
    if (dadosEmpresa.orcamentistaResponsavel) {
      partes.push(`Orçamentista: ${dadosEmpresa.orcamentistaResponsavel}`);
    }

    return partes.join("\n");
  }

  formatarDataParaTooltip(dataString) {
    if (!dataString) return "";

    try {
      if (
        typeof dataString === "string" &&
        dataString.match(/^\d{2}\/\d{2}\/\d{4}$/)
      ) {
        return dataString;
      }

      const data = new Date(dataString);

      if (isNaN(data.getTime())) {
        return dataString;
      }

      const dia = String(data.getDate()).padStart(2, "0");
      const mes = String(data.getMonth() + 1).padStart(2, "0");
      const ano = data.getFullYear();

      return `${dia}/${mes}/${ano}`;
    } catch (error) {
      return dataString;
    }
  }

  resetHeaderObra(headerSpacer) {
    headerSpacer.innerHTML = "";
  }

  prepararDadosObra(dados) {
    const obraBlock = this.container.closest(".obra-block");
    if (obraBlock) {
      obraBlock.dataset.empresaSigla = dados.sigla;
      obraBlock.dataset.empresaNome = dados.nomeEmpresa;
      obraBlock.dataset.numeroClienteFinal = dados.numeroClienteFinal;
      obraBlock.dataset.clienteFinal = dados.clienteFinal;
      obraBlock.dataset.codigoCliente = dados.codigoCliente;

      const dataFormatada = this.formatarData(dados.dataCadastro);
      obraBlock.dataset.dataCadastro = dataFormatada;

      obraBlock.dataset.orcamentistaResponsavel = dados.orcamentistaResponsavel;
      obraBlock.dataset.idGerado = `obra_${dados.sigla}_${dados.numeroClienteFinal}`;
      obraBlock.dataset.identificadorObra = `${dados.sigla}-${dados.numeroClienteFinal}`;

      this.atualizarHeaderObra(obraBlock, {
        empresaSigla: dados.sigla,
        empresaNome: dados.nomeEmpresa,
        numeroClienteFinal: dados.numeroClienteFinal,
        clienteFinal: dados.clienteFinal,
        codigoCliente: dados.codigoCliente,
        dataCadastro: dataFormatada,
        orcamentistaResponsavel: dados.orcamentistaResponsavel,
      });
    }
  }

  async prepararDados() {
    const dados = this.coletarDadosFormulario();

    if (!this.validarDados(dados)) {
      return;
    }

    if (!dados.empresaExistente) {
      const sucesso = await this.cadastrarNovaEmpresa(
        dados.sigla,
        dados.nomeEmpresa,
      );
      if (!sucesso) return;
    }

    this.prepararDadosObra(dados);

    showSystemStatus(
      "Dados da empresa preparados! Agora salve a obra.",
      "success",
    );

    this.ocultarFormulario();
  }

  coletarDadosFormulario() {
    const empresaInput = this.container.querySelector("#empresa-input");
    const siglaSelecionada = empresaInput?.dataset.siglaSelecionada;
    const nomeSelecionado = empresaInput?.dataset.nomeSelecionado;

    return {
      empresaInput: empresaInput?.value || "",
      sigla: siglaSelecionada,
      nomeEmpresa: nomeSelecionado,
      empresaExistente: !!siglaSelecionada,
      numeroClienteFinal:
        this.container.querySelector("#numero-cliente-final")?.value || "",
      clienteFinal: this.container.querySelector("#cliente-final")?.value || "",
      codigoCliente:
        this.container.querySelector("#codigo-cliente")?.value || "",
      dataCadastro: this.container.querySelector("#data-cadastro")?.value || "",
      orcamentistaResponsavel:
        this.container.querySelector("#orcamentista-responsavel")?.value || "",
    };
  }

  validarDados(dados) {
    if (!dados.empresaInput.trim()) {
      showSystemStatus("Por favor, informe a empresa", "error");
      return false;
    }

    if (!dados.empresaExistente) {
      const regexSigla = /^[A-Z]{2,6}$/;

      if (regexSigla.test(dados.empresaInput)) {
        const nomeCompleto = prompt(
          `Você digitou apenas a sigla "${dados.empresaInput}". Por favor, informe o nome completo da empresa:`,
        );
        if (!nomeCompleto || !nomeCompleto.trim()) {
          showSystemStatus("Nome completo da empresa é obrigatório", "error");
          return false;
        }

        if (nomeCompleto.trim().length < 3) {
          showSystemStatus(
            "Nome da empresa deve ter pelo menos 3 caracteres",
            "error",
          );
          return false;
        }

        dados.nomeEmpresa = nomeCompleto.trim();
        dados.sigla = dados.empresaInput.toUpperCase();
      } else {
        const primeiraPalavra = dados.empresaInput.split(" ")[0];
        const siglaSugerida = primeiraPalavra.substring(0, 3).toUpperCase();

        let siglaConfirmada = prompt(
          `Empresa não encontrada. Sugerimos a sigla "${siglaSugerida}". Confirme ou digite outra sigla (2-6 letras maiúsculas):`,
          siglaSugerida,
        );

        if (!siglaConfirmada) {
          showSystemStatus("Sigla é obrigatória", "error");
          return false;
        }

        siglaConfirmada = siglaConfirmada
          .trim()
          .toUpperCase()
          .replace(/[^A-Z]/g, "");

        if (!regexSigla.test(siglaConfirmada)) {
          showSystemStatus(
            "Sigla deve conter 2 a 6 letras maiúsculas, sem espaços ou caracteres especiais",
            "error",
          );
          return false;
        }

        dados.sigla = siglaConfirmada;
        dados.nomeEmpresa = dados.empresaInput;
      }
    }

    return true;
  }

  async cadastrarNovaEmpresa(sigla, nome) {
    try {
      const siglaExistente = this.empresas.find((empresaObj) => {
        const empresa = normalizeEmpresa(empresaObj);
        return empresa?.codigo === sigla;
      });

      if (siglaExistente) {
        showSystemStatus(
          `Sigla ${sigla} já está em uso. Escolha outra sigla.`,
          "error",
        );
        return false;
      }

      const novaEmpresa = { codigo: sigla, nome, credenciais: null };
      this.empresas.push(novaEmpresa);

      const response = await fetch("/api/dados/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(novaEmpresa),
      });

      if (!response.ok) {
        throw new Error("Erro ao salvar empresa");
      }

      invalidateRuntimeBootstrap();
      showSystemStatus(
        `Empresa ${sigla} - ${nome} cadastrada com sucesso!`,
        "success",
      );
      return true;
    } catch (error) {
      console.error(" Erro ao cadastrar nova empresa:", error);
      showSystemStatus("Erro ao cadastrar empresa", "error");
      return false;
    }
  }

  /**
   * Cancelar cadastro
   */
  cancelarCadastro() {
    try {
      const obraBlock = this.container?.closest(".obra-block");

      if (obraBlock) {
        // 1. PRIMEIRO: Limpar campos readonly usando setAttribute
        const camposReadonly = obraBlock.querySelectorAll(
          "input[readonly], input:disabled",
        );
        camposReadonly.forEach((campo) => {
          campo.setAttribute("value", "");
          campo.value = "";

          // Restaurar placeholder específico
          if (campo.classList.contains("numero-cliente-final-readonly")) {
            campo.setAttribute("placeholder", "Número do cliente");
          }
        });

        // 2. SEGUNDO: Limpar campos editáveis
        const camposEditaveis = obraBlock.querySelectorAll(
          "input:not([readonly]):not(:disabled)",
        );
        camposEditaveis.forEach((campo) => {
          campo.value = "";

          // Restaurar placeholders específicos
          if (
            campo.classList.contains("empresa-input-cadastro") ||
            campo.classList.contains("empresa-input")
          ) {
            campo.placeholder = "Digite sigla ou nome...";
          }
        });

        // 3. REMOVER VALOR HARDCODED do HTML (se existir)
        const empresaInputs = obraBlock.querySelectorAll(
          ".empresa-input-cadastro, .empresa-input",
        );
        empresaInputs.forEach((input) => {
          // Remove atributo value completamente
          input.removeAttribute("value");
          // Limpa data attributes do autocomplete
          delete input.dataset.siglaSelecionada;
          delete input.dataset.nomeSelecionado;
        });

        // 4. Limpar dados da obra
        this.limparDadosTemporarios(obraBlock);

        const tinhaDadosEmpresa = obraBlock.dataset.empresaSigla;

        if (tinhaDadosEmpresa) {
          this.restaurarTituloOriginal(obraBlock);
        }
      }

      // 5. Ocultar formulário e mostrar botão
      this.ocultarFormulario();
      this.mostrarSpanOriginal();

      if (this.container) {
        const spanOriginal = this.container.querySelector("span");
        if (spanOriginal) {
          spanOriginal.textContent = "+ Cadastrar Empresa";
        }
      }

      console.log(" Cadastro cancelado - todos os campos limpos");
    } catch (error) {
      console.error(" Erro ao cancelar cadastro:", error);
    }
  }

  // Resetar todos os campos da empresa
  resetarTodosCamposEmpresa(obraElement) {
    // Lista de todos os campos de empresa possíveis
    const camposEmpresa = [
      ".empresa-input-cadastro",
      ".empresa-input",
      ".numero-cliente-final-cadastro",
      ".numero-cliente-final-readonly",
      ".cliente-final-cadastro",
      ".cliente-final-input",
      ".codigo-cliente-cadastro",
      ".codigo-cliente-input",
      ".data-cadastro-cadastro",
      ".data-cadastro-input",
      ".orcamentista-responsavel-cadastro",
      ".orcamentista-responsavel-input",
    ];

    camposEmpresa.forEach((selector) => {
      const campo = obraElement.querySelector(selector);
      if (campo) {
        // Para campos readonly, usar setAttribute
        if (campo.readOnly || campo.disabled) {
          campo.setAttribute("value", "");
          campo.value = "";

          // Restaurar placeholder se existir
          if (campo.classList.contains("numero-cliente-final-readonly")) {
            campo.setAttribute("placeholder", "Número do cliente");
          }
        } else {
          campo.value = "";
        }

        // Limpar data attributes específicos
        if (campo.dataset.siglaSelecionada) {
          delete campo.dataset.siglaSelecionada;
        }
        if (campo.dataset.nomeSelecionado) {
          delete campo.dataset.nomeSelecionado;
        }

        console.log(` Campo ${selector} limpo`);
      }
    });

    // Resetar campo específico de número do cliente
    this.resetarNumeroClienteVisivel(obraElement);
  }

  // resetarNumeroClienteVisivel
  resetarNumeroClienteVisivel(obraElement) {
    const numeroClienteInput = obraElement.querySelector(
      ".numero-cliente-final-readonly",
    );

    if (numeroClienteInput) {
      // Para readonly, usar setAttribute
      numeroClienteInput.setAttribute("value", "");
      numeroClienteInput.value = "";
      numeroClienteInput.setAttribute("placeholder", "Número do cliente");
      console.log(" Número do cliente resetado (readonly)");
    }

    const formNumeroInput = this.container?.querySelector(
      "#numero-cliente-final",
    );
    if (formNumeroInput) {
      formNumeroInput.value = "";
      formNumeroInput.placeholder = "Será calculado automaticamente";
    }
  }

  limparDadosTemporarios(obraElement) {
    const camposParaLimpar = [
      "empresaSigla",
      "empresaNome",
      "numeroClienteFinal",
      "identificadorObra",
      "clienteFinal",
      "codigoCliente",
      "dataCadastro",
      "orcamentistaResponsavel",
      "idGerado",
    ];

    camposParaLimpar.forEach((campo) => {
      delete obraElement.dataset[campo];
    });
  }

  ocultarFormulario() {
    const form = this.container.querySelector("#empresa-cadastro-inline");
    if (form) {
      form.remove();
    }
    this.isActive = false;
  }

  mostrarSpanOriginal() {
    const span = this.container.querySelector("span");
    if (span) {
      span.style.display = "inline";
    }
  }

  obterDadosPreparados(obraId) {
    const obraBlock = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraBlock) return null;

    return {
      empresaSigla: obraBlock.dataset.empresaSigla,
      empresaNome: obraBlock.dataset.empresaNome,
      numeroClienteFinal: obraBlock.dataset.numeroClienteFinal
        ? parseInt(obraBlock.dataset.numeroClienteFinal)
        : null,
      clienteFinal: obraBlock.dataset.clienteFinal,
      codigoCliente: obraBlock.dataset.codigoCliente,
      dataCadastro: obraBlock.dataset.dataCadastro,
      orcamentistaResponsavel: obraBlock.dataset.orcamentistaResponsavel,
      idGerado: obraBlock.dataset.idGerado,
    };
  }

  formatarData(dataString) {
    if (!dataString) return "";

    try {
      if (
        typeof dataString === "string" &&
        dataString.match(/^\d{2}\/\d{2}\/\d{4}$/)
      ) {
        return dataString;
      }

      const data = new Date(dataString);

      if (isNaN(data.getTime())) {
        return dataString;
      }

      const dia = String(data.getDate()).padStart(2, "0");
      const mes = String(data.getMonth() + 1).padStart(2, "0");
      const ano = data.getFullYear();

      return `${dia}/${mes}/${ano}`;
    } catch (error) {
      return dataString;
    }
  }

  inicializarTooltipJavaScript(element) {
    if (!element) {
      return;
    }

    if (typeof element.__empresaTooltipCleanup === "function") {
      element.__empresaTooltipCleanup();
    }

    let autoCloseTimer = null;
    let lastIsMobile = window.innerWidth <= 768;
    const cleanupCallbacks = [];

    const addManagedListener = (target, eventName, handler, options) => {
      target.addEventListener(eventName, handler, options);
      cleanupCallbacks.push(() =>
        target.removeEventListener(eventName, handler, options),
      );
    };

    const cleanup = () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }

      cleanupCallbacks.splice(0).forEach((callback) => callback());
      delete element.__empresaTooltipCleanup;
      delete element.dataset.tooltipInitialized;
    };

    element.__empresaTooltipCleanup = cleanup;
    element.dataset.tooltipInitialized = "true";
    element.style.position = "relative";
    element.style.overflow = "visible";
    element.style.zIndex = "100";

    const tooltip = document.createElement("div");
    tooltip.className = "empresa-tooltip";
    tooltip.setAttribute("role", "tooltip");

    const closeButton = document.createElement("button");
    closeButton.className = "empresa-tooltip-close";
    closeButton.type = "button";
    closeButton.textContent = "x";
    closeButton.setAttribute("aria-label", "Fechar tooltip");

    const tooltipContent = document.createElement("div");
    tooltipContent.className = "empresa-tooltip-content";

    tooltip.appendChild(closeButton);
    tooltip.appendChild(tooltipContent);
    document.body.appendChild(tooltip);
    cleanupCallbacks.push(() => tooltip.remove());

    const getIsMobile = () => window.innerWidth <= 768;

    const cancelarAutoCloseTimer = () => {
      if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
      }
    };

    const esconderTooltip = () => {
      tooltip.classList.remove("show");
      cancelarAutoCloseTimer();
    };

    const sincronizarModoTooltip = () => {
      const isMobile = getIsMobile();
      tooltip.classList.toggle("empresa-tooltip-mobile", isMobile);
      closeButton.hidden = !isMobile;

      if (!isMobile) {
        cancelarAutoCloseTimer();
      }
    };

    const iniciarAutoCloseTimer = () => {
      cancelarAutoCloseTimer();

      if (!getIsMobile()) {
        return;
      }

      autoCloseTimer = setTimeout(() => {
        esconderTooltip();
      }, 400);
    };

    const atualizarPosicaoTooltip = () => {
      const rect = element.getBoundingClientRect();
      const isMobile = getIsMobile();

      if (isMobile) {
        tooltip.style.position = "fixed";
        tooltip.style.left = "50%";
        tooltip.style.top = "50%";
        tooltip.style.bottom = "auto";
        tooltip.style.right = "auto";
        tooltip.style.transform = "translate(-50%, -50%)";
        tooltip.style.width = "min(90vw, 320px)";
        tooltip.style.maxWidth = "320px";
        tooltip.style.maxHeight = "70vh";
        tooltip.style.overflowY = "auto";
        tooltip.style.zIndex = "100000";
      } else {
        tooltip.style.position = "fixed";
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.bottom = `${window.innerHeight - rect.top + 8}px`;
        tooltip.style.top = "auto";
        tooltip.style.right = "auto";
        tooltip.style.transform = "translateX(-50%)";
        tooltip.style.width = "auto";
        tooltip.style.maxWidth = "380px";
        tooltip.style.maxHeight = "none";
        tooltip.style.overflowY = "visible";
        tooltip.style.zIndex = "100000";
      }
    };

    const mostrarTooltip = () => {
      const tooltipText = element.getAttribute("data-tooltip");
      if (!tooltipText) {
        return;
      }

      sincronizarModoTooltip();
      tooltipContent.innerHTML = tooltipText;
      tooltip.classList.add("show");
      atualizarPosicaoTooltip();
      iniciarAutoCloseTimer();
    };

    const toggleTooltip = (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (tooltip.classList.contains("show")) {
        esconderTooltip();
        return;
      }

      mostrarTooltip();
    };

    const handleDocumentClick = (event) => {
      if (!element.contains(event.target) && !tooltip.contains(event.target)) {
        esconderTooltip();
      }
    };

    const handleWindowScroll = () => {
      if (!tooltip.classList.contains("show")) {
        return;
      }

      if (getIsMobile()) {
        esconderTooltip();
        return;
      }

      atualizarPosicaoTooltip();
    };

    const handleWindowResize = () => {
      const isMobile = getIsMobile();
      sincronizarModoTooltip();

      if (!tooltip.classList.contains("show")) {
        lastIsMobile = isMobile;
        return;
      }

      if (lastIsMobile !== isMobile) {
        esconderTooltip();
      } else {
        atualizarPosicaoTooltip();
      }

      lastIsMobile = isMobile;
    };

    addManagedListener(closeButton, "click", (event) => {
      event.stopPropagation();
      esconderTooltip();
    });

    addManagedListener(element, "click", (event) => {
      if (getIsMobile()) {
        toggleTooltip(event);
      }
    });

    addManagedListener(element, "mouseenter", () => {
      if (!getIsMobile()) {
        mostrarTooltip();
      }
    });

    addManagedListener(element, "mouseleave", () => {
      if (!getIsMobile()) {
        esconderTooltip();
      }
    });

    addManagedListener(document, "click", handleDocumentClick);
    addManagedListener(window, "scroll", handleWindowScroll, { passive: true });
    addManagedListener(window, "resize", handleWindowResize, { passive: true });
    addManagedListener(window, "orientationchange", esconderTooltip, {
      passive: true,
    });

    addManagedListener(
      tooltip,
      "touchstart",
      () => {
        cancelarAutoCloseTimer();
        iniciarAutoCloseTimer();
      },
      { passive: true },
    );

    addManagedListener(tooltip, "click", () => {
      cancelarAutoCloseTimer();
      iniciarAutoCloseTimer();
    });

    const observer = new MutationObserver(() => {
      if (!document.body.contains(element)) {
        cleanup();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    cleanupCallbacks.push(() => observer.disconnect());

    sincronizarModoTooltip();
  }
}

/* ==== SEÇÃO 3: FUNÇÕES GLOBAIS (ex-obra-adapter.js) ==== */

/**
 * Função global para editar dados da empresa
 */
window.editarDadosEmpresa = function (button, obraId = null) {
  try {
    const visualizacao = button.closest(".empresa-dados-visualizacao");
    let obraBlock;

    if (obraId) {
      // Se recebeu obraId, buscar por ID
      obraBlock = document.querySelector(`[data-obra-id="${obraId}"]`);
    } else {
      // Buscar pelo DOM
      obraBlock = visualizacao.closest(".obra-block");
    }

    if (!obraBlock) {
      console.error(" [EMPRESA] Obra não encontrada para edição");
      return;
    }

    // Remover visualização se existir
    if (visualizacao) {
      visualizacao.remove();
    }

    // Mostrar span original para ativar cadastro
    const spanOriginal = obraBlock.querySelector(
      ".projetc-header-record.very-dark span",
    );
    if (spanOriginal) {
      spanOriginal.style.display = "inline";

      // Simular clique para ativar cadastro
      if (
        window.empresaCadastro &&
        typeof window.empresaCadastro.ativarCadastro === "function"
      ) {
        const event = new Event("click");
        spanOriginal.dispatchEvent(event);
      } else {
        spanOriginal.click();
      }
    }
  } catch (error) {
    console.error(" [EMPRESA] Erro ao editar dados da empresa:", error);
  }
};

/**
 * Atualizar dados da empresa em tempo real
 */
window.atualizarDadosEmpresa = function (input, campo, obraId) {
  try {
    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraElement) {
      console.error(` [EMPRESA] Obra ${obraId} não encontrada`);
      return;
    }
    obraElement.dataset[campo] = input.value;
    console.log(` [EMPRESA] Campo ${campo} atualizado para:`, input.value);

    // Atualizar tooltip
    if (typeof atualizarTooltipEmpresa === "function") {
      atualizarTooltipEmpresa(obraId);
    }
  } catch (error) {
    console.error(` [EMPRESA] Erro ao atualizar campo ${campo}:`, error);
  }
};

/**
 * Função global para ativar cadastro de empresa - corrigida
 */
window.ativarCadastroEmpresa = function (obraId) {
  try {
    console.log(` [EMPRESA] Ativando formulário para obra: ${obraId}`);

    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraElement) {
      console.error(` [EMPRESA] Obra ${obraId} não encontrada`);
      return;
    }

    const empresaContainer = obraElement.querySelector(
      ".projetc-header-record.very-dark",
    );
    if (!empresaContainer) {
      console.error(` [EMPRESA] Container de empresa não encontrado`);
      return;
    }

    // SEMPRE OCULTAR O BOTÃO DE CADASTRO
    const botaoCadastro = empresaContainer.querySelector(
      ".btn-empresa-cadastro",
    );
    if (botaoCadastro) {
      botaoCadastro.style.display = "none";
    }

    // SEMPRE OCULTAR BOTÃO VISUALIZAR (se existir)
    const botaoVisualizar = empresaContainer.querySelector(
      ".btn-empresa-visualizar",
    );
    if (botaoVisualizar) {
      botaoVisualizar.style.display = "none";
    }

    // Verificar se já existe formulário
    const formularioExistente = empresaContainer.querySelector(
      ".empresa-formulario-ativo",
    );
    if (formularioExistente) {
      // Se já existe, apenas garantir que está visível
      formularioExistente.style.display = "block";
      console.log(` [EMPRESA] Formulário já existe, apenas exibindo`);
      return;
    }

    // Verificar se há dados salvos
    const dadosEmpresa = obterDadosEmpresaDaObra(obraId);

    // Criar formulário com fallback seguro para contextos de embed/mínimos
    const criarFormulario =
      typeof criarFormularioEmpresa === "function"
        ? criarFormularioEmpresa
        : window.criarFormularioEmpresa;

    if (typeof criarFormulario !== "function") {
      throw new ReferenceError("criarFormularioEmpresa não está disponível");
    }

    criarFormulario(obraId, empresaContainer, dadosEmpresa);
  } catch (error) {
    console.error(` [EMPRESA] Erro ao ativar cadastro:`, error);
  }
};

/**
 * Obtém dados de empresa de uma obra específica
 */
function obterDadosEmpresaDaObra(obraId) {
  try {
    const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
    if (!obraElement) {
      console.error(` [EMPRESA] Obra com ID ${obraId} não encontrada`);
      return null;
    }

    const camposEmpresa = [
      "empresaSigla",
      "empresaNome",
      "numeroClienteFinal",
      "clienteFinal",
      "codigoCliente",
      "dataCadastro",
      "orcamentistaResponsavel",
      "idGerado",
      "empresa_id",
    ];

    const dadosEmpresa = {};
    let temDados = false;

    camposEmpresa.forEach((campo) => {
      if (obraElement.dataset[campo]) {
        dadosEmpresa[campo] = obraElement.dataset[campo];
        temDados = true;
      }
    });

    if (temDados) {
      console.log(
        ` [EMPRESA] Dados recuperados para obra ${obraId}:`,
        dadosEmpresa,
      );
      return dadosEmpresa;
    }

    console.log(
      ` [EMPRESA] Nenhum dado de empresa encontrado para obra ${obraId}`,
    );
    return null;
  } catch (error) {
    console.error(` [EMPRESA] Erro ao obter dados de empresa:`, error);
    return null;
  }
}

/**
 * Atualizar texto do botão de cadastro de empresa
 */
function atualizarTextoBotaoEmpresa(
  obraId,
  texto = "Visualizar campos de cadastro de empresas",
) {
  const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
  if (!obraElement) return false;

  const botao = obraElement.querySelector(".btn-empresa-cadastro");
  if (botao) {
    botao.textContent = texto;
    return true;
  }

  return false;
}

/**
 * FUNÇÃO PARA ATUALIZAR TODOS OS BOTÕES DE EMPRESA (para obras existentes)
 */
function atualizarTodosBotoesEmpresa() {
  const botoes = document.querySelectorAll(".btn-empresa-cadastro");
  let atualizados = 0;

  botoes.forEach((botao) => {
    const textoAtual = botao.textContent.trim();
    if (textoAtual === "Adicionar campos de cadastro de empresas") {
      botao.textContent = "Visualizar campos de cadastro de empresas";
      atualizados++;
    }
  });

  return atualizados;
}

/* ==== SEÇÃO 4: INICIALIZAÇÃO DO SISTEMA ==== */

/**
 * INICIALIZAR SISTEMA DE EMPRESA
 */
function inicializarSistemaEmpresa() {
  console.log(" [EMPRESA] Inicializando sistema de empresa...");

  try {
    // Criar instância global da classe
    window.empresaCadastro = new EmpresaCadastroInline();

    // Configurar evento de DOMContentLoaded se necessário
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        console.log(
          " [EMPRESA] Sistema de empresa inicializado após DOM carregado",
        );
      });
    } else {
      console.log(" [EMPRESA] Sistema de empresa inicializado");
    }

    return true;
  } catch (error) {
    console.error(" [EMPRESA] Erro ao inicializar sistema:", error);
    return false;
  }
}
// empresa-core.js - funções auxiliares para tooltip
function criarTooltipEmpresa(dados) {
  const partes = [];
  if (dados.empresaNome) partes.push(`Empresa: ${dados.empresaNome}`);
  if (dados.clienteFinal) partes.push(`Cliente: ${dados.clienteFinal}`);
  if (dados.codigoCliente) partes.push(`Código: ${dados.codigoCliente}`);
  if (dados.dataCadastro) partes.push(`Data: ${dados.dataCadastro}`);
  if (dados.orcamentistaResponsavel)
    partes.push(`Orçamentista: ${dados.orcamentistaResponsavel}`);
  return partes.join("\n");
}

function atualizarTooltipEmpresa(obraId) {
  const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
  if (!obraElement) return;

  const headerSpacer = obraElement.querySelector(".obra-header-spacer");
  if (!headerSpacer) return;

  const span = headerSpacer.querySelector(".empresa-identifier-display");
  if (!span) return;

  const dados = {
    empresaSigla: obraElement.dataset.empresaSigla,
    empresaNome: obraElement.dataset.empresaNome,
    numeroClienteFinal: obraElement.dataset.numeroClienteFinal,
    clienteFinal: obraElement.dataset.clienteFinal,
    codigoCliente: obraElement.dataset.codigoCliente,
    dataCadastro: obraElement.dataset.dataCadastro,
    orcamentistaResponsavel: obraElement.dataset.orcamentistaResponsavel,
  };

  span.setAttribute("data-tooltip", criarTooltipEmpresa(dados));
}

EmpresaCadastroInline.prototype.obterObrasDoDOMParaNumeracao = function () {
  return Array.from(document.querySelectorAll(".obra-block")).map(
    (obraElement) => {
      const titulo =
        obraElement.querySelector(".obra-title")?.textContent?.trim() || "";
      const identificador =
        obraElement.dataset.identificadorObra ||
        obraElement
          .querySelector(".empresa-identifier-display")
          ?.textContent?.trim() ||
        titulo;

      const matchTitulo = identificador.match(/^([A-Za-z0-9]+)-(\d+)$/);
      const siglaDoTitulo = matchTitulo ? matchTitulo[1].toUpperCase() : "";
      const numeroDoTitulo = matchTitulo ? parseInt(matchTitulo[2], 10) : null;

      return {
        id: obraElement.dataset.obraId || "",
        empresaSigla:
          obraElement.dataset.empresaSigla ||
          obraElement.dataset.empresaCodigo ||
          siglaDoTitulo,
        empresaCodigo:
          obraElement.dataset.empresaCodigo ||
          obraElement.dataset.empresaSigla ||
          siglaDoTitulo,
        empresa_id:
          obraElement.dataset.empresaId || obraElement.dataset.empresa_id || "",
        numeroClienteFinal: obraElement.dataset.numeroClienteFinal
          ? parseInt(obraElement.dataset.numeroClienteFinal, 10)
          : numeroDoTitulo,
        idGerado: obraElement.dataset.idGerado || "",
        identificadorObra:
          obraElement.dataset.identificadorObra || identificador,
      };
    },
  );
};

EmpresaCadastroInline.prototype.obterObrasDaEmpresaParaNumeracao = function (
  sigla,
  obraId = null,
) {
  const obrasCombinadas = [...this.obrasExistentes];
  const obrasNoDOM = this.obterObrasDoDOMParaNumeracao();

  obrasNoDOM.forEach((obraDOM) => {
    const indiceExistente = obrasCombinadas.findIndex(
      (obraCache) => String(obraCache.id || "") === String(obraDOM.id || ""),
    );

    if (indiceExistente >= 0) {
      obrasCombinadas[indiceExistente] = {
        ...obrasCombinadas[indiceExistente],
        ...obraDOM,
      };
      return;
    }

    obrasCombinadas.push(obraDOM);
  });

  return obrasCombinadas.filter((obra) => {
    if (obraId && String(obra.id || "") === String(obraId)) {
      return false;
    }

    return (
      obra.empresaSigla === sigla ||
      obra.empresaCodigo === sigla ||
      obra.empresa_id === sigla ||
      (obra.idGerado && obra.idGerado.startsWith(`obra_${sigla}_`)) ||
      (obra.identificadorObra && obra.identificadorObra.startsWith(`${sigla}-`))
    );
  });
};

EmpresaCadastroInline.prototype.sincronizarObraExistenteParaNumeracao =
  function (obraData) {
    if (!obraData?.id) {
      return;
    }

    const indiceExistente = this.obrasExistentes.findIndex(
      (obra) => String(obra.id || "") === String(obraData.id || ""),
    );

    if (indiceExistente >= 0) {
      this.obrasExistentes[indiceExistente] = {
        ...this.obrasExistentes[indiceExistente],
        ...obraData,
      };
      return;
    }

    this.obrasExistentes.push(obraData);
  };

EmpresaCadastroInline.prototype.calcularNumeroClienteFinal = function (
  sigla,
  obraId = null,
) {
  try {
    console.log(
      `[EMPRESA] Calculando número para empresa: ${sigla}, obra: ${obraId}`,
    );

    if (!sigla) {
      console.log("[EMPRESA] Sigla não fornecida");
      return 0;
    }

    const obrasDaEmpresa = this.obterObrasDaEmpresaParaNumeracao(sigla, obraId);
    console.log(
      `[EMPRESA] Encontradas ${obrasDaEmpresa.length} obras para ${sigla}`,
    );

    let maiorNumero = 0;
    obrasDaEmpresa.forEach((obra) => {
      if (obra.numeroClienteFinal) {
        const numero = parseInt(obra.numeroClienteFinal, 10);
        if (!isNaN(numero) && numero > maiorNumero) {
          maiorNumero = numero;
        }
      }

      if (obra.idGerado) {
        const match = obra.idGerado.match(new RegExp(`obra_${sigla}_(\\d+)`));
        if (match) {
          const numero = parseInt(match[1], 10);
          if (numero > maiorNumero) {
            maiorNumero = numero;
          }
        }
      }
    });

    const novoNumero = maiorNumero + 1;

    if (obraId) {
      const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
      if (obraElement) {
        obraElement.dataset.empresaSigla = sigla;
        obraElement.dataset.empresaCodigo = sigla;
        obraElement.dataset.numeroClienteFinal = String(novoNumero);
        obraElement.dataset.idGerado = `obra_${sigla}_${novoNumero}`;
        obraElement.dataset.identificadorObra = `${sigla}-${novoNumero}`;
      }

      this.atualizarCampoNumeroCliente(obraId, novoNumero);

      if (obraElement) {
        const dados = {
          empresaSigla: sigla,
          empresaNome: obraElement.dataset.empresaNome || "",
          numeroClienteFinal: novoNumero,
          clienteFinal: obraElement.dataset.clienteFinal,
          codigoCliente: obraElement.dataset.codigoCliente,
          dataCadastro: obraElement.dataset.dataCadastro,
          orcamentistaResponsavel: obraElement.dataset.orcamentistaResponsavel,
        };
        this.atualizarHeaderObra(obraElement, dados);
      }

      this.sincronizarObraExistenteParaNumeracao({
        id: obraId,
        empresaSigla: sigla,
        empresaCodigo: sigla,
        empresa_id:
          obraElement?.dataset.empresaId ||
          obraElement?.dataset.empresa_id ||
          "",
        numeroClienteFinal: novoNumero,
        idGerado: `obra_${sigla}_${novoNumero}`,
        identificadorObra: `${sigla}-${novoNumero}`,
      });
    }

    return novoNumero;
  } catch (error) {
    console.error("[EMPRESA] Erro ao calcular numero do cliente final:", error);
    return 1;
  }
};

EmpresaCadastroInline.prototype.calcularNumeroClienteFinal = async function (
  sigla,
  obraId = null,
) {
  try {
    console.log(
      `[EMPRESA] Calculando numero para empresa: ${sigla}, obra: ${obraId}`,
    );

    if (!sigla) {
      console.log("[EMPRESA] Sigla nao fornecida");
      return 0;
    }

    const obrasDaEmpresa = this.obterObrasDaEmpresaParaNumeracao(sigla, obraId);
    console.log(
      `[EMPRESA] Encontradas ${obrasDaEmpresa.length} obras para ${sigla}`,
    );

    let novoNumero;
    try {
      const numeroDoServidor = await obterProximoNumeroClienteDoServidor(sigla);
      const empresa = this.empresas.find(
        (item) => String(item.codigo || "").trim().toUpperCase() === String(sigla).trim().toUpperCase(),
      );
      const numeroAtual = empresa?.numeroClienteAtual || 0;
      const numeroLocal = calcularProximoNumeroClienteLocal(obrasDaEmpresa, sigla, numeroAtual);
      novoNumero = Math.max(numeroDoServidor, numeroLocal);
      console.log(
        `[EMPRESA] Numero calculado: ${novoNumero} (servidor: ${numeroDoServidor}, local: ${numeroLocal}) para ${sigla}`,
      );
    } catch (serverError) {
      console.warn(
        `[EMPRESA] Falha ao consultar numero no servidor para ${sigla}:`,
        serverError,
      );
      const empresa = this.empresas.find(
        (item) => String(item.codigo || "").trim().toUpperCase() === String(sigla).trim().toUpperCase(),
      );
      novoNumero = calcularProximoNumeroClienteLocal(
        obrasDaEmpresa,
        sigla,
        empresa?.numeroClienteAtual || 0,
      );
      console.log(
        `[EMPRESA] Numero calculado localmente: ${novoNumero} para ${sigla}`,
      );
    }

    if (obraId) {
      const obraElement = document.querySelector(`[data-obra-id="${obraId}"]`);
      if (obraElement) {
        obraElement.dataset.empresaSigla = sigla;
        obraElement.dataset.empresaCodigo = sigla;
        obraElement.dataset.numeroClienteFinal = String(novoNumero);
        obraElement.dataset.idGerado = `obra_${sigla}_${novoNumero}`;
        obraElement.dataset.identificadorObra = `${sigla}-${novoNumero}`;
      }

      this.atualizarCampoNumeroCliente(obraId, novoNumero);

      if (obraElement) {
        const dados = {
          empresaSigla: sigla,
          empresaNome: obraElement.dataset.empresaNome || "",
          numeroClienteFinal: novoNumero,
          clienteFinal: obraElement.dataset.clienteFinal,
          codigoCliente: obraElement.dataset.codigoCliente,
          dataCadastro: obraElement.dataset.dataCadastro,
          orcamentistaResponsavel: obraElement.dataset.orcamentistaResponsavel,
        };
        this.atualizarHeaderObra(obraElement, dados);
      }

      this.sincronizarObraExistenteParaNumeracao({
        id: obraId,
        empresaSigla: sigla,
        empresaCodigo: sigla,
        empresa_id:
          obraElement?.dataset.empresaId ||
          obraElement?.dataset.empresa_id ||
          "",
        numeroClienteFinal: novoNumero,
        idGerado: `obra_${sigla}_${novoNumero}`,
        identificadorObra: `${sigla}-${novoNumero}`,
      });
    }

    return novoNumero;
  } catch (error) {
    console.error("[EMPRESA] Erro ao calcular numero do cliente final:", error);
    return 1;
  }
};

export {
  carregarEmpresasComCache,
  limparCacheEmpresas,
  obterDadosEmpresaDaObra,
  atualizarTextoBotaoEmpresa,
  atualizarTodosBotoesEmpresa,
  inicializarSistemaEmpresa,
  atualizarTooltipEmpresa,
  criarTooltipEmpresa,
};

// Compatibilidade global
if (typeof window !== "undefined") {
  window.carregarEmpresasComCache = carregarEmpresasComCache;
  window.limparCacheEmpresas = limparCacheEmpresas;
  window.obterDadosEmpresaDaObra = obterDadosEmpresaDaObra;
  window.atualizarTextoBotaoEmpresa = atualizarTextoBotaoEmpresa;
  window.atualizarTodosBotoesEmpresa = atualizarTodosBotoesEmpresa;
  window.inicializarSistemaEmpresa = inicializarSistemaEmpresa;
  window.atualizarTooltipEmpresa = atualizarTooltipEmpresa;
}
