 (function () {
  const STORAGE_KEY = "practiceHub.v1";
  const LESSON_SIZE = 10;

  const defaultState = {
    spelling: {
      listName: "Weekly List",
      words: [],
      currentWord: null,
      stats: {}
    },
    math: {
      minFactor: 1,
      maxFactor: 12,
      currentFact: null,
      stats: {}
    }
  };

  const state = loadState();
  const correctSound = new Audio("./correct.mp3");
  const incorrectSound = new Audio("./incorrect.mp3");
  correctSound.preload = "auto";
  incorrectSound.preload = "auto";

  const els = {
    tabs: document.querySelectorAll(".tab-button"),
    panels: document.querySelectorAll(".tab-panel"),
    listName: document.getElementById("listName"),
    wordList: document.getElementById("wordList"),
    saveListBtn: document.getElementById("saveListBtn"),
    startSpellingBtn: document.getElementById("startSpellingBtn"),
    stopSpellingBtn: document.getElementById("stopSpellingBtn"),
    spellingPrompt: document.getElementById("spellingPrompt"),
    spellingAnswer: document.getElementById("spellingAnswer"),
    checkSpellingBtn: document.getElementById("checkSpellingBtn"),
    nextSpellingBtn: document.getElementById("nextSpellingBtn"),
    spellingFeedback: document.getElementById("spellingFeedback"),
    spellingSummary: document.getElementById("spellingSummary"),
    spellingMissedList: document.getElementById("spellingMissedList"),
    spellingLessonProgress: document.getElementById("spellingLessonProgress"),
    minFactor: document.getElementById("minFactor"),
    maxFactor: document.getElementById("maxFactor"),
    startMathBtn: document.getElementById("startMathBtn"),
    stopMathBtn: document.getElementById("stopMathBtn"),
    mathPrompt: document.getElementById("mathPrompt"),
    mathAnswer: document.getElementById("mathAnswer"),
    checkMathBtn: document.getElementById("checkMathBtn"),
    nextMathBtn: document.getElementById("nextMathBtn"),
    mathFeedback: document.getElementById("mathFeedback"),
    mathSummary: document.getElementById("mathSummary"),
    mathMissedList: document.getElementById("mathMissedList"),
    mathLessonProgress: document.getElementById("mathLessonProgress"),
    spellingPanel: document.getElementById("spelling"),
    mathPanel: document.getElementById("math"),
    funCanvas: document.getElementById("funCanvas"),
    canvasStatus: document.getElementById("canvasStatus")
  };

  let funCtx = null;
  let funDpr = 1;
  let autoAdvanceTimer = null;
  let pendingAutoAdvance = false;
  let weatherScore = 0;
  let roadOffset = 0;
  let carProgress = 0;
  let carTargetProgress = 0;
  let stormFlash = 0;
  let sceneMessage = "";
  let sceneMessageFrames = 0;
  const clouds = [];
  const raindrops = [];
  const particles = [];
  const gameState = {
    spellingStarted: false,
    mathStarted: false,
    spellingLesson: null,
    mathLesson: null
  };

  init();

  function init() {
    initFunCanvas();
    bindTabs();
    bindSpelling();
    bindMath();
    hydrateInputs();
    renderSpellingStats();
    renderMathStats();
    renderLessonProgress("spelling");
    renderLessonProgress("math");
    updateCanvasStatus();
    setModeStarted("spelling", false);
    setModeStarted("math", false);
    renderMathPrompt();
  }

  function bindTabs() {
    els.tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        const id = tab.dataset.tab;
        els.tabs.forEach((btn) => btn.classList.remove("active"));
        tab.classList.add("active");
        els.panels.forEach((panel) => {
          panel.classList.toggle("active", panel.id === id);
        });
      });
    });
  }

  function bindSpelling() {
    els.saveListBtn.addEventListener("click", saveSpellingListFromInputs);
    els.startSpellingBtn.addEventListener("click", () => {
      saveSpellingListFromInputs();
      if (state.spelling.words.length === 0) {
        els.spellingPrompt.textContent = "Add words and save your list first.";
        return;
      }
      startLesson("spelling");
      setModeStarted("spelling", true);
      nextSpellingQuestion();
    });
    els.stopSpellingBtn.addEventListener("click", () => {
      cancelAutoAdvance();
      setModeStarted("spelling", false);
      resetFeedback(els.spellingFeedback);
      renderLessonProgress("spelling");
    });

    els.checkSpellingBtn.addEventListener("click", checkSpellingAnswer);
    els.nextSpellingBtn.addEventListener("click", skipSpellingQuestion);
    els.spellingAnswer.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        checkSpellingAnswer();
      }
    });
  }

  function parseWordList(raw) {
    const seen = new Set();
    return raw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((word) => {
        const key = normalizeWord(word);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function nextSpellingQuestion() {
    if (!gameState.spellingStarted) return;
    cancelAutoAdvance();
    const lesson = lessonFor("spelling");
    if (!lesson) {
      startLesson("spelling");
    } else if (lesson.done) {
      startLesson("spelling");
    } else if (lesson.asked >= lesson.total) {
      completeLesson("spelling", els.spellingFeedback, els.spellingPrompt);
      return;
    }
    if (state.spelling.words.length === 0) {
      els.spellingPrompt.textContent = "Save a list to begin practice.";
      state.spelling.currentWord = null;
      saveState();
      return;
    }

    let candidateWords = state.spelling.words;
    if (state.spelling.words.length > 1 && state.spelling.currentWord) {
      const previous = normalizeWord(state.spelling.currentWord);
      const nonRepeats = state.spelling.words.filter((word) => normalizeWord(word) !== previous);
      if (nonRepeats.length > 0) {
        candidateWords = nonRepeats;
      }
    }

    const picked = weightedPick(candidateWords, (word) => {
      const key = normalizeWord(word);
      const stat = getStat(state.spelling.stats, key);
      return 1 + stat.mistakes * 4 + (stat.attempts === 0 ? 2 : 0) + (stat.streak === 0 ? 1 : 0);
    });

    state.spelling.currentWord = picked;
    saveState();

    const scrambled = shuffleWord(picked);
    els.spellingPrompt.textContent = `Unscramble and type the word: ${scrambled}`;
    els.spellingAnswer.value = "";
    resetFeedback(els.spellingFeedback);
    els.spellingAnswer.focus();
  }

  function checkSpellingAnswer() {
    if (!gameState.spellingStarted) return;
    if (!state.spelling.currentWord) return;
    if (pendingAutoAdvance) return;
    const lesson = lessonFor("spelling");
    if (!lesson || lesson.done) return;

    const answer = normalizeWord(els.spellingAnswer.value);
    const expected = normalizeWord(state.spelling.currentWord);
    const stat = getStat(state.spelling.stats, expected);
    stat.attempts += 1;

    if (answer === expected) {
      stat.streak += 1;
      const finished = recordLessonAnswer("spelling", true);
      setFeedback(els.spellingFeedback, finished ? "Correct! Finishing lesson..." : "Correct! Loading next word...", true);
      weatherScore = clamp(weatherScore + 2, -20, 20);
      triggerCorrectEffect(`Nice! ${state.spelling.currentWord}`);
      if (finished) {
        queueNextQuestion(() => completeLesson("spelling", els.spellingFeedback, els.spellingPrompt));
      } else {
        queueNextQuestion(nextSpellingQuestion);
      }
    } else {
      stat.mistakes += 1;
      stat.streak = 0;
      const finished = recordLessonAnswer("spelling", false);
      setFeedback(
        els.spellingFeedback,
        finished
          ? `Not quite. Correct spelling: ${state.spelling.currentWord}. Finishing lesson...`
          : `Not quite. Correct spelling: ${state.spelling.currentWord}. Loading next word...`,
        false
      );
      weatherScore = clamp(weatherScore - 2, -20, 20);
      triggerWrongEffect();
      if (finished) {
        queueNextQuestion(() => completeLesson("spelling", els.spellingFeedback, els.spellingPrompt));
      } else {
        queueNextQuestion(nextSpellingQuestion);
      }
    }

    updateCanvasStatus();
    saveState();
    renderSpellingStats();
  }

  function skipSpellingQuestion() {
    if (!gameState.spellingStarted) return;
    const lesson = lessonFor("spelling");
    if (lesson && lesson.done) {
      startLesson("spelling");
      nextSpellingQuestion();
      return;
    }
    if (!state.spelling.currentWord) {
      nextSpellingQuestion();
      return;
    }
    if (pendingAutoAdvance) return;
    const key = normalizeWord(state.spelling.currentWord);
    const stat = getStat(state.spelling.stats, key);
    stat.attempts += 1;
    stat.mistakes += 1;
    stat.streak = 0;
    weatherScore = clamp(weatherScore - 2, -20, 20);
    triggerWrongEffect();
    const finished = recordLessonAnswer("spelling", false);
    setFeedback(els.spellingFeedback, "Skipped. Loading next word...", false);
    saveState();
    renderSpellingStats();
    if (finished) {
      queueNextQuestion(() => completeLesson("spelling", els.spellingFeedback, els.spellingPrompt));
    } else {
      queueNextQuestion(nextSpellingQuestion);
    }
  }

  function renderSpellingStats() {
    const stats = Object.values(state.spelling.stats);
    const totalAttempts = stats.reduce((sum, s) => sum + s.attempts, 0);
    const totalMistakes = stats.reduce((sum, s) => sum + s.mistakes, 0);
    const accuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalMistakes) / totalAttempts) * 100) : 0;

    els.spellingSummary.textContent = `${state.spelling.listName}: ${totalAttempts} attempts, ${totalMistakes} mistakes, ${accuracy}% accuracy`;

    const missedWords = Object.entries(state.spelling.stats)
      .filter(([, stat]) => stat.mistakes > 0)
      .sort((a, b) => b[1].mistakes - a[1].mistakes)
      .slice(0, 10);

    els.spellingMissedList.innerHTML = "";
    if (missedWords.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No commonly missed words yet.";
      els.spellingMissedList.appendChild(li);
      return;
    }

    missedWords.forEach(([word, stat]) => {
      const li = document.createElement("li");
      li.textContent = `${word}: ${stat.mistakes} mistakes (${stat.attempts} attempts)`;
      els.spellingMissedList.appendChild(li);
    });
  }

  function bindMath() {
    const applyMathRangeFromInputs = () => {
      const minInput = Number(els.minFactor.value);
      const maxInput = Number(els.maxFactor.value);
      const min = clamp(Number.isFinite(minInput) ? minInput : state.math.minFactor, 1, 20);
      const max = clamp(Number.isFinite(maxInput) ? maxInput : state.math.maxFactor, 1, 20);
      state.math.minFactor = Math.min(min, max);
      state.math.maxFactor = Math.max(min, max);
      els.minFactor.value = String(state.math.minFactor);
      els.maxFactor.value = String(state.math.maxFactor);
      state.math.currentFact = null;
      saveState();
    };

    els.minFactor.addEventListener("change", () => {
      applyMathRangeFromInputs();
      nextMathQuestion();
    });

    els.maxFactor.addEventListener("change", () => {
      applyMathRangeFromInputs();
      nextMathQuestion();
    });

    els.checkMathBtn.addEventListener("click", checkMathAnswer);
    els.nextMathBtn.addEventListener("click", skipMathQuestion);
    els.startMathBtn.addEventListener("click", () => {
      applyMathRangeFromInputs();
      startLesson("math");
      setModeStarted("math", true);
      nextMathQuestion();
    });
    els.stopMathBtn.addEventListener("click", () => {
      cancelAutoAdvance();
      setModeStarted("math", false);
      resetFeedback(els.mathFeedback);
      renderLessonProgress("math");
    });
    els.mathAnswer.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        checkMathAnswer();
      }
    });
  }

  function nextMathQuestion() {
    if (!gameState.mathStarted) return;
    cancelAutoAdvance();
    const lesson = lessonFor("math");
    if (!lesson) {
      startLesson("math");
    } else if (lesson.done) {
      startLesson("math");
    } else if (lesson.asked >= lesson.total) {
      completeLesson("math", els.mathFeedback, els.mathPrompt);
      return;
    }
    const facts = [];
    for (let a = state.math.minFactor; a <= state.math.maxFactor; a += 1) {
      for (let b = state.math.minFactor; b <= state.math.maxFactor; b += 1) {
        facts.push([a, b]);
      }
    }

    const picked = weightedPick(facts, ([a, b]) => {
      const key = factKey(a, b);
      const stat = getStat(state.math.stats, key);
      return 1 + stat.mistakes * 4 + (stat.attempts === 0 ? 1 : 0) + (stat.streak === 0 ? 1 : 0);
    });

    state.math.currentFact = picked;
    saveState();
    renderMathPrompt();
    els.mathAnswer.value = "";
    resetFeedback(els.mathFeedback);
    els.mathAnswer.focus();
  }

  function renderMathPrompt() {
    if (!state.math.currentFact) {
      els.mathPrompt.textContent = "Press Next to start.";
      return;
    }
    const [a, b] = state.math.currentFact;
    els.mathPrompt.textContent = `${a} × ${b} = ?`;
  }

  function checkMathAnswer() {
    if (!gameState.mathStarted) return;
    if (!state.math.currentFact) return;
    if (pendingAutoAdvance) return;
    const lesson = lessonFor("math");
    if (!lesson || lesson.done) return;

    const [a, b] = state.math.currentFact;
    const key = factKey(a, b);
    const expected = a * b;
    const entered = Number(els.mathAnswer.value);
    const stat = getStat(state.math.stats, key);
    stat.attempts += 1;

    if (Number.isFinite(entered) && entered === expected) {
      stat.streak += 1;
      const finished = recordLessonAnswer("math", true);
      setFeedback(els.mathFeedback, finished ? "Correct! Finishing lesson..." : "Correct! Loading next fact...", true);
      weatherScore = clamp(weatherScore + 2, -20, 20);
      triggerCorrectEffect(`Great! ${a} x ${b} = ${expected}`);
      if (finished) {
        queueNextQuestion(() => completeLesson("math", els.mathFeedback, els.mathPrompt));
      } else {
        queueNextQuestion(nextMathQuestion);
      }
    } else {
      stat.mistakes += 1;
      stat.streak = 0;
      const finished = recordLessonAnswer("math", false);
      setFeedback(
        els.mathFeedback,
        finished ? `Not quite. ${a} × ${b} = ${expected}. Finishing lesson...` : `Not quite. ${a} × ${b} = ${expected}. Loading next fact...`,
        false
      );
      weatherScore = clamp(weatherScore - 2, -20, 20);
      triggerWrongEffect();
      if (finished) {
        queueNextQuestion(() => completeLesson("math", els.mathFeedback, els.mathPrompt));
      } else {
        queueNextQuestion(nextMathQuestion);
      }
    }

    updateCanvasStatus();
    saveState();
    renderMathStats();
  }

  function skipMathQuestion() {
    if (!gameState.mathStarted) return;
    const lesson = lessonFor("math");
    if (lesson && lesson.done) {
      startLesson("math");
      nextMathQuestion();
      return;
    }
    if (!state.math.currentFact) {
      nextMathQuestion();
      return;
    }
    if (pendingAutoAdvance) return;
    const [a, b] = state.math.currentFact;
    const key = factKey(a, b);
    const stat = getStat(state.math.stats, key);
    stat.attempts += 1;
    stat.mistakes += 1;
    stat.streak = 0;
    weatherScore = clamp(weatherScore - 2, -20, 20);
    triggerWrongEffect();
    const finished = recordLessonAnswer("math", false);
    setFeedback(els.mathFeedback, "Skipped. Loading next fact...", false);
    saveState();
    renderMathStats();
    if (finished) {
      queueNextQuestion(() => completeLesson("math", els.mathFeedback, els.mathPrompt));
    } else {
      queueNextQuestion(nextMathQuestion);
    }
  }

  function renderMathStats() {
    const stats = Object.values(state.math.stats);
    const totalAttempts = stats.reduce((sum, s) => sum + s.attempts, 0);
    const totalMistakes = stats.reduce((sum, s) => sum + s.mistakes, 0);
    const accuracy = totalAttempts > 0 ? Math.round(((totalAttempts - totalMistakes) / totalAttempts) * 100) : 0;
    els.mathSummary.textContent = `${totalAttempts} attempts, ${totalMistakes} mistakes, ${accuracy}% accuracy`;

    const missedFacts = Object.entries(state.math.stats)
      .filter(([, stat]) => stat.mistakes > 0)
      .sort((a, b) => b[1].mistakes - a[1].mistakes)
      .slice(0, 10);

    els.mathMissedList.innerHTML = "";
    if (missedFacts.length === 0) {
      const li = document.createElement("li");
      li.textContent = "No commonly missed facts yet.";
      els.mathMissedList.appendChild(li);
      return;
    }

    missedFacts.forEach(([key, stat]) => {
      const li = document.createElement("li");
      li.textContent = `${key.replace("x", " × ")}: ${stat.mistakes} mistakes (${stat.attempts} attempts)`;
      els.mathMissedList.appendChild(li);
    });
  }

  function saveSpellingListFromInputs() {
    const words = parseWordList(els.wordList.value);
    state.spelling.listName = els.listName.value.trim() || "Weekly List";
    state.spelling.words = words;
    state.spelling.currentWord = null;
    saveState();
    renderSpellingStats();
  }

  function createLessonState() {
    return {
      total: LESSON_SIZE,
      asked: 0,
      correct: 0,
      done: false
    };
  }

  function lessonFor(mode) {
    return mode === "spelling" ? gameState.spellingLesson : gameState.mathLesson;
  }

  function setLessonFor(mode, lesson) {
    if (mode === "spelling") {
      gameState.spellingLesson = lesson;
      return;
    }
    gameState.mathLesson = lesson;
  }

  function startLesson(mode) {
    setLessonFor(mode, createLessonState());
    renderLessonProgress(mode);
    syncCarToLesson();
    updateCanvasStatus();
  }

  function completeLesson(mode, feedbackEl, promptEl) {
    const lesson = lessonFor(mode);
    if (!lesson) return;
    lesson.done = true;
    const accuracy = lesson.asked > 0 ? Math.round((lesson.correct / lesson.asked) * 100) : 0;
    promptEl.textContent = "Lesson complete!";
    setFeedback(feedbackEl, `Lesson result: ${lesson.correct}/${lesson.total} correct (${accuracy}% accuracy).`, true);
    if (mode === "spelling") {
      state.spelling.currentWord = null;
    } else {
      state.math.currentFact = null;
    }
    renderLessonProgress(mode);
    syncCarToLesson();
    updateCanvasStatus();
  }

  function recordLessonAnswer(mode, isCorrect) {
    const lesson = lessonFor(mode);
    if (!lesson || lesson.done) return false;
    lesson.asked += 1;
    if (isCorrect) {
      lesson.correct += 1;
    }
    renderLessonProgress(mode);
    syncCarToLesson();
    updateCanvasStatus();
    return lesson.asked >= lesson.total;
  }

  function renderLessonProgress(mode) {
    const lesson = lessonFor(mode);
    const el = mode === "spelling" ? els.spellingLessonProgress : els.mathLessonProgress;
    if (!el) return;
    if (!lesson) {
      el.textContent = `Lesson progress: 0/${LESSON_SIZE} (0%)`;
      return;
    }
    const percent = Math.round((lesson.asked / lesson.total) * 100);
    if (lesson.done) {
      const accuracy = lesson.asked > 0 ? Math.round((lesson.correct / lesson.asked) * 100) : 0;
      el.textContent = `Lesson complete: ${lesson.correct}/${lesson.total} correct (${accuracy}% accuracy)`;
      return;
    }
    el.textContent = `Lesson progress: ${lesson.asked}/${lesson.total} (${percent}%)`;
  }

  function activeLesson() {
    if (gameState.spellingStarted) return gameState.spellingLesson;
    if (gameState.mathStarted) return gameState.mathLesson;
    if (gameState.spellingLesson && gameState.spellingLesson.done) return gameState.spellingLesson;
    if (gameState.mathLesson && gameState.mathLesson.done) return gameState.mathLesson;
    return null;
  }

  function syncCarToLesson() {
    const lesson = activeLesson();
    if (!lesson) {
      carTargetProgress = 0;
      return;
    }
    carTargetProgress = lesson.total > 0 ? lesson.asked / lesson.total : 0;
  }

  function setModeStarted(mode, started) {
    if (mode === "spelling") {
      gameState.spellingStarted = started;
      els.spellingPanel.classList.toggle("game-started", started);
      syncCarToLesson();
      updateCanvasStatus();
      updateGlobalPlayingState();
      return;
    }
    gameState.mathStarted = started;
    els.mathPanel.classList.toggle("game-started", started);
    syncCarToLesson();
    updateCanvasStatus();
    updateGlobalPlayingState();
  }

  function updateGlobalPlayingState() {
    const isPlaying = gameState.spellingStarted || gameState.mathStarted;
    document.body.classList.toggle("game-playing", isPlaying);
  }

  function weightedPick(items, getWeight) {
    let total = 0;
    const weights = items.map((item) => {
      const weight = Math.max(0, Number(getWeight(item)) || 0);
      total += weight;
      return weight;
    });

    if (total <= 0) {
      return items[Math.floor(Math.random() * items.length)];
    }

    let roll = Math.random() * total;
    for (let i = 0; i < items.length; i += 1) {
      roll -= weights[i];
      if (roll <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function shuffleWord(word) {
    const chars = word.split("");
    for (let i = chars.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = chars[i];
      chars[i] = chars[j];
      chars[j] = tmp;
    }
    return chars.join("");
  }

  function hydrateInputs() {
    const min = clamp(Number(state.math.minFactor) || 1, 1, 20);
    const max = clamp(Number(state.math.maxFactor) || 12, 1, 20);
    state.math.minFactor = Math.min(min, max);
    state.math.maxFactor = Math.max(min, max);
    els.listName.value = state.spelling.listName;
    els.wordList.value = state.spelling.words.join("\n");
    els.minFactor.value = String(state.math.minFactor);
    els.maxFactor.value = String(state.math.maxFactor);
  }

  function setFeedback(element, message, isGood) {
    element.textContent = message;
    element.classList.toggle("good", isGood);
    element.classList.toggle("bad", !isGood);
  }

  function resetFeedback(element) {
    element.textContent = "";
    element.classList.remove("good", "bad");
  }

  function normalizeWord(word) {
    return String(word || "")
      .trim()
      .toLowerCase();
  }

  function factKey(a, b) {
    return `${a}x${b}`;
  }

  function getStat(record, key) {
    if (!record[key]) {
      record[key] = { attempts: 0, mistakes: 0, streak: 0 };
    }
    return record[key];
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Math.round(value)));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return {
        spelling: {
          ...defaultState.spelling,
          ...(parsed.spelling || {}),
          stats: (parsed.spelling && parsed.spelling.stats) || {}
        },
        math: {
          ...defaultState.math,
          ...(parsed.math || {}),
          stats: (parsed.math && parsed.math.stats) || {}
        }
      };
    } catch (_error) {
      return structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function initFunCanvas() {
    const canvas = els.funCanvas;
    if (!canvas) return;
    funCtx = canvas.getContext("2d");
    if (!funCtx) return;

    for (let i = 0; i < 7; i += 1) {
      clouds.push({
        x: 40 + i * 140,
        y: 25 + (i % 3) * 20,
        size: 0.8 + Math.random() * 0.6,
        speed: 0.15 + Math.random() * 0.3
      });
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    requestAnimationFrame(drawFrame);
  }

  function resizeCanvas() {
    const canvas = els.funCanvas;
    if (!canvas || !funCtx) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = Math.max(160, Math.floor(rect.height));
    funDpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * funDpr);
    canvas.height = Math.floor(height * funDpr);
    funCtx.setTransform(funDpr, 0, 0, funDpr, 0, 0);
  }

  function drawFrame(timestamp) {
    if (!funCtx || !els.funCanvas) return;
    const canvas = els.funCanvas;
    const width = canvas.width / funDpr;
    const height = canvas.height / funDpr;

    drawSky(width, height);
    drawSun(width, height, timestamp);
    drawClouds(width, height);
    drawRain(width, height);
    drawRoad(width, height);
    drawCar(width, height, timestamp);
    drawParticles(width, height);
    drawSceneMessage(width, height);
    drawStormFlash(width, height);

    requestAnimationFrame(drawFrame);
  }

  function drawSky(width, height) {
    const sunFactor = (weatherScore + 20) / 40;
    const topColor = mixColor("#6276a8", "#79d9ff", sunFactor);
    const bottomColor = mixColor("#6d7ba0", "#d9f7ff", sunFactor);
    const groundColor = mixColor("#6b8f59", "#87d267", sunFactor);

    const sky = funCtx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, topColor);
    sky.addColorStop(1, bottomColor);
    funCtx.fillStyle = sky;
    funCtx.fillRect(0, 0, width, height);

    funCtx.fillStyle = groundColor;
    funCtx.fillRect(0, height * 0.68, width, height * 0.32);
  }

  function drawSun(width, height, timestamp) {
    const sunFactor = (weatherScore + 20) / 40;
    const alpha = 0.2 + sunFactor * 0.9;
    const pulse = Math.sin(timestamp * 0.004) * 2;
    const x = width - 62;
    const y = 45;
    const radius = 22 + pulse;

    funCtx.globalAlpha = alpha;
    funCtx.fillStyle = "#ffe46b";
    funCtx.beginPath();
    funCtx.arc(x, y, radius, 0, Math.PI * 2);
    funCtx.fill();

    funCtx.strokeStyle = "rgba(255, 227, 118, 0.6)";
    funCtx.lineWidth = 2;
    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10 + timestamp * 0.0008;
      funCtx.beginPath();
      funCtx.moveTo(x + Math.cos(angle) * (radius + 6), y + Math.sin(angle) * (radius + 6));
      funCtx.lineTo(x + Math.cos(angle) * (radius + 14), y + Math.sin(angle) * (radius + 14));
      funCtx.stroke();
    }
    funCtx.globalAlpha = 1;
  }

  function drawClouds(width, height) {
    const stormFactor = 1 - (weatherScore + 20) / 40;
    const dark = mixColor("#ffffff", "#5e6988", stormFactor);

    clouds.forEach((cloud) => {
      cloud.x += cloud.speed * (0.7 + stormFactor * 0.8);
      if (cloud.x > width + 80) cloud.x = -90;
      const yShift = stormFactor * 5;
      drawCloud(cloud.x, cloud.y + yShift, cloud.size, dark);
    });

    if (stormFactor > 0.4) {
      const hazeAlpha = (stormFactor - 0.4) * 0.45;
      funCtx.fillStyle = `rgba(45, 54, 82, ${hazeAlpha.toFixed(3)})`;
      funCtx.fillRect(0, 0, width, height * 0.7);
    }
  }

  function drawCloud(x, y, scale, color) {
    funCtx.fillStyle = color;
    funCtx.beginPath();
    funCtx.arc(x, y, 15 * scale, 0, Math.PI * 2);
    funCtx.arc(x + 14 * scale, y - 6 * scale, 18 * scale, 0, Math.PI * 2);
    funCtx.arc(x + 31 * scale, y, 14 * scale, 0, Math.PI * 2);
    funCtx.fill();
  }

  function drawRain(width, height) {
    const stormFactor = 1 - (weatherScore + 20) / 40;
    const density = Math.max(0, Math.floor((stormFactor - 0.5) * 120));

    for (let i = raindrops.length - 1; i >= 0; i -= 1) {
      const drop = raindrops[i];
      drop.x += drop.vx;
      drop.y += drop.vy;
      if (drop.y > height || drop.x > width + 10) {
        raindrops.splice(i, 1);
      }
    }

    for (let i = 0; i < density; i += 1) {
      raindrops.push({
        x: Math.random() * width,
        y: -10,
        vx: 1.2 + Math.random() * 1.5,
        vy: 4 + Math.random() * 3
      });
    }

    funCtx.strokeStyle = "rgba(190, 220, 255, 0.65)";
    funCtx.lineWidth = 1.3;
    raindrops.forEach((drop) => {
      funCtx.beginPath();
      funCtx.moveTo(drop.x, drop.y);
      funCtx.lineTo(drop.x + 2, drop.y + 9);
      funCtx.stroke();
    });
  }

  function drawRoad(width, height) {
    const roadY = height * 0.73;
    funCtx.fillStyle = "#586176";
    funCtx.fillRect(0, roadY, width, height * 0.2);

    roadOffset += 0.8;
    if (roadOffset > 40) roadOffset = 0;
    funCtx.fillStyle = "#ffe69b";
    for (let x = -40 + roadOffset; x < width; x += 40) {
      funCtx.fillRect(x, roadY + 18, 22, 5);
    }
  }

  function drawCar(width, height, timestamp) {
    carProgress += (carTargetProgress - carProgress) * 0.14;
    carProgress = Math.max(0, Math.min(1, carProgress));
    const wobble = Math.sin(timestamp * 0.012) * 2;
    const roadY = height * 0.73;
    const minX = 24;
    const maxX = Math.max(minX, width - 120);
    const x = minX + (maxX - minX) * carProgress;
    const y = roadY - 24 + wobble;

    funCtx.fillStyle = "#ff5f5f";
    funCtx.fillRect(x, y, 88, 24);
    funCtx.fillStyle = "#ffd166";
    funCtx.fillRect(x + 18, y - 15, 45, 16);
    funCtx.fillStyle = "#ffffff";
    funCtx.fillRect(x + 24, y - 12, 15, 10);
    funCtx.fillRect(x + 43, y - 12, 15, 10);
    drawWheel(x + 20, y + 24);
    drawWheel(x + 70, y + 24);
  }

  function drawWheel(x, y) {
    funCtx.fillStyle = "#2c2c34";
    funCtx.beginPath();
    funCtx.arc(x, y, 8, 0, Math.PI * 2);
    funCtx.fill();
    funCtx.fillStyle = "#b8bcc8";
    funCtx.beginPath();
    funCtx.arc(x, y, 3, 0, Math.PI * 2);
    funCtx.fill();
  }

  function drawParticles(width, height) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i];
      p.life -= 1;
      p.vy += 0.05;
      p.x += p.vx;
      p.y += p.vy;
      if (p.life <= 0 || p.y > height + 20 || p.x < -30 || p.x > width + 30) {
        particles.splice(i, 1);
        continue;
      }
      funCtx.globalAlpha = Math.max(0, p.life / p.maxLife);
      funCtx.fillStyle = p.color;
      funCtx.beginPath();
      if (p.kind === "rain-splash") {
        funCtx.fillRect(p.x, p.y, p.size, p.size * 1.6);
      } else {
        funCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        funCtx.fill();
      }
      funCtx.globalAlpha = 1;
    }
  }

  function drawSceneMessage(width, height) {
    if (sceneMessageFrames <= 0 || !sceneMessage) return;
    sceneMessageFrames -= 1;
    funCtx.globalAlpha = Math.min(1, sceneMessageFrames / 20);
    roundRect(funCtx, width * 0.18, height * 0.12, width * 0.64, 46, 12);
    funCtx.fillStyle = "#ff7f50";
    funCtx.fill();
    funCtx.globalAlpha = 1;
    funCtx.fillStyle = "#fffaf0";
    funCtx.font = '700 24px "Baloo 2", "Nunito", sans-serif';
    funCtx.textAlign = "center";
    funCtx.fillText(sceneMessage, width * 0.5, height * 0.12 + 31);
  }

  function drawStormFlash(width, height) {
    if (stormFlash <= 0) return;
    stormFlash -= 1;
    funCtx.fillStyle = `rgba(255, 255, 255, ${(stormFlash / 8).toFixed(3)})`;
    funCtx.fillRect(0, 0, width, height);
  }

  function emitParticles(config) {
    if (!funCtx || !els.funCanvas) return;
    const canvas = els.funCanvas;
    const width = canvas.width / funDpr;
    const height = canvas.height / funDpr;
    const originX = width * config.x;
    const originY = height * config.y;

    for (let i = 0; i < config.count; i += 1) {
      const angle = config.minAngle + Math.random() * (config.maxAngle - config.minAngle);
      const speed = config.speedMin + Math.random() * (config.speedMax - config.speedMin);
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 2 + Math.random() * 3,
        color: config.colors[Math.floor(Math.random() * config.colors.length)],
        kind: config.kind || "confetti",
        life: 42 + Math.floor(Math.random() * 18),
        maxLife: 60
      });
    }
  }

  function triggerCorrectEffect(message) {
    playCorrectSound();
    sceneMessage = message;
    sceneMessageFrames = 80;
    emitParticles({
      x: 0.35,
      y: 0.56,
      count: 45,
      minAngle: -3.05,
      maxAngle: -0.1,
      speedMin: 1.1,
      speedMax: 4.3,
      colors: ["#ff5fa2", "#ffd166", "#70e000", "#4cc9f0", "#b388ff"]
    });
  }

  function triggerWrongEffect() {
    playIncorrectSound();
    stormFlash = 8;
    sceneMessage = "Oops! Try the next one!";
    sceneMessageFrames = 50;
    emitParticles({
      x: 0.28,
      y: 0.67,
      count: 14,
      minAngle: -2.9,
      maxAngle: -1.7,
      speedMin: 0.4,
      speedMax: 1.3,
      colors: ["#91a2bf", "#b4c2da", "#d0dcf0"],
      kind: "rain-splash"
    });
  }

  function playCorrectSound() {
    try {
      correctSound.currentTime = 0;
      const playback = correctSound.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch(() => {
          // Ignore autoplay/browser policy errors after user interaction differences.
        });
      }
    } catch (_error) {
      // Ignore audio errors so quiz flow never breaks.
    }
  }

  function playIncorrectSound() {
    try {
      incorrectSound.currentTime = 0;
      const playback = incorrectSound.play();
      if (playback && typeof playback.catch === "function") {
        playback.catch(() => {
          // Ignore autoplay/browser policy errors after user interaction differences.
        });
      }
    } catch (_error) {
      // Ignore audio errors so quiz flow never breaks.
    }
  }

  function queueNextQuestion(nextQuestionFn) {
    cancelAutoAdvance();
    pendingAutoAdvance = true;
    autoAdvanceTimer = setTimeout(() => {
      pendingAutoAdvance = false;
      nextQuestionFn();
    }, 800);
  }

  function cancelAutoAdvance() {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }
    pendingAutoAdvance = false;
  }

  function updateCanvasStatus() {
    if (!els.canvasStatus) return;
    const lesson = activeLesson();
    const lessonText = lesson
      ? lesson.done
        ? `Lesson done: ${lesson.correct}/${lesson.total}`
        : `Lesson: ${lesson.asked}/${lesson.total}`
      : `Lesson: 0/${LESSON_SIZE}`;
    if (weatherScore >= 14) {
      els.canvasStatus.textContent = `${lessonText} | Weather: Super sunny race day`;
    } else if (weatherScore >= 6) {
      els.canvasStatus.textContent = `${lessonText} | Weather: Mostly sunny`;
    } else if (weatherScore >= -5) {
      els.canvasStatus.textContent = `${lessonText} | Weather: Fair skies`;
    } else if (weatherScore >= -13) {
      els.canvasStatus.textContent = `${lessonText} | Weather: Cloudy`;
    } else {
      els.canvasStatus.textContent = `${lessonText} | Weather: Stormy`;
    }
  }

  function mixColor(a, b, t) {
    const c1 = hexToRgb(a);
    const c2 = hexToRgb(b);
    const p = Math.max(0, Math.min(1, t));
    const r = Math.round(c1.r + (c2.r - c1.r) * p);
    const g = Math.round(c1.g + (c2.g - c1.g) * p);
    const bl = Math.round(c1.b + (c2.b - c1.b) * p);
    return `rgb(${r}, ${g}, ${bl})`;
  }

  function hexToRgb(hex) {
    const clean = hex.replace("#", "");
    return {
      r: Number.parseInt(clean.slice(0, 2), 16),
      g: Number.parseInt(clean.slice(2, 4), 16),
      b: Number.parseInt(clean.slice(4, 6), 16)
    };
  }

  function roundRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
})();
