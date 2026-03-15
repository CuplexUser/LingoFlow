const { CATEGORIES, LEVEL_ORDER, LEVEL_XP_MULTIPLIER } = require("./data/constants.ts");
const { loadLanguageContent } = require("./data/contentLoader.ts");
const { createCourseSelectors, createSessionGenerator, recommendedLevelFromMastery } = require("./data/sessionGenerator.ts");
const { getPracticePool } = require("./data/practicePool.ts");

const { languages: LANGUAGES, course: COURSE, contentMeta: LANGUAGE_CONTENT_META } = loadLanguageContent();
const { getCategoryItems, getAllItems, getCourseOverview } = createCourseSelectors(COURSE);
const generateSession = createSessionGenerator(getCategoryItems, getAllItems, getPracticePool);

module.exports = {
  LANGUAGES,
  CATEGORIES,
  COURSE,
  LEVEL_ORDER,
  LEVEL_XP_MULTIPLIER,
  LANGUAGE_CONTENT_META,
  getCourseOverview,
  getCategoryItems,
  getAllItems,
  generateSession,
  recommendedLevelFromMastery
};
