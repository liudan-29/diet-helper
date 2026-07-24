let toastTimer = null;

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function showToast(message, options = {}) {
  const toast = document.querySelector("#toast");
  const text = document.querySelector("#toastText");
  const action = document.querySelector("#toastAction");
  const countdown = document.querySelector("#toastCountdown");
  clearTimeout(toastTimer);
  text.textContent = message;
  action.hidden = !options.actionLabel;
  action.textContent = options.actionLabel || "";
  action.onclick = options.onAction || null;
  countdown.textContent = options.countdown ? String(options.countdown) : "";
  toast.hidden = false;
  toast.focus({ preventScroll: true });
  if (!options.persistent) {
    toastTimer = setTimeout(() => {
      toast.hidden = true;
      options.onExpire?.();
    }, options.duration || 3500);
  }
  return {
    setCountdown(value) {
      countdown.textContent = String(value);
    },
    close() {
      clearTimeout(toastTimer);
      toast.hidden = true;
    },
  };
}

export function openModal({ title, content, actions = [], danger = false, trigger = null }) {
  const root = document.querySelector("#modalRoot");
  const panel = root.querySelector(".modal-panel");
  const titleElement = root.querySelector("#modalTitle");
  const body = root.querySelector("#modalBody");
  const footer = root.querySelector("#modalActions");
  const closeButton = root.querySelector("#modalClose");
  titleElement.textContent = title;
  body.innerHTML = content;
  footer.replaceChildren();
  panel.classList.toggle("danger-modal", danger);

  const close = () => {
    root.hidden = true;
    document.body.classList.remove("modal-open");
    document.removeEventListener("keydown", onKeydown);
    trigger?.focus?.();
  };
  const onKeydown = (event) => {
    if (event.key === "Escape" && !danger) close();
    if (event.key !== "Tab") return;
    const focusable = [...panel.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]'
    )];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  actions.forEach((action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = action.className || "secondary-action";
    button.textContent = action.label;
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const shouldClose = await action.onClick?.(body, close);
        if (shouldClose !== false) close();
      } finally {
        button.disabled = false;
      }
    });
    footer.append(button);
  });
  closeButton.onclick = close;
  root.hidden = false;
  document.body.classList.add("modal-open");
  document.addEventListener("keydown", onKeydown);
  requestAnimationFrame(() => panel.querySelector("input, button, textarea, select")?.focus());
  return { close, body };
}

export function setChipSelection(container, values, multiple = true) {
  const selected = new Set(Array.isArray(values) ? values : [values]);
  container.querySelectorAll("[data-value]").forEach((button) => {
    const active = selected.has(button.dataset.value);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  if (!multiple && !selected.size) {
    const first = container.querySelector("[data-value]");
    first?.classList.add("active");
  }
}

export function valuesFromChips(container) {
  return [...container.querySelectorAll("[data-value].active")].map(
    (button) => button.dataset.value
  );
}

export function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

export function currentMealPeriod() {
  const hour = new Date().getHours();
  return hour < 10 ? "早餐" : hour < 15 ? "午餐" : hour < 21 ? "晚餐" : "夜宵";
}
