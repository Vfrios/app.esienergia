/**
 * logger.js
 * Smart console filter with a silent client mode.
 */

function resolveAppConfig(appConfig) {
    if (appConfig) {
        return appConfig;
    }

    if (typeof window === 'undefined') {
        return {};
    }

    return window.APP_CONFIG || window.__APP_CONFIG_OVERRIDES__ || {};
}

function stringifyLogArg(arg) {
    if (arg instanceof Error) {
        const stack = typeof arg.stack === 'string' ? arg.stack : '';
        return stack || `${arg.name}: ${arg.message}`;
    }

    if (typeof arg === 'object' && arg !== null) {
        try {
            return JSON.stringify(arg);
        } catch (error) {
            const objectName = arg?.constructor?.name || 'Object';
            return `[${objectName} unserializable]`;
        }
    }

    return String(arg);
}

export function createSmartLogger(appConfig = null) {
    class SmartLogger {
        constructor(runtimeAppConfig) {
            this.appConfig = resolveAppConfig(runtimeAppConfig);
            this.isClientMode = this.appConfig?.mode === 'client';

            this.levels = {
                NONE: -1,
                ERROR: 0,
                WARN: 1,
                INFO: 2,
                DEBUG: 3
            };

            this.config = {
                globalLevel: this.appConfig?.logger?.globalLevel || (this.isClientMode ? 'NONE' : 'WARN'),
                enabled: this.appConfig?.logger?.enabled ?? true,
                announceCommands: this.appConfig?.logger?.announceCommands ?? !this.isClientMode,
                silentPatterns: [
                    'Vazão atualizada para', 'Salvando dados para sala', 'Iniciando cálculos para sala',
                    'Ganhos calculados para', 'Dados coletados para', 'Tentando atualizar tabela',
                    'Obras carregadas:', 'Sala ainda não salva', 'Procurando sala:',
                    'Sincronização configurada', 'Observer configurado', 'VERIFICAÇÃO COMPLETA',
                    'Elementos encontrados', 'Construindo seção de', ' Sincronização paredes',
                    ' Configurando par', ' Sincronização configurada', ' INICIALIZANDO VALORES PADRÃO',
                    ' CONFIGURANDO TODAS AS SINCRONIZAÇÕES', ' CONFIGURANDO SINCRONIZAÇÃO BIDIRECIONAL',
                    'Módulos carregados', 'Funções críticas', 'DEBUG FINAL', 'Carregando constantes',
                    'Inicializando sistema', ' Constantes carregadas', ' Carregando módulos',
                    ' Verificando sessão', ' Sessão encontrada', ' Sistema de shutdown',
                    ' Inicializando sistema', ' Display térmico atualizado',
                    ' ', ' Iniciando cálculos', ' Ganhos calculados',
                    ' Totais para', ' Tentando atualizar',
                    ' Salvando dados', ' Obras carregadas', ' Sala ainda não salva',
                    '  Coletando inputs', '  Estado da pressurização',
                    '  dados coletados', '  Seção encontrada',
                    ' VERIFICAÇÃO COMPLETA DA SALA', ' Título:  Encontrado',
                    ' TODOS OS ELEMENTOS ENCONTRADOS',
                    ' Máquina adicionada à sala', ' Procurando máquinas após clique',
                    ' Preenchendo campos', ' Encontradas máquinas', ' Preenchendo apenas a PRIMEIRA',
                    ' Preenchendo máquina', ' Tipo de máquina selecionado', ' Capacidade selecionada',
                    ' Tensão selecionada', ' Selecionando opções aleatórias', ' Encontrados checkboxes',
                    ' Opção selecionada', ' opções selecionadas aleatoriamente',
                    ' Botão Salvar Obra clicado', ' Alterando TODOS os valores', ' TODOS os valores alterados',
                    ' Chamando função original', ' SALVANDO OBRA pelo ID', ' Buscando obra com retry',
                    ' Obra encontrada na tentativa', ' REFERÊNCIA SALVA', ' Obra confirmada no DOM',
                    ' Construindo dados da obra', ' buildObraData INICIADA', ' Construindo dados da obra',
                    ' [EXTRACT EMPRESA]', ' [EXTRACT EMPRESA]', ' [EXTRACT EMPRESA]',
                    ' [EXTRACT EMPRESA]', ' [EXTRACT EMPRESA]', ' [EXTRACT EMPRESA]',
                    ' [EXTRACT EMPRESA]',
                    ' Encontrados projetos', ' Processando projeto', ' Encontradas salas',
                    ' Extraindo dados da sala', ' Inputs de climatização', ' Extraindo dados da máquina',
                    ' Máquina extraída', ' máquina(s) extraída(s)', ' Dados de capacidade',
                    ' ganhos térmicos', ' opções de instalação', ' Dados extraídos da sala',
                    ' Projeto processado', ' Projeto adicionado à obra', ' Dados da obra construídos',
                    ' VERIFICAÇÃO FINAL', ' VERIFICAÇÃO DE OBRA MELHORADA', ' SALVANDO COMO NOVA OBRA',
                    ' SALVANDO NOVA OBRA', ' Adicionando obra à sessão', ' NOVA OBRA SALVA',
                    ' Obra confirmada no DOM', ' Atualizando botão da obra', ' Botão atualizado para',
                    ' [HEADER] Chamando', ' [HEADER] Iniciando', ' [HEADER] Extraindo',
                    ' [HEADER] Dados extraídos', ' [HEADER] Chamando', ' Inicializando tooltip',
                    ' Tooltip inicializado', ' Header da obra atualizado', ' [EMPRESA] Interface atualizada',
                    ' [HEADER] Header atualizado', ' OBRA SALVA/ATUALIZADA',
                    ' Escondendo', ' Backup alterado no form'
                ]
            };

            this.originalConsole = {
                log: console.log,
                warn: console.warn,
                error: console.error,
                info: console.info,
                debug: console.debug
            };

            this.initialize();
        }

        initialize() {
            this.interceptConsole();
            this.registerLoggerCommands();

            if (this.config.announceCommands) {
                this.showLoggerCommands();
            }
        }

        interceptConsole() {
            const self = this;

            console.log = function (...args) {
                if (!self.config.enabled) {
                    self.originalConsole.log(...args);
                    return;
                }
                self.processLog('INFO', args);
            };

            console.info = function (...args) {
                if (!self.config.enabled) {
                    self.originalConsole.info(...args);
                    return;
                }
                self.processLog('INFO', args);
            };

            console.warn = function (...args) {
                if (!self.config.enabled) {
                    self.originalConsole.warn(...args);
                    return;
                }
                self.processLog('WARN', args);
            };

            console.error = function (...args) {
                if (!self.config.enabled) {
                    self.originalConsole.error(...args);
                    return;
                }
                self.processLog('ERROR', args);
            };

            console.debug = function (...args) {
                if (!self.config.enabled) {
                    self.originalConsole.debug(...args);
                    return;
                }
                self.processLog('DEBUG', args);
            };
        }

        processLog(level, args) {
            const message = args.map((arg) => stringifyLogArg(arg)).join(' ');

            if (level !== 'ERROR' && this.shouldSilence(message)) {
                return;
            }

            if (!this.shouldShow(level)) {
                return;
            }

            const icon = this.getIcon(level);
            const method = level === 'INFO' ? 'log' : level.toLowerCase();
            this.originalConsole[method](icon, ...args);
        }

        shouldSilence(message) {
            return this.config.silentPatterns.some((pattern) => message.includes(pattern));
        }

        shouldShow(level) {
            if (level === 'ERROR') {
                return true;
            }

            return this.levels[level] <= this.levels[this.config.globalLevel];
        }

        getIcon(level) {
            const icons = {
                ERROR: 'X',
                WARN: '!',
                INFO: 'i',
                DEBUG: '>'
            };

            return icons[level] || '-';
        }

        defineHiddenGlobal(name, value) {
            if (typeof window === 'undefined') {
                return;
            }

            Object.defineProperty(window, name, {
                value,
                configurable: true,
                writable: true,
                enumerable: false
            });
        }

        toggleFiltering(enable = null) {
            if (enable === null) {
                this.config.enabled = !this.config.enabled;
            } else {
                this.config.enabled = Boolean(enable);
            }

            if (this.isClientMode) {
                return this.config.enabled;
            }

            const status = this.config.enabled ? 'ATIVADO' : 'DESATIVADO';
            const behavior = this.config.enabled ? 'filtrados' : 'mostrados';
            this.originalConsole.log(
                `%cLogger ${status} - logs serao ${behavior}`,
                'color: #ffffff; background: #1976d2; padding: 4px 8px; border-radius: 4px; font-weight: bold;'
            );

            return this.config.enabled;
        }

        getStatus() {
            const status = {
                enabled: this.config.enabled,
                level: this.config.globalLevel,
                filteredPatterns: this.config.silentPatterns.length,
                mode: this.isClientMode ? 'client-stealth' : 'admin'
            };

            if (!this.isClientMode) {
                this.originalConsole.log('%cLogger status:', 'color: #1976d2; font-weight: bold;', status);
            }

            return status;
        }

        restoreConsole() {
            console.log = this.originalConsole.log;
            console.warn = this.originalConsole.warn;
            console.error = this.originalConsole.error;
            console.info = this.originalConsole.info;
            console.debug = this.originalConsole.debug;

            if (!this.isClientMode) {
                this.originalConsole.log(
                    '%cConsole original restaurado',
                    'color: #ffffff; background: #d32f2f; padding: 4px 8px; border-radius: 4px; font-weight: bold;'
                );
            }
        }

        registerLoggerCommands() {
            const api = {
                toggle: (enable = null) => this.toggleFiltering(enable),
                on: () => this.toggleFiltering(true),
                off: () => this.toggleFiltering(false),
                status: () => this.getStatus(),
                restore: () => this.restoreConsole(),
                instance: this
            };

            this.defineHiddenGlobal('__esiLogger', api);

            const debugNamespace = window.__esiDebug && typeof window.__esiDebug === 'object'
                ? { ...window.__esiDebug, logger: api }
                : { logger: api };

            this.defineHiddenGlobal('__esiDebug', debugNamespace);
            this.defineHiddenGlobal('toggleLogger', api.toggle);
            this.defineHiddenGlobal('loggerOn', api.on);
            this.defineHiddenGlobal('loggerOff', api.off);
            this.defineHiddenGlobal('getLoggerStatus', api.status);
            this.defineHiddenGlobal('restoreOriginalConsole', api.restore);
        }

        showLoggerCommands() {
            setTimeout(() => {
                this.originalConsole.log(
                    '%cFILTRO DE LOGS ATIVADO',
                    'color: #ffffff; background: #388e3c; padding: 3px 5px; border-radius: 4px; font-size: 14px;'
                );
                this.originalConsole.log('%cComandos disponiveis:', 'color: #1976d2; font-weight: bold;');
                this.originalConsole.log('   - toggleLogger()       - Alternar filtro de logs');
                this.originalConsole.log('   - loggerOn()           - Ativar filtro');
                this.originalConsole.log('   - loggerOff()          - Desativar filtro (mostrar tudo)');
                this.originalConsole.log('   - getLoggerStatus()    - Ver status atual');
                this.originalConsole.log('   - restoreOriginalConsole() - Remover filtros completamente');
                this.originalConsole.log('   - __esiLogger.status() - API discreta');
                this.originalConsole.log('');
            }, 100);
        }
    }

    return new SmartLogger(appConfig);
}
