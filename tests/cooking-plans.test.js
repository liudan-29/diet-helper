import test from "node:test";
import assert from "node:assert/strict";

import {
  matchCookingPlans,
  parseIngredients,
} from "../lib/cooking-plans.js";

test("食材输入支持中英文分隔并自动去重", () => {
  assert.deepEqual(
    parseIngredients("鸡蛋，番茄\n鸡蛋, 米饭、青菜"),
    ["鸡蛋", "番茄", "米饭", "青菜"]
  );
});

test("番茄和鸡蛋可以匹配不超过可用时间的完整方案", () => {
  const plans = matchCookingPlans({
    ingredients: ["番茄", "鸡蛋"],
    availableMinutes: 20,
    partySize: 2,
    tools: ["炒锅"],
    tastePreferences: ["清淡"],
  });

  const plan = plans.find((item) => item.ruleKey === "tomato-eggs");
  assert.ok(plan);
  assert.equal(plans[0].ruleKey, "tomato-eggs");
  assert.equal(plan.title, "番茄炒蛋");
  assert.ok(plan.estimatedMinutes <= 20);
  assert.ok(plan.steps.length >= 1);
  assert.ok(Array.isArray(plan.missingIngredients));
});

test("做饭方案遵守时间、厨具和口味限制", () => {
  const plans = matchCookingPlans({
    ingredients: ["米饭", "青菜"],
    availableMinutes: 15,
    partySize: 1,
    tools: ["炒锅"],
    tastePreferences: ["少油"],
  });

  assert.ok(plans.length >= 1);
  assert.ok(plans.every((item) => item.estimatedMinutes <= 15));
  assert.equal(plans.some((item) => item.ruleKey === "rice-cooker"), false);
});

test("肉蛋和未知食材不会套用生食凉拌方案", () => {
  for (const ingredients of [["鸡蛋"], ["鸡胸肉"], ["神秘食材"]]) {
    const plans = matchCookingPlans({
      ingredients,
      availableMinutes: 20,
      partySize: 1,
      tools: ["炒锅"],
      tastePreferences: [],
    });
    assert.equal(plans.some((item) => item.ruleKey === "cold-mix"), false);
  }
});

test("补充要求会进入方案提醒", () => {
  const [plan] = matchCookingPlans({
    ingredients: ["黄瓜"],
    availableMinutes: 10,
    partySize: 1,
    tools: [],
    tastePreferences: ["清淡"],
    customRequirement: "不要香菜",
  });
  assert.equal(plan.requirementNote, "不要香菜");
  assert.ok(plan.steps.some((step) => step.includes("不要香菜")));
});
