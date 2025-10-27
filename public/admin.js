const storageNotice = document.getElementById('storageNotice');
const scriptListEl = document.getElementById('scriptList');
const customJsonBlock = document.getElementById('customJsonBlock');
const customNameEl = document.getElementById('customName');
const customJsonEl = document.getElementById('customJson');
const saveCustomButton = document.getElementById('saveCustomButton');
const deleteCustomButton = document.getElementById('deleteCustomButton');
const saveButton = document.getElementById('saveButton');
const statusMessage = document.getElementById('statusMessage');
const LOCAL_SCRIPTS_KEY = 'botc_saved_custom_scripts_v1';
const LOCAL_OPTION_PREFIX = 'local:';
const CUSTOM_NEW_OPTION = '__custom__';
const LOCAL_LAST_CUSTOM_JSON_KEY = 'botc_last_custom_json_v1';
const LOCAL_LAST_CONFIG_KEY = 'botc_last_overlay_config_v1';

const decompressCache = new Map();

let builtinScripts = [];
let savedCustomScripts = {};

const STATUS_COLORS = {
    success: 'lightgreen',
    error: '#ff8080',
    info: '#9ec5fe'
};

if (storageNotice) {
    storageNotice.innerHTML = [
        '✅ 儲存設定時會更新 Twitch 擴充設定，並同步一份資料到目前瀏覽器，方便再次編輯。',
        '<br />',
        '📌 Twitch 觀眾會直接讀取擴充設定中的劇本資料，不需要 Cookie。'
    ].join('');
}

function showStatus(message, type = 'success') {
    statusMessage.textContent = message;
    statusMessage.style.color = STATUS_COLORS[type] || STATUS_COLORS.success;
}

function persistLastCustomJson(value) {
    try {
        if (typeof value === 'string' && value.trim()) {
            window.localStorage?.setItem(LOCAL_LAST_CUSTOM_JSON_KEY, value);
        } else {
            window.localStorage?.removeItem(LOCAL_LAST_CUSTOM_JSON_KEY);
        }
    } catch (err) {
        console.warn('儲存最近自訂劇本內容時發生錯誤:', err);
    }
}

function loadLastCustomJson() {
    try {
        return window.localStorage?.getItem(LOCAL_LAST_CUSTOM_JSON_KEY) || '';
    } catch (err) {
        console.warn('載入最近自訂劇本內容時發生錯誤:', err);
        return '';
    }
}

function persistLastConfig(config) {
    try {
        if (!config) {
            window.localStorage?.removeItem(LOCAL_LAST_CONFIG_KEY);
            return;
        }

        window.localStorage?.setItem(LOCAL_LAST_CONFIG_KEY, JSON.stringify(config));
    } catch (err) {
        console.warn('儲存最近的覆蓋設定時失敗:', err);
    }
}

function loadLastConfig() {
    try {
        const raw = window.localStorage?.getItem(LOCAL_LAST_CONFIG_KEY);
        if (!raw) {
            return null;
        }

        return JSON.parse(raw);
    } catch (err) {
        console.warn('載入最近的覆蓋設定時失敗:', err);
        return null;
    }
}

function computeScriptHash(text) {
    if (typeof text !== 'string' || !text) {
        return '0';
    }

    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0; // eslint-disable-line no-bitwise
    }

    return hash.toString(16);
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

function compressCustomJson(normalizedJson) {
    try {
        console.info('[Compression] 開始壓縮自訂劇本...');

        // 使用新版 compression.js 的壓縮方法
        const result = window.CompressionHelper.compressToStorableString(normalizedJson);

        if (!result || typeof result.encodedString !== 'string') {
            throw new Error('壓縮結果無效或為空');
        }

        console.info(
            `[Compression] 壓縮完成: 原始=${result.originalLength} bytes → 壓縮後=${result.compressedLength} bytes`
        );

        // 回傳統一格式，供 admin.js 主流程使用
        return {
            base64: result.encodedString,
            originalLength: result.originalLength || normalizedJson.length,
            compressedLength: result.compressedLength || result.encodedString.length
        };

    } catch (err) {
        console.error('[Compression] 壓縮失敗:', err);
        throw err; // 讓外層 saveButton.catch() 負責 UI 顯示
    }
}

async function reconstructCustomJsonFromConfig(config) {
    if (!config || typeof config !== 'object') {
        return '';
    }
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

function sanitizeConfigForStorage(config) {
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

const SCRIPT_ALLOWED_KEYS = [
    'id',
    'name',
    'ability',
    'image',
    'otherNight',
    'firstNight',
    'team'
];

const IMAGE_PLACEHOLDER_REGEX = /^~(\d+)~(.+)/;

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

function applyNightOrderAggregation(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return entries;
    }

    const cloned = entries.map(item => (item && typeof item === 'object' ? { ...item } : item));

    let metaIndex = cloned.findIndex(item => item && item.id === '_meta');
    let metaEntry = metaIndex >= 0 ? { ...cloned[metaIndex] } : null;
    const existingFirstNight = metaEntry ? normalizeNightOrderArray(metaEntry.firstNight) : null;
    const existingOtherNight = metaEntry ? normalizeNightOrderArray(metaEntry.otherNight) : null;

    const firstNightPairs = [];
    const otherNightPairs = [];

    cloned.forEach(item => {
        if (!item || item.id === '_meta' || typeof item !== 'object') {
            return;
        }

        const firstNightValue = Number(item.firstNight);
        if (Number.isFinite(firstNightValue) && firstNightValue > 0) {
            firstNightPairs.push({ id: item.id, value: firstNightValue });
        }

        const otherNightValue = Number(item.otherNight);
        if (Number.isFinite(otherNightValue) && otherNightValue > 0) {
            otherNightPairs.push({ id: item.id, value: otherNightValue });
        }

        if (Object.prototype.hasOwnProperty.call(item, 'firstNight')) {
            delete item.firstNight;
        }
        if (Object.prototype.hasOwnProperty.call(item, 'otherNight')) {
            delete item.otherNight;
        }
    });

    const sortByValue = (a, b) => {
        if (a.value === b.value) {
            return String(a.id).localeCompare(String(b.id));
        }
        return a.value - b.value;
    };

    const computedFirstNight = firstNightPairs.length > 0
        ? firstNightPairs.sort(sortByValue).map(entry => entry.id)
        : null;
    const computedOtherNight = otherNightPairs.length > 0
        ? otherNightPairs.sort(sortByValue).map(entry => entry.id)
        : null;

    const finalFirstNight = computedFirstNight && computedFirstNight.length > 0
        ? computedFirstNight
        : existingFirstNight;
    const finalOtherNight = computedOtherNight && computedOtherNight.length > 0
        ? computedOtherNight
        : existingOtherNight;

    const shouldEnsureMeta = (finalFirstNight && finalFirstNight.length > 0)
        || (finalOtherNight && finalOtherNight.length > 0);

    if (shouldEnsureMeta && !metaEntry) {
        metaEntry = { id: '_meta' };
        cloned.unshift(metaEntry);
        metaIndex = 0;
    }

    if (metaEntry) {
        if (finalFirstNight && finalFirstNight.length > 0) {
            metaEntry.firstNight = finalFirstNight;
        } else {
            delete metaEntry.firstNight;
        }

        if (finalOtherNight && finalOtherNight.length > 0) {
            metaEntry.otherNight = finalOtherNight;
        } else {
            delete metaEntry.otherNight;
        }

        if (metaIndex >= 0) {
            cloned[metaIndex] = metaEntry;
        }
    }

    return cloned;
}

function extractNightOrderSummary(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return { firstNight: null, otherNight: null };
    }

    const metaEntry = entries.find(item => item && item.id === '_meta');
    if (!metaEntry || typeof metaEntry !== 'object') {
        return { firstNight: null, otherNight: null };
    }

    return {
        firstNight: normalizeNightOrderArray(metaEntry.firstNight),
        otherNight: normalizeNightOrderArray(metaEntry.otherNight)
    };
}

function sanitizeScriptEntry(entry) {
    if (!entry || typeof entry !== 'object') {
        return entry;
    }

    if (entry.id === '_meta') {
        return { ...entry };
    }

    const result = {};
    SCRIPT_ALLOWED_KEYS.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(entry, key)) {
            result[key] = entry[key];
        }
    });

    return result;
}

function applyImageBaseOptimization(entries) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return entries;
    }

    const cloned = entries.map(item => (item && typeof item === 'object' ? { ...item } : item));
    let metaIndex = cloned.findIndex(item => item && item.id === '_meta');
    let metaEntry = metaIndex >= 0 ? { ...cloned[metaIndex] } : null;

    const existingBases = metaEntry && Array.isArray(metaEntry.imageBases)
        ? metaEntry.imageBases.filter(base => typeof base === 'string' && base)
        : [];

    const hasPlaceholders = cloned.some(item => (
        item
        && item.id !== '_meta'
        && typeof item.image === 'string'
        && IMAGE_PLACEHOLDER_REGEX.test(item.image)
    ));

    if (hasPlaceholders) {
        if (metaEntry) {
            if (existingBases.length > 0) {
                metaEntry.imageBases = existingBases;
            } else {
                delete metaEntry.imageBases;
            }
            cloned[metaIndex] = metaEntry;
        }
        return cloned;
    }

    const baseStats = new Map();

    cloned.forEach((item, index) => {
        if (!item || item.id === '_meta' || typeof item.image !== 'string' || !item.image) {
            return;
        }

        const slashIndex = item.image.lastIndexOf('/');
        if (slashIndex <= 8) {
            return;
        }

        const base = item.image.slice(0, slashIndex + 1);
        const remainder = item.image.slice(slashIndex + 1);
        if (!remainder) {
            return;
        }

        const stat = baseStats.get(base) || { count: 0, entries: [] };
        stat.count += 1;
        stat.entries.push({ index, remainder });
        baseStats.set(base, stat);
    });

    if (baseStats.size === 0) {
        if (metaEntry) {
            if (existingBases.length > 0) {
                metaEntry.imageBases = existingBases;
            } else {
                delete metaEntry.imageBases;
            }
            cloned[metaIndex] = metaEntry;
        }
        return cloned;
    }

    const finalBases = [...existingBases];
    const baseToIndex = new Map();
    finalBases.forEach((base, idx) => {
        baseToIndex.set(base, idx);
    });

    const candidates = Array.from(baseStats.entries())
        .map(([base, stat]) => ({
            base,
            count: stat.count,
            entries: stat.entries,
            estimatedSavings: (base.length - 3) * stat.count - base.length
        }))
        .filter(item => item.count >= 2 && item.base.length >= 12 && item.estimatedSavings > 0)
        .sort((a, b) => {
            if (b.estimatedSavings === a.estimatedSavings) {
                return b.base.length - a.base.length;
            }
            return b.estimatedSavings - a.estimatedSavings;
        });

    candidates.forEach(candidate => {
        if (baseToIndex.has(candidate.base)) {
            return;
        }

        const potentialIndex = finalBases.length;
        const placeholderOverhead = String(potentialIndex).length + 2;
        if (candidate.base.length <= placeholderOverhead) {
            return;
        }

        const convertibleCount = candidate.entries.reduce((acc, info) => {
            if (!info || !info.remainder) {
                return acc;
            }
            const original = cloned[info.index]?.image || '';
            if (!original || !original.startsWith(candidate.base)) {
                return acc;
            }
            const placeholder = `~${potentialIndex}~${original.slice(candidate.base.length)}`;
            return placeholder.length < original.length ? acc + 1 : acc;
        }, 0);

        if (convertibleCount >= 2) {
            baseToIndex.set(candidate.base, potentialIndex);
            finalBases.push(candidate.base);
        }
    });

    if (finalBases.length === existingBases.length) {
        if (metaEntry) {
            if (existingBases.length > 0) {
                metaEntry.imageBases = existingBases;
            } else {
                delete metaEntry.imageBases;
            }
            cloned[metaIndex] = metaEntry;
        }
        return cloned;
    }

    const baseEntries = Array.from(baseToIndex.entries())
        .map(([base, index]) => ({ base, index }))
        .sort((a, b) => b.base.length - a.base.length);

    let optimized = false;

    cloned.forEach(item => {
        if (!item || item.id === '_meta' || typeof item.image !== 'string' || !item.image) {
            return;
        }

        for (let i = 0; i < baseEntries.length; i += 1) {
            const { base, index } = baseEntries[i];
            if (!item.image.startsWith(base) || item.image.length <= base.length) {
                continue;
            }

            const placeholder = `~${index}~${item.image.slice(base.length)}`;
            if (placeholder.length < item.image.length) {
                item.image = placeholder;
                optimized = true;
            }
            break;
        }
    });

    if (!optimized) {
        if (metaEntry) {
            if (existingBases.length > 0) {
                metaEntry.imageBases = existingBases;
            } else {
                delete metaEntry.imageBases;
            }
            cloned[metaIndex] = metaEntry;
        }
        return cloned;
    }

    if (!metaEntry) {
        metaEntry = { id: '_meta' };
        cloned.unshift(metaEntry);
        metaIndex = 0;
    }

    metaEntry.imageBases = finalBases;
    cloned[metaIndex] = metaEntry;

    return cloned;
}

function parseAndNormalizeScriptJson(rawJson) {
    const trimmed = rawJson.trim();
    if (!trimmed) {
        throw new Error('自訂劇本內容不可為空');
    }

    let parsed;
    try {
        parsed = JSON.parse(trimmed);
    } catch (err) {
        throw new Error('自訂劇本必須是有效的 JSON 格式');
    }

    if (!Array.isArray(parsed)) {
        throw new Error('自訂劇本必須是 JSON 陣列');
    }

    const invalidIndex = parsed.findIndex(item => !item || typeof item !== 'object' || !item.id);
    if (invalidIndex !== -1) {
        throw new Error(`第 ${invalidIndex + 1} 筆資料缺少 id 欄位`);
    }

    const sanitized = parsed.map(sanitizeScriptEntry);
    const aggregated = applyNightOrderAggregation(sanitized);
    const optimized = applyImageBaseOptimization(aggregated);
    const nightOrder = extractNightOrderSummary(optimized);

    return {
        parsed: optimized,
        normalized: JSON.stringify(optimized, null, 2),
        nightOrder
    };
}

function loadSavedCustomScripts() {
    try {
        const raw = window.localStorage?.getItem(LOCAL_SCRIPTS_KEY);
        if (!raw) {
            return {};
        }

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return {};
        }

        return Object.fromEntries(
            Object.entries(parsed)
                .filter(([, value]) => typeof value === 'string')
        );
    } catch (err) {
        console.warn('載入本機自訂劇本失敗:', err);
        return {};
    }
}

function persistSavedCustomScripts() {
    try {
        window.localStorage?.setItem(LOCAL_SCRIPTS_KEY, JSON.stringify(savedCustomScripts));
    } catch (err) {
        console.warn('儲存自訂劇本到本機時發生錯誤:', err);
        showStatus('⚠️ 無法將自訂劇本儲存在本機，請確認瀏覽器允許儲存功能', 'error');
    }
}

function getLocalOptionValue(name) {
    return `${LOCAL_OPTION_PREFIX}${encodeURIComponent(name)}`;
}

function parseScriptSelection(value) {
    if (!value) {
        return { type: 'none' };
    }

    if (value === CUSTOM_NEW_OPTION) {
        return { type: 'customNew' };
    }

    if (value.startsWith(LOCAL_OPTION_PREFIX)) {
        const name = decodeURIComponent(value.slice(LOCAL_OPTION_PREFIX.length));
        return { type: 'customSaved', name };
    }

    return { type: 'builtin', value };
}

function renderScriptOptions(selectedValue) {
    const builtinOptions = builtinScripts
        .map(fileName => `<option value="${fileName}">${fileName}</option>`)
        .join('');

    const savedNames = Object.keys(savedCustomScripts)
        .sort((a, b) => a.localeCompare(b, 'zh-Hant')); // provide consistent order for Chinese names

    const savedOptions = savedNames
        .map(name => `<option value="${getLocalOptionValue(name)}">📝 ${name}</option>`)
        .join('');

    const savedGroup = savedOptions
        ? `<optgroup label="已儲存的自訂劇本">${savedOptions}</optgroup>`
        : '';

    scriptListEl.innerHTML = [
        '<option value="">-- 請選擇劇本 --</option>',
        builtinOptions,
        `<option value="${CUSTOM_NEW_OPTION}">✏️ 新增自訂劇本</option>`,
        savedGroup
    ].join('');

    if (selectedValue && Array.from(scriptListEl.options).some(opt => opt.value === selectedValue)) {
        scriptListEl.value = selectedValue;
    } else {
        scriptListEl.value = '';
    }
}

function clearLoadedCustomMetadata() {
    delete customNameEl.dataset.loadedName;
    delete customJsonEl.dataset.loadedName;
    delete customJsonEl.dataset.loadedValue;
}

function updateCustomButtonsState(selection) {
    const isCustom = selection.type === 'customNew' || selection.type === 'customSaved';
    customJsonBlock.style.display = isCustom ? 'block' : 'none';
    saveCustomButton.disabled = !isCustom;
    deleteCustomButton.disabled = selection.type !== 'customSaved';
}

function handleScriptSelectionChange() {
    const selection = parseScriptSelection(scriptListEl.value);
    updateCustomButtonsState(selection);

    if (selection.type === 'customSaved') {
        const savedJson = savedCustomScripts[selection.name];
        if (typeof savedJson !== 'string') {
            showStatus(`❌ 找不到名為「${selection.name}」的自訂劇本，請重新選擇`, 'error');
            scriptListEl.value = CUSTOM_NEW_OPTION;
            handleScriptSelectionChange();
            return;
        }

        customNameEl.value = selection.name;
        customJsonEl.value = savedJson;
        customNameEl.dataset.loadedName = selection.name;
        customJsonEl.dataset.loadedName = selection.name;
        customJsonEl.dataset.loadedValue = savedJson;
        persistLastCustomJson(savedJson);
        return;
    }

    if (selection.type === 'customNew') {
        const cachedJson = loadLastCustomJson();
        if (!customJsonEl.value && cachedJson) {
            customJsonEl.value = cachedJson;
            persistLastCustomJson(cachedJson);
        }
        clearLoadedCustomMetadata();
        return;
    }

    // built-in or no selection
    customNameEl.value = '';
    customJsonEl.value = '';
    clearLoadedCustomMetadata();
}

async function updateFormFromConfig(config) {
    if (config && typeof config === 'object' && Object.keys(config).length > 0) {
        const sanitized = sanitizeConfigForStorage(config);
        if (sanitized) {
            persistLastConfig(sanitized);
        }

        const { selectedScript = '', customName = '' } = config;

        if (selectedScript && selectedScript !== CUSTOM_NEW_OPTION) {
            if (Array.from(scriptListEl.options).some(opt => opt.value === selectedScript)) {
                scriptListEl.value = selectedScript;
            } else {
                showStatus(`⚠️ 找不到劇本「${selectedScript}」，請重新選擇`, 'error');
                scriptListEl.value = '';
            }
            handleScriptSelectionChange();
            return;
        }

        scriptListEl.value = CUSTOM_NEW_OPTION;
        customNameEl.value = customName || '';

        let effectiveJson = '';
        try {
            effectiveJson = await reconstructCustomJsonFromConfig(config);
        } catch (err) {
            console.warn('解壓縮自訂劇本失敗，改用本機快取:', err);
            effectiveJson = loadLastCustomJson();
        }

        if (!effectiveJson) {
            effectiveJson = loadLastCustomJson();
        }

        if (effectiveJson) {
            customJsonEl.value = effectiveJson;
            persistLastCustomJson(effectiveJson);
        } else {
            customJsonEl.value = '';
        }

        if (customName && savedCustomScripts[customName] === customJsonEl.value) {
            scriptListEl.value = getLocalOptionValue(customName);
        }

        handleScriptSelectionChange();
        return;
    }

    const fallbackConfig = loadLastConfig();
    if (fallbackConfig) {
        await updateFormFromConfig(fallbackConfig);
        return;
    }

    const cachedCustomJson = loadLastCustomJson();
    if (cachedCustomJson) {
        scriptListEl.value = CUSTOM_NEW_OPTION;
        customJsonEl.value = cachedCustomJson;
        handleScriptSelectionChange();
    }
}

function readConfigFromTwitch() {
    const configStr = window.Twitch?.ext?.configuration?.broadcaster?.content;
    if (!configStr) {
        return null;
    }

    try {
        return JSON.parse(configStr);
    } catch (err) {
        console.error('解析 Twitch 設定失敗:', err);
        return null;
    }
}

function setupTwitchListeners() {
    const twitchExt = window.Twitch?.ext;
    if (!twitchExt) {
        return false;
    }

    const applyCurrentConfig = async () => {
        const config = readConfigFromTwitch();
        if (config) {
            await updateFormFromConfig(config);
        } else {
            await updateFormFromConfig(loadLastConfig());
        }
    };

    twitchExt.onAuthorized(() => {
        applyCurrentConfig().catch(err => {
            console.error('套用 Twitch 授權設定時發生錯誤:', err);
        });
    });

    twitchExt.configuration?.onChanged?.(() => {
        applyCurrentConfig().catch(err => {
            console.error('套用 Twitch 設定變更時發生錯誤:', err);
        });
    });

    applyCurrentConfig().catch(err => {
        console.error('初始化 Twitch 設定時發生錯誤:', err);
    });
    return true;
}

async function initializeConfigForm() {
    savedCustomScripts = loadSavedCustomScripts();

    try {
        const loadedScripts = await fetch('Allscript/scripts.json')
            .then(res => {
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                return res.json();
            });

        builtinScripts = Array.isArray(loadedScripts) ? loadedScripts : [];
    } catch (err) {
        console.error('載入劇本清單時發生錯誤:', err);
        showStatus('❌ 無法載入劇本清單，請稍後再試', 'error');
        builtinScripts = [];
    }

    renderScriptOptions(scriptListEl.value);
    handleScriptSelectionChange();

    if (!setupTwitchListeners()) {
        await updateFormFromConfig(loadLastConfig());
    }
}

function handleCustomNameInput(event) {
    const selection = parseScriptSelection(scriptListEl.value);
    if (selection.type === 'customSaved') {
        const newValue = event.target.value;
        scriptListEl.value = CUSTOM_NEW_OPTION;
        handleScriptSelectionChange();
        customNameEl.value = newValue;
    }
}

function handleCustomJsonInput(event) {
    const selection = parseScriptSelection(scriptListEl.value);
    if (selection.type === 'customSaved') {
        const newValue = event.target.value;
        scriptListEl.value = CUSTOM_NEW_OPTION;
        handleScriptSelectionChange();
        customJsonEl.value = newValue;
    }

    if (parseScriptSelection(scriptListEl.value).type === 'customNew') {
        persistLastCustomJson(event.target.value);
    }
}

function saveCustomScript() {
    const selection = parseScriptSelection(scriptListEl.value);
    if (selection.type !== 'customNew' && selection.type !== 'customSaved') {
        showStatus('❌ 請先選擇「新增自訂劇本」或載入已儲存的自訂劇本', 'error');
        return;
    }

    const name = customNameEl.value.trim();
    const customJson = customJsonEl.value.trim();

    if (!name) {
        showStatus('❌ 請為自訂劇本輸入名稱', 'error');
        return;
    }

    let normalizedJson;
    try {
        ({ normalized: normalizedJson } = parseAndNormalizeScriptJson(customJson));
    } catch (err) {
        showStatus(`❌ ${err.message}`, 'error');
        return;
    }

    savedCustomScripts[name] = normalizedJson;
    persistSavedCustomScripts();
    persistLastCustomJson(normalizedJson);

    const optionValue = getLocalOptionValue(name);
    renderScriptOptions(optionValue);
    scriptListEl.value = optionValue;
    handleScriptSelectionChange();

    customJsonEl.dataset.loadedValue = normalizedJson;
    customJsonEl.dataset.loadedName = name;
    customNameEl.dataset.loadedName = name;
    customJsonEl.value = normalizedJson;

    showStatus(`✅ 已儲存自訂劇本「${name}」`, 'success');
}

function deleteCustomScript() {
    const selection = parseScriptSelection(scriptListEl.value);
    if (selection.type !== 'customSaved') {
        return;
    }

    const { name } = selection;
    const storedJson = savedCustomScripts[name];
    if (typeof storedJson !== 'string') {
        showStatus(`❌ 找不到名為「${name}」的自訂劇本`, 'error');
        return;
    }

    const nextScripts = { ...savedCustomScripts };
    delete nextScripts[name];
    savedCustomScripts = nextScripts;
    persistSavedCustomScripts();

    if (customJsonEl.dataset.loadedName === name) {
        clearLoadedCustomMetadata();
    }

    if (customNameEl.value.trim() === name) {
        customNameEl.value = '';
    }

    if (customJsonEl.dataset.loadedValue === storedJson) {
        customJsonEl.value = '';
        persistLastCustomJson('');
    }

    renderScriptOptions(CUSTOM_NEW_OPTION);
    scriptListEl.value = CUSTOM_NEW_OPTION;
    customNameEl.value = '';
    customJsonEl.value = '';
    handleScriptSelectionChange();

    showStatus(`🗑️ 已刪除自訂劇本「${name}」`, 'info');
}

scriptListEl.addEventListener('change', handleScriptSelectionChange);
customNameEl.addEventListener('input', handleCustomNameInput);
customJsonEl.addEventListener('input', handleCustomJsonInput);
saveCustomButton.addEventListener('click', saveCustomScript);
deleteCustomButton.addEventListener('click', deleteCustomScript);

saveButton.addEventListener('click', async () => {
    const selection = parseScriptSelection(scriptListEl.value);

    if (selection.type === 'none') {
        showStatus('❌ 請先選擇或輸入一份劇本', 'error');
        return;
    }

    const timestamp = Date.now();
    let payload;
    let storageConfig = null;
    let normalizedJson = '';

    if (selection.type === 'builtin') {
        storageConfig = {
            selectedScript: selection.value,
            _timestamp: timestamp,
            scriptVersion: timestamp
        };
        payload = { ...storageConfig };
        persistLastCustomJson('');
    } else {
        const customName = customNameEl.value.trim();
        const customJson = customJsonEl.value.trim();

        if (!customName) {
            showStatus('❌ 請輸入自訂劇本名稱', 'error');
            return;
        }

        let nightOrder = { firstNight: null, otherNight: null };

        try {
            const parseResult = parseAndNormalizeScriptJson(customJson);
            normalizedJson = parseResult.normalized;
            nightOrder = parseResult.nightOrder || nightOrder;
        } catch (err) {
            showStatus(`❌ ${err.message}`, 'error');
            return;
        }

        persistLastCustomJson(normalizedJson);
        customJsonEl.value = normalizedJson;
        customJsonEl.dataset.loadedValue = normalizedJson;
        customJsonEl.dataset.loadedName = customName;
        customNameEl.dataset.loadedName = customName;

        const scriptVersion = timestamp;
        const scriptHash = computeScriptHash(normalizedJson);

        saveButton.disabled = true;

        let compressed = null;

        try {
            showStatus('🗜️ 正在壓縮自訂劇本...', 'info');

            compressed = compressCustomJson(normalizedJson);
            if (!compressed || !compressed.base64) throw new Error('壓縮結果無效');

            const firstNightOrder = normalizeNightOrderArray(nightOrder.firstNight);
            const otherNightOrder = normalizeNightOrderArray(nightOrder.otherNight);

            storageConfig = {
                selectedScript: CUSTOM_NEW_OPTION,
                customName,
                _timestamp: timestamp,
                scriptVersion,
                scriptHash,
                customJsonLength: normalizedJson.length,
                hasGlobalPart: false
            };

            if (firstNightOrder) {
                storageConfig.firstNight = [...firstNightOrder];
            }

            if (otherNightOrder) {
                storageConfig.otherNight = [...otherNightOrder];
            }

            const encoder = new TextEncoder();
            const byteSize = encoder.encode(JSON.stringify({ ...storageConfig, compressedBase64: compressed.base64 })).length;

            if (byteSize <= 5000) {
                payload = { ...storageConfig, compressedBase64: compressed.base64 };
            } else {
                showStatus('⚠️ 壓縮後的劇本仍超過 5KB，請刪減內容後再試。', 'error');
                saveButton.disabled = false;
                return;
            }
        } catch (err) {
            console.error('壓縮自訂劇本失敗:', err);
            showStatus('❌ 劇本壓縮失敗', 'error');
            return;
        }
    }
    // ======== 儲存階段 ========
    saveButton.disabled = true;
    showStatus('💾 儲存中...', 'info');

    try {
        const sanitizedStorage = sanitizeConfigForStorage(storageConfig || payload);
        if (sanitizedStorage) persistLastConfig(sanitizedStorage);

        if (!window.Twitch?.ext?.configuration) {
            showStatus('⚠️ 無法存取 Twitch Extension API，已將設定保存在本機', 'error');
            return;
        }

        // broadcaster 段
        const payloadString = JSON.stringify(payload);
        window.Twitch.ext.configuration.set('broadcaster', '1', payloadString);

        // 廣播同步
        if (window.Twitch.ext.send) {
            try {
                window.Twitch.ext.send('broadcast', 'application/json', payloadString);
            } catch (sendErr) {
                console.warn('透過 Twitch 廣播更新設定時失敗:', sendErr);
            }
        }

        showStatus('✅ 設定已儲存並同步到 Twitch 擴充功能！');
    } catch (err) {
        console.error('儲存設定失敗:', err);
        showStatus('❌ 儲存設定失敗，請稍後再試', 'error');
    } finally {
        saveButton.disabled = false;
    }
});

initializeConfigForm();
