const TRANSITION_ID = 'esi-page-transition';
const TRANSITION_DURATION = 360;
const PRIMARY_ROUTES = new Set([
    '/obras/create',
    '/admin/obras/create',
    '/admin/obras/manage',
    '/admin/data'
]);
let transitionStarted = false;

function getTransitionLabel(pathname) {
    if (pathname === '/admin/data') return 'Abrindo edição de dados...';
    if (pathname === '/admin/obras/manage') return 'Abrindo gerenciamento de obras...';
    if (pathname === '/admin/obras/create') return 'Abrindo criação de obras...';
    if (pathname === '/obras/create') return 'Abrindo suas obras...';
    return 'Abrindo o sistema...';
}

function isInternalNavigation(targetUrl) {
    try {
        const currentUrl = new URL(window.location.href);
        const nextUrl = new URL(targetUrl, window.location.origin);
        const nextPath = nextUrl.pathname.replace(/\/$/, '') || '/';

        return nextUrl.origin === currentUrl.origin &&
            PRIMARY_ROUTES.has(nextPath) &&
            nextUrl.pathname !== currentUrl.pathname;
    } catch (error) {
        return false;
    }
}

function resolveNavigationTarget(target) {
    const link = target.closest?.('a[href]');
    if (link) {
        if (link.target || link.hasAttribute('download') || link.dataset.skipTransition === 'true') {
            return null;
        }

        return link.href;
    }

    const clickable = target.closest?.('[onclick]');
    const onclick = clickable?.getAttribute('onclick') || '';
    const hrefMatch = onclick.match(/window\.location\.href\s*=\s*['"]([^'"]+)['"]/i) ||
        onclick.match(/window\.location\.replace\(\s*['"]([^'"]+)['"]\s*\)/i);

    return hrefMatch ? new URL(hrefMatch[1], window.location.origin).toString() : null;
}

function ensureTransitionStyles() {
    if (document.getElementById(`${TRANSITION_ID}-styles`)) {
        return;
    }

    const style = document.createElement('style');
    style.id = `${TRANSITION_ID}-styles`;
    style.textContent = `
        html.esi-page-enter body {
            opacity: 0;
            transform: translateY(8px);
        }

        body {
            transition: opacity 260ms ease, transform 260ms ease;
        }

        .esi-page-transition {
            position: fixed;
            inset: 0;
            z-index: 300000;
            display: grid;
            place-items: center;
            background: rgba(247, 250, 252, 0.97);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            opacity: 0;
            pointer-events: none;
            transition: opacity 220ms ease;
        }

        .esi-page-transition.is-visible {
            opacity: 1;
            pointer-events: auto;
        }

        .esi-page-transition__content {
            display: grid;
            justify-items: center;
            gap: 14px;
            color: #334155;
            text-align: center;
        }

        .esi-page-transition__logo {
            width: 92px;
            height: 92px;
            object-fit: contain;
            animation: esi-page-transition-pulse 900ms ease-in-out infinite alternate;
        }

        .esi-page-transition__label {
            margin: 0;
            font-size: 0.9rem;
            letter-spacing: 0.02em;
        }

        .esi-page-transition__loader {
            width: 42px;
            height: 3px;
            overflow: hidden;
            background: #cbd5e1;
            border-radius: 999px;
        }

        .esi-page-transition__loader::after {
            display: block;
            width: 55%;
            height: 100%;
            content: '';
            background: #3156c9;
            border-radius: inherit;
            animation: esi-page-transition-loader 800ms ease-in-out infinite;
        }

        @keyframes esi-page-transition-pulse {
            from { transform: scale(0.94); opacity: 0.72; }
            to { transform: scale(1); opacity: 1; }
        }

        @keyframes esi-page-transition-loader {
            from { transform: translateX(-100%); }
            to { transform: translateX(190%); }
        }

        @media (prefers-reduced-motion: reduce) {
            html.esi-page-enter body,
            body {
                transition: none;
            }

            .esi-page-transition,
            .esi-page-transition__logo,
            .esi-page-transition__loader::after {
                animation: none;
                transition: none;
            }
        }
    `;
    document.head.appendChild(style);
}

function ensureTransitionElement() {
    let transition = document.getElementById(TRANSITION_ID);
    if (transition) {
        return transition;
    }

    transition = document.createElement('div');
    transition.id = TRANSITION_ID;
    transition.className = 'esi-page-transition';
    transition.setAttribute('aria-hidden', 'true');
    transition.innerHTML = `
        <div class="esi-page-transition__content" role="status" aria-live="polite">
            <img class="esi-page-transition__logo"
                src="https://esienergia.com.br/wp-content/uploads/2024/02/favicon5.png"
                alt="ESI Energia">
            <p class="esi-page-transition__label">Abrindo o sistema...</p>
            <div class="esi-page-transition__loader" aria-hidden="true"></div>
        </div>
    `;
    document.body.appendChild(transition);
    return transition;
}

export function showPageTransition(targetUrl) {
    if (transitionStarted || !isInternalNavigation(targetUrl)) {
        return false;
    }

    ensureTransitionStyles();
    const transition = ensureTransitionElement();
    const pathname = new URL(targetUrl, window.location.origin).pathname.replace(/\/$/, '') || '/';
    const label = transition.querySelector('.esi-page-transition__label');

    if (label) {
        label.textContent = getTransitionLabel(pathname);
    }

    transitionStarted = true;
    transition.classList.add('is-visible');
    transition.setAttribute('aria-hidden', 'false');
    return true;
}

function bindPageTransitionNavigation() {
    document.addEventListener('click', (event) => {
        if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
        ) {
            return;
        }

        const targetUrl = resolveNavigationTarget(event.target);
        if (!isInternalNavigation(targetUrl)) {
            return;
        }

        showPageTransition(targetUrl);

        if (window.location.pathname.replace(/\/$/, '') === '/admin/data') {
            return;
        }

        event.preventDefault();
        window.setTimeout(() => {
            window.location.href = targetUrl;
        }, TRANSITION_DURATION);
    }, true);
}

function initializePageTransition() {
    const currentPath = window.location.pathname.replace(/\/$/, '') || '/';
    if (!PRIMARY_ROUTES.has(currentPath)) {
        return;
    }

    ensureTransitionStyles();
    document.documentElement.classList.add('esi-page-enter');
    window.requestAnimationFrame(() => {
        document.documentElement.classList.remove('esi-page-enter');
    });
    ensureTransitionElement();
    bindPageTransitionNavigation();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    initializePageTransition();
}
