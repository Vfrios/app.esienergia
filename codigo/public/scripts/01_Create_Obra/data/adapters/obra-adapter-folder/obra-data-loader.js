// obra-data-loader.js
import {
    prepararDadosEmpresaNaObra
} from '../../empresa-system/empresa-data-extractor.js'
import { isClientMode, matchesEmpresaContext } from '../../../core/config.js'
import {
    getObraCatalogRuntimeData,
    getSessionObrasRuntimeData,
    getSessionScopedObrasRuntimeData
} from '../../../core/runtime-data.js'

/**
 * Remove todas as obras base do container HTML
 */
function removeBaseObraFromHTML() {
    const obrasContainer = document.getElementById('projects-container')
    if (!obrasContainer) return

    const existingObras = obrasContainer.querySelectorAll('.obra-block')
    existingObras.forEach((obra) => obra.remove())
}

function filterObrasForCurrentMode(obras, { logRejected = false } = {}) {
    if (!Array.isArray(obras)) return []

    return obras.filter((obra) => {
        if (matchesEmpresaContext(obra)) {
            return true
        }

        if (logRejected) {
            console.warn(`[LOAD OBRAS] Obra ${obra.id} ignorada por nao pertencer a empresa autenticada`)
        }

        return false
    })
}

async function resolveObrasToLoad() {
    if (window.location.pathname.replace(/\/$/, '') === '/admin/obras/manage') {
        const catalogoCompleto = await getObraCatalogRuntimeData()
        console.log(`[LOAD OBRAS] Gerenciamento: ${catalogoCompleto.length} obra(s) no catalogo completo`)
        return catalogoCompleto
    }

    if (isClientMode()) {
        const todasObras = await getObraCatalogRuntimeData()
        const obrasDaEmpresa = filterObrasForCurrentMode(todasObras)

        console.log(`[LOAD OBRAS] Modo client: ${obrasDaEmpresa.length} obra(s) encontradas para a empresa autenticada`)
        return obrasDaEmpresa
    }

    const [sessionData, todasObras] = await Promise.all([
        getSessionObrasRuntimeData(),
        getSessionScopedObrasRuntimeData()
    ])

    const obraIds = sessionData.obras || []
    if (obraIds.length === 0 || todasObras.length === 0) {
        return []
    }

    const lookup = {}
    todasObras.forEach((obra) => {
        lookup[obra.id] = obra
        lookup[obra.id.toString()] = obra
    })

    const obrasParaCarregar = []
    for (let i = 0; i < obraIds.length; i++) {
        const obra = lookup[obraIds[i]] || lookup[obraIds[i].toString()]
        if (obra) {
            obrasParaCarregar.push(obra)
        }
    }

    console.log(`[LOAD OBRAS] Modo admin: ${obrasParaCarregar.length} obra(s) encontradas na sessao`)
    return filterObrasForCurrentMode(obrasParaCarregar, { logRejected: true })
}

async function fetchFullObraById(obraId) {
    const response = await fetch(`/obras/${encodeURIComponent(obraId)}`)
    if (!response.ok) {
        throw new Error(`Falha ao carregar obra ${obraId}: ${response.status}`)
    }

    return response.json()
}

async function ensureFullObraData(obraData) {
    if (!obraData || typeof obraData !== 'object') {
        throw new Error('Obra invalida para carregamento')
    }

    if (Array.isArray(obraData.projetos)) {
        return obraData
    }

    if (!obraData.id) {
        throw new Error('Obra sem ID para carregamento completo')
    }

    return fetchFullObraById(obraData.id)
}

/**
 * Carrega obras do servidor
 */
async function loadObrasFromServer() {
    console.log('[LOAD OBRAS] Iniciando carregamento com suporte a empresa...')
    const startTime = performance.now()

    try {
        const obrasPermitidas = await resolveObrasToLoad()

        if (obrasPermitidas.length === 0) {
            return 0
        }

        removeBaseObraFromHTML()

        if (window.createEmptyObra) {
            await Promise.allSettled(
                obrasPermitidas.map((obra) =>
                    window.createEmptyObra(obra.nome, obra.id, true)
                )
            )
        }

        await new Promise((resolve) => setTimeout(resolve, 5))

        const loadPromises = obrasPermitidas.map((obra) =>
            loadSingleObra(obra).catch((error) => {
                console.warn(`[LOAD OBRAS] Falha ao carregar obra ${obra.id}:`, error.message)
                return 0
            })
        )

        const results = await Promise.allSettled(loadPromises)
        const successCount = results.reduce(
            (count, result) => (result.status === 'fulfilled' ? count + result.value : count),
            0
        )

        const endTime = performance.now()
        console.log(`[LOAD OBRAS] ${successCount} obra(s) carregadas em ${Math.round(endTime - startTime)}ms`)
        return successCount
    } catch (error) {
        console.error('[LOAD OBRAS] Erro ao carregar obras:', error)
        return 0
    }
}

/**
 * Carrega uma ou multiplas obras com suporte completo a empresa
 */
async function loadSingleObra(obraData) {
    if (Array.isArray(obraData)) {
        const obrasPermitidas = filterObrasForCurrentMode(obraData)

        console.log(`[LOAD OBRAS] Carregando ${obrasPermitidas.length} obra(s) em paralelo...`)

        if (obrasPermitidas.length === 0) return 0

        const startTime = performance.now()

        if (window.createEmptyObra) {
            await Promise.allSettled(
                obrasPermitidas.map((obra) => window.createEmptyObra(obra.nome, obra.id, true))
            )
        }

        await new Promise((resolve) => setTimeout(resolve, 5))

        const promises = obrasPermitidas.map(async (obra) => {
            try {
                const obraCompleta = await ensureFullObraData(obra)
                const element = document.querySelector(`[data-obra-id="${obra.id}"]`)
                if (!element) {
                    console.warn(`[LOAD OBRAS] Elemento nao encontrado para obra ${obra.id}`)
                    return false
                }

                if (window.populateObraData) {
                    await window.populateObraData(obraCompleta)
                }

                await prepararDadosEmpresaNaObra(obraCompleta, element)
                return true
            } catch (error) {
                console.warn(`[LOAD OBRAS] Erro ao carregar obra ${obra.id}:`, error.message)
                return false
            }
        })

        const results = await Promise.allSettled(promises)
        const successCount = results.filter((result) => result.status === 'fulfilled' && result.value).length

        const endTime = performance.now()
        console.log(`[LOAD OBRAS] ${successCount}/${obrasPermitidas.length} obra(s) em ${Math.round(endTime - startTime)}ms`)

        return successCount
    }

    try {
        if (!matchesEmpresaContext(obraData)) {
            console.warn(`[LOAD OBRAS] Obra ${obraData?.id} bloqueada para a empresa autenticada`)
            return 0
        }

        const obraId = obraData.id.toString()
        const obraNome = obraData.nome || `Obra ${obraId}`
        const obraCompleta = await ensureFullObraData(obraData)

        console.log(`[LOAD OBRAS] Carregando obra individual: "${obraNome}"`)

        let element = document.querySelector(`[data-obra-id="${obraId}"]`)

        if (!element && window.createEmptyObra) {
            await window.createEmptyObra(obraNome, obraId)
            await new Promise((resolve) => setTimeout(resolve, 5))
            element = document.querySelector(`[data-obra-id="${obraId}"]`)
        }

        if (!element) {
            console.error(`[LOAD OBRAS] Elemento da obra "${obraNome}" nao encontrado`)
            return 0
        }

        if (window.populateObraData) {
            await window.populateObraData(obraCompleta)
        }

        await prepararDadosEmpresaNaObra(obraCompleta, element)

        return 1
    } catch (error) {
        console.error('[LOAD OBRAS] Erro ao carregar obra individual:', error)
        return 0
    }
}

// Funcao para debug
async function debugLoadObras() {
    console.log('[DEBUG] Iniciando debug do carregamento...')

    console.log('[DEBUG] Funcoes disponiveis:', {
        createEmptyObra: typeof window.createEmptyObra,
        populateObraData: typeof window.populateObraData,
        prepararDadosEmpresaNaObra: typeof window.prepararDadosEmpresaNaObra
    })

    try {
        const response = await fetch('/obras')
        if (response.ok) {
            const obras = await response.json()
            console.log(`[DEBUG] ${obras.length} obra(s) retornadas por /obras`)

            obras.forEach((obra, index) => {
                console.log(`   ${index + 1}. ${obra.nome} (${obra.id}):`, {
                    empresaSigla: obra.empresaSigla,
                    empresaNome: obra.empresaNome,
                    empresa_id: obra.empresa_id
                })
            })
        }
    } catch (error) {
        console.error('[DEBUG] Erro ao buscar obras:', error)
    }
}

if (typeof window !== 'undefined') {
    window.loadObrasFromServer = loadObrasFromServer
    window.removeBaseObraFromHTML = removeBaseObraFromHTML
    window.loadSingleObra = loadSingleObra
}

export {
    removeBaseObraFromHTML,
    loadObrasFromServer,
    loadSingleObra,
    debugLoadObras
}
