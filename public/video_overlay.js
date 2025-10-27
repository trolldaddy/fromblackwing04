const leftPanel = document.getElementById('leftPanel');
const rightPanel = document.getElementById('rightPanel');
const toggleButton = document.getElementById('toggleButton');
const toggleButtonTextEl = toggleButton
    ? toggleButton.querySelector('.toggle-button-text')
    : null;
const toggleButtonLogoEl = toggleButton
    ? toggleButton.querySelector('.toggle-button-logo')
    : null;
const globalTooltip = document.getElementById('globalTooltip');
const bodyElement = document.body;
const layoutMode = bodyElement && bodyElement.dataset
    ? bodyElement.dataset.overlayLayout || ''
    : '';
const isMobileLayout = layoutMode === 'mobile';
const mobileInfoContainer = document.getElementById('mobileInfo');
const mobileInfoTitleEl = document.getElementById('mobileInfoTitle');
const mobileInfoBodyEl = document.getElementById('mobileInfoBody');
const townsfolkTitleEl = document.getElementById('townsfolkTitle');
const outsiderTitleEl = document.getElementById('outsiderTitle');
const minionTitleEl = document.getElementById('minionTitle');
const demonTitleEl = document.getElementById('demonTitle');
const jinxTitleEl = document.getElementById('jinxTitle');
const townsfolkGrid = document.getElementById('townsfolkGrid');
const outsiderGrid = document.getElementById('outsiderGrid');
const minionGrid = document.getElementById('minionGrid');
const demonGrid = document.getElementById('demonGrid');
const jinxGrid = document.getElementById('jinxGrid');
const firstNightList = document.getElementById('firstNightList');
const otherNightList = document.getElementById('otherNightList');
const mobileTabButtons = isMobileLayout
    ? Array.from(document.querySelectorAll('[data-mobile-tab-button]'))
    : [];
const mobileTabPanels = isMobileLayout
    ? Array.from(document.querySelectorAll('[data-mobile-tab-panel]'))
    : [];
const mobileTabPanelsContainer = isMobileLayout
    ? document.getElementById('mobileTabPanels')
    : null;
const mobileTabPanelsTrack = isMobileLayout
    ? document.getElementById('mobileTabPanelsTrack')
    : null;
const mobileTabSwipeSurface = isMobileLayout ? mobileTabPanelsContainer : null;
const mobileTabNavButtons = isMobileLayout
    ? Array.from(document.querySelectorAll('[data-mobile-nav-target]'))
    : [];
const mobileNavCenterButton = isMobileLayout
    ? document.getElementById('mobileNavCenterButton')
    : null;
const supportsPointerSwipe = Boolean(
    isMobileLayout && typeof window !== 'undefined' && 'PointerEvent' in window
);

const CATEGORY_DEFAULT_NAMES = {
    townsfolk: '鎮民',
    outsider: '外來者',
    minion: '爪牙',
    demon: '惡魔',
    'a jinxed': '相剋&特殊規則'
};

const MOBILE_DEFAULT_INFO_TITLE = '劇本資訊';
const MOBILE_DEFAULT_INFO_BODY = '點擊角色以查看詳細能力與提醒。';
const MOBILE_FIRST_NIGHT_INFO = {
    title: '首夜行動',
    body: '依序參考下方行動列表。'
};
const MOBILE_OTHER_NIGHT_INFO = {
    title: '次夜行動',
    body: '請依照下方次夜順序進行。'
};

let mobileInfoDefaultTitle = MOBILE_DEFAULT_INFO_TITLE;
let mobileInfoDefaultBody = MOBILE_DEFAULT_INFO_BODY;
const MOBILE_TAB_IDS = ['firstNight', 'roles', 'otherNight'];
const MOBILE_DEFAULT_TAB = 'roles';
let activeMobileTabId = isMobileLayout ? MOBILE_DEFAULT_TAB : null;
let mobileTabTouchStartX = null;
let mobileTabTouchStartY = null;
let mobileTabIsSwiping = false;
let mobileTabIgnoreSwipe = false;
let mobileTabSwipeDeltaPercent = 0;
let mobileTabSwipePointerId = null;
const MOBILE_SWIPE_ACTIVATION_THRESHOLD_PX = 3;
const MOBILE_SWIPE_VERTICAL_REJECTION_RATIO = 2.5; // Allow more vertical drift before cancelling a swipe
const MOBILE_SWIPE_COMPLETION_THRESHOLD_PERCENT = 30;

function scrollMobileViewToTop({ smooth = true } = {}) {
    if (!isMobileLayout) {
        return;
    }

    const behavior = smooth ? 'smooth' : 'auto';

    const tryScroll = target => {
        if (!target) {
            return;
        }

        if (typeof target.scrollTo === 'function') {
            try {
                target.scrollTo({ top: 0, behavior });
                return true;
            } catch (err) {
                try {
                    target.scrollTo(0, 0);
                    return true;
                } catch (fallbackErr) {
                    // Ignore fallback errors.
                }
            }
        }

        if (typeof target.scrollTop === 'number') {
            target.scrollTop = 0;
            return true;
        }

        return false;
    };

    let scrolled = false;

    if (typeof window !== 'undefined') {
        scrolled = tryScroll(window) || scrolled;
    }

    if (typeof document !== 'undefined') {
        scrolled = tryScroll(document.documentElement) || scrolled;
        scrolled = tryScroll(document.body) || scrolled;
    }

    if (!scrolled) {
        tryScroll(leftPanel);
    }
}

const TOGGLE_BUTTON_PRIMARY_LABEL = '顯示劇本';
const TOGGLE_BUTTON_SHORTCUT_LABEL = '(快捷鍵:Ｃ)';
const TOGGLE_BUTTON_LABEL_HTML = [
    `<span class="toggle-button-main">${TOGGLE_BUTTON_PRIMARY_LABEL}</span>`,
    '<br />',
    `<span class="toggle-button-shortcut">${TOGGLE_BUTTON_SHORTCUT_LABEL}</span>`
].join('');
const TOGGLE_BUTTON_ARIA_LABEL = '顯示或隱藏劇本（快捷鍵 C）';

function normalizeNightOrderArray(value) {
    if (!Array.isArray(value)) {
        return null;
    }

    const filtered = value
        .filter(id => typeof id === 'string' && id)
        .map(id => id.trim())
        .filter(id => id.length > 0);

    return filtered.length > 0 ? filtered : null;
}

const categoryElements = {
    townsfolk: { title: townsfolkTitleEl, grid: townsfolkGrid },
    outsider: { title: outsiderTitleEl, grid: outsiderGrid },
    minion: { title: minionTitleEl, grid: minionGrid },
    demon: { title: demonTitleEl, grid: demonGrid },
    'a jinxed': { title: jinxTitleEl, grid: jinxGrid }
};

function updateMobileInfo(title, body) {
    if (!isMobileLayout || !mobileInfoContainer) {
        return;
    }

    const safeTitle = typeof title === 'string' && title.trim()
        ? title.trim()
        : mobileInfoDefaultTitle;
    const safeBody = typeof body === 'string' && body.trim()
        ? body.trim()
        : mobileInfoDefaultBody;

    if (mobileInfoTitleEl) {
        mobileInfoTitleEl.textContent = safeTitle;
    }

    if (mobileInfoBodyEl) {
        mobileInfoBodyEl.textContent = safeBody;
    }
}

function resetMobileInfo(meta) {
    if (!isMobileLayout || !mobileInfoContainer) {
        return;
    }

    const metaTitle = typeof meta?.name === 'string' && meta.name.trim()
        ? meta.name.trim()
        : MOBILE_DEFAULT_INFO_TITLE;

    const metaDescription = typeof meta?.description === 'string' && meta.description.trim()
        ? meta.description.trim()
        : MOBILE_DEFAULT_INFO_BODY;

    mobileInfoDefaultTitle = metaTitle;
    mobileInfoDefaultBody = metaDescription;

    if (mobileNavCenterButton) {
        mobileNavCenterButton.textContent = metaTitle || '角色列表';
    }

    updateMobileInfo(metaTitle, metaDescription);
}

function normalizeMobileTabId(tabId) {
    if (typeof tabId !== 'string') {
        return MOBILE_DEFAULT_TAB;
    }

    const trimmed = tabId.trim();
    if (MOBILE_TAB_IDS.includes(trimmed)) {
        return trimmed;
    }

    return MOBILE_DEFAULT_TAB;
}

function updateMobileTabTrackPosition(options = {}) {
    if (!isMobileLayout || !mobileTabPanelsTrack) {
        return;
    }

    mobileTabPanelsTrack.classList.remove('is-swiping');

    const immediate = options.immediate === true;
    const index = getTabIndex(activeMobileTabId);
    const translatePercent = -index * 100;

    if (immediate) {
        const previousTransition = mobileTabPanelsTrack.style.transition;
        mobileTabPanelsTrack.style.transition = 'none';
        mobileTabPanelsTrack.style.transform = `translate3d(${translatePercent}%, 0, 0)`;
        // Force a reflow so the transition reset takes effect before restoring.
        mobileTabPanelsTrack.getBoundingClientRect();
        mobileTabPanelsTrack.style.transition = previousTransition || '';
    } else {
        mobileTabPanelsTrack.style.transition = '';
        mobileTabPanelsTrack.style.transform = `translate3d(${translatePercent}%, 0, 0)`;
    }
}

function activateMobileTab(tabId, options = {}) {
    if (!isMobileLayout) {
        return;
    }

    const normalized = normalizeMobileTabId(tabId);
    if (!options.force && normalized === activeMobileTabId) {
        return;
    }

    activeMobileTabId = normalized;

    mobileTabButtons.forEach(button => {
        const buttonTabId = button?.dataset?.mobileTabButton || '';
        const isActive = buttonTabId === normalized;
        if (isActive) {
            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');
            button.tabIndex = 0;
        } else {
            button.classList.remove('active');
            button.setAttribute('aria-selected', 'false');
            button.tabIndex = -1;
        }
    });

    mobileTabPanels.forEach(panel => {
        const panelTabId = panel?.dataset?.mobileTabPanel || '';
        const isActive = panelTabId === normalized;
        panel.classList.toggle('active', isActive);
        panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
    });

    updateMobileTabTrackPosition({ immediate: options.force === true });
    updateMobileTabNavButtons();
    updateMobileInfoForActiveTab();

    const shouldScrollToTop = normalized === 'firstNight' || normalized === 'otherNight';
    const allowScrollOnForce = options.allowScrollOnForce === true;
    if (shouldScrollToTop && (options.force !== true || allowScrollOnForce)) {
        scrollMobileViewToTop({ smooth: options.force !== true });
    }
}

function getTabIndex(tabId) {
    return MOBILE_TAB_IDS.indexOf(normalizeMobileTabId(tabId));
}

function focusMobileTabByIndex(index) {
    if (!isMobileLayout) {
        return;
    }

    const clamped = Math.min(Math.max(index, 0), MOBILE_TAB_IDS.length - 1);
    const targetId = MOBILE_TAB_IDS[clamped];
    const targetButton = mobileTabButtons.find(
        button => button?.dataset?.mobileTabButton === targetId
    );

    if (targetButton) {
        targetButton.focus();
        activateMobileTab(targetId);
    }
}

function switchMobileTabByOffset(offset) {
    if (!isMobileLayout || !offset) {
        return;
    }

    const currentIndex = getTabIndex(activeMobileTabId);
    const targetIndex = Math.min(
        Math.max(currentIndex + offset, 0),
        MOBILE_TAB_IDS.length - 1
    );

    if (targetIndex !== currentIndex) {
        activateMobileTab(MOBILE_TAB_IDS[targetIndex]);
    }
}

function initializeMobileTabs() {
    if (!isMobileLayout) {
        return;
    }

    activateMobileTab(activeMobileTabId || MOBILE_DEFAULT_TAB, { force: true });

    mobileTabButtons.forEach((button, index) => {
        if (!button) {
            return;
        }

        button.addEventListener('click', () => {
            activateMobileTab(button.dataset.mobileTabButton);
        });

        button.addEventListener('keydown', event => {
            switch (event.key) {
                case 'ArrowLeft':
                case 'ArrowUp':
                    focusMobileTabByIndex(index - 1);
                    event.preventDefault();
                    break;
                case 'ArrowRight':
                case 'ArrowDown':
                    focusMobileTabByIndex(index + 1);
                    event.preventDefault();
                    break;
                case 'Home':
                    focusMobileTabByIndex(0);
                    event.preventDefault();
                    break;
                case 'End':
                    focusMobileTabByIndex(MOBILE_TAB_IDS.length - 1);
                    event.preventDefault();
                    break;
                default:
                    break;
            }
        });
    });

    if (mobileTabPanelsContainer && mobileTabSwipeSurface) {
        const resetMobileSwipeState = () => {
            mobileTabTouchStartX = null;
            mobileTabTouchStartY = null;
            mobileTabIsSwiping = false;
            mobileTabIgnoreSwipe = false;
            mobileTabSwipeDeltaPercent = 0;
            mobileTabSwipePointerId = null;

            if (mobileTabPanelsTrack) {
                mobileTabPanelsTrack.classList.remove('is-swiping');
                mobileTabPanelsTrack.style.transition = '';
            }
        };

        const finalizeMobileSwipe = () => {
            if (!mobileTabPanelsTrack) {
                resetMobileSwipeState();
                return;
            }

            mobileTabPanelsTrack.classList.remove('is-swiping');
            mobileTabPanelsTrack.style.transition = '';

            if (!mobileTabIsSwiping || mobileTabIgnoreSwipe) {
                updateMobileTabTrackPosition({ immediate: true });
                resetMobileSwipeState();
                return;
            }

            const currentIndex = getTabIndex(activeMobileTabId);
            const lastIndex = MOBILE_TAB_IDS.length - 1;
            let targetIndex = currentIndex;

            if (Math.abs(mobileTabSwipeDeltaPercent) >= MOBILE_SWIPE_COMPLETION_THRESHOLD_PERCENT) {
                if (mobileTabSwipeDeltaPercent < 0 && currentIndex < lastIndex) {
                    targetIndex = currentIndex + 1;
                } else if (mobileTabSwipeDeltaPercent > 0 && currentIndex > 0) {
                    targetIndex = currentIndex - 1;
                }
            }

            if (targetIndex !== currentIndex) {
                activateMobileTab(MOBILE_TAB_IDS[targetIndex]);
            } else {
                updateMobileTabTrackPosition();
            }

            resetMobileSwipeState();
        };

        const beginMobileSwipe = (clientX, clientY, pointerId = null) => {
            mobileTabTouchStartX = clientX;
            mobileTabTouchStartY = clientY;
            mobileTabIsSwiping = false;
            mobileTabIgnoreSwipe = false;
            mobileTabSwipeDeltaPercent = 0;
            mobileTabSwipePointerId = pointerId;
        };

        const processMobileSwipeMove = (clientX, clientY) => {
            if (mobileTabTouchStartX === null || mobileTabTouchStartY === null) {
                return false;
            }

            const deltaX = clientX - mobileTabTouchStartX;
            const deltaY = clientY - mobileTabTouchStartY;

            if (!mobileTabIsSwiping) {
                const absDeltaX = Math.abs(deltaX);
                const absDeltaY = Math.abs(deltaY);

                if (absDeltaX < MOBILE_SWIPE_ACTIVATION_THRESHOLD_PX) {
                    return false;
                }

                if (absDeltaY > absDeltaX * MOBILE_SWIPE_VERTICAL_REJECTION_RATIO) {
                    mobileTabIgnoreSwipe = true;
                    return false;
                }

                mobileTabIsSwiping = true;
                if (mobileTabPanelsTrack) {
                    mobileTabPanelsTrack.style.transition = 'none';
                    mobileTabPanelsTrack.classList.add('is-swiping');
                }
            }

            if (mobileTabIgnoreSwipe || !mobileTabPanelsTrack) {
                return mobileTabIsSwiping;
            }

            const containerWidth = mobileTabPanelsContainer.clientWidth || 1;
            let deltaPercent = (deltaX / containerWidth) * 100;
            const currentIndex = getTabIndex(activeMobileTabId);
            const lastIndex = MOBILE_TAB_IDS.length - 1;
            const minBound = currentIndex === lastIndex ? 0 : -100;
            const maxBound = currentIndex === 0 ? 0 : 100;

            if (deltaPercent < minBound) {
                deltaPercent = minBound;
            } else if (deltaPercent > maxBound) {
                deltaPercent = maxBound;
            }

            mobileTabSwipeDeltaPercent = deltaPercent;
            const base = -currentIndex * 100;
            mobileTabPanelsTrack.style.transform = `translate3d(${base + deltaPercent}%, 0, 0)`;

            return true;
        };

        if (supportsPointerSwipe && mobileTabSwipeSurface) {
            mobileTabSwipeSurface.addEventListener('pointerdown', event => {
                if (event.pointerType === 'mouse' && event.button !== 0) {
                    return;
                }

                if (mobileTabSwipePointerId !== null) {
                    return;
                }

                beginMobileSwipe(event.clientX, event.clientY, event.pointerId);

                if (typeof mobileTabSwipeSurface.setPointerCapture === 'function') {
                    try {
                        mobileTabSwipeSurface.setPointerCapture(event.pointerId);
                    } catch (captureError) {
                        // Ignore capture errors (e.g., non-primary pointers).
                    }
                }
            });

            mobileTabSwipeSurface.addEventListener(
                'pointermove',
                event => {
                    if (mobileTabSwipePointerId !== event.pointerId) {
                        return;
                    }

                    const handled = processMobileSwipeMove(event.clientX, event.clientY);
                    if (handled && event.cancelable) {
                        event.preventDefault();
                    }
                },
                { passive: false }
            );

            const handlePointerEnd = event => {
                if (mobileTabSwipePointerId !== event.pointerId) {
                    return;
                }

                finalizeMobileSwipe();

                if (typeof mobileTabSwipeSurface.releasePointerCapture === 'function') {
                    try {
                        mobileTabSwipeSurface.releasePointerCapture(event.pointerId);
                    } catch (releaseError) {
                        // Ignore release errors; capture may not have been set.
                    }
                }
            };

            mobileTabSwipeSurface.addEventListener('pointerup', handlePointerEnd);
            mobileTabSwipeSurface.addEventListener('pointercancel', handlePointerEnd);
            mobileTabSwipeSurface.addEventListener('pointerleave', handlePointerEnd);
        } else if (mobileTabSwipeSurface) {
            mobileTabSwipeSurface.addEventListener(
                'touchstart',
                event => {
                    if (event.touches.length !== 1) {
                        resetMobileSwipeState();
                        return;
                    }

                    const touch = event.touches[0];

                    beginMobileSwipe(touch.clientX, touch.clientY, touch.identifier);
                },
                { passive: true }
            );

            mobileTabSwipeSurface.addEventListener(
                'touchmove',
                event => {
                    if (mobileTabSwipePointerId === null) {
                        return;
                    }

                    const relevantTouch = Array.from(event.touches || []).find(
                        touch => touch.identifier === mobileTabSwipePointerId
                    );

                    if (!relevantTouch) {
                        return;
                    }

                    const handled = processMobileSwipeMove(
                        relevantTouch.clientX,
                        relevantTouch.clientY
                    );

                    if (handled && event.cancelable) {
                        event.preventDefault();
                    }
                },
                { passive: false }
            );

            const handleTouchEnd = event => {
                if (mobileTabSwipePointerId === null) {
                    return;
                }

                const stillActive = Array.from(event.touches || []).some(
                    touch => touch.identifier === mobileTabSwipePointerId
                );

                if (!stillActive) {
                    finalizeMobileSwipe();
                }
            };

            mobileTabSwipeSurface.addEventListener('touchend', handleTouchEnd);
            mobileTabSwipeSurface.addEventListener('touchcancel', handleTouchEnd);
        }
    }

    if (mobileTabNavButtons.length > 0) {
        mobileTabNavButtons.forEach(button => {
            const targetId = button?.dataset?.mobileNavTarget;
            if (!targetId) {
                return;
            }

            button.addEventListener('click', () => {
                if (button.getAttribute('aria-disabled') === 'true') {
                    return;
                }
                activateMobileTab(targetId);
            });
        });
        updateMobileTabNavButtons();
    }
}

function updateMobileTabNavButtons() {
    if (!isMobileLayout || mobileTabNavButtons.length === 0) {
        return;
    }

    mobileTabNavButtons.forEach(button => {
        const targetId = button?.dataset?.mobileNavTarget;
        if (!targetId) {
            return;
        }

        const isSameTab = normalizeMobileTabId(targetId) === activeMobileTabId;
        button.setAttribute('aria-disabled', isSameTab ? 'true' : 'false');
    });
}

function updateMobileInfoForActiveTab() {
    if (!isMobileLayout || !mobileInfoContainer) {
        return;
    }

    switch (activeMobileTabId) {
        case 'firstNight':
            updateMobileInfo(MOBILE_FIRST_NIGHT_INFO.title, MOBILE_FIRST_NIGHT_INFO.body);
            break;
        case 'otherNight':
            updateMobileInfo(MOBILE_OTHER_NIGHT_INFO.title, MOBILE_OTHER_NIGHT_INFO.body);
            break;
        case 'roles':
        default:
            updateMobileInfo(mobileInfoDefaultTitle, mobileInfoDefaultBody);
            break;
    }
}

function applyToggleButtonLabel() {
    if (!toggleButton) {
        return;
    }

    if (toggleButtonTextEl) {
        toggleButtonTextEl.innerHTML = TOGGLE_BUTTON_LABEL_HTML;
    } else {
        toggleButton.textContent = `${TOGGLE_BUTTON_PRIMARY_LABEL}\n${TOGGLE_BUTTON_SHORTCUT_LABEL}`;
        toggleButton.style.whiteSpace = 'pre-line';
    }
}

let isVisible = false;
let twitchAuthorized = false;
let lastAppliedSignature = null;
let suppressToggleClick = false;
let toggleKeyboardHandlerAttached = false;
let lastAppliedToggleLogo = '';

applyToggleButtonLabel();
initializeMobileTabs();

if (isMobileLayout) {
    window.addEventListener('resize', () => {
        updateMobileTabTrackPosition({ immediate: true });
    });

    isVisible = true;
    if (leftPanel) {
        leftPanel.classList.add('show');
    }
    if (rightPanel) {
        rightPanel.classList.add('show');
    }
    if (toggleButton) {
        toggleButton.style.display = 'none';
    }
}

const urlParams = new URLSearchParams(window.location.search);
const rawAssetsBase = urlParams.get('assetsBase') || '';

let assetBaseUrl = null;
if (rawAssetsBase) {
    try {
        assetBaseUrl = new URL(rawAssetsBase, window.location.href);
    } catch (err) {
        console.warn('指定的 assetsBase 無法解析，將改用預設來源:', err);
        assetBaseUrl = null;
    }
}

function resolveAssetUrl(path) {
    if (!path) {
        return '';
    }

    try {
        const absoluteUrl = new URL(path);
        if (absoluteUrl.protocol === 'http:' || absoluteUrl.protocol === 'https:') {
            return path;
        }
    } catch (err) {
        // Ignore parse errors; the path is relative.
    }

    const normalizedPath = path.replace(/^\/+/, '');

    if (!assetBaseUrl) {
        return normalizedPath;
    }

    try {
        return new URL(normalizedPath, assetBaseUrl).toString();
    } catch (err) {
        console.warn('組合資源 URL 時發生錯誤，將改用原始路徑:', err);
        return normalizedPath;
    }
}

async function decompressBase64WithCache(base64) {
    if (typeof base64 !== 'string' || !base64) {
        return '';
    }

    const cacheKey = `$default:${base64}`;

    if (decompressCache.has(cacheKey)) {
        return decompressCache.get(cacheKey);
    }

    const helper = window.CompressionHelper;
    if (!helper || typeof helper.decompressFromStorableString !== 'function') {
        console.error('[Compression] 找不到 decompressFromStorableString，compression.js 可能未載入');
        return Promise.reject(new Error('瀏覽器不支援解壓縮功能'));
    }

    const request = new Promise((resolve, reject) => {
        try {
            const result = helper.decompressFromStorableString(base64);
            decompressCache.set(cacheKey, result);
            resolve(result);
        } catch (err) {
            decompressCache.delete(cacheKey);
            reject(err);
        }
    });

    decompressCache.set(cacheKey, request);
    return request;
}


const DEFAULT_SCRIPT = 'trouble_brewing.json';
const LOCAL_STORAGE_CONFIG_KEY = 'botc_overlay_last_config_v1';
const LOCAL_STORAGE_SCRIPT_KEY = 'botc_overlay_last_script_v1';

const decompressCache = new Map();
const IMAGE_PLACEHOLDER_REGEX = /^~(\d+)~(.+)/;

let referenceDataPromise = null;

const TEAM_ALIASES = {
    townsfolk: 'townsfolk',
    townfolk: 'townsfolk',
    outsiders: 'outsider',
    outsider: 'outsider',
    minions: 'minion',
    minion: 'minion',
    demons: 'demon',
    demon: 'demon',
    fabled: 'a jinxed',
    fable: 'a jinxed',
    fables: 'a jinxed',
    'a jinxed': 'a jinxed',
    'a_jinxed': 'a jinxed',
    jinxed: 'a jinxed',
    jinx: 'a jinxed'
};

const CHINESE_TEAM_ALIASES = {
    鎮民: 'townsfolk',
    镇民: 'townsfolk',
    外來者: 'outsider',
    外来者: 'outsider',
    爪牙: 'minion',
    惡魔: 'demon',
    恶魔: 'demon',
    相剋: 'a jinxed',
    相克: 'a jinxed',
    傳奇: 'a jinxed',
    传奇: 'a jinxed',
    傳說: 'a jinxed',
    传说: 'a jinxed',
    特殊規則: 'a jinxed',
    特殊规则: 'a jinxed',
    特殊: 'a jinxed'
};

function normalizeTeam(rawTeam, rawChineseTeam) {
    if (rawTeam) {
        const key = String(rawTeam).trim().toLowerCase();
        if (key in TEAM_ALIASES) {
            return TEAM_ALIASES[key];
        }
    }

    if (rawChineseTeam) {
        const key = String(rawChineseTeam).trim();
        if (key in CHINESE_TEAM_ALIASES) {
            return CHINESE_TEAM_ALIASES[key];
        }
    }

    return null;
}

function clamp(value, min, max) {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
}

function normalizeImageUrl(raw) {
    if (!raw) {
        return '';
    }

    if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) {
        if (raw.startsWith('//')) {
            return `${window.location.protocol}${raw}`;
        }
        return raw;
    }

    return resolveAssetUrl(raw);
}

function expandImagePlaceholder(image, bases) {
    if (typeof image !== 'string' || !image) {
        return image;
    }

    const match = IMAGE_PLACEHOLDER_REGEX.exec(image);
    if (!match) {
        return image;
    }

    const index = Number(match[1]);
    const suffix = match[2] || '';

    if (!Array.isArray(bases) || !Number.isInteger(index) || index < 0 || index >= bases.length) {
        return image;
    }

    const base = bases[index];
    if (typeof base !== 'string' || !base) {
        return image;
    }

    return `${base}${suffix}`;
}

function showTooltipForElement(element, text, direction) {
    if (!globalTooltip) {
        return;
    }

    const tooltipText = text || '（沒有能力資訊）';
    globalTooltip.textContent = tooltipText;
    globalTooltip.style.display = 'block';

    const rect = element.getBoundingClientRect();
    const tooltipWidth = globalTooltip.offsetWidth;
    const horizontalPadding = 10;
    const offsetY = rect.top + window.scrollY;

    let offsetX;
    if (direction === 'left') {
        offsetX = Math.max(horizontalPadding, rect.left - tooltipWidth - horizontalPadding);
    } else {
        offsetX = Math.min(
            window.innerWidth - tooltipWidth - horizontalPadding,
            rect.right + horizontalPadding
        );
    }

    globalTooltip.style.left = `${offsetX}px`;
    globalTooltip.style.top = `${offsetY}px`;
}

function hideTooltip() {
    if (globalTooltip) {
        globalTooltip.style.display = 'none';
    }
}

function attachTooltip(element, text, direction) {
    if (!element) {
        return;
    }

    if (isMobileLayout) {
        return;
    }

    const tooltipText = text || '（沒有能力資訊）';
    element.addEventListener('mouseenter', () => {
        showTooltipForElement(element, tooltipText, direction);
    });
    element.addEventListener('mouseleave', hideTooltip);
}

function parseActionOrder(raw) {
    if (raw === null || raw === undefined) {
        return null;
    }

    if (typeof raw === 'string' && raw.trim() === '') {
        return null;
    }

    const value = Number(raw);
    if (!Number.isFinite(value) || value === 0) {
        return null;
    }

    return value;
}

function renderOrderList(container, entries, options = {}) {
    if (!container) {
        return;
    }

    container.innerHTML = '';

    const sorted = entries
        .filter(entry => entry && typeof entry.value === 'number')
        .sort((a, b) => a.value - b.value);

    const suppressMobileInfo = Boolean(options?.suppressMobileInfo);

    sorted.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'order-item';

        const iconWrapper = document.createElement('div');
        iconWrapper.className = 'order-icon';

        if (entry.image) {
            const img = document.createElement('img');
            img.src = entry.image;
            img.alt = entry.name;
            iconWrapper.appendChild(img);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'order-icon-placeholder';
            const fallbackText = entry.placeholder || (entry.name ? entry.name.charAt(0) : '★');
            placeholder.textContent = fallbackText;
            iconWrapper.appendChild(placeholder);
        }

        const nameSpan = document.createElement('span');
        nameSpan.className = 'order-name';
        nameSpan.textContent = entry.name;

        item.appendChild(iconWrapper);
        item.appendChild(nameSpan);

        if (isMobileLayout && mobileInfoContainer && !suppressMobileInfo) {
            const clickTitle = typeof options.titleFormatter === 'function'
                ? options.titleFormatter(entry)
                : entry.name;
            const clickBody = typeof entry.tooltip === 'string' && entry.tooltip.trim()
                ? entry.tooltip.trim()
                : '（沒有提醒）';

            item.addEventListener('click', () => {
                updateMobileInfo(clickTitle, clickBody);
            });
        }

        container.appendChild(item);
    });
}

function getReferenceMap() {
    if (!referenceDataPromise) {
        const referenceListPath = 'new_EVERY_SINGLE_ROLE_with_chinese_abilities.json';
        const referenceListUrl = assetBaseUrl
            ? new URL(referenceListPath, assetBaseUrl).toString()
            : referenceListPath;
        referenceDataPromise = fetch(referenceListUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(list => {
                const map = new Map();
                if (Array.isArray(list)) {
                    list.forEach(item => {
                        if (item && item.id) {
                            map.set(item.id, item);
                        }
                    });
                }
                return map;
            })
            .catch(err => {
                console.error('載入角色資料參考表失敗:', err);
                return new Map();
            });
    }

    return referenceDataPromise;
}

function updateCategoryTitles(meta) {
    const metaNames = meta || {};
    const pickName = (...candidates) => {
        for (const candidate of candidates) {
            if (typeof candidate === 'string' && candidate.trim()) {
                return candidate.trim();
            }
        }
        return '';
    };
    const withPrefix = (name, prefix) => {
        const trimmed = typeof name === 'string' ? name.trim() : '';
        if (!trimmed) {
            return `${prefix}${trimmed}`;
        }
        return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`;
    };

    const townsfolkName =
        pickName(metaNames.townsfolkName, metaNames.townsfolk, CATEGORY_DEFAULT_NAMES.townsfolk)
        || CATEGORY_DEFAULT_NAMES.townsfolk;
    const outsiderName =
        pickName(metaNames.outsidersName, metaNames.outsider, CATEGORY_DEFAULT_NAMES.outsider)
        || CATEGORY_DEFAULT_NAMES.outsider;
    const minionName =
        pickName(metaNames.minionsName, metaNames.minion, CATEGORY_DEFAULT_NAMES.minion)
        || CATEGORY_DEFAULT_NAMES.minion;
    const demonName =
        pickName(metaNames.demonsName, metaNames.demon, CATEGORY_DEFAULT_NAMES.demon)
        || CATEGORY_DEFAULT_NAMES.demon;
    const specialTitle =
        pickName(
            metaNames.specialRulesName,
            metaNames.specialName,
            metaNames['a jinxedName'],
            metaNames['a jinxed'],
            metaNames.jinxName,
            metaNames.jinx,
            metaNames.fabledName,
            metaNames.fabled,
            CATEGORY_DEFAULT_NAMES['a jinxed']
        ) || CATEGORY_DEFAULT_NAMES['a jinxed'];

    const titleMap = {
        townsfolk: withPrefix(townsfolkName, '善良陣營：'),
        outsider: withPrefix(outsiderName, '善良陣營：'),
        minion: withPrefix(minionName, '邪惡陣營：'),
        demon: withPrefix(demonName, '邪惡陣營：'),
        'a jinxed': specialTitle
    };

    Object.entries(categoryElements).forEach(([key, { title }]) => {
        if (title) {
            title.textContent = titleMap[key] || CATEGORY_DEFAULT_NAMES[key] || '';
        }
    });
}

function updateToggleButtonAppearance(meta) {
    if (!toggleButton || isMobileLayout) {
        return;
    }

    applyToggleButtonLabel();
    toggleButton.setAttribute('aria-label', TOGGLE_BUTTON_ARIA_LABEL);
    toggleButton.title = TOGGLE_BUTTON_ARIA_LABEL;

    const rawLogo = meta && typeof meta.logo === 'string' ? meta.logo.trim() : '';
    const resolvedLogoUrl = rawLogo ? normalizeImageUrl(rawLogo) : '';

    if (!resolvedLogoUrl || !toggleButtonLogoEl) {
        toggleButton.classList.remove('toggle-button--with-logo');
        if (toggleButtonLogoEl) {
            toggleButtonLogoEl.style.display = 'none';
            toggleButtonLogoEl.src = '';
            toggleButtonLogoEl.onload = null;
            toggleButtonLogoEl.onerror = null;
        }
        lastAppliedToggleLogo = '';
        return;
    }

    if (resolvedLogoUrl === lastAppliedToggleLogo && toggleButton.classList.contains('toggle-button--with-logo')) {
        toggleButtonLogoEl.style.display = 'block';
        return;
    }

    toggleButton.classList.remove('toggle-button--with-logo');
    toggleButtonLogoEl.style.display = 'none';
    toggleButtonLogoEl.onload = null;
    toggleButtonLogoEl.onerror = null;

    const handleLoad = () => {
        toggleButtonLogoEl.onload = null;
        toggleButtonLogoEl.onerror = null;
        toggleButtonLogoEl.style.display = 'block';
        toggleButton.classList.add('toggle-button--with-logo');
        lastAppliedToggleLogo = resolvedLogoUrl;
    };

    const handleError = () => {
        toggleButtonLogoEl.onload = null;
        toggleButtonLogoEl.onerror = null;
        toggleButtonLogoEl.style.display = 'none';
        toggleButtonLogoEl.src = '';
        toggleButton.classList.remove('toggle-button--with-logo');
        lastAppliedToggleLogo = '';
    };

    toggleButtonLogoEl.onload = handleLoad;
    toggleButtonLogoEl.onerror = handleError;
    toggleButtonLogoEl.src = resolvedLogoUrl;
}

function togglePanels() {
    isVisible = !isVisible;
    if (leftPanel) {
        leftPanel.classList.toggle('show', isVisible);
    }
    if (rightPanel) {
        rightPanel.classList.toggle('show', isVisible);
    }
    if (!isVisible) {
        hideTooltip();
    }
}

function shouldIgnoreToggleShortcutTarget(target) {
    if (!target) {
        return false;
    }

    if (target.isContentEditable) {
        return true;
    }

    const tagName = target.tagName;
    if (!tagName) {
        return false;
    }

    switch (tagName.toLowerCase()) {
        case 'input':
        case 'textarea':
        case 'select':
        case 'button':
            return true;
        default:
            return false;
    }
}

function handleToggleShortcut(event) {
    if (event.key !== 'c' && event.key !== 'C') {
        return;
    }

    if (shouldIgnoreToggleShortcutTarget(event.target)) {
        return;
    }

    togglePanels();
}

function initializeToggleButtonControls() {
    if (!toggleButton || isMobileLayout) {
        return;
    }

    if (!toggleKeyboardHandlerAttached) {
        window.addEventListener('keydown', handleToggleShortcut);
        toggleKeyboardHandlerAttached = true;
    }

    if (toggleButton.dataset.dragInitialized === '1') {
        return;
    }

    let dragPointerId = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let dragWidth = 0;
    let dragHeight = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragMovedDuringPointer = false;

    const endDrag = event => {
        if (dragPointerId === null || event.pointerId !== dragPointerId) {
            return;
        }

        try {
            toggleButton.releasePointerCapture(dragPointerId);
        } catch (err) {
            // Ignore release failures.
        }

        toggleButton.classList.remove('toggle-button--dragging');
        dragPointerId = null;

        if (dragMovedDuringPointer) {
            suppressToggleClick = true;
        }

        dragMovedDuringPointer = false;
    };

    toggleButton.addEventListener('pointerdown', event => {
        if (event.button && event.button !== 0) {
            return;
        }

        dragPointerId = event.pointerId;

        const rect = toggleButton.getBoundingClientRect();
        dragOffsetX = event.clientX - rect.left;
        dragOffsetY = event.clientY - rect.top;
        dragWidth = rect.width;
        dragHeight = rect.height;
        dragStartX = event.clientX;
        dragStartY = event.clientY;
        dragMovedDuringPointer = false;

        toggleButton.classList.add('toggle-button--dragging');

        try {
            toggleButton.setPointerCapture(dragPointerId);
        } catch (err) {
            // Ignore capture failures (e.g., non-primary buttons).
        }

        suppressToggleClick = false;
        event.preventDefault();
    });

    toggleButton.addEventListener('pointermove', event => {
        if (dragPointerId === null || event.pointerId !== dragPointerId) {
            return;
        }

        const proposedLeft = event.clientX - dragOffsetX;
        const proposedTop = event.clientY - dragOffsetY;
        const maxLeft = Math.max(0, window.innerWidth - dragWidth);
        const maxTop = Math.max(0, window.innerHeight - dragHeight);
        const left = clamp(proposedLeft, 0, maxLeft);
        const top = clamp(proposedTop, 0, maxTop);

        if (!dragMovedDuringPointer) {
            const dx = Math.abs(event.clientX - dragStartX);
            const dy = Math.abs(event.clientY - dragStartY);
            if (dx > 3 || dy > 3) {
                dragMovedDuringPointer = true;
            }
        }

        toggleButton.style.left = `${left}px`;
        toggleButton.style.top = `${top}px`;
        toggleButton.style.right = 'auto';
        toggleButton.style.bottom = 'auto';
        toggleButton.style.transform = 'none';

        event.preventDefault();
    });

    const finalizeDrag = event => {
        if (dragPointerId !== null && event.pointerId === dragPointerId && dragMovedDuringPointer) {
            event.preventDefault();
        }
        endDrag(event);
    };

    toggleButton.addEventListener('pointerup', finalizeDrag);
    toggleButton.addEventListener('pointercancel', finalizeDrag);

    toggleButton.addEventListener('click', event => {
        if (suppressToggleClick) {
            suppressToggleClick = false;
            event.preventDefault();
            return;
        }

        togglePanels();
    });

    toggleButton.dataset.dragInitialized = '1';
}

initializeToggleButtonControls();

async function resolveCustomScript(config, resolvedScript) {
    if (typeof resolvedScript === 'string' && resolvedScript) return resolvedScript;
    if (!config || typeof config !== 'object') return '';

    // 🟦 新增分段支援：合併 global 段
    if (config.hasGlobalPart) {
        try {
            const globalStr = window.Twitch?.ext?.configuration?.global?.content || '{}';
            const globalData = JSON.parse(globalStr);
            const merged = (config.compressedBase64 || '') + (globalData.compressedBase64 || '');
            return await decompressBase64WithCache(merged);
        } catch (err) {
            console.warn('解析或合併 global 段失敗，改嘗試 broadcaster 段:', err);
        }
    }

    // 🟩 單段壓縮
    if (typeof config.compressedBase64 === 'string' && config.compressedBase64.trim()) {
        try {
            return await decompressBase64WithCache(config.compressedBase64);
        } catch (err) {
            console.warn('單段解壓失敗，改嘗試未壓縮資料:', err);
        }
    }

    return '';
}

function computeConfigSignature(config, resolvedScript) {
    if (!config || typeof config !== 'object') return 'default';

    const selectedScript = config.selectedScript || null;
    const scriptVersion = config.scriptVersion || config._timestamp || null;
    const scriptHash = config.scriptHash || null;

    // 原始 JSON 長度：以 customJsonLength 為主，沒有時才用解壓後字串長度
    const customLength =
        typeof config.customJsonLength === 'number'
            ? config.customJsonLength
            : (typeof resolvedScript === 'string' ? resolvedScript.length : null);

    const hasGlobalPart = !!config.hasGlobalPart;

    // 只輸出目前存在且必要的欄位
    const firstNightOrder = normalizeNightOrderArray(config.firstNight);
    const otherNightOrder = normalizeNightOrderArray(config.otherNight);

    return JSON.stringify({
        selectedScript,
        scriptVersion,
        scriptHash,
        customLength,
        hasGlobalPart,
        firstNight: firstNightOrder,
        otherNight: otherNightOrder
    });
}

function prepareConfigForStorage(config) {
    // 基本防呆
    if (!config || typeof config !== 'object') return null;

    // 只拷貝「需要用來判斷是否變更」的欄位
    const stored = {
        // 共同欄位
        selectedScript: config.selectedScript || '',
        _timestamp: typeof config._timestamp === 'number' ? config._timestamp : null,

        // 版本/簽章相關（上傳端已先計算好，不要在這裡再推導）
        scriptVersion: typeof config.scriptVersion === 'number' ? config.scriptVersion : (config._timestamp || null),
        scriptHash: config.scriptHash || null,

        // 自訂劇本才有意義的欄位（供 overlay 計算簽章用）
        customName: config.customName || '',
        customJsonLength: typeof config.customJsonLength === 'number' ? config.customJsonLength : null,

        // 是否有分段（broadcaster + global）
        hasGlobalPart: !!config.hasGlobalPart
    };

    const normalizedFirstNight = normalizeNightOrderArray(config.firstNight);
    const normalizedOtherNight = normalizeNightOrderArray(config.otherNight);

    if (normalizedFirstNight) {
        stored.firstNight = [...normalizedFirstNight];
    }

    if (normalizedOtherNight) {
        stored.otherNight = [...normalizedOtherNight];
    }

    // 內建劇本：移除自訂劇本專屬欄位
    if (stored.selectedScript !== '__custom__') {
        delete stored.customName;
        delete stored.scriptHash;
        delete stored.customJsonLength;
        delete stored.hasGlobalPart;
        delete stored.firstNight;
        delete stored.otherNight;
    }

    return stored;
}

function loadStoredViewerState() {
    try {
        const configStr = window.localStorage?.getItem(LOCAL_STORAGE_CONFIG_KEY);
        if (!configStr) {
            return null;
        }

        const config = JSON.parse(configStr);
        const scriptSource = window.localStorage?.getItem(LOCAL_STORAGE_SCRIPT_KEY) || null;
        return { config, scriptSource };
    } catch (err) {
        console.warn('載入最近的覆蓋設定時發生錯誤:', err);
        return null;
    }
}

function persistViewerState(config, scriptSource) {
    try {
        if (!config) {
            window.localStorage?.removeItem(LOCAL_STORAGE_CONFIG_KEY);
            window.localStorage?.removeItem(LOCAL_STORAGE_SCRIPT_KEY);
            return;
        }

        const storedConfig = prepareConfigForStorage(config);
        if (storedConfig) {
            window.localStorage?.setItem(LOCAL_STORAGE_CONFIG_KEY, JSON.stringify(storedConfig));
        }

        if (typeof scriptSource === 'string' && scriptSource.trim()) {
            window.localStorage?.setItem(LOCAL_STORAGE_SCRIPT_KEY, scriptSource);
        } else {
            window.localStorage?.removeItem(LOCAL_STORAGE_SCRIPT_KEY);
        }
    } catch (err) {
        console.warn('儲存最近覆蓋設定至本機時發生錯誤:', err);
    }
}

async function loadRolesFromList(roleList) {
    if (!Array.isArray(roleList)) {
        throw new Error('角色資料格式不正確');
    }

    let meta = null;
    let imageBases = null;
    const playableRoles = [];

    roleList.forEach(entry => {
        if (!entry || typeof entry !== 'object') {
            return;
        }

        if (entry.id === '_meta') {
            meta = entry;
            if (Array.isArray(entry.imageBases)) {
                imageBases = entry.imageBases.filter(base => typeof base === 'string' && base);
            }
            return;
        }

        if (entry.id) {
            const normalizedRole = { ...entry };
            if (imageBases) {
                normalizedRole.image = expandImagePlaceholder(normalizedRole.image, imageBases);
            }
            playableRoles.push(normalizedRole);
        }
    });

    updateCategoryTitles(meta);
    updateToggleButtonAppearance(meta);
    resetMobileInfo(meta);

    const referenceMap = await getReferenceMap();

    const metaProvidesFirstNight = Array.isArray(meta?.firstNight);
    const metaProvidesOtherNight = Array.isArray(meta?.otherNight);
    const firstNightOrder = metaProvidesFirstNight
        ? meta.firstNight.filter(id => typeof id === 'string' && id)
        : [];
    const otherNightOrder = metaProvidesOtherNight
        ? meta.otherNight.filter(id => typeof id === 'string' && id)
        : [];
    const useFirstNightOrder = firstNightOrder.length > 0;
    const useOtherNightOrder = otherNightOrder.length > 0;

    Object.values(categoryElements).forEach(({ grid }) => {
        if (grid) {
            grid.innerHTML = '';
        }
    });

    if (firstNightList) {
        firstNightList.innerHTML = '';
    }

    if (otherNightList) {
        otherNightList.innerHTML = '';
    }

    hideTooltip();

    const roleDetails = new Map();

    playableRoles.forEach(role => {
        if (!role || !role.id) {
            return;
        }

        const reference = (role.id && referenceMap.get(role.id)) || null;
        const combined = { ...(reference || {}), ...role };
        const normalizedTeam = normalizeTeam(
            combined.team,
            combined.sch_team || reference?.sch_team
        );

        const displayName = combined.name ?? reference?.name_zh ?? reference?.name ?? role.id;
        const ability = (typeof combined.ability === 'string' && combined.ability.trim())
            ? combined.ability
            : (reference?.ability || '');
        const imageUrl = normalizeImageUrl(combined.image ?? reference?.image ?? '');
        const firstNightReminder =
            typeof combined.firstNightReminder === 'string' && combined.firstNightReminder.trim()
                ? combined.firstNightReminder.trim()
                : '';
        const otherNightReminder =
            typeof combined.otherNightReminder === 'string' && combined.otherNightReminder.trim()
                ? combined.otherNightReminder.trim()
                : '';

        roleDetails.set(role.id, {
            name: displayName,
            image: imageUrl,
            firstNightReminder,
            otherNightReminder,
            firstNightValue: parseActionOrder(combined.firstNight),
            otherNightValue: parseActionOrder(combined.otherNight)
        });

        if (!normalizedTeam || !categoryElements[normalizedTeam]) {
            return;
        }

        const tooltipDirection = normalizedTeam === 'townsfolk' ? 'right' : 'left';

        const container = document.createElement('div');
        container.className = 'role';

        const img = document.createElement('img');
        img.src = imageUrl;
        img.alt = displayName;
        container.appendChild(img);

        const label = document.createElement('div');
        label.className = 'role-label';
        label.textContent = displayName;
        container.appendChild(label);

        const tooltipText = ability || '（沒有能力資訊）';
        if (isMobileLayout && mobileInfoContainer) {
            container.addEventListener('click', () => {
                updateMobileInfo(displayName, tooltipText);
            });
        } else {
            attachTooltip(container, tooltipText, tooltipDirection);
        }

        categoryElements[normalizedTeam].grid.appendChild(container);
    });

    const resolveOrderDetails = roleId => {
        if (!roleId) {
            return null;
        }

        if (roleDetails.has(roleId)) {
            return roleDetails.get(roleId);
        }

        const reference = referenceMap.get(roleId);
        if (!reference) {
            return null;
        }

        const fallbackDetail = {
            name: reference.name_zh || reference.name || roleId,
            image: normalizeImageUrl(reference.image || ''),
            firstNightReminder: typeof reference.firstNightReminder === 'string'
                ? reference.firstNightReminder.trim()
                : '',
            otherNightReminder: typeof reference.otherNightReminder === 'string'
                ? reference.otherNightReminder.trim()
                : '',
            firstNightValue: parseActionOrder(reference.firstNight),
            otherNightValue: parseActionOrder(reference.otherNight)
        };

        roleDetails.set(roleId, fallbackDetail);
        return fallbackDetail;
    };

    const firstNightEntries = [];
    const otherNightEntries = [];

    const unresolvedFirstNightIds = [];
    const unresolvedOtherNightIds = [];

    if (useFirstNightOrder) {
        firstNightOrder.forEach((roleId, index) => {
            const details = resolveOrderDetails(roleId);
            if (!details) {
                unresolvedFirstNightIds.push(roleId);
                firstNightEntries.push({
                    value: index,
                    name: roleId,
                    image: '',
                    placeholder: roleId ? roleId.charAt(0).toUpperCase() : '？',
                    tooltip: '（找不到角色資料）'
                });
                return;
            }

            firstNightEntries.push({
                value: index,
                name: details.name,
                image: details.image,
                tooltip: details.firstNightReminder || '（沒有提醒）'
            });
        });
    }

    if (!useFirstNightOrder || firstNightEntries.length === 0) {
        roleDetails.forEach(details => {
            if (details.firstNightValue !== null) {
                firstNightEntries.push({
                    value: details.firstNightValue,
                    name: details.name,
                    image: details.image,
                    tooltip: details.firstNightReminder || '（沒有提醒）'
                });
            }
        });
    } else if (unresolvedFirstNightIds.length > 0) {
        console.warn(
            '[Overlay] 找不到以下首夜行動順序中的角色，已忽略：',
            unresolvedFirstNightIds
        );
    }

    if (useOtherNightOrder) {
        otherNightOrder.forEach((roleId, index) => {
            const details = resolveOrderDetails(roleId);
            if (!details) {
                unresolvedOtherNightIds.push(roleId);
                otherNightEntries.push({
                    value: index,
                    name: roleId,
                    image: '',
                    placeholder: roleId ? roleId.charAt(0).toUpperCase() : '？',
                    tooltip: '（找不到角色資料）'
                });
                return;
            }

            otherNightEntries.push({
                value: index,
                name: details.name,
                image: details.image,
                tooltip: details.otherNightReminder || '（沒有提醒）'
            });
        });
    }

    if (!useOtherNightOrder || otherNightEntries.length === 0) {
        roleDetails.forEach(details => {
            if (details.otherNightValue !== null) {
                otherNightEntries.push({
                    value: details.otherNightValue,
                    name: details.name,
                    image: details.image,
                    tooltip: details.otherNightReminder || '（沒有提醒）'
                });
            }
        });
    } else if (unresolvedOtherNightIds.length > 0) {
        console.warn(
            '[Overlay] 找不到以下次夜行動順序中的角色，已忽略：',
            unresolvedOtherNightIds
        );
    }

    const firstNightTitleFormatter = entry => `${entry.name}（首夜行動）`;
    const otherNightTitleFormatter = entry => `${entry.name}（次夜行動）`;

    renderOrderList(firstNightList, firstNightEntries, {
        titleFormatter: firstNightTitleFormatter,
        suppressMobileInfo: true
    });
    renderOrderList(otherNightList, otherNightEntries, {
        titleFormatter: otherNightTitleFormatter,
        suppressMobileInfo: true
    });

    if (isMobileLayout) {
        activateMobileTab(activeMobileTabId || MOBILE_DEFAULT_TAB, { force: true });
    }
}

async function loadDefaultScript() {
    const defaultScriptUrl = resolveAssetUrl(`Allscript/${DEFAULT_SCRIPT}`);

    try {
        const data = await fetch(defaultScriptUrl).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        });
        await loadRolesFromList(data);
    } catch (err) {
        console.error('載入預設劇本失敗:', err);
    }
}

async function loadScriptByName(scriptFileName) {
    const scriptUrl = resolveAssetUrl(`Allscript/${scriptFileName}`);

    try {
        const data = await fetch(scriptUrl).then(response => {
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        });
        await loadRolesFromList(data);
    } catch (err) {
        console.warn(`載入指定劇本失敗 (${scriptFileName})，改用預設劇本。`, err);
        await loadDefaultScript();
    }
}

async function applyConfig(config, options = {}) {
    const { force = false, resolvedScript = null, allowDefault = true } = options;

    const signature = computeConfigSignature(config, resolvedScript);
    if (!force && signature === lastAppliedSignature) {
        return { applied: false, scriptSource: null };
    }

    if (!config || typeof config !== 'object') {
        if (!allowDefault) {
            return { applied: false, scriptSource: null };
        }

        await loadDefaultScript();
        lastAppliedSignature = 'default';
        return { applied: true, scriptSource: null };
    }

    if (config.selectedScript === '__custom__') {
        let scriptSource = '';
        try {
            scriptSource = await resolveCustomScript(config, resolvedScript);
        } catch (err) {
            console.error('解壓縮自訂劇本失敗，改用預設劇本:', err);
            if (allowDefault) {
                await loadDefaultScript();
                lastAppliedSignature = 'default';
                return { applied: true, scriptSource: null };
            }
            return { applied: false, scriptSource: null };
        }

        if (!scriptSource) {
            console.warn('自訂劇本為空，改用預設劇本');
            if (allowDefault) {
                await loadDefaultScript();
                lastAppliedSignature = 'default';
                return { applied: true, scriptSource: null };
            }
            return { applied: false, scriptSource: null };
        }

        try {
            const customList = JSON.parse(scriptSource);
            await loadRolesFromList(customList);
            lastAppliedSignature = signature;
            return { applied: true, scriptSource };
        } catch (err) {
            if (
                config?.hasGlobalPart &&
                scriptSource &&
                err instanceof SyntaxError &&
                typeof err.message === 'string' &&
                err.message.includes('Unexpected end')
            ) {
                console.error(
                    '自訂劇本資料不完整：僅取得 broadcaster 段，global 段可能沒有成功上傳或讀取。'
                );
            }
            console.error('解析自訂劇本失敗，改用預設劇本:', err);
            if (allowDefault) {
                await loadDefaultScript();
                lastAppliedSignature = 'default';
                return { applied: true, scriptSource: null };
            }
            return { applied: false, scriptSource: null };
        }
    }

    if (config.selectedScript) {
        await loadScriptByName(config.selectedScript);
        lastAppliedSignature = signature;
        return { applied: true, scriptSource: null };
    }

    if (allowDefault) {
        await loadDefaultScript();
        lastAppliedSignature = signature;
        return { applied: true, scriptSource: null };
    }

    return { applied: false, scriptSource: null };
}

async function applyFallbackConfig() {
    const storedState = loadStoredViewerState();
    if (storedState) {
        const result = await applyConfig(storedState.config, {
            force: true,
            resolvedScript: storedState.scriptSource,
            allowDefault: true
        });

        if (result.applied) {
            if (!result.scriptSource && storedState.scriptSource) {
                persistViewerState(null, null);
            }
            return;
        }

        persistViewerState(null, null);
    }

    await applyConfig(null, { force: true });
}

async function handleTwitchConfigChange() {
    const configStr = window.Twitch?.ext?.configuration?.broadcaster?.content;
    if (!configStr) {
        persistViewerState(null, null);
        await applyFallbackConfig();
        return;
    }

    try {
        const config = JSON.parse(configStr);
        if (!config || Object.keys(config).length === 0) {
            persistViewerState(null, null);
            await applyFallbackConfig();
            return;
        }

        const result = await applyConfig(config, { force: true });
        if (result.applied) {
            persistViewerState(config, result.scriptSource);
        }
    } catch (err) {
        console.error('解析 Twitch 設定錯誤，改用本機或預設劇本:', err);
        await applyFallbackConfig();
    }
}

function setupTwitchIntegration() {
    const twitchExt = window.Twitch?.ext;
    if (!twitchExt) {
        return false;
    }

    const safeTrigger = () => {
        if (!twitchAuthorized) {
            return;
        }

        handleTwitchConfigChange().catch(err => {
            console.error('處理 Twitch 設定時發生錯誤:', err);
        });
    };

    twitchExt.onAuthorized(() => {
        twitchAuthorized = true;
        safeTrigger();
    });

    if (twitchExt.configuration?.onChanged) {
        twitchExt.configuration.onChanged(() => {
            safeTrigger();
        });
    }

    if (twitchExt.listen) {
        twitchExt.listen('broadcast', (target, contentType, body) => {
            if (target !== 'broadcast' || !body) {
                return;
            }

            try {
                const parsed = typeof body === 'string' ? JSON.parse(body) : body;
                if (!parsed || typeof parsed !== 'object') {
                    return;
                }

                twitchAuthorized = true;
                applyConfig(parsed, { force: true }).then(result => {
                    if (result.applied) {
                        persistViewerState(parsed, result.scriptSource);
                    }
                }).catch(err => {
                    console.error('套用 Twitch 廣播設定時發生錯誤:', err);
                });
            } catch (err) {
                console.warn('解析 Twitch 廣播設定時發生錯誤:', err);
            }
        });
    }

    return true;
}

async function init() {
    const hasTwitch = setupTwitchIntegration();

    await applyFallbackConfig();

    if (!hasTwitch) {
        return;
    }

    // 如果在合理時間內沒有取得授權，繼續沿用本機或預設設定
    setTimeout(() => {
        if (!twitchAuthorized) {
            console.warn('未從 Twitch 取得授權回應，沿用本機設定或預設劇本。');
            applyFallbackConfig().catch(err => {
                console.warn('套用本機設定時發生錯誤:', err);
            });
        }
    }, 5000);
}

init();
