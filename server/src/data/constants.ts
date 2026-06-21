const CATEGORIES = [
  { id: "essentials", label: "Essentials", description: "Core survival phrases" },
  { id: "conversation", label: "Conversation", description: "Natural social dialogue" },
  { id: "travel", label: "Travel", description: "Transport and directions" },
  { id: "work", label: "Work", description: "Professional communication" },
  { id: "health", label: "Health", description: "Medical and emergency phrases" },
  { id: "family_friends", label: "Family & Friends", description: "Relationships and social life" },
  { id: "food_cooking", label: "Food & Cooking", description: "Meals, recipes, and dining" },
  { id: "grammar", label: "Grammar", description: "Sentence structures and tenses" },
  { id: "hobbies_leisure", label: "Hobbies & Leisure", description: "Free-time activities and interests" },
  { id: "sports_fitness", label: "Sports & Fitness", description: "Exercise, training, and active lifestyle vocabulary" },
  { id: "news_media", label: "News & Media", description: "Current events, journalism, and media literacy language" },
  { id: "money_finance", label: "Money & Finance", description: "Banking, budgeting, payments, and financial conversations" },
  { id: "science_technology", label: "Science & Technology", description: "Modern tools, ideas, and innovation" },
  {
    id: "culture_history",
    label: "Culture & History",
    description: "Traditions, museums, customs, and historical context",
    experimental: true
  },
  {
    id: "nature_animals",
    label: "Nature & Animals",
    description: "Animals, plants, weather, and outdoor activities",
    experimental: true
  },
  {
    id: "numbers_math",
    label: "Numbers & Math",
    description: "Count, calculate, and conquer. Learn numbers, operators, fractions, and the sneaky ways English uses numbers in everyday speech.",
    experimental: true
  }
];

const LEVEL_ORDER = ["a1", "a2", "b1", "b2"];
const LEVEL_XP_MULTIPLIER = { a1: 1.0, a2: 1.25, b1: 1.6, b2: 2.0 };

// XP awarded for finishing a story, before the per-level multiplier (a1=20 … b2=40),
// plus the maximum bonus for a perfect comprehension quiz (scaled by score and level).
// Kept modest so reading cannot trivially complete the daily goal on its own.
const STORY_BASE_XP = 20;
const QUIZ_BONUS_MAX = 15;

module.exports = {
  CATEGORIES,
  LEVEL_ORDER,
  LEVEL_XP_MULTIPLIER,
  STORY_BASE_XP,
  QUIZ_BONUS_MAX
};
