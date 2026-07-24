import test from "node:test";
import assert from "node:assert/strict";

import {
  emptyStore,
  clearStructuredData,
  readActiveModule,
  readStore,
  saveActiveModule,
  toggleFavorite,
  upsertItem,
} from "../lib/local-store.js";

test.beforeEach(() => {
  globalThis.localStorage = createStorage();
  globalThis.sessionStorage = createStorage();
  globalThis.window = { dispatchEvent() {} };
  globalThis.CustomEvent = class {
    constructor(type) {
      this.type = type;
    }
  };
});

test.afterEach(() => {
  clearStructuredData();
  delete globalThis.localStorage;
  delete globalThis.sessionStorage;
  delete globalThis.window;
  delete globalThis.CustomEvent;
});

test("首次使用会创建带默认值的本地数据结构", () => {
  const store = emptyStore();
  assert.equal(store.schemaVersion, 1);
  assert.equal(store.userProfile.defaultBudget, 80);
  assert.deepEqual(store.mealRecords, []);
  assert.equal(readStore().recovered, false);
});

test("同编号记录会更新而不会重复新增", () => {
  upsertItem("mealRecords", { id: "record-1", title: "午饭" });
  upsertItem("mealRecords", { id: "record-1", title: "晚饭" });

  const records = readStore().data.mealRecords;
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "晚饭");
});

test("收藏按对象类型和编号切换且保持唯一", () => {
  const first = toggleFavorite("restaurant", "poi-1", { name: "测试餐厅" });
  assert.equal(first.active, true);
  assert.equal(readStore().data.favorites.length, 1);

  const second = toggleFavorite("restaurant", "poi-1", { name: "测试餐厅" });
  assert.equal(second.active, false);
  assert.equal(readStore().data.favorites.length, 0);
});

test("入口只恢复白名单中的模块", () => {
  saveActiveModule("cook");
  assert.equal(readActiveModule(["eat", "cook", "records", "mine"]), "cook");
  saveActiveModule("unknown");
  assert.equal(readActiveModule(["eat", "cook", "records", "mine"]), "eat");
});

test("用餐需求历史只保留最近50条", () => {
  for (let index = 0; index < 55; index += 1) {
    upsertItem("mealRequests", {
      id: `request-${index}`,
      createdAt: new Date(2026, 0, 1, 0, index).toISOString(),
    });
  }
  const requests = readStore().data.mealRequests;
  assert.equal(requests.length, 50);
  assert.equal(requests[0].id, "request-54");
  assert.equal(requests.at(-1).id, "request-5");
});

test("未来版本数据会阻止写入且保留原值", () => {
  const raw = JSON.stringify({ schemaVersion: 999, mealRecords: [{ id: "old" }] });
  localStorage.setItem("diet-helper-data", raw);

  const result = readStore();
  assert.equal(result.writeBlocked, true);
  assert.throws(
    () => upsertItem("mealRecords", { id: "new" }),
    /当前写入已停止/
  );
  assert.equal(localStorage.getItem("diet-helper-data"), raw);
});

function createStorage() {
  const values = new Map();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(String(key));
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    },
  };
}
