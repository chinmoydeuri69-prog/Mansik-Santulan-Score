(() => {
  "use strict";

  const API_BASE = "http://127.0.0.1:8000";
  const REQUEST_TIMEOUT_MS = 30000;
  const SCORE_MAX = 10;

  const $ = (id) => document.getElementById(id);

  const form = $("predict-form");
  const submitBtn = $("submit-btn");
  const resetBtn = $("reset-btn");
  const retryBtn = $("error-retry-btn");

  const states = {
    idle: $("state-idle"),
    loading: $("state-loading"),
    result: $("state-result"),
    error: $("state-error")
  };

  const scoreNumber = $("score-number");
  const scoreBand = $("score-band");
  const scoreContext = $("score-context");
  const gaugeFill = $("gauge-fill");
  const errorLabel = $("error-label");
  const errorCopy = $("error-copy");
  const stressGroup = $("stress_level_group");
  const stressInput = $("stress_level");

  if (!form || !submitBtn || Object.values(states).some((el) => !el) ||
      !scoreNumber || !scoreBand || !scoreContext || !gaugeFill || !errorCopy) {
    console.error("Mindful Metrics: one or more required HTML elements are missing.");
    return;
  }

  const fieldNames = [
    "age", "gender", "country", "academic_level", "most_used_platform",
    "purpose_of_use", "avg_daily_usage_hours", "daily_unlocks", "study_hours",
    "physical_activity_hours", "sleep_hours_per_night", "stress_level"
  ];

  function showState(name) {
    Object.entries(states).forEach(([key, element]) => {
      element.hidden = key !== name;
    });
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    if (resetBtn) resetBtn.disabled = busy;
    if (busy) {
      submitBtn.dataset.label = submitBtn.innerText;
      submitBtn.innerHTML = "<span>Creating snapshot…</span><span aria-hidden='true'>↗</span>";
    } else if (submitBtn.dataset.label) {
      submitBtn.innerHTML = `<span>${escapeHtml(submitBtn.dataset.label)}</span><span aria-hidden="true">↗</span>`;
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function wrapperFor(input) {
    return input?.closest(".form-group") || input?.parentElement;
  }

  function setFieldError(name, message) {
    const input = $(name);
    if (!input) return;
    const wrapper = wrapperFor(input);
    if (wrapper) {
      wrapper.classList.add("has-error");
      let note = wrapper.querySelector(".field-error");
      if (!note) {
        note = document.createElement("small");
        note.className = "field-error";
        note.setAttribute("role", "alert");
        wrapper.appendChild(note);
      }
      note.textContent = message;
    }
    input.setAttribute("aria-invalid", "true");
  }

  function clearFieldError(name) {
    const input = $(name);
    if (!input) return;
    const wrapper = wrapperFor(input);
    if (wrapper) {
      wrapper.classList.remove("has-error");
      wrapper.querySelector(".field-error")?.remove();
    }
    input.removeAttribute("aria-invalid");
  }

  function clearErrors() {
    fieldNames.forEach(clearFieldError);
  }

  function getPayload() {
    const data = new FormData(form);
    const text = (key) => String(data.get(key) ?? "").trim();
    const number = (key) => {
      const raw = data.get(key);
      return raw === null || String(raw).trim() === "" ? NaN : Number(raw);
    };

    return {
      age: number("age"),
      gender: text("gender"),
      country: text("country"),
      academic_level: text("academic_level"),
      most_used_platform: text("most_used_platform"),
      purpose_of_use: text("purpose_of_use"),
      avg_daily_usage_hours: number("avg_daily_usage_hours"),
      daily_unlocks: number("daily_unlocks"),
      study_hours: number("study_hours"),
      physical_activity_hours: number("physical_activity_hours"),
      sleep_hours_per_night: number("sleep_hours_per_night"),
      stress_level: text("stress_level")
    };
  }

  function validate(payload) {
    let valid = true;

    const requiredText = [
      ["gender", "Please choose an option."],
      ["country", "Please enter your country."],
      ["academic_level", "Please select your academic level."],
      ["most_used_platform", "Please select a platform."],
      ["purpose_of_use", "Please select a purpose."],
      ["stress_level", "Please select a stress level."]
    ];

    requiredText.forEach(([name, message]) => {
      if (!payload[name]) {
        setFieldError(name, message);
        valid = false;
      }
    });

    const numeric = [
      { name: "age", label: "Age", min: 10, max: 100, integer: true },
      { name: "avg_daily_usage_hours", label: "Screen time", min: 0, max: 24 },
      { name: "daily_unlocks", label: "Daily unlocks", min: 0, integer: true },
      { name: "study_hours", label: "Study hours", min: 0, max: 24 },
      { name: "physical_activity_hours", label: "Physical activity", min: 0, max: 24 },
      { name: "sleep_hours_per_night", label: "Sleep hours", min: 0, max: 24 }
    ];

    numeric.forEach((field) => {
      const value = payload[field.name];
      let message = "";

      if (!Number.isFinite(value)) {
        message = `Enter a valid ${field.label.toLowerCase()}.`;
      } else if (value < field.min || (field.max !== undefined && value > field.max)) {
        message = field.max === undefined
          ? `${field.label} must be at least ${field.min}.`
          : `${field.label} must be between ${field.min} and ${field.max}.`;
      } else if (field.integer && !Number.isInteger(value)) {
        message = `${field.label} must be a whole number.`;
      }

      if (message) {
        setFieldError(field.name, message);
        valid = false;
      }
    });

    return valid;
  }

  function displayError(title, message) {
    if (errorLabel) errorLabel.textContent = title;
    errorCopy.textContent = errorLabel ? message : `${title}: ${message}`;
    showState("error");
  }

  function scoreDescription(score) {
    if (score < 4) return "Lower model score";
    if (score < 7) return "Mid-range model score";
    return "Higher model score";
  }

  function displayResult(rawScore) {
    const score = Number(rawScore);
    if (!Number.isFinite(score)) {
      displayError("Unexpected response", "The server did not return a valid score. Please try again.");
      return;
    }

    const boundedScore = Math.max(0, Math.min(SCORE_MAX, score));
    scoreNumber.textContent = boundedScore.toFixed(2);
    scoreBand.textContent = scoreDescription(boundedScore);
    scoreContext.textContent =
      "This is an experimental estimate based on the information submitted. It is not a diagnosis or clinical assessment.";

    gaugeFill.style.width = `${(boundedScore / SCORE_MAX) * 100}%`;
    showState("result");
  }

  async function parseJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function showServerFieldErrors(details) {
    if (!Array.isArray(details)) return false;
    let found = false;

    details.forEach((item) => {
      if (!Array.isArray(item?.loc)) return;
      const field = item.loc[item.loc.length - 1];
      if (typeof field !== "string" || !$(field)) return;
      setFieldError(field, item.msg || "Please check this field.");
      found = true;
    });

    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearErrors();

    const payload = getPayload();
    if (!validate(payload)) {
      const firstInvalid = form.querySelector('[aria-invalid="true"]');
      firstInvalid?.focus();
      return;
    }

    showState("loading");
    setBusy(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      const result = await parseJson(response);

      if (response.status === 422) {
        const hasFieldErrors = showServerFieldErrors(result?.detail);
        displayError(
          "Please review your answers",
          hasFieldErrors
            ? "A few entries need attention. Correct the highlighted fields and submit again."
            : "The server could not validate these answers. Please review your entries."
        );
        return;
      }

      if (!response.ok) {
        const message = typeof result?.detail === "string"
          ? result.detail
          : `The service returned an error (${response.status}).`;
        throw new Error(message);
      }

      if (result?.predicted_mental_health_score === undefined) {
        throw new Error("The response did not include a predicted score.");
      }

      displayResult(result.predicted_mental_health_score);
    } catch (error) {
      console.error("Snapshot request failed:", error);

      if (error.name === "AbortError") {
        displayError("The request took too long", "The service did not respond in time. Please try again.");
      } else if (error instanceof TypeError) {
        displayError("Connection issue", "We couldn't reach the service. Check your connection and try again.");
      } else {
        displayError("We couldn't create your snapshot", error.message || "Please try again in a moment.");
      }
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  }

  function backToForm() {
    clearErrors();
    showState("idle");
  }

  if (stressGroup && stressInput) {
    const stressButtons = stressGroup.querySelectorAll("button[data-value]");
    stressButtons.forEach((button) => {
      button.addEventListener("click", () => {
        stressInput.value = button.dataset.value || "";
        stressButtons.forEach((other) => {
          const selected = other === button;
          other.classList.toggle("active", selected);
          other.setAttribute("aria-pressed", String(selected));
        });
        clearFieldError("stress_level");
      });
    });
  }

  form.addEventListener("input", (event) => {
    if (event.target?.id) clearFieldError(event.target.id);
  });

  form.addEventListener("change", (event) => {
    if (event.target?.id) clearFieldError(event.target.id);
  });

  form.addEventListener("submit", handleSubmit);
  resetBtn?.addEventListener("click", backToForm);
  retryBtn?.addEventListener("click", backToForm);

  showState("idle");
  console.info("Mindful Metrics is ready.");
})();
