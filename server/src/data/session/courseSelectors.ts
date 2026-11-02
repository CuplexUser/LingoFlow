// Reading a loaded course: one unit's items, all of a language's items, and an overview.
const { CATEGORIES } = require("../constants.ts");
const { levelRank } = require("./itemText.ts");

function createCourseSelectors(course) {
  function getCategoryItems(language, category) {
    return course[language]?.[category] || [];
  }

  function getAllItems(language) {
    const catalog = course[language] || {};
    return CATEGORIES.flatMap((category) =>
      (catalog[category.id] || []).map((item) => ({
        ...item,
        category: item.category || category.id
      }))
    );
  }

  function getCourseOverview(language) {
    const catalog = course[language] || {};
    return CATEGORIES.map((category) => {
      const items = catalog[category.id] || [];
      const levels = Array.from(new Set(items.map((item) => item.level))).sort(
        (a, b) => levelRank(a) - levelRank(b)
      );
      return {
        ...category,
        totalPhrases: items.length,
        levels,
        mediaRichCount: items.filter((item) => item.audioUrl || item.imageUrl).length,
        sampleCulturalNotes: items
          .map((item) => String(item.culturalNote || "").trim())
          .filter(Boolean)
          .slice(0, 2)
      };
    });
  }

  return {
    getCategoryItems,
    getAllItems,
    getCourseOverview
  };
}

module.exports = { createCourseSelectors };
