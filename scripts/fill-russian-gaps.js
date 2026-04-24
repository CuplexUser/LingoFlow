#!/usr/bin/env node
/* global console, require */

const fs = require("fs");
const path = require("path");

const LEVELS = ["a1", "a2", "b1", "b2"];
const TARGET_PER_LEVEL = 20;
const RUSSIAN_DIR = path.resolve("server/content/languages/russian");

const TOPICS = {
  essentials: { en: "language basics", acc: "основы языка", gen: "основ языка" },
  conversation: { en: "conversation", acc: "разговорную речь", gen: "разговорной речи" },
  travel: { en: "travel", acc: "путешествия", gen: "путешествий" },
  work: { en: "work", acc: "рабочие задачи", gen: "рабочих задач" },
  health: { en: "health", acc: "здоровье", gen: "здоровья" },
  family_friends: { en: "family and friends", acc: "семью и друзей", gen: "семьи и друзей" },
  food_cooking: { en: "food and cooking", acc: "еду и кулинарию", gen: "еды и кулинарии" },
  grammar: { en: "grammar", acc: "грамматику", gen: "грамматики" },
  hobbies_leisure: { en: "hobbies and leisure", acc: "хобби и досуг", gen: "хобби и досуга" },
  sports_fitness: { en: "sports and fitness", acc: "спорт и фитнес", gen: "спорта и фитнеса" },
  news_media: { en: "news and media", acc: "новости и медиа", gen: "новостей и медиа" },
  money_finance: { en: "money and finance", acc: "деньги и финансы", gen: "денег и финансов" },
  science_technology: { en: "science and technology", acc: "науку и технологии", gen: "науки и технологий" },
  culture_history: { en: "culture and history", acc: "культуру и историю", gen: "культуры и истории" },
  nature_animals: { en: "nature and animals", acc: "природу и животных", gen: "природы и животных" }
};

const VOCAB = {
  essentials: [["phrase", "фраза"], ["question", "вопрос"], ["answer", "ответ"]],
  conversation: [["dialogue", "диалог"], ["listener", "слушатель"], ["topic", "тема"]],
  travel: [["ticket", "билет"], ["station", "вокзал"], ["route", "маршрут"]],
  work: [["deadline", "срок"], ["meeting", "встреча"], ["report", "отчёт"]],
  health: [["exercise", "упражнение"], ["rest", "отдых"], ["medicine", "лекарство"]],
  family_friends: [["relative", "родственник"], ["friendship", "дружба"], ["support", "поддержка"]],
  food_cooking: [["recipe", "рецепт"], ["ingredient", "ингредиент"], ["kitchen", "кухня"]],
  grammar: [["verb", "глагол"], ["noun", "существительное"], ["tense", "время"]],
  hobbies_leisure: [["hobby", "хобби"], ["board game", "настольная игра"], ["painting", "рисование"]],
  sports_fitness: [["training", "тренировка"], ["coach", "тренер"], ["endurance", "выносливость"]],
  news_media: [["headline", "заголовок"], ["article", "статья"], ["source", "источник"]],
  money_finance: [["budget", "бюджет"], ["savings", "сбережения"], ["expense", "расход"]],
  science_technology: [["research", "исследование"], ["device", "устройство"], ["data", "данные"]],
  culture_history: [["tradition", "традиция"], ["museum", "музей"], ["heritage", "наследие"]],
  nature_animals: [["forest", "лес"], ["habitat", "среда обитания"], ["species", "вид"]]
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function countByLevel(items) {
  return Object.fromEntries(LEVELS.map((level) => [level, items.filter((item) => item.level === level).length]));
}

function nextId(categoryId, level, usedIds) {
  const prefix = `ru-${categoryId.slice(0, 2)}-${level}-`;
  let n = 1;
  while (usedIds.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

function pick(items, idx) {
  return items[idx % items.length];
}

function buildRussianEntry(categoryId, level, idx) {
  const topic = TOPICS[categoryId] || { en: categoryId.replace(/_/g, " "), acc: categoryId, gen: categoryId };
  const vocab = VOCAB[categoryId] || [["practice", "практика"], ["lesson", "урок"], ["topic", "тема"]];

  const rotations = {
    a1: [undefined, "build_sentence", "flashcard", "pronunciation", "mc_sentence"],
    a2: [undefined, "build_sentence", "cloze_sentence", "pronunciation", "roleplay"],
    b1: [undefined, "build_sentence", "cloze_sentence", "dictation_sentence", "roleplay"],
    b2: [undefined, "cloze_sentence", "dictation_sentence", "roleplay", "mc_sentence"]
  };

  const exerciseType = pick(rotations[level], idx);

  if (exerciseType === "flashcard") {
    const [enWord, ruWord] = pick(vocab, idx);
    return {
      level,
      difficulty: level,
      prompt: `Vocabulary: ${enWord}`,
      correctAnswer: ruWord,
      hints: ["Recall the most common Russian equivalent."],
      exerciseType
    };
  }

  if (exerciseType === "cloze_sentence") {
    const answer = level === "a2" ? "занимаюсь" : level === "b1" ? "развиваю" : "углубляю";
    const stem =
      level === "a2"
        ? `Cloze: Я регулярно ____ темой «${topic.acc}».`
        : level === "b1"
          ? `Cloze: Я постепенно ____ навыки в теме «${topic.acc}».`
          : `Cloze: Я системно ____ знания в теме «${topic.gen}».`;
    return {
      level,
      difficulty: level,
      prompt: stem,
      correctAnswer: answer,
      hints: ["Use a verb that matches the context and style."],
      exerciseType
    };
  }

  if (exerciseType === "dictation_sentence") {
    const sentence =
      level === "b1"
        ? `Я стараюсь регулярно практиковать тему «${topic.acc}».`
        : `Системная практика темы «${topic.gen}» помогает говорить увереннее.`;
    return {
      level,
      difficulty: level,
      prompt: "Listen and type the sentence you hear.",
      correctAnswer: sentence,
      hints: ["Listen for key noun endings and word order."],
      exerciseType
    };
  }

  if (exerciseType === "roleplay") {
    const response =
      level === "a2"
        ? `Можете дать мне больше упражнений по теме «${topic.gen}»?`
        : level === "b1"
          ? `Мне бы хотелось больше практики по теме «${topic.gen}», чтобы говорить увереннее.`
          : `Буду признателен за развёрнутую обратную связь по теме «${topic.gen}».`;
    return {
      level,
      difficulty: level,
      prompt: `Roleplay: Ask your tutor for support with ${topic.en}.`,
      correctAnswer: response,
      hints: ["Use a polite, natural request."],
      exerciseType
    };
  }

  if (exerciseType === "mc_sentence") {
    const sentence =
      level === "a1"
        ? `Я каждый день повторяю тему «${topic.acc}».`
        : `Я регулярно практикую тему «${topic.acc}».`;
    return {
      level,
      difficulty: level,
      prompt: `Choose the best translation: I regularly practice ${topic.en}.`,
      correctAnswer: sentence,
      hints: ["Pick the most natural Russian sentence."],
      exerciseType
    };
  }

  const phrasePools = {
    a1: [
      [`Say: I study ${topic.en} every day.`, `Я каждый день изучаю ${topic.acc}.`],
      [`Ask: Can we practice ${topic.en} now?`, `Мы можем сейчас практиковать ${topic.acc}?`],
      [`Say: This lesson on ${topic.en} is useful.`, `Этот урок по теме «${topic.gen}» полезный.`],
      [`Say: I need more time for ${topic.en}.`, `Мне нужно больше времени на ${topic.acc}.`]
    ],
    a2: [
      [`Say: I practiced ${topic.en} yesterday.`, `Я вчера практиковал ${topic.acc}.`],
      [`Ask: How can I improve in ${topic.en}?`, `Как я могу улучшить навыки в теме «${topic.gen}»?`],
      [`Say: This exercise on ${topic.en} was difficult.`, `Это упражнение по теме «${topic.gen}» было трудным.`],
      [`Say: I understand ${topic.en} better now.`, `Теперь я лучше понимаю тему «${topic.acc}».`]
    ],
    b1: [
      [`Say: Regular practice helps me improve in ${topic.en}.`, `Регулярная практика помогает мне развиваться в теме «${topic.gen}».`],
      [`Ask: Which strategy works best for ${topic.en}?`, `Какая стратегия лучше всего работает для темы «${topic.gen}»?`],
      [`Say: I make fewer mistakes when I review ${topic.en}.`, `Я делаю меньше ошибок, когда повторяю тему «${topic.acc}».`],
      [`Say: I want to sound more natural in ${topic.en}.`, `Я хочу звучать более естественно в теме «${topic.gen}».`]
    ],
    b2: [
      [`Say: Systematic practice has deepened my understanding of ${topic.en}.`, `Системная практика углубила моё понимание темы «${topic.gen}».`],
      [`Ask: Could you clarify a nuance in ${topic.en}?`, `Не могли бы вы уточнить один смысловой оттенок в теме «${topic.gen}»?`],
      [`Say: I value detailed feedback on ${topic.en}.`, `Я ценю подробную обратную связь по теме «${topic.gen}».`],
      [`Say: Consistency matters more than intensity in ${topic.en}.`, `В теме «${topic.gen}» системность важнее интенсивности.`]
    ]
  };

  const [prompt, correctAnswer] = pick(phrasePools[level], idx);
  return {
    level,
    difficulty: level,
    prompt,
    correctAnswer,
    hints: ["Focus on natural Russian phrasing and word order."],
    ...(exerciseType ? { exerciseType } : {})
  };
}

function main() {
  const files = fs
    .readdirSync(RUSSIAN_DIR)
    .filter((name) => name.endsWith(".json") && name !== "_meta.json")
    .sort();

  for (const fileName of files) {
    const categoryId = fileName.replace(".json", "");
    const filePath = path.join(RUSSIAN_DIR, fileName);
    const items = readJson(filePath);
    const usedIds = new Set(items.map((item) => String(item.id)));
    const before = countByLevel(items);

    for (const level of LEVELS) {
      let idx = 0;
      while (items.filter((item) => item.level === level).length < TARGET_PER_LEVEL) {
        const generated = buildRussianEntry(categoryId, level, idx);
        const id = nextId(categoryId, level, usedIds);
        const entry = { id, ...generated };
        items.push(entry);
        usedIds.add(id);
        idx += 1;
      }
    }

    writeJson(filePath, items);
    const after = countByLevel(items);
    console.log(
      `${categoryId}: ${before.a1}/${before.a2}/${before.b1}/${before.b2} -> ${after.a1}/${after.a2}/${after.b1}/${after.b2} (total ${items.length})`
    );
  }
}

main();
