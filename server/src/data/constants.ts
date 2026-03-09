const CATEGORIES = [
  { id: "essentials", label: "Essentials", description: "Core survival phrases" },
  { id: "conversation", label: "Conversation", description: "Natural social dialogue" },
  { id: "travel", label: "Travel", description: "Transport and directions" },
  { id: "work", label: "Work", description: "Professional communication" },
  { id: "health", label: "Health", description: "Medical and emergency phrases" },
  { id: "family_friends", label: "Family & Friends", description: "Relationships and social life" },
  { id: "food_cooking", label: "Food & Cooking", description: "Meals, recipes, and dining" },
  { id: "grammar", label: "Grammar", description: "Sentence structures and tenses" }
];

const LEVEL_ORDER = ["a1", "a2", "b1", "b2"];
const LEVEL_XP_MULTIPLIER = { a1: 1.0, a2: 1.25, b1: 1.6, b2: 2.0 };

module.exports = {
  CATEGORIES,
  LEVEL_ORDER,
  LEVEL_XP_MULTIPLIER
};
