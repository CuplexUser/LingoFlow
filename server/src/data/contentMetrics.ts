const { LEVEL_ORDER } = require("./constants.ts");

function normalizeExerciseType(item: any): string {
  const raw = String(item?.exerciseType || "").trim().toLowerCase();
  return raw || "unspecified";
}

function emptyLevelCounts() {
  return LEVEL_ORDER.reduce((acc: Record<string, number>, level: string) => {
    acc[level] = 0;
    return acc;
  }, {});
}

function createContentMetrics(course: Record<string, Record<string, any[]>>, categories: Array<{ id: string }>) {
  return function getContentMetrics(options: { language?: string } = {}) {
    const languageFilter = String(options.language || "").trim().toLowerCase();
    const languageIds = Object.keys(course)
      .filter((id) => !languageFilter || id === languageFilter)
      .sort();

    const languages = languageIds.map((languageId) => {
      const catalog = course[languageId] || {};
      const categoryMetrics = categories.map((category) => {
        const items = Array.isArray(catalog[category.id]) ? catalog[category.id] : [];
        const levelCounts = emptyLevelCounts();
        const exerciseTypeCounts: Record<string, number> = {};

        items.forEach((item) => {
          const level = String(item?.level || "").trim().toLowerCase();
          if (LEVEL_ORDER.includes(level)) {
            levelCounts[level] += 1;
          }
          const exerciseType = normalizeExerciseType(item);
          exerciseTypeCounts[exerciseType] = (exerciseTypeCounts[exerciseType] || 0) + 1;
        });

        return {
          id: category.id,
          total: items.length,
          levelCounts,
          exerciseTypeCounts,
          underTargetByLevel: LEVEL_ORDER.filter((level) => levelCounts[level] < 20)
        };
      });

      const totalItems = categoryMetrics.reduce((sum, entry) => sum + entry.total, 0);
      return {
        id: languageId,
        totalItems,
        categories: categoryMetrics
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      targetPerLevel: 20,
      languages
    };
  };
}

module.exports = {
  createContentMetrics
};
