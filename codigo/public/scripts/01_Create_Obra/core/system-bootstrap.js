const SYSTEM_BOOTSTRAP_ENDPOINT = '/api/runtime/system-bootstrap';

let systemBootstrapCache = null;
let systemBootstrapPromise = null;

function createEmptySystemPayload() {
    return {
        constants: {},
        machines: [],
        materials: {},
        banco_acessorios: {},
        dutos: [],
        tubos: [],
        ADM: [],
        administradores: [],
        empresas: []
    };
}

function normalizeSystemPayload(payload = {}) {
    const fallback = createEmptySystemPayload();

    return {
        ...fallback,
        ...payload,
        constants: payload?.constants && typeof payload.constants === 'object' ? payload.constants : fallback.constants,
        machines: Array.isArray(payload?.machines) ? payload.machines : fallback.machines,
        materials: payload?.materials && typeof payload.materials === 'object' ? payload.materials : fallback.materials,
        banco_acessorios: payload?.banco_acessorios && typeof payload.banco_acessorios === 'object'
            ? payload.banco_acessorios
            : fallback.banco_acessorios,
        dutos: Array.isArray(payload?.dutos) ? payload.dutos : fallback.dutos,
        tubos: Array.isArray(payload?.tubos) ? payload.tubos : fallback.tubos,
        ADM: Array.isArray(payload?.ADM) ? payload.ADM : fallback.ADM,
        administradores: Array.isArray(payload?.administradores) ? payload.administradores : fallback.administradores,
        empresas: Array.isArray(payload?.empresas) ? payload.empresas : fallback.empresas
    };
}

function createJsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

async function requestSystemBootstrap() {
    const response = await fetch(SYSTEM_BOOTSTRAP_ENDPOINT, {
        credentials: 'same-origin'
    });

    if (!response.ok) {
        throw new Error(`Erro HTTP ao carregar bootstrap do sistema: ${response.status}`);
    }

    const payload = await response.json();
    return normalizeSystemPayload(payload);
}

export async function loadSystemBootstrap(options = {}) {
    const forceReload = options === true || options.force === true;

    if (forceReload) {
        invalidateSystemBootstrap();
    }

    if (systemBootstrapCache) {
        return systemBootstrapCache;
    }

    if (!systemBootstrapPromise) {
        systemBootstrapPromise = requestSystemBootstrap()
            .then((payload) => {
                systemBootstrapCache = payload;
                systemBootstrapPromise = null;
                return payload;
            })
            .catch((error) => {
                systemBootstrapPromise = null;
                throw error;
            });
    }

    return systemBootstrapPromise;
}

export function invalidateSystemBootstrap() {
    systemBootstrapCache = null;
    systemBootstrapPromise = null;
}

function buildDutoTypes(payload) {
    return (payload.dutos || [])
        .map((duto) => ({
            value: duto.type || '',
            label: duto.type || '',
            descricao: duto.descricao || '',
            valor_base: duto.valor || 0
        }))
        .filter((item) => item.value)
        .sort((a, b) => a.label.localeCompare(b.label));
}

function buildDutoOpcionais(payload) {
    const opcionaisPorTipo = {};
    const todosOpcionais = [];
    const uniqueById = new Map();

    (payload.dutos || []).forEach((duto) => {
        const tipo = duto.type || '';
        const opcionais = Array.isArray(duto.opcionais) ? duto.opcionais : [];

        opcionaisPorTipo[tipo] = opcionais.map((opcional) => {
            const formatted = {
                id: opcional.id,
                nome: opcional.nome || '',
                value: opcional.value || 0,
                descricao: opcional.descricao || '',
                tipo_duto: tipo
            };

            if (formatted.id && !uniqueById.has(formatted.id)) {
                uniqueById.set(formatted.id, formatted);
            }

            todosOpcionais.push(formatted);
            return formatted;
        });
    });

    return {
        success: true,
        opcionais_por_tipo: opcionaisPorTipo,
        opcionais: Array.from(uniqueById.values()),
        count: todosOpcionais.length
    };
}

function buildPolegadas(payload) {
    return (payload.tubos || [])
        .map((tubo) => ({
            value: tubo.polegadas || '',
            label: `${tubo.polegadas || ''}''`,
            mm: tubo.mm || 0,
            valor: tubo.valor || 0
        }))
        .filter((item) => item.value);
}

function buildAcessorioTypes(payload) {
    return Object.keys(payload.banco_acessorios || {}).sort();
}

function buildAcessorioByType(payload, tipo) {
    const acessorio = payload.banco_acessorios?.[tipo];
    if (!acessorio) {
        return createJsonResponse({
            success: false,
            error: `Tipo de acessório '${tipo}' não encontrado`
        }, 404);
    }

    const valores = acessorio.valores_padrao && typeof acessorio.valores_padrao === 'object'
        ? acessorio.valores_padrao
        : {};
    const dimensoes = Object.keys(valores);
    const precos = Object.values(valores).filter((value) => typeof value === 'number');
    const precoMedio = precos.length
        ? precos.reduce((total, value) => total + value, 0) / precos.length
        : 0;

    return createJsonResponse({
        success: true,
        tipo,
        acessorio,
        estatisticas: {
            quantidade_dimensoes: dimensoes.length,
            dimensoes: dimensoes.slice(0, 10),
            preco_medio: Number(precoMedio.toFixed(2)),
            preco_min: precos.length ? Math.min(...precos) : 0,
            preco_max: precos.length ? Math.max(...precos) : 0
        }
    });
}

const SYSTEM_ROUTE_BUILDERS = {
    '/api/system-data': (payload) => payload,
    '/constants': (payload) => payload.constants || {},
    '/system-constants': (payload) => payload.constants || {},
    '/machines': (payload) => payload.machines || [],
    '/api/materials': (payload) => ({
        materials: payload.materials || {}
    }),
    '/api/dutos': (payload) => ({
        success: true,
        dutos: payload.dutos || [],
        count: (payload.dutos || []).length
    }),
    '/api/dutos/types': (payload) => {
        const types = buildDutoTypes(payload);
        return {
            success: true,
            types,
            dutos: payload.dutos || [],
            count: types.length
        };
    },
    '/api/dutos/opcionais': (payload) => buildDutoOpcionais(payload),
    '/api/tubos': (payload) => ({
        success: true,
        tubos: payload.tubos || [],
        count: (payload.tubos || []).length
    }),
    '/api/tubos/polegadas': (payload) => {
        const polegadas = buildPolegadas(payload);
        return {
            success: true,
            polegadas,
            count: polegadas.length
        };
    },
    '/api/acessorios': (payload) => ({
        success: true,
        acessorios: payload.banco_acessorios || {},
        count: Object.keys(payload.banco_acessorios || {}).length
    }),
    '/api/acessorios/types': (payload) => {
        const types = buildAcessorioTypes(payload);
        return {
            success: true,
            types,
            count: types.length
        };
    }
};

function shouldInvalidateSystemCache(method, pathname) {
    const upperMethod = String(method || 'GET').toUpperCase();
    if (upperMethod === 'GET') {
        return false;
    }

    return pathname.startsWith('/api/system-data/')
        || pathname === '/obras'
        || pathname.startsWith('/obras/')
        || pathname === '/api/system-data/save'
        || pathname === '/api/constants/save'
        || pathname === '/api/materials/save'
        || pathname === '/api/empresas/save'
        || pathname === '/api/machines/save'
        || pathname === '/api/machines/add'
        || pathname === '/api/machines/update'
        || pathname === '/api/machines/delete'
        || pathname === '/api/acessorios/add'
        || pathname === '/api/acessorios/update'
        || pathname === '/api/acessorios/delete'
        || pathname === '/api/dutos/add'
        || pathname === '/api/dutos/update'
        || pathname === '/api/dutos/delete'
        || pathname === '/api/tubos/add'
        || pathname === '/api/tubos/update'
        || pathname === '/api/tubos/delete'
        || pathname === '/api/system/apply-json';
}

export function installSystemFetchBridge() {
    if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
        return;
    }

    if (window.__systemFetchBridgeInstalled) {
        return;
    }

    const originalFetch = window.fetch.bind(window);

    window.fetch = async function systemFetchBridge(input, init) {
        const requestUrl = typeof input === 'string' ? input : input?.url;
        const requestMethod = init?.method || (typeof input !== 'string' ? input?.method : null) || 'GET';
        const normalizedUrl = new URL(requestUrl, window.location.origin);
        const pathname = normalizedUrl.pathname;

        if (String(requestMethod).toUpperCase() === 'GET') {
            if (pathname.startsWith('/api/acessorios/type/')) {
                const payload = await loadSystemBootstrap();
                const tipo = decodeURIComponent(pathname.split('/').pop() || '');
                return buildAcessorioByType(payload, tipo);
            }

            const routeBuilder = SYSTEM_ROUTE_BUILDERS[pathname];
            if (routeBuilder) {
                const payload = await loadSystemBootstrap();
                return createJsonResponse(routeBuilder(payload));
            }
        }

        const response = await originalFetch(input, init);

        if (shouldInvalidateSystemCache(requestMethod, pathname)) {
            invalidateSystemBootstrap();
        }

        return response;
    };

    window.__systemFetchBridgeInstalled = true;
    window.__systemOriginalFetch = originalFetch;
}

if (typeof window !== 'undefined') {
    if (window.__SYSTEM_BOOTSTRAP__) {
        systemBootstrapCache = normalizeSystemPayload(window.__SYSTEM_BOOTSTRAP__);
    }

    window.loadSystemBootstrap = loadSystemBootstrap;
    window.invalidateSystemBootstrap = invalidateSystemBootstrap;
    installSystemFetchBridge();
}
