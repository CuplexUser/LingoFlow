// Skills group a course's items into things a learner can know: the words for a topic
// ("vocab"), something they can do with the language ("function") or a grammar point
// ("grammar"). The knowledge map and unit exams are built on them.
//
// The catalog lives in server/content/skills: _shared.json holds the skills every course
// uses, and an optional <language>.json adds a course's own. Items name their skills in
// `skills`. A course translated from English says so with `skillsFrom` in its _meta.json and
// inherits the English item's skills by id (de-fo-a2-51 takes en-fo-a2-51's), so only items
// it adds need tags of their own. An item still untagged falls into a generated
// "<Unit> basics" skill, so the map and exams work for every item.
const fs: typeof import("fs") = require("fs");
const path: typeof import("path") = require("path");
const { CATEGORIES, LEVEL_ORDER } = require("./constants.ts");
const { SKILLS_DIR } = require("../paths.ts");

type SkillKind = "vocab" | "function" | "grammar";

type Skill = {
  id: string;
  label: string;
  kind: SkillKind;
  level: string;
  units: string[];
  description?: string;
  generated?: boolean;
};

type SkillCatalog = { shared: Skill[]; byLanguage: Record<string, Skill[]> };

const SKILL_KINDS: SkillKind[] = ["vocab", "function", "grammar"];
const SKILL_ID_RE = /^[a-z0-9_]+(\.[a-z0-9_-]+)+$/;
const SHARED_FILE = "_shared.json";

function categoryLabel(category: string): string {
  return CATEGORIES.find((entry: { id: string }) => entry.id === category)?.label || category;
}

function fallbackSkillId(category: string, level: string): string {
  return `${category}.${level}.general`;
}

function fallbackSkill(category: string, level: string): Skill {
  return {
    id: fallbackSkillId(category, level),
    label: `${categoryLabel(category)} basics`,
    kind: "vocab",
    level,
    units: [category],
    generated: true
  };
}

// The id an item shares with its English original: "de-fo-a2-51" and "en-fo-a2-51" are both
// "fo-a2-51".
function sourceKey(itemId: string): string {
  return String(itemId).replace(/^[a-z]+-/, "");
}

function validateSkills(skills: unknown, fileName: string): Skill[] {
  if (!Array.isArray(skills)) throw new Error(`${fileName}: skills must be an array`);
  const categoryIds = CATEGORIES.map((entry: { id: string }) => entry.id);
  return skills.map((skill: any, index: number) => {
    const prefix = `${fileName}.skills[${index}]`;
    if (!skill || typeof skill !== "object") throw new Error(`${prefix} must be an object`);
    if (!SKILL_ID_RE.test(String(skill.id || ""))) throw new Error(`${prefix}.id is not a skill id`);
    if (!String(skill.label || "").trim()) throw new Error(`${prefix}.label is required`);
    if (!SKILL_KINDS.includes(skill.kind)) throw new Error(`${prefix}.kind must be one of ${SKILL_KINDS.join(", ")}`);
    if (!LEVEL_ORDER.includes(skill.level)) throw new Error(`${prefix}.level must be one of ${LEVEL_ORDER.join(", ")}`);
    if (!Array.isArray(skill.units) || !skill.units.length || skill.units.some((unit: string) => !categoryIds.includes(unit))) {
      throw new Error(`${prefix}.units must list known categories`);
    }
    if (String(skill.id).endsWith(".general")) throw new Error(`${prefix}.id ends in .general, which is kept for generated skills`);
    return {
      id: skill.id,
      label: skill.label,
      kind: skill.kind,
      level: skill.level,
      units: skill.units,
      ...(skill.description ? { description: skill.description } : {})
    };
  });
}

function loadSkillCatalog(dir: string = SKILLS_DIR): SkillCatalog {
  const catalog: SkillCatalog = { shared: [], byLanguage: {} };
  if (!fs.existsSync(dir)) return catalog;
  const seen = new Set<string>();
  for (const file of fs.readdirSync(dir).filter((name: string) => name.endsWith(".json")).sort()) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    const skills = validateSkills(parsed?.skills, file);
    for (const skill of skills) {
      if (seen.has(skill.id)) throw new Error(`${file}: duplicate skill id ${skill.id}`);
      seen.add(skill.id);
    }
    if (file === SHARED_FILE) catalog.shared = skills;
    else catalog.byLanguage[file.replace(/\.json$/, "")] = skills;
  }
  return catalog;
}

function createSkillIndex(
  course: Record<string, Record<string, any[]>>,
  catalog: SkillCatalog,
  skillSources: Record<string, string | undefined> = {}
) {
  const itemSkills = new Map<string, Map<string, string[]>>();
  const skillsByLanguage = new Map<string, Map<string, Skill>>();
  const skillItems = new Map<string, Map<string, string[]>>();

  const ownTags = (item: any): string[] =>
    Array.isArray(item.skills) ? item.skills.map(String).filter(Boolean) : [];

  for (const language of Object.keys(course)) {
    const known = new Map<string, Skill>(
      [...catalog.shared, ...(catalog.byLanguage[language] || [])].map((skill) => [skill.id, skill])
    );
    const source = skillSources[language];
    if (source && !course[source]) throw new Error(`${language}: skillsFrom names an unknown course "${source}"`);
    const sourceTags = new Map<string, string[]>();
    if (source && course[source]) {
      for (const items of Object.values(course[source])) {
        for (const item of items) sourceTags.set(sourceKey(item.id), ownTags(item));
      }
    }

    const tags = new Map<string, string[]>();
    const used = new Map<string, Skill>();
    const members = new Map<string, string[]>();
    for (const [category, items] of Object.entries(course[language])) {
      for (const item of items) {
        const level = String(item.difficulty || item.level);
        let resolved = ownTags(item).filter((id) => known.has(id));
        if (!resolved.length && source) {
          resolved = (sourceTags.get(sourceKey(item.id)) || []).filter((id) => known.has(id));
        }
        if (!resolved.length) {
          const fallback = fallbackSkill(category, level);
          known.set(fallback.id, known.get(fallback.id) || fallback);
          resolved = [fallback.id];
        }
        tags.set(String(item.id), resolved);
        for (const id of resolved) {
          used.set(id, known.get(id) as Skill);
          members.set(id, [...(members.get(id) || []), String(item.id)]);
        }
      }
    }
    itemSkills.set(language, tags);
    skillsByLanguage.set(language, used);
    skillItems.set(language, members);
  }

  // Skills come back in catalog order, so a unit's skills read the way they were written.
  const catalogOrder = new Map(
    [...catalog.shared, ...Object.values(catalog.byLanguage).flat()].map((skill, index) => [skill.id, index])
  );
  const order = (skill: Skill) => catalogOrder.get(skill.id) ?? Number.MAX_SAFE_INTEGER;

  return {
    getSkills(language: string): Skill[] {
      return [...(skillsByLanguage.get(language)?.values() || [])].sort((a, b) => order(a) - order(b));
    },
    getSkill(language: string, skillId: string): Skill | null {
      return skillsByLanguage.get(language)?.get(skillId) || null;
    },
    getItemSkills(language: string, itemId: string): string[] {
      return itemSkills.get(language)?.get(String(itemId)) || [];
    },
    getSkillItems(language: string, skillId: string): string[] {
      return skillItems.get(language)?.get(skillId) || [];
    },
    // The skills taught in one unit: items of this category at this level.
    getUnitSkills(language: string, category: string, level: string): Skill[] {
      const items = course[language]?.[category] || [];
      const ids = new Set<string>();
      for (const item of items) {
        if (String(item.difficulty || item.level) !== level) continue;
        for (const id of itemSkills.get(language)?.get(String(item.id)) || []) ids.add(id);
      }
      return [...ids]
        .map((id) => skillsByLanguage.get(language)?.get(id) as Skill)
        .sort((a, b) => order(a) - order(b));
    }
  };
}

module.exports = {
  SKILL_KINDS,
  SKILL_ID_RE,
  fallbackSkillId,
  sourceKey,
  loadSkillCatalog,
  createSkillIndex
};
