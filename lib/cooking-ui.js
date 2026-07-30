import {
  COOKING_TASTES,
  COOKING_TOOLS,
  matchCookingPlans,
  parseIngredients,
} from "./cooking-plans.js";
import {
  createId,
  isFavorite,
  readFormDraft,
  readStore,
  saveFormDraft,
  toggleFavorite,
  upsertItem,
} from "./local-store.js";
import {
  currentMealPeriod,
  escapeHtml,
  setChipSelection,
  showToast,
  todayString,
  valuesFromChips,
} from "./ui.js";

export function createCooking({ openRecordEditor }) {
  const elements = collectElements();
  const profile = readStore().data.userProfile;
  const draft = readFormDraft("cooking") || {};
  const state = {
    candidates: [],
    index: 0,
    currentPlan: null,
    generationSequence: 0,
  };

  elements.cookingToolChips.innerHTML = COOKING_TOOLS.map(chipHtml).join("");
  elements.cookingTasteChips.innerHTML = COOKING_TASTES.map(chipHtml).join("");
  elements.cookingIngredients.value = draft.ingredients || "";
  elements.cookingMinutes.value = String(draft.availableMinutes || 30);
  elements.cookingPartySize.value = String(draft.partySize || Math.min(profile.defaultPartySize, 20));
  elements.cookingRequirement.value = draft.customRequirement || "";
  setChipSelection(elements.cookingToolChips, draft.tools || []);
  setChipSelection(elements.cookingTasteChips, draft.tastePreferences || profile.tastePreferences);
  bindEvents();

  function bindEvents() {
    elements.cookingForm.addEventListener("submit", generatePlans);
    elements.quickTimeChips.addEventListener("click", (event) => {
      const chip = event.target.closest("[data-value]");
      if (!chip) return;
      elements.cookingMinutes.value = chip.dataset.value;
      saveDraft();
    });
    [elements.cookingToolChips, elements.cookingTasteChips].forEach((group) => {
      group.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-value]");
        if (!chip) return;
        chip.classList.toggle("active");
        chip.setAttribute("aria-pressed", String(chip.classList.contains("active")));
        saveDraft();
      });
    });
    [
      elements.cookingIngredients,
      elements.cookingMinutes,
      elements.cookingPartySize,
      elements.cookingRequirement,
    ].forEach((input) => input.addEventListener("input", saveDraft));
    elements.cookingResult.addEventListener("click", handleResultAction);
  }

  async function generatePlans(event) {
    event.preventDefault();
    const input = readInput();
    if (!validate(input)) return;
    const sequence = ++state.generationSequence;
    elements.generatePlanButton.disabled = true;
    elements.generatePlanButton.innerHTML = "正在匹配 <span>···</span>";
    elements.cookingMessage.textContent = "";
    await Promise.resolve();
    if (sequence !== state.generationSequence) return;
    state.candidates = matchCookingPlans(input);
    state.index = 0;
    if (!state.candidates.length) {
      elements.cookingMessage.textContent = "没有匹配方案，请减少厨具或口味限制，或增加可用时间。";
      elements.cookingResult.innerHTML = `<div class="status-banner warning">没有找到完整方案，输入已保留，可以修改条件后重试。</div>`;
    } else {
      state.currentPlan = persistPlan(input, state.candidates[0]);
      renderPlan();
    }
    elements.generatePlanButton.disabled = false;
    elements.generatePlanButton.innerHTML = "生成方案 <span>↗</span>";
  }

  function readInput() {
    return {
      ingredients: parseIngredients(elements.cookingIngredients.value),
      availableMinutes: Number(elements.cookingMinutes.value),
      partySize: Number(elements.cookingPartySize.value),
      tools: valuesFromChips(elements.cookingToolChips),
      tastePreferences: valuesFromChips(elements.cookingTasteChips),
      customRequirement: elements.cookingRequirement.value.trim(),
    };
  }

  function validate(input) {
    const checks = [
      [elements.cookingIngredients, input.ingredients.length >= 1, "请至少填写1项食材。"],
      [elements.cookingMinutes, Number.isInteger(input.availableMinutes) && input.availableMinutes >= 5 && input.availableMinutes <= 240, "可用时间请填写5至240分钟。"],
      [elements.cookingPartySize, Number.isInteger(input.partySize) && input.partySize >= 1 && input.partySize <= 20, "用餐人数请填写1至20人。"],
    ];
    checks.forEach(([element]) => element.classList.remove("invalid"));
    const invalid = checks.find(([, valid]) => !valid);
    if (!invalid) {
      saveDraft();
      return true;
    }
    invalid[0].classList.add("invalid");
    elements.cookingMessage.textContent = invalid[2];
    invalid[0].focus();
    return false;
  }

  function persistPlan(input, match) {
    const now = new Date().toISOString();
    const plan = {
      id: createId("cooking-plan"),
      ...input,
      ...match,
      source: "local-rules",
      status: "generated",
      createdAt: now,
      updatedAt: now,
    };
    try {
      upsertItem("cookingPlans", plan);
    } catch {
      elements.cookingMessage.textContent = "方案已生成，但本地历史未保存。";
    }
    return plan;
  }

  function renderPlan() {
    const plan = state.currentPlan;
    if (!plan) return;
    const favorite = isFavorite("cookingPlan", plan.id);
    elements.cookingResult.className = "cooking-result";
    elements.cookingResult.innerHTML = `
      <article class="recipe-sheet">
        <div class="recipe-title">
          <div><p class="eyebrow">本地食谱方案</p><h2>${escapeHtml(plan.title)}</h2><p class="recipe-meta">${plan.estimatedMinutes}分钟 · ${plan.partySize}人</p></div>
          <button class="icon-button favorite-button${favorite ? " active" : ""}" data-cook-action="favorite" type="button" aria-label="${favorite ? "取消收藏方案" : "收藏方案"}">${favorite ? "★" : "☆"}</button>
        </div>
        <div class="ingredient-groups">
          <div><h3>已有材料</h3><ul>${plan.ingredients.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>
          <div><h3>还需准备</h3>${plan.missingIngredients.length ? `<ul>${plan.missingIngredients.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "<p>无需额外准备</p>"}</div>
        </div>
        <h3>制作步骤</h3>
        <div class="recipe-steps">${plan.steps.map((step, index) => `<div class="recipe-step"><span>${String(index + 1).padStart(2, "0")}</span><p>${escapeHtml(step)}</p></div>`).join("")}</div>
        <div class="safety-note"><strong>注意事项</strong><br />${escapeHtml(plan.safetyNote)}</div>
        <div class="recipe-actions">
          <button class="primary-action" data-cook-action="record" type="button">记为吃过</button>
          <button class="secondary-action" data-cook-action="next" type="button">换一个</button>
          <button class="icon-button" data-cook-action="favorite" type="button" aria-label="${favorite ? "取消收藏方案" : "收藏方案"}">${favorite ? "★" : "☆"}</button>
        </div>
      </article>`;
  }

  function handleResultAction(event) {
    const button = event.target.closest("[data-cook-action]");
    if (!button || !state.currentPlan) return;
    if (button.dataset.cookAction === "next") {
      if (state.candidates.length < 2 || state.index >= state.candidates.length - 1) {
        showToast("没有更多匹配方案，当前方案已保留。");
        return;
      }
      state.index += 1;
      state.currentPlan = persistPlan(readInput(), state.candidates[state.index]);
      renderPlan();
    }
    if (button.dataset.cookAction === "favorite") togglePlanFavorite();
    if (button.dataset.cookAction === "record") recordPlan();
  }

  function togglePlanFavorite() {
    const plan = state.currentPlan;
    try {
      const result = toggleFavorite("cookingPlan", plan.id, {
        title: plan.title,
        estimatedMinutes: plan.estimatedMinutes,
        ingredients: plan.ingredients.slice(0, 4),
      });
      renderPlan();
      showToast(result.active ? "已收藏做饭方案。" : "已取消收藏。");
    } catch {
      showToast("本次收藏未保存，请检查浏览器存储空间。");
    }
  }

  function recordPlan() {
    const plan = state.currentPlan;
    openRecordEditor({
      sourceType: "cooking",
      sourceId: plan.id,
      title: plan.title,
      foods: plan.ingredients.join("、"),
      mealDate: todayString(),
      mealPeriod: currentMealPeriod(),
      partySize: plan.partySize,
      sourceHint: `来自“自己做” · ${plan.title}`,
    });
  }

  function saveDraft() {
    saveFormDraft("cooking", {
      ingredients: elements.cookingIngredients.value,
      availableMinutes: Number(elements.cookingMinutes.value),
      partySize: Number(elements.cookingPartySize.value),
      tools: valuesFromChips(elements.cookingToolChips),
      tastePreferences: valuesFromChips(elements.cookingTasteChips),
      customRequirement: elements.cookingRequirement.value,
    });
  }

  return {
    openPlan(id) {
      const plan = readStore().data.cookingPlans.find((item) => item.id === id);
      if (!plan) return;
      state.currentPlan = plan;
      state.candidates = [plan];
      state.index = 0;
      renderPlan();
    },
    reusePlan(id) {
      const plan = readStore().data.cookingPlans.find((item) => item.id === id);
      if (!plan) return;
      elements.cookingIngredients.value = plan.ingredients.join("，");
      elements.cookingMinutes.value = String(plan.availableMinutes);
      elements.cookingPartySize.value = String(plan.partySize);
      elements.cookingRequirement.value = plan.customRequirement || "";
      setChipSelection(elements.cookingToolChips, plan.tools || []);
      setChipSelection(elements.cookingTasteChips, plan.tastePreferences || []);
      saveDraft();
      this.openPlan(id);
    },
  };
}

function chipHtml(value) {
  return `<button class="chip" data-value="${escapeHtml(value)}" type="button" aria-pressed="false">${escapeHtml(value)}</button>`;
}

function collectElements() {
  const ids = [
    "cookingForm", "cookingIngredients", "cookingMinutes", "cookingPartySize",
    "cookingRequirement", "cookingToolChips", "cookingTasteChips",
    "quickTimeChips", "generatePlanButton", "cookingMessage", "cookingResult",
  ];
  return Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
}
