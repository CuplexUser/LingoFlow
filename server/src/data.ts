const { CATEGORIES, LEVEL_ORDER, LEVEL_XP_MULTIPLIER } = require("./data/constants.ts");
const { loadLanguageContent } = require("./data/contentLoader.ts");
const { createCourseSelectors, createSessionGenerator, recommendedLevelFromMastery } = require("./data/sessionGenerator.ts");
const { getPracticePool } = require("./data/practicePool.ts");
const { createContentMetrics } = require("./data/contentMetrics.ts");

const { languages: LANGUAGES, course: COURSE, contentMeta: LANGUAGE_CONTENT_META } = loadLanguageContent();
const { getCategoryItems, getAllItems, getCourseOverview } = createCourseSelectors(COURSE);
const generateSession = createSessionGenerator(getCategoryItems, getAllItems, getPracticePool);
const getContentMetrics = createContentMetrics(COURSE, CATEGORIES);

module.exports = {
  LANGUAGES,
  CATEGORIES,
  COURSE,
  LEVEL_ORDER,
  LEVEL_XP_MULTIPLIER,
  LANGUAGE_CONTENT_META,
  getCourseOverview,
  getContentMetrics,
  getCategoryItems,
  getAllItems,
  generateSession,
  recommendedLevelFromMastery
};
