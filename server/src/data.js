const LANGUAGES = [
  { id: "english", label: "English", flag: "US" },
  { id: "spanish", label: "Spanish", flag: "ES" },
  { id: "russian", label: "Russian", flag: "RU" }
];

const CATEGORIES = [
  { id: "essentials", label: "Essentials", description: "Core survival phrases" },
  { id: "conversation", label: "Conversation", description: "Natural social dialogue" },
  { id: "travel", label: "Travel", description: "Transport and directions" },
  { id: "work", label: "Work", description: "Professional communication" },
  { id: "health", label: "Health", description: "Medical and emergency phrases" },
  { id: "grammar", label: "Grammar", description: "Sentence structures and tenses" }
];

const LEVEL_ORDER = ["a1", "a2", "b1", "b2"];
const LEVEL_XP_MULTIPLIER = { a1: 1.0, a2: 1.25, b1: 1.6, b2: 2.0 };

function sentence(id, level, prompt, target) {
  return { id, level, prompt, target };
}

const COURSE = {
  spanish: {
    essentials: [
      sentence("sp-es-1", "a1", "Say: Hello, how are you?", "Hola, ¿cómo estás?"),
      sentence("sp-es-2", "a1", "Say: Thank you very much for your help.", "Muchas gracias por tu ayuda."),
      sentence("sp-es-3", "a1", "Say: I do not understand this sentence.", "No entiendo esta oración."),
      sentence("sp-es-4", "a2", "Say: Could you speak more slowly, please?", "¿Podrías hablar más despacio, por favor?"),
      sentence("sp-es-5", "a2", "Say: I am learning Spanish every day.", "Estoy aprendiendo español todos los días."),
      sentence("sp-es-6", "b1", "Say: I made a mistake, but I will try again.", "Cometí un error, pero lo intentaré de nuevo."),
      sentence("sp-es-7", "b1", "Say: I would like to improve my pronunciation.", "Me gustaría mejorar mi pronunciación."),
      sentence("sp-es-8", "b2", "Say: I can explain my opinion with clear arguments.", "Puedo explicar mi opinión con argumentos claros.")
    ],
    conversation: [
      sentence("sp-co-1", "a1", "Ask: What is your name?", "¿Cómo te llamas?"),
      sentence("sp-co-2", "a1", "Say: My name is Alex and I am from the United States.", "Me llamo Alex y soy de Estados Unidos."),
      sentence("sp-co-3", "a2", "Say: It is nice to meet you in person.", "Es un placer conocerte en persona."),
      sentence("sp-co-4", "a2", "Ask: What do you usually do on weekends?", "¿Qué sueles hacer los fines de semana?"),
      sentence("sp-co-5", "b1", "Say: I enjoy talking about books and current events.", "Disfruto hablar sobre libros y temas actuales."),
      sentence("sp-co-6", "b1", "Say: In my opinion, consistency is more important than intensity.", "En mi opinión, la constancia es más importante que la intensidad."),
      sentence("sp-co-7", "b2", "Say: I used to be shy, but now I express my ideas confidently.", "Antes era tímido, pero ahora expreso mis ideas con confianza."),
      sentence("sp-co-8", "b2", "Say: Although we disagree, I respect your perspective.", "Aunque no estamos de acuerdo, respeto tu perspectiva.")
    ],
    travel: [
      sentence("sp-tr-1", "a1", "Ask: Where is the train station?", "¿Dónde está la estación de tren?"),
      sentence("sp-tr-2", "a1", "Ask: How much does this ticket cost?", "¿Cuánto cuesta este billete?"),
      sentence("sp-tr-3", "a2", "Say: I need a room for two nights.", "Necesito una habitación para dos noches."),
      sentence("sp-tr-4", "a2", "Ask: Does this bus go to the city center?", "¿Este autobús va al centro de la ciudad?"),
      sentence("sp-tr-5", "b1", "Say: My flight was delayed because of bad weather.", "Mi vuelo se retrasó por el mal tiempo."),
      sentence("sp-tr-6", "b1", "Say: I lost my passport and need help immediately.", "Perdí mi pasaporte y necesito ayuda inmediatamente."),
      sentence("sp-tr-7", "b2", "Ask: Could you recommend a safe neighborhood near downtown?", "¿Podría recomendarme un barrio seguro cerca del centro?"),
      sentence("sp-tr-8", "b2", "Say: I would prefer a quieter route, even if it takes longer.", "Prefiero una ruta más tranquila, aunque tarde más.")
    ],
    work: [
      sentence("sp-wo-1", "a1", "Say: I work in a small software company.", "Trabajo en una pequeña empresa de software."),
      sentence("sp-wo-2", "a2", "Say: We have a meeting at nine in the morning.", "Tenemos una reunión a las nueve de la mañana."),
      sentence("sp-wo-3", "a2", "Ask: Could you send me the updated report?", "¿Podrías enviarme el informe actualizado?"),
      sentence("sp-wo-4", "b1", "Say: We should prioritize the tasks with the highest impact.", "Deberíamos priorizar las tareas con mayor impacto."),
      sentence("sp-wo-5", "b1", "Say: I finished the draft, but it still needs revision.", "Terminé el borrador, pero aún necesita revisión."),
      sentence("sp-wo-6", "b2", "Say: Our proposal focuses on long-term sustainability.", "Nuestra propuesta se centra en la sostenibilidad a largo plazo."),
      sentence("sp-wo-7", "b2", "Say: If we align our goals, we can deliver faster.", "Si alineamos nuestros objetivos, podemos entregar más rápido."),
      sentence("sp-wo-8", "b2", "Ask: What metrics will define success for this project?", "¿Qué métricas definirán el éxito de este proyecto?")
    ],
    health: [
      sentence("sp-he-1", "a1", "Say: I do not feel well today.", "No me siento bien hoy."),
      sentence("sp-he-2", "a1", "Ask: Where is the nearest pharmacy?", "¿Dónde está la farmacia más cercana?"),
      sentence("sp-he-3", "a2", "Say: I have had a headache since this morning.", "Tengo dolor de cabeza desde esta mañana."),
      sentence("sp-he-4", "a2", "Say: I am allergic to peanuts.", "Soy alérgico a los cacahuetes."),
      sentence("sp-he-5", "b1", "Ask: Should I take this medicine before or after meals?", "¿Debo tomar este medicamento antes o después de comer?"),
      sentence("sp-he-6", "b1", "Say: The pain gets worse when I walk quickly.", "El dolor empeora cuando camino rápido."),
      sentence("sp-he-7", "b2", "Say: I need a full checkup because these symptoms persist.", "Necesito un chequeo completo porque estos síntomas persisten."),
      sentence("sp-he-8", "b2", "Ask: Could you explain the treatment options in detail?", "¿Podría explicar en detalle las opciones de tratamiento?")
    ],
    grammar: [
      sentence("sp-gr-1", "a1", "Say: I am reading a short story now.", "Estoy leyendo un cuento corto ahora."),
      sentence("sp-gr-2", "a1", "Say: Yesterday I studied for two hours.", "Ayer estudié durante dos horas."),
      sentence("sp-gr-3", "a2", "Say: Tomorrow I will practice with my friend.", "Mañana practicaré con mi amigo."),
      sentence("sp-gr-4", "a2", "Say: If I have time, I will review the lesson.", "Si tengo tiempo, repasaré la lección."),
      sentence("sp-gr-5", "b1", "Say: I have been studying Spanish for six months.", "He estado estudiando español durante seis meses."),
      sentence("sp-gr-6", "b1", "Say: I would travel more if flights were cheaper.", "Viajaría más si los vuelos fueran más baratos."),
      sentence("sp-gr-7", "b2", "Say: By the time we arrive, they will have finished dinner.", "Para cuando lleguemos, ellos habrán terminado de cenar."),
      sentence("sp-gr-8", "b2", "Say: Had I known earlier, I would have changed the plan.", "Si lo hubiera sabido antes, habría cambiado el plan.")
    ]
  },
  russian: {
    essentials: [
      sentence("ru-es-1", "a1", "Say: Hello, how are you?", "Привет, как дела?"),
      sentence("ru-es-2", "a1", "Say: Thank you very much for your help.", "Большое спасибо за твою помощь."),
      sentence("ru-es-3", "a1", "Say: I do not understand this sentence.", "Я не понимаю это предложение."),
      sentence("ru-es-4", "a2", "Say: Could you speak more slowly, please?", "Можете говорить медленнее, пожалуйста?"),
      sentence("ru-es-5", "a2", "Say: I am learning Russian every day.", "Я учу русский язык каждый день."),
      sentence("ru-es-6", "b1", "Say: I made a mistake, but I will try again.", "Я сделал ошибку, но попробую снова."),
      sentence("ru-es-7", "b1", "Say: I would like to improve my pronunciation.", "Я хотел бы улучшить своё произношение."),
      sentence("ru-es-8", "b2", "Say: I can explain my opinion with clear arguments.", "Я могу объяснить своё мнение с ясными аргументами.")
    ],
    conversation: [
      sentence("ru-co-1", "a1", "Ask: What is your name?", "Как тебя зовут?"),
      sentence("ru-co-2", "a1", "Say: My name is Alex and I am from the United States.", "Меня зовут Алекс, и я из США."),
      sentence("ru-co-3", "a2", "Say: It is nice to meet you in person.", "Приятно познакомиться лично."),
      sentence("ru-co-4", "a2", "Ask: What do you usually do on weekends?", "Что ты обычно делаешь по выходным?"),
      sentence("ru-co-5", "b1", "Say: I enjoy talking about books and current events.", "Мне нравится говорить о книгах и текущих событиях."),
      sentence("ru-co-6", "b1", "Say: In my opinion, consistency is more important than intensity.", "По моему мнению, регулярность важнее интенсивности."),
      sentence("ru-co-7", "b2", "Say: I used to be shy, but now I express my ideas confidently.", "Раньше я был застенчивым, но теперь уверенно выражаю свои мысли."),
      sentence("ru-co-8", "b2", "Say: Although we disagree, I respect your perspective.", "Хотя мы не согласны, я уважаю твою точку зрения.")
    ],
    travel: [
      sentence("ru-tr-1", "a1", "Ask: Where is the train station?", "Где находится железнодорожный вокзал?"),
      sentence("ru-tr-2", "a1", "Ask: How much does this ticket cost?", "Сколько стоит этот билет?"),
      sentence("ru-tr-3", "a2", "Say: I need a room for two nights.", "Мне нужен номер на две ночи."),
      sentence("ru-tr-4", "a2", "Ask: Does this bus go to the city center?", "Этот автобус едет в центр города?"),
      sentence("ru-tr-5", "b1", "Say: My flight was delayed because of bad weather.", "Мой рейс задержали из-за плохой погоды."),
      sentence("ru-tr-6", "b1", "Say: I lost my passport and need help immediately.", "Я потерял паспорт и мне срочно нужна помощь."),
      sentence("ru-tr-7", "b2", "Ask: Could you recommend a safe neighborhood near downtown?", "Не могли бы вы порекомендовать безопасный район рядом с центром?"),
      sentence("ru-tr-8", "b2", "Say: I would prefer a quieter route, even if it takes longer.", "Я предпочёл бы более спокойный маршрут, даже если он займет больше времени.")
    ],
    work: [
      sentence("ru-wo-1", "a1", "Say: I work in a small software company.", "Я работаю в небольшой IT-компании."),
      sentence("ru-wo-2", "a2", "Say: We have a meeting at nine in the morning.", "У нас встреча в девять утра."),
      sentence("ru-wo-3", "a2", "Ask: Could you send me the updated report?", "Можете отправить мне обновлённый отчёт?"),
      sentence("ru-wo-4", "b1", "Say: We should prioritize the tasks with the highest impact.", "Нам нужно приоритизировать задачи с наибольшим эффектом."),
      sentence("ru-wo-5", "b1", "Say: I finished the draft, but it still needs revision.", "Я закончил черновик, но его ещё нужно доработать."),
      sentence("ru-wo-6", "b2", "Say: Our proposal focuses on long-term sustainability.", "Наше предложение ориентировано на долгосрочную устойчивость."),
      sentence("ru-wo-7", "b2", "Say: If we align our goals, we can deliver faster.", "Если мы согласуем цели, мы сможем быстрее выполнить задачу."),
      sentence("ru-wo-8", "b2", "Ask: What metrics will define success for this project?", "Какие метрики определят успех этого проекта?")
    ],
    health: [
      sentence("ru-he-1", "a1", "Say: I do not feel well today.", "Сегодня я плохо себя чувствую."),
      sentence("ru-he-2", "a1", "Ask: Where is the nearest pharmacy?", "Где находится ближайшая аптека?"),
      sentence("ru-he-3", "a2", "Say: I have had a headache since this morning.", "У меня болит голова с самого утра."),
      sentence("ru-he-4", "a2", "Say: I am allergic to peanuts.", "У меня аллергия на арахис."),
      sentence("ru-he-5", "b1", "Ask: Should I take this medicine before or after meals?", "Мне принимать это лекарство до или после еды?"),
      sentence("ru-he-6", "b1", "Say: The pain gets worse when I walk quickly.", "Боль усиливается, когда я быстро хожу."),
      sentence("ru-he-7", "b2", "Say: I need a full checkup because these symptoms persist.", "Мне нужно полное обследование, потому что эти симптомы не проходят."),
      sentence("ru-he-8", "b2", "Ask: Could you explain the treatment options in detail?", "Можете подробно объяснить варианты лечения?")
    ],
    grammar: [
      sentence("ru-gr-1", "a1", "Say: I am reading a short story now.", "Сейчас я читаю короткий рассказ."),
      sentence("ru-gr-2", "a1", "Say: Yesterday I studied for two hours.", "Вчера я занимался два часа."),
      sentence("ru-gr-3", "a2", "Say: Tomorrow I will practice with my friend.", "Завтра я буду практиковаться с другом."),
      sentence("ru-gr-4", "a2", "Say: If I have time, I will review the lesson.", "Если у меня будет время, я повторю урок."),
      sentence("ru-gr-5", "b1", "Say: I have been studying Russian for six months.", "Я изучаю русский язык уже шесть месяцев."),
      sentence("ru-gr-6", "b1", "Say: I would travel more if flights were cheaper.", "Я бы больше путешествовал, если бы билеты были дешевле."),
      sentence("ru-gr-7", "b2", "Say: By the time we arrive, they will have finished dinner.", "К тому времени, как мы приедем, они уже закончат ужин."),
      sentence("ru-gr-8", "b2", "Say: Had I known earlier, I would have changed the plan.", "Если бы я знал раньше, я бы изменил план.")
    ]
  },
  english: {
    essentials: [
      sentence("en-es-1", "a1", "Say: Hello, how are you?", "Hello, how are you?"),
      sentence("en-es-2", "a1", "Say: Thank you very much for your help.", "Thank you very much for your help."),
      sentence("en-es-3", "a1", "Say: I do not understand this sentence.", "I do not understand this sentence."),
      sentence("en-es-4", "a2", "Say: Could you speak more slowly, please?", "Could you speak more slowly, please?"),
      sentence("en-es-5", "a2", "Say: I am learning English every day.", "I am learning English every day."),
      sentence("en-es-6", "b1", "Say: I made a mistake, but I will try again.", "I made a mistake, but I will try again."),
      sentence("en-es-7", "b1", "Say: I would like to improve my pronunciation.", "I would like to improve my pronunciation."),
      sentence("en-es-8", "b2", "Say: I can explain my opinion with clear arguments.", "I can explain my opinion with clear arguments.")
    ],
    conversation: [
      sentence("en-co-1", "a1", "Ask: What is your name?", "What is your name?"),
      sentence("en-co-2", "a1", "Say: My name is Alex and I am from the United States.", "My name is Alex and I am from the United States."),
      sentence("en-co-3", "a2", "Say: It is nice to meet you in person.", "It is nice to meet you in person."),
      sentence("en-co-4", "a2", "Ask: What do you usually do on weekends?", "What do you usually do on weekends?"),
      sentence("en-co-5", "b1", "Say: I enjoy talking about books and current events.", "I enjoy talking about books and current events."),
      sentence("en-co-6", "b1", "Say: In my opinion, consistency is more important than intensity.", "In my opinion, consistency is more important than intensity."),
      sentence("en-co-7", "b2", "Say: I used to be shy, but now I express my ideas confidently.", "I used to be shy, but now I express my ideas confidently."),
      sentence("en-co-8", "b2", "Say: Although we disagree, I respect your perspective.", "Although we disagree, I respect your perspective.")
    ],
    travel: [
      sentence("en-tr-1", "a1", "Ask: Where is the train station?", "Where is the train station?"),
      sentence("en-tr-2", "a1", "Ask: How much does this ticket cost?", "How much does this ticket cost?"),
      sentence("en-tr-3", "a2", "Say: I need a room for two nights.", "I need a room for two nights."),
      sentence("en-tr-4", "a2", "Ask: Does this bus go to the city center?", "Does this bus go to the city center?"),
      sentence("en-tr-5", "b1", "Say: My flight was delayed because of bad weather.", "My flight was delayed because of bad weather."),
      sentence("en-tr-6", "b1", "Say: I lost my passport and need help immediately.", "I lost my passport and need help immediately."),
      sentence("en-tr-7", "b2", "Ask: Could you recommend a safe neighborhood near downtown?", "Could you recommend a safe neighborhood near downtown?"),
      sentence("en-tr-8", "b2", "Say: I would prefer a quieter route, even if it takes longer.", "I would prefer a quieter route, even if it takes longer.")
    ],
    work: [
      sentence("en-wo-1", "a1", "Say: I work in a small software company.", "I work in a small software company."),
      sentence("en-wo-2", "a2", "Say: We have a meeting at nine in the morning.", "We have a meeting at nine in the morning."),
      sentence("en-wo-3", "a2", "Ask: Could you send me the updated report?", "Could you send me the updated report?"),
      sentence("en-wo-4", "b1", "Say: We should prioritize the tasks with the highest impact.", "We should prioritize the tasks with the highest impact."),
      sentence("en-wo-5", "b1", "Say: I finished the draft, but it still needs revision.", "I finished the draft, but it still needs revision."),
      sentence("en-wo-6", "b2", "Say: Our proposal focuses on long-term sustainability.", "Our proposal focuses on long-term sustainability."),
      sentence("en-wo-7", "b2", "Say: If we align our goals, we can deliver faster.", "If we align our goals, we can deliver faster."),
      sentence("en-wo-8", "b2", "Ask: What metrics will define success for this project?", "What metrics will define success for this project?")
    ],
    health: [
      sentence("en-he-1", "a1", "Say: I do not feel well today.", "I do not feel well today."),
      sentence("en-he-2", "a1", "Ask: Where is the nearest pharmacy?", "Where is the nearest pharmacy?"),
      sentence("en-he-3", "a2", "Say: I have had a headache since this morning.", "I have had a headache since this morning."),
      sentence("en-he-4", "a2", "Say: I am allergic to peanuts.", "I am allergic to peanuts."),
      sentence("en-he-5", "b1", "Ask: Should I take this medicine before or after meals?", "Should I take this medicine before or after meals?"),
      sentence("en-he-6", "b1", "Say: The pain gets worse when I walk quickly.", "The pain gets worse when I walk quickly."),
      sentence("en-he-7", "b2", "Say: I need a full checkup because these symptoms persist.", "I need a full checkup because these symptoms persist."),
      sentence("en-he-8", "b2", "Ask: Could you explain the treatment options in detail?", "Could you explain the treatment options in detail?")
    ],
    grammar: [
      sentence("en-gr-1", "a1", "Say: I am reading a short story now.", "I am reading a short story now."),
      sentence("en-gr-2", "a1", "Say: Yesterday I studied for two hours.", "Yesterday I studied for two hours."),
      sentence("en-gr-3", "a2", "Say: Tomorrow I will practice with my friend.", "Tomorrow I will practice with my friend."),
      sentence("en-gr-4", "a2", "Say: If I have time, I will review the lesson.", "If I have time, I will review the lesson."),
      sentence("en-gr-5", "b1", "Say: I have been studying English for six months.", "I have been studying English for six months."),
      sentence("en-gr-6", "b1", "Say: I would travel more if flights were cheaper.", "I would travel more if flights were cheaper."),
      sentence("en-gr-7", "b2", "Say: By the time we arrive, they will have finished dinner.", "By the time we arrive, they will have finished dinner."),
      sentence("en-gr-8", "b2", "Say: Had I known earlier, I would have changed the plan.", "Had I known earlier, I would have changed the plan.")
    ]
  }
};

function shuffle(items) {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
}

function levelRank(level) {
  return LEVEL_ORDER.indexOf(level);
}

function recommendedLevelFromMastery(mastery) {
  if (mastery < 20) return "a1";
  if (mastery < 45) return "a2";
  if (mastery < 70) return "b1";
  return "b2";
}

function clampLevelRank(rank) {
  return Math.max(0, Math.min(rank, LEVEL_ORDER.length - 1));
}

function getCategoryItems(language, category) {
  return COURSE[language]?.[category] || [];
}

function getCourseOverview(language) {
  const catalog = COURSE[language] || {};
  return CATEGORIES.map((category) => {
    const items = catalog[category.id] || [];
    const levels = Array.from(new Set(items.map((item) => item.level))).sort(
      (a, b) => levelRank(a) - levelRank(b)
    );
    return {
      ...category,
      totalPhrases: items.length,
      levels
    };
  });
}

function pickDistractors(pool, answer, count) {
  const unique = pool.filter((item) => item.target !== answer).map((item) => item.target);
  return shuffle(unique).slice(0, count);
}

function buildAcceptedAnswers(target) {
  const compact = String(target || "").trim();
  if (!compact) return [];
  const noTrailingPunctuation = compact.replace(/[.!?]+$/g, "");
  if (noTrailingPunctuation !== compact) {
    return [noTrailingPunctuation];
  }
  return [];
}

function deriveObjective(category, level) {
  if (category === "grammar") {
    if (level === "a1") return "present-and-past-basics";
    if (level === "a2") return "future-and-conditionals";
    if (level === "b1") return "perfect-and-hypothetical";
    return "advanced-complex-tenses";
  }
  return `${category}-${level}-communication`;
}

function pickLevelAwareDistractors(pool, item, count) {
  const ranked = levelRank(item.level);
  const sameBand = pool.filter(
    (candidate) =>
      candidate.target !== item.target &&
      Math.abs(levelRank(candidate.level) - ranked) <= 1
  );
  const source = sameBand.length >= count ? sameBand : pool.filter((candidate) => candidate.target !== item.target);
  return shuffle(source.map((candidate) => candidate.target)).slice(0, count);
}

function createQuestion(item, pool, idx, category) {
  const questionTypeCycle = ["mc_sentence", "build_sentence", "cloze_sentence", "dictation_sentence", "dialogue_turn"];
  const questionType = questionTypeCycle[idx % questionTypeCycle.length];
  const base = {
    id: item.id,
    type: questionType,
    level: item.level,
    prompt: item.prompt,
    answer: item.target,
    acceptedAnswers: buildAcceptedAnswers(item.target),
    objective: deriveObjective(category, item.level)
  };

  if (questionType === "mc_sentence") {
    const distractors = pickLevelAwareDistractors(pool, item, 3);
    return {
      ...base,
      options: shuffle([item.target, ...distractors])
    };
  }

  if (questionType === "dialogue_turn") {
    const distractors = pickLevelAwareDistractors(pool, item, 3);
    return {
      ...base,
      prompt: `Choose the best response. ${item.prompt}`,
      options: shuffle([item.target, ...distractors])
    };
  }

  if (questionType === "cloze_sentence") {
    const answerTokens = item.target.split(" ").filter(Boolean);
    const maskIndex = answerTokens.findIndex((token) => token.length > 3);
    const selectedMaskIndex = maskIndex >= 0 ? maskIndex : 0;
    const clozeAnswer = answerTokens[selectedMaskIndex];
    const fallbackDistractors = pool
      .flatMap((entry) => entry.target.split(" "))
      .filter((token) => token.length > 2 && token !== clozeAnswer);
    const clozeOptions = shuffle([clozeAnswer, ...shuffle(fallbackDistractors).slice(0, 3)]).slice(0, 4);
    const clozeTokens = [...answerTokens];
    clozeTokens[selectedMaskIndex] = "____";
    return {
      ...base,
      clozeAnswer,
      clozeText: clozeTokens.join(" "),
      clozeOptions
    };
  }

  if (questionType === "dictation_sentence") {
    const answerTokens = item.target.split(" ");
    const tokenPool = pool
      .flatMap((entry) => entry.target.split(" "))
      .filter((token) => token.length > 2 && !answerTokens.includes(token));
    const noise = shuffle(tokenPool).slice(0, 2);
    return {
      ...base,
      prompt: `Listen and build sentence. ${item.prompt}`,
      audioText: item.target,
      tokens: shuffle([...answerTokens, ...noise])
    };
  }

  const answerTokens = item.target.split(" ");
  const tokenPool = pool
    .flatMap((entry) => entry.target.split(" "))
    .filter((token) => token.length > 2 && !answerTokens.includes(token));
  const noise = shuffle(tokenPool).slice(0, 2);

  return {
    ...base,
    tokens: shuffle([...answerTokens, ...noise])
  };
}

function generateSession({
  language,
  category,
  mastery = 0,
  count = 10,
  recentAccuracy = null,
  selfRatedLevel = "a1",
  dueItemIds = [],
  weakItemIds = []
}) {
  const all = getCategoryItems(language, category);
  if (!all.length) {
    return {
      recommendedLevel: "a1",
      questions: []
    };
  }

  const baselineLevel = recommendedLevelFromMastery(mastery);
  let adaptiveRank = levelRank(baselineLevel);

  if (Number.isFinite(recentAccuracy)) {
    if (recentAccuracy >= 0.88) adaptiveRank += 1;
    if (recentAccuracy <= 0.55) adaptiveRank -= 1;
  }

  const selfRatedRank = levelRank(selfRatedLevel);
  if (selfRatedRank >= 0) {
    adaptiveRank = Math.max(adaptiveRank, selfRatedRank - 1);
  }

  const recommendedLevel = LEVEL_ORDER[clampLevelRank(adaptiveRank)];
  const maxRank = Math.min(clampLevelRank(adaptiveRank) + 1, LEVEL_ORDER.length - 1);
  const candidatePool = all.filter((item) => levelRank(item.level) <= maxRank);
  const sourcePool = candidatePool.length >= count ? candidatePool : all;
  const dueSet = new Set(dueItemIds);
  const weakSet = new Set(weakItemIds);
  const targetCount = Math.min(count, sourcePool.length);
  const dueTarget = Math.max(0, Math.min(targetCount, Math.round(targetCount * 0.6)));
  const weakTarget = Math.max(0, Math.min(targetCount - dueTarget, Math.round(targetCount * 0.25)));

  const dueItems = shuffle(sourcePool.filter((item) => dueSet.has(item.id))).slice(0, dueTarget);
  const selectedIds = new Set(dueItems.map((item) => item.id));
  const weakItems = shuffle(
    sourcePool.filter((item) => weakSet.has(item.id) && !selectedIds.has(item.id))
  ).slice(0, weakTarget);
  weakItems.forEach((item) => selectedIds.add(item.id));

  const remaining = shuffle(sourcePool.filter((item) => !selectedIds.has(item.id)));
  const selected = [...dueItems, ...weakItems, ...remaining].slice(0, targetCount);
  const questions = selected.map((item, idx) => createQuestion(item, sourcePool, idx, category));

  return {
    recommendedLevel,
    difficultyMultiplier: LEVEL_XP_MULTIPLIER[recommendedLevel],
    questions
  };
}

module.exports = {
  LANGUAGES,
  CATEGORIES,
  COURSE,
  LEVEL_ORDER,
  LEVEL_XP_MULTIPLIER,
  getCourseOverview,
  getCategoryItems,
  generateSession,
  recommendedLevelFromMastery
};
