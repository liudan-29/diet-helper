export const SCHEMA_VERSION = 1;

const STORE_KEY = "diet-helper-data";
const ACTIVE_MODULE_KEY = "diet-helper-active-module";
const FORM_DRAFT_KEY = "diet-helper-form-drafts";
const WRITE_BLOCKED_ERROR = "本地数据需要先清除或重置，当前写入已停止";
let writeBlocked = false;
let writeBlockedReason = "";

const COLLECTIONS = [
  "mealRequests",
  "cookingPlans",
  "mealRecords",
  "favorites",
  "feedbackEvents",
  "commonPlaces",
];

export function createId(prefix) {
  const value = globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${value}`;
}

export function emptyStore() {
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    userProfile: {
      id: "local-user",
      tastePreferences: [],
      dietaryRestrictions: [],
      defaultBudget: 80,
      defaultPartySize: 1,
      defaultCommonPlaceId: null,
      createdAt: now,
      updatedAt: now,
    },
    mealRequests: [],
    restaurants: {},
    cookingPlans: [],
    mealRecords: [],
    favorites: [],
    feedbackEvents: [],
    commonPlaces: [],
  };
}

export function readStore() {
  let raw;
  try {
    raw = localStorage.getItem(STORE_KEY);
  } catch {
    return { data: emptyStore(), recovered: true, storageUnavailable: true };
  }
  if (!raw) {
    return {
      data: emptyStore(),
      recovered: writeBlocked,
      writeBlocked,
      error: writeBlockedReason || null,
    };
  }
  try {
    const parsed = JSON.parse(raw);
    const data = migrateStore(parsed);
    if (!writeBlocked) return { data, recovered: false, writeBlocked: false };
    return {
      data: emptyStore(),
      recovered: true,
      writeBlocked: true,
      error: writeBlockedReason,
    };
  } catch (error) {
    preserveCorruptValue(raw);
    writeBlocked = true;
    writeBlockedReason = String(error?.message || "本地数据读取失败");
    return {
      data: emptyStore(),
      recovered: true,
      writeBlocked: true,
      error: writeBlockedReason,
    };
  }
}

export function updateStore(mutator) {
  const current = readStore();
  if (writeBlocked || current.writeBlocked) {
    throw new Error(`${WRITE_BLOCKED_ERROR}：${writeBlockedReason || "数据版本或格式异常"}`);
  }
  const latest = current.data;
  const draft = structuredClone(latest);
  const result = mutator(draft);
  draft.schemaVersion = SCHEMA_VERSION;
  draft.mealRequests = [...draft.mealRequests]
    .sort((left, right) =>
      String(right.createdAt || right.updatedAt || "").localeCompare(
        String(left.createdAt || left.updatedAt || "")
      )
    )
    .slice(0, 50);
  localStorage.setItem(STORE_KEY, JSON.stringify(draft));
  window.dispatchEvent(new CustomEvent("diet-helper-store-change"));
  return result ?? draft;
}

export function upsertItem(collection, item) {
  if (!COLLECTIONS.includes(collection)) throw new Error("未知数据集合");
  return updateStore((data) => {
    const index = data[collection].findIndex((entry) => entry.id === item.id);
    if (index >= 0) data[collection][index] = { ...data[collection][index], ...item };
    else data[collection].push(item);
    return item;
  });
}

export function removeItem(collection, id) {
  if (!COLLECTIONS.includes(collection)) throw new Error("未知数据集合");
  updateStore((data) => {
    data[collection] = data[collection].filter((entry) => entry.id !== id);
  });
}

export function toggleFavorite(targetType, targetId, snapshot) {
  let favorite = null;
  let active = false;
  updateStore((data) => {
    const index = data.favorites.findIndex(
      (item) => item.targetType === targetType && item.targetId === targetId
    );
    if (index >= 0) {
      [favorite] = data.favorites.splice(index, 1);
      return;
    }
    active = true;
    favorite = {
      id: createId("favorite"),
      targetType,
      targetId,
      snapshot,
      createdAt: new Date().toISOString(),
    };
    data.favorites.push(favorite);
  });
  return { active, favorite };
}

export function isFavorite(targetType, targetId) {
  return readStore().data.favorites.some(
    (item) => item.targetType === targetType && item.targetId === targetId
  );
}

export function saveActiveModule(moduleName) {
  try {
    localStorage.setItem(ACTIVE_MODULE_KEY, moduleName);
  } catch {
    // 入口切换仍可继续，本次刷新恢复不可用。
  }
}

export function readActiveModule(validModules) {
  try {
    const value = localStorage.getItem(ACTIVE_MODULE_KEY);
    return validModules.includes(value) ? value : validModules[0];
  } catch {
    return validModules[0];
  }
}

export function saveFormDraft(name, value) {
  let drafts = {};
  try {
    drafts = JSON.parse(sessionStorage.getItem(FORM_DRAFT_KEY) || "{}");
    drafts[name] = value;
    sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // 草稿保存失败不阻塞当前表单。
  }
}

export function readFormDraft(name) {
  try {
    return JSON.parse(sessionStorage.getItem(FORM_DRAFT_KEY) || "{}")[name] || null;
  } catch {
    return null;
  }
}

export function clearFormDraft(name) {
  try {
    const drafts = JSON.parse(sessionStorage.getItem(FORM_DRAFT_KEY) || "{}");
    delete drafts[name];
    sessionStorage.setItem(FORM_DRAFT_KEY, JSON.stringify(drafts));
  } catch {
    // 草稿清理失败不影响结构化数据。
  }
}

export function clearStructuredData() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith("diet-helper-")) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  sessionStorage.removeItem(FORM_DRAFT_KEY);
  writeBlocked = false;
  writeBlockedReason = "";
  window.dispatchEvent(new CustomEvent("diet-helper-store-change"));
}

export function resetStructuredData() {
  clearStructuredData();
  localStorage.setItem(STORE_KEY, JSON.stringify(emptyStore()));
}

function migrateStore(parsed) {
  if (!parsed || typeof parsed !== "object") throw new Error("本地数据格式无效");
  if (
    !Number.isInteger(parsed.schemaVersion) ||
    parsed.schemaVersion < 1 ||
    parsed.schemaVersion > SCHEMA_VERSION
  ) {
    throw new Error("本地数据版本不受支持");
  }
  if (
    parsed.userProfile !== undefined &&
    (!parsed.userProfile || typeof parsed.userProfile !== "object" || Array.isArray(parsed.userProfile))
  ) {
    throw new Error("用户资料格式无效");
  }
  COLLECTIONS.forEach((key) => {
    if (parsed[key] !== undefined && !Array.isArray(parsed[key])) {
      throw new Error(`${key}集合格式无效`);
    }
  });
  if (
    parsed.restaurants !== undefined &&
    (!parsed.restaurants || typeof parsed.restaurants !== "object" || Array.isArray(parsed.restaurants))
  ) {
    throw new Error("餐厅快照格式无效");
  }
  const defaults = emptyStore();
  const migrated = { ...defaults, ...parsed, schemaVersion: SCHEMA_VERSION };
  migrated.userProfile = { ...defaults.userProfile, ...(parsed.userProfile || {}) };
  COLLECTIONS.forEach((key) => {
    migrated[key] = Array.isArray(parsed[key]) ? parsed[key] : [];
  });
  migrated.restaurants =
    parsed.restaurants && typeof parsed.restaurants === "object"
      ? parsed.restaurants
      : {};
  return migrated;
}

function preserveCorruptValue(raw) {
  try {
    localStorage.setItem(`diet-helper-corrupt-backup-${Date.now()}`, raw);
  } catch {
    // 原值仍保留在STORE_KEY；备份失败时不覆盖。
  }
}
