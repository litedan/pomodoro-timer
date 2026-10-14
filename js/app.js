
"use strict";

const DEFAULTS = {
  work: 25,
  short: 5,
  long: 15,
  cycle: 4,
};

const MODES = {
  work: {
    title: "Time to focus",
    label: "Focus",
  },
  short: {
    title: "Take a short break",
    label: "Short break",
  },
  long: {
    title: "Time for a longer break",
    label: "Long break",
  },
};

const STORAGE_KEY = "pomodoro-timer-state";

const elements = {
  timer: document.querySelector("#timer"),
  title: document.querySelector("#session-title"),
  status: document.querySelector("#session-status"),
  start: document.querySelector("#start-button"),
  reset: document.querySelector("#reset-button"),
  settingsButton: document.querySelector("#settings-button"),
  settings: document.querySelector("#settings"),
  settingsForm: document.querySelector("#settings-form"),
  workInput: document.querySelector("#work-duration"),
  shortInput: document.querySelector("#short-duration"),
  longInput: document.querySelector("#long-duration"),
  cycleInput: document.querySelector("#cycle-duration"),
  completed: document.querySelector("#completed-count"),
  cycle: document.querySelector("#cycle-count"),
  tabs: [...document.querySelectorAll(".session-tab")],
};

const state = {
  mode: "work",
  running: false,
  endTime: null,
  remaining: DEFAULTS.work * 60,
  intervalId: null,
  completedSessions: 0,
  cycleSessions: 0,
  durations: { ...DEFAULTS },
};

// ---------- Persistence ----------

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) return null;

    const saved = JSON.parse(raw);

    if (!saved || typeof saved !== "object") {
      return null;
    }

    const durations = saved.durations;

    if (!durations || typeof durations !== "object") {
      return null;
    }

    const validDuration =
      Number.isInteger(durations.work) &&
      durations.work >= 1 &&
      durations.work <= 120 &&
      Number.isInteger(durations.short) &&
      durations.short >= 1 &&
      durations.short <= 60 &&
      Number.isInteger(durations.long) &&
      durations.long >= 1 &&
      durations.long <= 120 &&
      Number.isInteger(durations.cycle) &&
      durations.cycle >= 2 &&
      durations.cycle <= 12;

    if (!validDuration) {
      return null;
    }

    return {
      durations: {
        work: durations.work,
        short: durations.short,
        long: durations.long,
        cycle: durations.cycle,
      },
      completedSessions:
        Number.isSafeInteger(saved.completedSessions) &&
        saved.completedSessions >= 0
          ? saved.completedSessions
          : 0,
      cycleSessions:
        Number.isSafeInteger(saved.cycleSessions) &&
        saved.cycleSessions >= 0
          ? saved.cycleSessions % durations.cycle
          : 0,
    };
  } catch (error) {
    console.warn("Could not load saved state:", error);
    return null;
  }
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        durations: state.durations,
        completedSessions: state.completedSessions,
        cycleSessions: state.cycleSessions,
      })
    );
  } catch (error) {
    console.warn("Could not save state:", error);
  }
}

function restoreState() {
  const saved = loadSavedState();

  if (!saved) return;

  state.durations = saved.durations;
  state.completedSessions = saved.completedSessions;
  state.cycleSessions = saved.cycleSessions;
  state.remaining = state.durations.work * 60;
}

// ---------- Display ----------

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(remainingSeconds).padStart(2, "0")
  );
}

function updateDisplay() {
  elements.timer.textContent = formatTime(state.remaining);
  elements.title.textContent = MODES[state.mode].title;

  elements.completed.textContent = String(
    state.completedSessions
  );

  elements.cycle.textContent =
    `${state.cycleSessions}/${state.durations.cycle}`;

  if (state.running) {
    elements.start.textContent = "Pause";
  } else if (
    state.remaining === state.durations[state.mode] * 60
  ) {
    elements.start.textContent = "Start";
  } else {
    elements.start.textContent = "Resume";
  }

  elements.tabs.forEach((tab) => {
    const active = tab.dataset.mode === state.mode;

    tab.classList.toggle("active", active);
    tab.setAttribute("aria-pressed", String(active));
  });

  document.title =
    `${formatTime(state.remaining)} — Pomodoro`;

  saveState();
}

// ---------- Sound notification ----------

function playSound() {
  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    const audioContext = new AudioContextClass();

    const playTone = (frequency, startAt, duration) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;

      gain.gain.setValueAtTime(0.001, startAt);
      gain.gain.exponentialRampToValueAtTime(
        0.15,
        startAt + 0.02
      );
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        startAt + duration
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start(startAt);
      oscillator.stop(startAt + duration);
    };

    const playSequence = () => {
      const now = audioContext.currentTime;

      playTone(660, now, 0.2);
      playTone(880, now + 0.25, 0.3);

      setTimeout(() => {
        audioContext.close().catch(() => {});
      }, 1000);
    };

    if (audioContext.state === "suspended") {
      audioContext.resume()
        .then(playSequence)
        .catch(() => audioContext.close());
    } else {
      playSequence();
    }
  } catch (error) {
    console.warn("Could not play notification sound:", error);
  }
}

// ---------- Timer control ----------

function stopInterval() {
  if (state.intervalId !== null) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }
}

function selectMode(mode) {
  if (!Object.hasOwn(MODES, mode)) return;

  stopInterval();

  state.running = false;
  state.endTime = null;
  state.mode = mode;
  state.remaining = state.durations[mode] * 60;

  elements.status.textContent = "Ready when you are.";

  updateDisplay();
}

function finishSession() {
  stopInterval();

  state.running = false;
  state.endTime = null;
  state.remaining = 0;

  if (state.mode === "work") {
    state.completedSessions += 1;
    state.cycleSessions += 1;

    if (state.cycleSessions >= state.durations.cycle) {
      state.cycleSessions = 0;
      state.mode = "long";
    } else {
      state.mode = "short";
    }
  } else {
    state.mode = "work";
  }

  state.remaining = state.durations[state.mode] * 60;

  elements.status.textContent =
    "Session complete! Time for the next one.";

  updateDisplay();
  playSound();
}

function tick() {
  if (!state.running || state.endTime === null) return;

  state.remaining = Math.max(
    0,
    Math.ceil((state.endTime - Date.now()) / 1000)
  );

  if (state.remaining <= 0) {
    finishSession();
    return;
  }

  updateDisplay();
}

function startTimer() {
  if (state.running) {
    // Update first to avoid losing time between ticks.
    tick();

    if (!state.running) return;

    state.running = false;
    state.endTime = null;

    stopInterval();

    elements.status.textContent = "Timer paused.";

    updateDisplay();
    return;
  }

  if (state.remaining <= 0) {
    state.remaining = state.durations[state.mode] * 60;
  }

  state.running = true;
  state.endTime = Date.now() + state.remaining * 1000;

  elements.status.textContent =
    "Stay focused. You've got this.";

  stopInterval();
  state.intervalId = setInterval(tick, 250);

  updateDisplay();
}

function resetTimer() {
  stopInterval();

  state.running = false;
  state.endTime = null;
  state.remaining = state.durations[state.mode] * 60;

  elements.status.textContent = "Timer reset.";

  updateDisplay();
}

// ---------- Settings ----------

function toggleSettings() {
  const willOpen = elements.settings.hidden;

  elements.settings.hidden = !willOpen;

  elements.settingsButton.setAttribute(
    "aria-expanded",
    String(willOpen)
  );

  if (willOpen) {
    elements.workInput.value = state.durations.work;
    elements.shortInput.value = state.durations.short;
    elements.longInput.value = state.durations.long;
    elements.cycleInput.value = state.durations.cycle;

    elements.settings.querySelector("input").focus();
  } else {
    elements.settingsButton.focus();
  }
}

function readSettings() {
  return {
    work: Number(elements.workInput.value),
    short: Number(elements.shortInput.value),
    long: Number(elements.longInput.value),
    cycle: Number(elements.cycleInput.value),
  };
}

function validateSettings(durations) {
  return (
    Number.isInteger(durations.work) &&
    durations.work >= 1 &&
    durations.work <= 120 &&
    Number.isInteger(durations.short) &&
    durations.short >= 1 &&
    durations.short <= 60 &&
    Number.isInteger(durations.long) &&
    durations.long >= 1 &&
    durations.long <= 120 &&
    Number.isInteger(durations.cycle) &&
    durations.cycle >= 2 &&
    durations.cycle <= 12
  );
}

function saveSettings(event) {
  event.preventDefault();

  const durations = readSettings();

  if (!validateSettings(durations)) {
    elements.status.textContent =
      "Enter valid durations within the allowed ranges.";
    return;
  }

  stopInterval();

  state.running = false;
  state.endTime = null;
  state.durations = durations;

  state.cycleSessions %= durations.cycle;
  state.remaining = durations[state.mode] * 60;

  elements.settings.hidden = true;

  elements.settingsButton.setAttribute(
    "aria-expanded",
    "false"
  );

  elements.status.textContent = "Settings saved.";

  updateDisplay();
  elements.settingsButton.focus();
}

// ---------- Event listeners ----------

elements.start.addEventListener("click", startTimer);
elements.reset.addEventListener("click", resetTimer);

elements.settingsButton.addEventListener(
  "click",
  toggleSettings
);

elements.settingsForm.addEventListener(
  "submit",
  saveSettings
);

elements.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectMode(tab.dataset.mode);
  });
});

// ---------- Initialization ----------

restoreState();
updateDisplay();
