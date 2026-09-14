/*
* ARQUIVO DE RENDERIZACAO DE salas
*/

import { ensureStringId } from '../../utils/id-generator.js';
import { ensureTableSectionExists } from './data-fillers.js';

function waitForNextFrame() {
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => resolve());
    });
}

function scheduleDeferredTask(task, { delay = 0, idle = false, timeout = 1000 } = {}) {
    const runTask = () => {
        if (idle && 'requestIdleCallback' in window) {
            window.requestIdleCallback(() => task(), { timeout });
            return;
        }

        window.requestAnimationFrame(() => task());
    };

    if (delay > 0) {
        window.setTimeout(runTask, delay);
        return;
    }

    runTask();
}

function renderRoomFromData(projectId, projectName, roomData, obraId = null, obraName = null) {
    const roomName = roomData.nome;
    const roomId = ensureStringId(roomData.id);

    console.log(` Renderizando sala: ${roomName} no projeto ${projectName}`, {
        obra: obraName,
        projectId,
        roomId,
        inputs: Object.keys(roomData.inputs || {}).length,
        maquinas: roomData.maquinas?.length || 0,
        capacidade: Object.keys(roomData.capacidade || {}).length,
        ganhosTermicos: Object.keys(roomData.ganhosTermicos || {}).length,
        acessorios: roomData.acessorios?.length || 0,
        dutos: roomData.dutos?.length || 0,
        conjuntosTubulacao: roomData.tubulacao?.conjuntos?.length || 0
    });

    (async () => {
        try {
            await waitForNextFrame();
            await createEmptyRoom(obraId, projectId, roomName, roomId);
            await waitForNextFrame();

            const roomElement = document.querySelector(`[data-room-id="${roomId}"]`);
            if (!roomElement) {
                console.error(` Elemento da sala ${roomId} nao encontrado apos criacao`);
                return;
            }

            scheduleDeferredTask(async () => {
                try {
                    const sectionsReady = await ensureAllRoomSections(roomElement);
                    if (!sectionsReady) {
                        console.error(` Falha ao criar secoes para ${roomName}`);
                        return;
                    }

                    console.log(` Todas as secoes criadas para ${roomName} - Iniciando preenchimento`);
                    await populateRoomData(roomElement, roomData);
                } catch (error) {
                    console.error(` Erro ao garantir secoes para ${roomName}:`, error);
                }
            }, { idle: true, timeout: 600 });
        } catch (error) {
            console.error(` Erro ao renderizar sala ${roomName}:`, error);
        }
    })();
}

async function populateRoomData(roomElement, roomData) {
    if (!roomElement || !roomData) {
        console.error(' Elemento da sala ou dados invalidos');
        return false;
    }

    const roomId = roomElement.dataset.roomId;
    const roomName = roomElement.dataset.roomName;

    if (!roomId || roomId === 'undefined' || roomId === 'null') {
        console.error(` Room ID invalido no populateRoomData: "${roomId}"`);
        return false;
    }

    console.log(` Preenchendo sala "${roomName}" (ID: ${roomId})`);

    try {
        const tableExists = ensureTableSectionExists(roomElement);
        if (!tableExists) {
            scheduleDeferredTask(() => {
                console.warn(` Tabela de inputs nao encontrada para ${roomName}, criando...`);
            }, { delay: 50 });
        }

        const roomTitle = roomElement.querySelector('.room-title');
        if (roomTitle && roomData.nome) {
            roomTitle.textContent = roomData.nome;
            console.log(` Titulo da sala atualizado: ${roomData.nome}`);
        }

        if (roomData.inputs) {
            console.log(` Preenchendo inputs de climatizacao para sala ${roomName}`);
            fillClimatizationInputs(roomElement, roomData.inputs);
        }

        if (roomData.ganhosTermicos) {
            console.log(` Preenchendo ganhos termicos para sala ${roomName}`);
            fillThermalGainsData(roomElement, roomData.ganhosTermicos);
        }

        if (roomData.capacidade) {
            console.log(` Preenchendo dados de capacidade para sala ${roomName}`);
            fillCapacityData(roomElement, roomData.capacidade);
        }

        if (roomData.ventilacao && Object.keys(roomData.ventilacao).length > 0) {
            console.log(` Preenchendo dados de ventilacao para sala ${roomName}`);
            if (typeof window.fillVentilacaoInputs === 'function') {
                window.fillVentilacaoInputs(roomElement, roomData.ventilacao);
                console.log(' Ventilacao preenchida');
            } else {
                console.error(' Funcao fillVentilacaoInputs nao disponivel no window');
            }
        }

        if (roomData.acessorios && Array.isArray(roomData.acessorios)) {
            console.log(` Preenchendo ${roomData.acessorios.length} acessorio(s) para sala ${roomName}`);
            if (typeof window.fillAcessoriosData === 'function') {
                window.fillAcessoriosData(roomElement, roomData.acessorios);
                console.log(' Acessorios preenchidos');
            } else {
                console.error(' Funcao fillAcessoriosData nao disponivel no window');
            }
        }

        if (roomData.dutos && Array.isArray(roomData.dutos)) {
            console.log(` Preenchendo ${roomData.dutos.length} duto(s) para sala ${roomName}`);
            if (typeof window.fillDutosData === 'function') {
                window.fillDutosData(roomElement, roomData.dutos);
                console.log(' Dutos preenchidos');
            } else {
                console.error(' Funcao fillDutosData nao disponivel no window');
            }
        }

        if (roomData.tubulacao && roomData.tubulacao.conjuntos && Array.isArray(roomData.tubulacao.conjuntos)) {
            console.log(` Preenchendo ${roomData.tubulacao.conjuntos.length} conjunto(s) de tubulacao para sala ${roomName}`);
            if (typeof window.fillTubulacaoData === 'function') {
                window.fillTubulacaoData(roomElement, roomData.tubulacao);
                console.log(' Tubulacao preenchida');
            } else {
                console.error(' Funcao fillTubulacaoData nao disponivel no window');
            }
        } else if (roomData.tubulacao) {
            console.warn(` Estrutura de tubulacao invalida ou vazia para sala ${roomName}:`, roomData.tubulacao);
        }

        if (roomData.maquinas && Array.isArray(roomData.maquinas)) {
            console.log(` Preenchendo ${roomData.maquinas.length} maquina(s) para sala ${roomName}`);
            try {
                // Executa hidratação de máquinas sem delays (await apenas se necessário)
                const success = await fillMachinesData(roomElement, roomData.maquinas);

                if (success) {
                    console.log(` Todas as maquinas preenchidas com sucesso para sala ${roomName}`);
                } else {
                    console.error(` Falha ao preencher maquinas para sala ${roomName}`);
                }
            } catch (error) {
                console.error(` Erro ao preencher maquinas para sala ${roomName}:`, error);
            }
        }

        console.log(` Sala "${roomName}" preenchida com sucesso`);
        return true;
    } catch (error) {
        console.error(` Erro ao preencher sala "${roomName}":`, error);
        return false;
    }
}

function populateRoomInputs(projectId, projectName, roomId, roomName, roomData, obraId, obraName) {
    const roomElement = document.querySelector(`[data-room-id="${roomId}"]`);
    if (roomElement) {
        populateRoomData(roomElement, roomData);
    } else {
        console.error(` Elemento da sala ${roomId} nao encontrado no DOM`);
    }
}

export {
    renderRoomFromData,
    populateRoomData,
    populateRoomInputs
};
