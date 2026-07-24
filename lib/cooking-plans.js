export const COOKING_TOOLS = ["炒锅", "汤锅", "电饭煲", "烤箱", "空气炸锅"];
export const COOKING_TASTES = ["清淡", "辣", "少油", "素食"];
const RAW_SAFE_INGREDIENTS = [
  /^(黄瓜|青瓜)$/,
  /^(番茄|西红柿|圣女果|小番茄)$/,
  /^(生菜|罗马生菜|苦菊|芝麻菜)$/,
  /^(胡萝卜|白萝卜|水萝卜)$/,
  /^(彩椒|甜椒)$/,
  /^(苹果|梨|香蕉|橙子|橘子|葡萄|草莓|蓝莓|西瓜|哈密瓜|猕猴桃)$/,
  /^(牛油果|鳄梨)$/,
];

const RULES = [
  {
    key: "cold-mix",
    title: "清爽拌一盘",
    minutes: 5,
    tools: [],
    tastes: ["清淡", "少油", "素食"],
    match: (items) =>
      items.length > 0 &&
      items.every((item) => RAW_SAFE_INGREDIENTS.some((pattern) => pattern.test(item))),
    missing: ["盐", "醋或柠檬汁"],
    steps: (ingredients) => [
      `把${ingredients.join("、")}洗净，适合生食的切成小块。`,
      "加入少量盐和醋拌匀；不能生食的材料请改用后续加热方案。",
    ],
    safety: "确认食材适合生食；肉类、蛋类和不确定的食材必须彻底加热。",
  },
  {
    key: "tomato-eggs",
    priority: 10,
    title: "番茄炒蛋",
    minutes: 18,
    tools: ["炒锅"],
    tastes: ["清淡", "少油"],
    match: (items) => includesAny(items, ["番茄", "西红柿"]) && includesAny(items, ["蛋", "鸡蛋"]),
    missing: ["盐", "食用油"],
    steps: () => [
      "番茄切块，鸡蛋打散。",
      "锅热后放少量油，鸡蛋炒至凝固后盛出。",
      "番茄炒出汁，放回鸡蛋，加盐翻匀。",
    ],
    safety: "鸡蛋应炒至完全凝固，盛放生蛋液的容器不要接触熟食。",
  },
  {
    key: "fried-rice",
    priority: 10,
    title: "家常什锦炒饭",
    minutes: 15,
    tools: ["炒锅"],
    tastes: ["少油"],
    match: (items) => includesAny(items, ["米饭", "剩饭"]),
    missing: ["盐", "食用油"],
    steps: (ingredients) => [
      "把配菜切成小粒，米饭提前拨散。",
      `先炒熟${ingredients.filter((item) => !/米饭|剩饭/.test(item)).join("、") || "配菜"}。`,
      "加入米饭翻炒至热透，少量盐调味。",
    ],
    safety: "隔夜米饭应冷藏保存，并在食用前彻底加热。",
  },
  {
    key: "quick-noodles",
    priority: 10,
    title: "一碗热汤面",
    minutes: 20,
    tools: ["汤锅"],
    tastes: ["清淡"],
    match: (items) => includesAny(items, ["面", "面条", "挂面"]),
    missing: ["盐", "清水"],
    steps: (ingredients) => [
      "汤锅加水煮沸，先放需要久煮的食材。",
      "下面条并轻轻拨散。",
      `加入${ingredients.filter((item) => !/面/.test(item)).join("、") || "现有配菜"}，煮熟后调味。`,
    ],
    safety: "肉类与蛋类应完全熟透，汤锅沸腾时注意防烫。",
  },
  {
    key: "stir-fry",
    title: "现有食材快炒",
    minutes: 12,
    tools: ["炒锅"],
    tastes: ["辣", "少油", "素食"],
    match: () => true,
    missing: ["盐", "食用油"],
    steps: (ingredients) => [
      `把${ingredients.join("、")}洗净并切成大小接近的块。`,
      "锅热后放少量油，先下不易熟的食材。",
      "加入其余食材炒熟，少量盐调味后出锅。",
    ],
    safety: "生熟食材分开处理；肉类应确认中心完全熟透。",
  },
  {
    key: "rice-cooker",
    title: "电饭煲一锅焖",
    minutes: 45,
    tools: ["电饭煲"],
    tastes: ["清淡", "少油"],
    match: () => true,
    missing: ["大米", "盐", "清水"],
    steps: (ingredients, partySize) => [
      `按${partySize}人份淘米，现有食材切小块。`,
      `把${ingredients.join("、")}铺在米上，按平时水量加水。`,
      "启动煮饭程序，结束后翻拌均匀并确认食材熟透。",
    ],
    safety: "肉类应切小并完全熟透；开盖时避开蒸汽。",
  },
];

export function parseIngredients(value) {
  return [...new Set(
    String(value || "")
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean)
  )];
}

export function matchCookingPlans(input) {
  const selectedTools = new Set(input.tools || []);
  const selectedTastes = new Set(input.tastePreferences || []);
  const customRequirement = String(input.customRequirement || "").trim().slice(0, 200);
  return RULES.filter((rule) => rule.minutes <= input.availableMinutes)
    .filter((rule) => !selectedTools.size || !rule.tools.length || rule.tools.some((tool) => selectedTools.has(tool)))
    .filter((rule) => !selectedTastes.size || rule.tastes.some((taste) => selectedTastes.has(taste)))
    .filter((rule) => rule.match(input.ingredients))
    .sort((left, right) => (right.priority || 0) - (left.priority || 0))
    .map((rule) => {
      const steps = rule.steps(input.ingredients, input.partySize);
      if (customRequirement) {
        steps.push(`完成前按补充要求调整：${customRequirement}。这项内容只作操作提醒，忌口和过敏仍需自行确认。`);
      }
      return {
        ruleKey: rule.key,
        title: rule.title,
        estimatedMinutes: rule.minutes,
        requiredIngredients: input.ingredients,
        missingIngredients: rule.missing.filter(
          (missing) => !input.ingredients.some((item) => item.includes(missing))
        ),
        steps,
        safetyNote: rule.safety,
        requirementNote: customRequirement,
      };
    });
}

function includesAny(items, values) {
  return items.some((item) => values.some((value) => item.includes(value)));
}
