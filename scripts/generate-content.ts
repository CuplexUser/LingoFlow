#!/usr/bin/env npx tsx
/**
 * LingoFlow Content Generator
 *
 * Generates new entries for a category file, matching the exact schema of
 * the English reference file and preserving uniform structure across languages.
 *
 * Usage:
 *   npx tsx scripts/generate-content.ts --lang=spanish --category=conversation --count=12
 *   npx tsx scripts/generate-content.ts --audit
 *   npx tsx scripts/generate-content.ts --dry-run --lang=spanish --category=conversation --count=12
 *
 * Assumptions about your file layout:
 *   server/content/languages/<lang>/<category>.json
 *   e.g. server/content/languages/english/conversation.json
 *        server/content/languages/spanish/conversation.json
 *
 * The English file is always the structural reference.
 * ID prefix convention derived from filename: "en-cv" → "es-cv", "it-cv", etc.
 */

import fs from "fs";
import path from "path";

// Load .env from server/ so ANTHROPIC_API_KEY can live alongside other server secrets
const envPath = path.resolve("server/.env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONTENT_ROOT = path.resolve("server/content/languages");

const LANG_PREFIXES: Record<string, string> = {
  english: "en",
  spanish: "es",
  russian: "ru",
  italian: "it",
  swedish: "sv",
};

const LEVELS = ["a1", "a2", "b1", "b2"] as const;
type Level = (typeof LEVELS)[number];

// All exercise types currently in the schema
const EXERCISE_TYPES = [
  "build_sentence",
  "flashcard",
  "pronunciation",
  "roleplay",
  "cloze_sentence",
  "dictation_sentence",
  "mc_sentence",
  "dialogue_turn",
] as const;

// ---------------------------------------------------------------------------
// Schema types
// ---------------------------------------------------------------------------

interface Entry {
  id: string;
  level: Level;
  difficulty: Level;
  prompt: string;
  correctAnswer: string;
  hints: string[];
  exerciseType?: string;
  imageUrl?: string;
  culturalNote?: string;
  acceptedAnswers?: string[];
}

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((a) => {
      const [k, v] = a.replace(/^--/, "").split("=");
      return [k, v ?? true];
    })
  );
  return {
    lang: args.lang as string | undefined,
    category: args.category as string | undefined,
    count: args.count ? parseInt(args.count as string, 10) : 12,
    audit: !!args.audit,
    dryRun: !!args["dry-run"],
    offline: !!args.offline,
    level: args.level as Level | undefined,
  };
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function categoryFilePath(lang: string, category: string): string {
  return path.join(CONTENT_ROOT, lang, `${category}.json`);
}

function loadCategory(lang: string, category: string): Entry[] {
  const fp = categoryFilePath(lang, category);
  if (!fs.existsSync(fp)) return [];
  return JSON.parse(fs.readFileSync(fp, "utf-8")) as Entry[];
}

function saveCategory(
  lang: string,
  category: string,
  entries: Entry[],
  dryRun: boolean
): void {
  const fp = categoryFilePath(lang, category);
  const json = JSON.stringify(entries, null, 2);
  if (dryRun) {
    console.log(`\n[DRY RUN] Would write ${entries.length} entries to: ${fp}`);
    console.log(json.slice(0, 500) + (json.length > 500 ? "\n  ..." : ""));
    return;
  }
  const backup = fp + ".bak";
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  if (fs.existsSync(fp)) {
    fs.copyFileSync(fp, backup);
  }
  fs.writeFileSync(fp, json, "utf-8");
  console.log(`✓ Wrote ${entries.length} entries to ${fp}`);
}

// ---------------------------------------------------------------------------
// Structure analysis
// ---------------------------------------------------------------------------

function analyseStructure(entries: Entry[]): Record<Level, string[]> {
  const byLevel: Record<Level, string[]> = { a1: [], a2: [], b1: [], b2: [] };
  for (const e of entries) {
    if (LEVELS.includes(e.level)) {
      byLevel[e.level].push(e.exerciseType ?? "none");
    }
  }
  return byLevel;
}

function exerciseTypeDistribution(entries: Entry[]): Record<string, number> {
  const dist: Record<string, number> = {};
  for (const e of entries) {
    const t = e.exerciseType ?? "none";
    dist[t] = (dist[t] ?? 0) + 1;
  }
  return dist;
}

// ---------------------------------------------------------------------------
// Audit mode: show what's missing across all languages vs English
// ---------------------------------------------------------------------------

function audit() {
  const languages = fs
    .readdirSync(CONTENT_ROOT)
    .filter((d) => fs.statSync(path.join(CONTENT_ROOT, d)).isDirectory());

  const englishCategories = fs
    .readdirSync(path.join(CONTENT_ROOT, "english"))
    .filter((f) => f.endsWith(".json") && f !== "_meta.json")
    .map((f) => f.replace(".json", ""));

  console.log("\n=== LingoFlow Content Audit ===\n");

  for (const category of englishCategories) {
    const ref = loadCategory("english", category);
    const refByLevel = analyseStructure(ref);
    console.log(`Category: ${category}`);
    console.log(`  English: ${ref.length} entries`);
    for (const level of LEVELS) {
      console.log(
        `    ${level}: ${refByLevel[level].length} entries  [${refByLevel[level].join(", ")}]`
      );
    }

    for (const lang of languages) {
      if (lang === "english") continue;
      const entries = loadCategory(lang, category);
      if (entries.length === 0) {
        console.log(`  ${lang}: ⚠ FILE MISSING`);
        continue;
      }
      const byLevel = analyseStructure(entries);
      const gaps: string[] = [];
      for (const level of LEVELS) {
        const refCount = refByLevel[level].length;
        const langCount = byLevel[level].length;
        if (langCount < refCount) {
          gaps.push(`${level}: ${langCount}/${refCount}`);
        }
      }
      if (gaps.length) {
        console.log(`  ${lang}: ${entries.length} entries — GAPS: ${gaps.join(" | ")}`);
      } else {
        console.log(`  ${lang}: ${entries.length} entries ✓`);
      }
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// ID helpers
// ---------------------------------------------------------------------------

function nextId(
  lang: string,
  category: string,
  level: Level,
  existing: Entry[]
): string {
  const prefix = LANG_PREFIXES[lang] ?? lang.slice(0, 2);
  // Derive category abbreviation from first two letters
  const catAbbr = category.slice(0, 2);
  const base = `${prefix}-${catAbbr}-${level}-`;
  const used = new Set(existing.map((e) => e.id));
  let n = existing.length + 1;
  while (used.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

// ---------------------------------------------------------------------------
// Prompt builder for the Anthropic API
// ---------------------------------------------------------------------------

function buildPrompt(
  lang: string,
  category: string,
  level: Level,
  existingEntries: Entry[],
  refEntries: Entry[],
  count: number
): string {
  const refLevelEntries = refEntries.filter((e) => e.level === level);
  const existingIds = existingEntries.map((e) => e.id).join(", ");
  const dist = exerciseTypeDistribution(refLevelEntries);
  const langName = lang.charAt(0).toUpperCase() + lang.slice(1);

  return `You are generating language learning content for the LingoFlow app.

Language: ${langName}
Category: ${category}
CEFR Level: ${level.toUpperCase()}
Entries to generate: ${count}

EXISTING IDs (do not reuse): ${existingIds || "none yet"}

EXERCISE TYPE DISTRIBUTION TO MATCH (from the English reference):
${JSON.stringify(dist, null, 2)}

RULES:
1. Return ONLY a JSON array. No prose, no markdown fences, no comments.
2. Each entry MUST follow this exact schema:
{
  "id": "<lang_prefix>-<cat_abbr>-<level>-<n>",
  "level": "${level}",
  "difficulty": "${level}",
  "prompt": "...",
  "correctAnswer": "...",
  "hints": ["..."],
  "exerciseType": "..." // optional, one of: ${EXERCISE_TYPES.join(", ")}
}
3. Optional fields (include when appropriate for the exercise type):
   - "imageUrl": "/images/placeholder.svg"  (only for flashcard)
   - "culturalNote": "..."                  (only for dialogue_turn)
   - "acceptedAnswers": ["..."]             (when multiple answers are valid)
4. Match the exercise type distribution shown above as closely as possible.
5. prompts and correctAnswers must be in ${langName}, not English.
   Exception: roleplay/dialogue_turn prompts may use English instructions.
6. For ${langName} at ${level.toUpperCase()}, use vocabulary and grammar appropriate for that level.
7. Hints should be in English (they are coach tips for the learner).
8. IDs must be unique. Use prefix "${LANG_PREFIXES[lang] ?? lang.slice(0, 2)}-${category.slice(0, 2)}-${level}-" followed by a number.

EXAMPLE ENGLISH ENTRIES FOR THIS LEVEL (for structural reference only — do NOT copy content):
${JSON.stringify(refLevelEntries.slice(0, 3), null, 2)}

Generate exactly ${count} entries now.`;
}

// ---------------------------------------------------------------------------
// Anthropic API call
// ---------------------------------------------------------------------------

async function generateEntries(prompt: string): Promise<Entry[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to server/.env or export it in your shell."
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const text: string = data.content
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  // Strip possible markdown fences
  const clean = text.replace(/^```json\s*/m, "").replace(/\s*```$/m, "").trim();

  try {
    return JSON.parse(clean) as Entry[];
  } catch {
    throw new Error(`Failed to parse API response as JSON:\n${clean.slice(0, 300)}`);
  }
}

function pickFrom<T>(items: T[], idx: number): T {
  return items[idx % items.length];
}

function buildOfflineEnglishEntry(category: string, level: Level, idx: number): Omit<Entry, "id"> {
  const typeRotation: Partial<Record<Level, Array<Entry["exerciseType"]>>> = {
    a1: [undefined, "build_sentence", "flashcard", "pronunciation", "mc_sentence"],
    a2: [undefined, "build_sentence", "cloze_sentence", "pronunciation", "roleplay"],
    b1: [undefined, "build_sentence", "cloze_sentence", "dialogue_turn", "dictation_sentence"],
    b2: [undefined, "cloze_sentence", "dialogue_turn", "dictation_sentence", "mc_sentence"],
  };
  const exerciseType = pickFrom(typeRotation[level] ?? [undefined], idx);

  if (category === "work") {
    const a1Phrases = [
      ["Say: I start work at nine.", "I start work at nine.", "Use present simple for routines."],
      ["Ask: Where is the training room?", "Where is the training room?", "Use this on your first day."],
      ["Say: I need a new password.", "I need a new password.", "Useful when contacting IT."],
      ["Say: I work with the sales team.", "I work with the sales team.", "Use 'work with' + team."]
    ] as const;
    const a2Phrases = [
      ["Say: I have a meeting with the client this afternoon.", "I have a meeting with the client this afternoon.", "Use time markers for clarity."],
      ["Ask: Could you review this report before lunch?", "Could you review this report before lunch?", "Use 'Could you' for polite requests."],
      ["Say: I am responsible for weekly updates.", "I am responsible for weekly updates.", "Use this to describe ownership."],
      ["Say: We finished the task ahead of schedule.", "We finished the task ahead of schedule.", "Good phrase for progress updates."]
    ] as const;
    const b1Phrases = [
      ["Say: We should prioritize the customer issue before deployment.", "We should prioritize the customer issue before deployment.", "Use 'should' for recommendations."],
      ["Say: I would like to propose a shorter meeting agenda.", "I would like to propose a shorter meeting agenda.", "Polite formal suggestion structure."],
      ["Ask: Can we move this deadline to next Wednesday?", "Can we move this deadline to next Wednesday?", "Direct but collaborative phrasing."],
      ["Say: I need more context before I can approve this plan.", "I need more context before I can approve this plan.", "State dependency clearly."]
    ] as const;
    const b2Phrases = [
      ["Say: We need to align deliverables with stakeholder expectations.", "We need to align deliverables with stakeholder expectations.", "Use precise business vocabulary."],
      ["Say: I suggest we document risks before final sign-off.", "I suggest we document risks before final sign-off.", "Strong phrasing for process quality."],
      ["Ask: How should we mitigate potential delays in this rollout?", "How should we mitigate potential delays in this rollout?", "Use 'mitigate' for formal risk language."],
      ["Say: This proposal balances short-term impact with long-term sustainability.", "This proposal balances short-term impact with long-term sustainability.", "Contrast clauses raise sophistication."]
    ] as const;

    const poolByLevel = { a1: a1Phrases, a2: a2Phrases, b1: b1Phrases, b2: b2Phrases };
    const [prompt, correctAnswer, hint] = pickFrom(poolByLevel[level], idx);

    if (exerciseType === "flashcard") {
      const vocab = [
        ["Vocabulary: a formal plan for tasks and dates", "timeline", "Common in project planning."],
        ["Vocabulary: to check work for mistakes", "review", "Often paired with 'document' or 'report'."],
        ["Vocabulary: the final approval before release", "sign-off", "Hyphenated compound noun."],
        ["Vocabulary: someone you report to", "manager", "A core workplace noun."]
      ] as const;
      const [fp, fa, fh] = pickFrom(vocab, idx);
      return { level, difficulty: level, prompt: fp, correctAnswer: fa, hints: [fh], exerciseType };
    }

    return { level, difficulty: level, prompt, correctAnswer, hints: [hint], exerciseType };
  }

  if (
    [
      "hobbies_leisure",
      "sports_fitness",
      "news_media",
      "money_finance",
      "science_technology",
      "culture_history",
      "nature_animals",
      "conversation",
      "travel",
      "health",
      "family_friends",
      "food_cooking",
      "grammar"
    ].includes(category)
  ) {
    const categoryThemes: Record<string, Record<Level, Array<[string, string, string]>>> = {
      hobbies_leisure: {
        a1: [
          ["Say: I like painting on weekends.", "I like painting on weekends.", "Use 'like' + activity."],
          ["Say: I play chess with my friend.", "I play chess with my friend.", "Simple present for habits."],
          ["Ask: Do you enjoy reading comics?", "Do you enjoy reading comics?", "Use 'Do you enjoy...?' for hobbies."]
        ],
        a2: [
          ["Say: I started learning photography last year.", "I started learning photography last year.", "Past simple for finished past actions."],
          ["Say: I usually relax by listening to music.", "I usually relax by listening to music.", "Use 'by + -ing' for method."],
          ["Ask: Which hobby helps you reduce stress?", "Which hobby helps you reduce stress?", "Useful for conversation practice."]
        ],
        b1: [
          ["Say: I joined a local book club to meet new people.", "I joined a local book club to meet new people.", "Purpose clause with 'to'."],
          ["Say: My main hobby changed after I moved to the city.", "My main hobby changed after I moved to the city.", "Use sequence in storytelling."],
          ["Ask: How do you stay motivated when practicing your hobby?", "How do you stay motivated when practicing your hobby?", "Open question form."]
        ],
        b2: [
          ["Say: Leisure activities improve my focus and creativity.", "Leisure activities improve my focus and creativity.", "Abstract nouns are common at B2."],
          ["Say: I prefer hobbies that combine social interaction with skill-building.", "I prefer hobbies that combine social interaction with skill-building.", "Complex noun phrase."],
          ["Ask: To what extent should hobbies be goal-oriented?", "To what extent should hobbies be goal-oriented?", "Formal discussion prompt."]
        ]
      },
      sports_fitness: {
        a1: [
          ["Say: I go running in the morning.", "I go running in the morning.", "Daily routine sentence."],
          ["Say: We train at the gym twice a week.", "We train at the gym twice a week.", "Use frequency phrases."],
          ["Ask: Do you play any team sports?", "Do you play any team sports?", "Basic sports question."]
        ],
        a2: [
          ["Say: I am trying to improve my endurance.", "I am trying to improve my endurance.", "Use present continuous for current goals."],
          ["Say: Stretching helps prevent injuries.", "Stretching helps prevent injuries.", "General truth form."],
          ["Ask: How long is your usual workout?", "How long is your usual workout?", "Useful gym conversation."]
        ],
        b1: [
          ["Say: Regular exercise has improved my energy levels.", "Regular exercise has improved my energy levels.", "Present perfect for recent impact."],
          ["Say: I switched to cycling because it is easier on my knees.", "I switched to cycling because it is easier on my knees.", "Explain reason with 'because'."],
          ["Ask: What strategy do you use to stay consistent with training?", "What strategy do you use to stay consistent with training?", "Reflective sports question."]
        ],
        b2: [
          ["Say: A balanced training plan reduces the risk of overtraining.", "A balanced training plan reduces the risk of overtraining.", "Formal fitness vocabulary."],
          ["Say: Performance improves when recovery is treated as part of training.", "Performance improves when recovery is treated as part of training.", "Passive form at B2."],
          ["Ask: How can athletes maintain motivation during long off-seasons?", "How can athletes maintain motivation during long off-seasons?", "Complex question pattern."]
        ]
      },
      news_media: {
        a1: [
          ["Say: I read the news every morning.", "I read the news every morning.", "Simple habit sentence."],
          ["Say: This story is about the weather.", "This story is about the weather.", "Topic sentence."],
          ["Ask: Where do you get your news?", "Where do you get your news?", "Common media question."]
        ],
        a2: [
          ["Say: I follow local news on my phone.", "I follow local news on my phone.", "Use 'follow' for ongoing updates."],
          ["Say: I prefer short videos to long articles.", "I prefer short videos to long articles.", "Comparison pattern."],
          ["Ask: Did you hear about this event yesterday?", "Did you hear about this event yesterday?", "Past simple in context."]
        ],
        b1: [
          ["Say: I compare several sources before I trust a headline.", "I compare several sources before I trust a headline.", "Cause and sequence in one sentence."],
          ["Say: Social media can spread accurate and inaccurate information quickly.", "Social media can spread accurate and inaccurate information quickly.", "Balanced statement practice."],
          ["Ask: Why do people share articles without reading them?", "Why do people share articles without reading them?", "Discussion question."]
        ],
        b2: [
          ["Say: Responsible journalism requires transparent sourcing and context.", "Responsible journalism requires transparent sourcing and context.", "Academic register."],
          ["Say: Sensational headlines can distort public understanding of complex issues.", "Sensational headlines can distort public understanding of complex issues.", "High-level media vocabulary."],
          ["Ask: How should platforms balance free expression and misinformation control?", "How should platforms balance free expression and misinformation control?", "Debate-oriented framing."]
        ]
      },
      money_finance: {
        a1: [
          ["Say: I need to save money this month.", "I need to save money this month.", "Basic finance phrase."],
          ["Say: The coffee costs three dollars.", "The coffee costs three dollars.", "Price sentence."],
          ["Ask: Can I pay by card?", "Can I pay by card?", "Useful payment question."]
        ],
        a2: [
          ["Say: I set a budget for groceries every week.", "I set a budget for groceries every week.", "Budget vocabulary."],
          ["Say: My rent increased last year.", "My rent increased last year.", "Past simple for changes."],
          ["Ask: How much should I save each month?", "How much should I save each month?", "Planning question."]
        ],
        b1: [
          ["Say: I track my spending to avoid unnecessary expenses.", "I track my spending to avoid unnecessary expenses.", "Purpose clause at B1."],
          ["Say: Interest rates affect how much people borrow.", "Interest rates affect how much people borrow.", "Common finance concept."],
          ["Ask: What is the safest way to build an emergency fund?", "What is the safest way to build an emergency fund?", "Practical finance question."]
        ],
        b2: [
          ["Say: Long-term financial stability depends on disciplined saving and diversified investments.", "Long-term financial stability depends on disciplined saving and diversified investments.", "Formal financial wording."],
          ["Say: Inflation erodes purchasing power when wages do not keep pace.", "Inflation erodes purchasing power when wages do not keep pace.", "Cause-effect sentence."],
          ["Ask: Which policies are most effective in reducing household debt risk?", "Which policies are most effective in reducing household debt risk?", "Policy-level question."]
        ]
      },
      science_technology: {
        a1: [
          ["Say: I use my phone to learn new words.", "I use my phone to learn new words.", "Simple technology usage sentence."],
          ["Say: The computer is very fast.", "The computer is very fast.", "Basic descriptive statement."],
          ["Ask: How do you charge this device?", "How do you charge this device?", "Everyday tech question."]
        ],
        a2: [
          ["Say: I updated the app this morning.", "I updated the app this morning.", "Past simple with tech context."],
          ["Say: This website is easier to use than the old one.", "This website is easier to use than the old one.", "Comparative structure."],
          ["Ask: Which tool do you use for online meetings?", "Which tool do you use for online meetings?", "Functional question."]
        ],
        b1: [
          ["Say: New technology can improve access to education.", "New technology can improve access to education.", "General-impact sentence."],
          ["Say: I backed up my files in case my laptop failed.", "I backed up my files in case my laptop failed.", "Risk-prevention phrasing."],
          ["Ask: What are the benefits of using open-source software?", "What are the benefits of using open-source software?", "Topic question for discussion."]
        ],
        b2: [
          ["Say: Ethical guidelines should evolve as artificial intelligence systems become more capable.", "Ethical guidelines should evolve as artificial intelligence systems become more capable.", "B2 policy-style sentence."],
          ["Say: Automation can increase productivity while reshaping labor markets.", "Automation can increase productivity while reshaping labor markets.", "Balanced argument sentence."],
          ["Ask: How can regulators encourage innovation without compromising public safety?", "How can regulators encourage innovation without compromising public safety?", "High-level question."]
        ]
      },
      culture_history: {
        a1: [
          ["Say: This museum is very interesting.", "This museum is very interesting.", "Simple cultural sentence."],
          ["Say: We visited an old castle.", "We visited an old castle.", "Past simple travel-culture link."],
          ["Ask: What is this festival called?", "What is this festival called?", "Basic culture question."]
        ],
        a2: [
          ["Say: This tradition is important to many families.", "This tradition is important to many families.", "Common culture expression."],
          ["Say: I learned about this country in school.", "I learned about this country in school.", "Past learning sentence."],
          ["Ask: Why do people celebrate this holiday?", "Why do people celebrate this holiday?", "History/culture curiosity."]
        ],
        b1: [
          ["Say: Historical events continue to influence modern society.", "Historical events continue to influence modern society.", "Cause-impact idea."],
          ["Say: Local traditions help preserve community identity.", "Local traditions help preserve community identity.", "Community-focused statement."],
          ["Ask: Which historical period do you find most fascinating?", "Which historical period do you find most fascinating?", "Opinion prompt."]
        ],
        b2: [
          ["Say: Interpreting history requires awareness of perspective and bias.", "Interpreting history requires awareness of perspective and bias.", "Analytical framing."],
          ["Say: Cultural heritage can strengthen social cohesion across generations.", "Cultural heritage can strengthen social cohesion across generations.", "Advanced abstract wording."],
          ["Ask: How should societies balance preservation with modernization?", "How should societies balance preservation with modernization?", "Complex policy-style question."]
        ]
      },
      nature_animals: {
        a1: [
          ["Say: I saw a bird in the park.", "I saw a bird in the park.", "Simple past observation."],
          ["Say: The forest is very quiet.", "The forest is very quiet.", "Basic description."],
          ["Ask: What animal is this?", "What animal is this?", "Starter question."]
        ],
        a2: [
          ["Say: We planted trees near our school.", "We planted trees near our school.", "Past action with nature theme."],
          ["Say: This river is cleaner than before.", "This river is cleaner than before.", "Comparative sentence."],
          ["Ask: How can we protect wild animals?", "How can we protect wild animals?", "Action-oriented question."]
        ],
        b1: [
          ["Say: Protecting habitats is essential for biodiversity.", "Protecting habitats is essential for biodiversity.", "Key environmental phrase."],
          ["Say: I started reducing plastic waste to help marine life.", "I started reducing plastic waste to help marine life.", "Personal impact sentence."],
          ["Ask: What causes animal populations to decline?", "What causes animal populations to decline?", "Scientific reasoning question."]
        ],
        b2: [
          ["Say: Climate change is accelerating habitat loss in vulnerable ecosystems.", "Climate change is accelerating habitat loss in vulnerable ecosystems.", "Advanced environmental vocabulary."],
          ["Say: Conservation strategies must consider both ecology and local livelihoods.", "Conservation strategies must consider both ecology and local livelihoods.", "Balanced policy sentence."],
          ["Ask: Which environmental interventions deliver the greatest long-term impact?", "Which environmental interventions deliver the greatest long-term impact?", "Analytical question."]
        ]
      },
      conversation: {
        a1: [
          ["Say: Nice to meet you.", "Nice to meet you.", "Polite first-meeting phrase."],
          ["Ask: How are you today?", "How are you today?", "Common opener."],
          ["Say: I am from Sweden.", "I am from Sweden.", "Simple personal information."]
        ],
        a2: [
          ["Say: I am sorry, I did not catch that.", "I am sorry, I did not catch that.", "Polite repair phrase."],
          ["Ask: Could you speak a little slower?", "Could you speak a little slower?", "Useful listening support."],
          ["Say: What do you usually do after work?", "What do you usually do after work?", "Routine question pattern."]
        ],
        b1: [
          ["Say: I see your point, but I have a different opinion.", "I see your point, but I have a different opinion.", "Balanced disagreement."],
          ["Ask: What made you decide that?", "What made you decide that?", "Follow-up question."],
          ["Say: I felt nervous at first, then I relaxed.", "I felt nervous at first, then I relaxed.", "Story transition phrase."]
        ],
        b2: [
          ["Say: Let me rephrase that to make my point clearer.", "Let me rephrase that to make my point clearer.", "Advanced conversation control."],
          ["Ask: Would you mind elaborating on that argument?", "Would you mind elaborating on that argument?", "Formal discussion prompt."],
          ["Say: I appreciate the nuance in your explanation.", "I appreciate the nuance in your explanation.", "High-level feedback phrase."]
        ]
      },
      travel: {
        a1: [
          ["Say: I need a ticket to the city center.", "I need a ticket to the city center.", "Basic transport sentence."],
          ["Ask: Where is the train station?", "Where is the train station?", "Core travel question."],
          ["Say: My hotel is near the museum.", "My hotel is near the museum.", "Location phrase."]
        ],
        a2: [
          ["Say: I would like to check in, please.", "I would like to check in, please.", "Hotel check-in phrase."],
          ["Ask: How long does the bus ride take?", "How long does the bus ride take?", "Travel time question."],
          ["Say: I lost my boarding pass this morning.", "I lost my boarding pass this morning.", "Problem report sentence."]
        ],
        b1: [
          ["Say: We changed our route because of the weather.", "We changed our route because of the weather.", "Reason clause in travel context."],
          ["Ask: Which neighborhood is best for local food?", "Which neighborhood is best for local food?", "Recommendation question."],
          ["Say: Traveling alone helped me become more independent.", "Traveling alone helped me become more independent.", "Reflection sentence."]
        ],
        b2: [
          ["Say: Efficient public transport made the entire trip more sustainable.", "Efficient public transport made the entire trip more sustainable.", "B2 travel perspective."],
          ["Ask: How can tourism support local communities without harming them?", "How can tourism support local communities without harming them?", "Complex travel ethics question."],
          ["Say: I planned contingencies in case flights were delayed.", "I planned contingencies in case flights were delayed.", "Advanced planning phrase."]
        ]
      },
      health: {
        a1: [
          ["Say: I have a headache.", "I have a headache.", "Basic symptom sentence."],
          ["Ask: Where is the nearest pharmacy?", "Where is the nearest pharmacy?", "Useful health question."],
          ["Say: I drink water every day.", "I drink water every day.", "Healthy habit statement."]
        ],
        a2: [
          ["Say: I should sleep more during the week.", "I should sleep more during the week.", "Advice with 'should'."],
          ["Ask: How often do you exercise?", "How often do you exercise?", "Routine health question."],
          ["Say: I started cooking healthier meals.", "I started cooking healthier meals.", "Lifestyle improvement phrase."]
        ],
        b1: [
          ["Say: Stress affects my concentration at work.", "Stress affects my concentration at work.", "Health impact sentence."],
          ["Ask: What helps you recover after a difficult week?", "What helps you recover after a difficult week?", "Coping strategy prompt."],
          ["Say: I reduced sugar because it improved my energy.", "I reduced sugar because it improved my energy.", "Cause-effect form."]
        ],
        b2: [
          ["Say: Preventive care is more effective than reactive treatment.", "Preventive care is more effective than reactive treatment.", "Advanced health framing."],
          ["Ask: Which policies can improve access to mental health care?", "Which policies can improve access to mental health care?", "Public-health discussion prompt."],
          ["Say: Sustainable routines matter more than short-term motivation.", "Sustainable routines matter more than short-term motivation.", "Abstract comparison sentence."]
        ]
      },
      family_friends: {
        a1: [
          ["Say: I visit my grandparents on Sundays.", "I visit my grandparents on Sundays.", "Family routine phrase."],
          ["Ask: Do you have any brothers or sisters?", "Do you have any brothers or sisters?", "Basic family question."],
          ["Say: My friend is very kind.", "My friend is very kind.", "Simple description."]
        ],
        a2: [
          ["Say: We celebrated my sister's birthday yesterday.", "We celebrated my sister's birthday yesterday.", "Past event sentence."],
          ["Ask: How did you meet your best friend?", "How did you meet your best friend?", "Conversation starter."],
          ["Say: I call my parents every evening.", "I call my parents every evening.", "Routine communication phrase."]
        ],
        b1: [
          ["Say: Good friendships require trust and honest communication.", "Good friendships require trust and honest communication.", "B1 relationship statement."],
          ["Ask: What do you do when a friend needs support?", "What do you do when a friend needs support?", "Support-oriented question."],
          ["Say: Family traditions help us stay connected.", "Family traditions help us stay connected.", "Community/family link."]
        ],
        b2: [
          ["Say: Healthy boundaries can strengthen long-term relationships.", "Healthy boundaries can strengthen long-term relationships.", "Advanced relationship concept."],
          ["Ask: How do family expectations influence personal choices?", "How do family expectations influence personal choices?", "Reflective high-level question."],
          ["Say: Friendships evolve as people's priorities change.", "Friendships evolve as people's priorities change.", "Nuanced change-over-time sentence."]
        ]
      },
      food_cooking: {
        a1: [
          ["Say: I would like a bowl of soup.", "I would like a bowl of soup.", "Simple ordering phrase."],
          ["Ask: Is this dish spicy?", "Is this dish spicy?", "Restaurant question."],
          ["Say: I cook rice for dinner.", "I cook rice for dinner.", "Basic cooking routine."]
        ],
        a2: [
          ["Say: I am trying a new recipe tonight.", "I am trying a new recipe tonight.", "Present continuous plan sentence."],
          ["Ask: How long should I bake this cake?", "How long should I bake this cake?", "Cooking-time question."],
          ["Say: We ate at a small family restaurant.", "We ate at a small family restaurant.", "Past dining sentence."]
        ],
        b1: [
          ["Say: Homemade meals are often cheaper and healthier.", "Homemade meals are often cheaper and healthier.", "Comparison sentence."],
          ["Ask: Which ingredients can replace butter in this recipe?", "Which ingredients can replace butter in this recipe?", "Substitution question."],
          ["Say: I started meal-prepping to save time during the week.", "I started meal-prepping to save time during the week.", "Purpose clause."]
        ],
        b2: [
          ["Say: Food culture reflects history, climate, and migration.", "Food culture reflects history, climate, and migration.", "Abstract cultural food concept."],
          ["Ask: How can cities reduce food waste across supply chains?", "How can cities reduce food waste across supply chains?", "Policy-level food question."],
          ["Say: A balanced diet depends on variety rather than strict restriction.", "A balanced diet depends on variety rather than strict restriction.", "B2 nutrition phrasing."]
        ]
      },
      grammar: {
        a1: [
          ["Say: She goes to school every day.", "She goes to school every day.", "Notice the -s in third person singular."],
          ["Say: They are happy.", "They are happy.", "Use 'are' with 'they'."],
          ["Ask: Is this sentence correct?", "Is this sentence correct?", "Grammar-check question."]
        ],
        a2: [
          ["Say: I have lived here for two years.", "I have lived here for two years.", "Present perfect for duration."],
          ["Say: If it rains, we will stay home.", "If it rains, we will stay home.", "First conditional pattern."],
          ["Ask: Should I use much or many here?", "Should I use much or many here?", "Countability grammar prompt."]
        ],
        b1: [
          ["Say: I wish I had more time to practice.", "I wish I had more time to practice.", "Use past form after 'wish' for present unreal situations."],
          ["Say: The report that you sent was very helpful.", "The report that you sent was very helpful.", "Relative clause example."],
          ["Ask: When should I use the passive voice?", "When should I use the passive voice?", "Usage question."]
        ],
        b2: [
          ["Say: Had I known earlier, I would have prepared differently.", "Had I known earlier, I would have prepared differently.", "Inverted third conditional."],
          ["Say: Not only did she finish on time, but she also improved the draft.", "Not only did she finish on time, but she also improved the draft.", "Inversion after negative adverbials."],
          ["Ask: How does emphasis change when we front a phrase?", "How does emphasis change when we front a phrase?", "Advanced grammar awareness question."]
        ]
      }
    };

    const [prompt, correctAnswer, hint] = pickFrom(categoryThemes[category][level], idx);
    const entry: Omit<Entry, "id"> = { level, difficulty: level, prompt, correctAnswer, hints: [hint], exerciseType };
    if (category === "culture_history" && (exerciseType === "dialogue_turn" || exerciseType === "roleplay")) {
      entry.culturalNote = "Cultural references vary by region and period.";
    }
    return entry;
  }

  const essentialsByLevel: Record<Level, Array<[string, string, string]>> = {
    a1: [
      ["Say: Could you repeat that, please?", "Could you repeat that, please?", "A polite clarification request."],
      ["Say: I am learning every day.", "I am learning every day.", "Present continuous can also work in context."],
      ["Ask: What does this word mean?", "What does this word mean?", "Core classroom question."],
      ["Say: Thank you for your patience.", "Thank you for your patience.", "Polite expression for support."]
    ],
    a2: [
      ["Say: I can explain it in another way.", "I can explain it in another way.", "Use this during misunderstandings."],
      ["Ask: Is there a simpler example?", "Is there a simpler example?", "Good for checking comprehension."],
      ["Say: I usually review new words at night.", "I usually review new words at night.", "Use adverbs with routine verbs."],
      ["Say: I almost forgot to send the message.", "I almost forgot to send the message.", "Shows near-miss actions."]
    ],
    b1: [
      ["Say: I have been practicing this expression for weeks.", "I have been practicing this expression for weeks.", "Present perfect continuous for duration."],
      ["Ask: Could we compare these two options?", "Could we compare these two options?", "Collaborative discussion language."],
      ["Say: I understood the idea but missed one detail.", "I understood the idea but missed one detail.", "Natural reflection sentence."],
      ["Say: I am trying to sound more natural in conversations.", "I am trying to sound more natural in conversations.", "Goal-focused phrasing."]
    ],
    b2: [
      ["Say: I can infer the meaning from context most of the time.", "I can infer the meaning from context most of the time.", "Academic-style phrasing."],
      ["Ask: Could you clarify the nuance of that expression?", "Could you clarify the nuance of that expression?", "Useful for advanced accuracy."],
      ["Say: I am confident, although I still make occasional mistakes.", "I am confident, although I still make occasional mistakes.", "Use concession for balanced statements."],
      ["Say: I would rather reformulate the sentence than translate it directly.", "I would rather reformulate the sentence than translate it directly.", "Shows advanced strategy."]
    ]
  };

  const [prompt, correctAnswer, hint] = pickFrom(essentialsByLevel[level], idx);
  return { level, difficulty: level, prompt, correctAnswer, hints: [hint], exerciseType };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateEntry(e: unknown, idx: number): e is Entry {
  if (typeof e !== "object" || e === null) {
    console.warn(`  [skip] entry ${idx}: not an object`);
    return false;
  }
  const obj = e as Record<string, unknown>;
  if (!obj.id || typeof obj.id !== "string") {
    console.warn(`  [skip] entry ${idx}: missing or invalid id`);
    return false;
  }
  if (!LEVELS.includes(obj.level as Level)) {
    console.warn(`  [skip] entry ${idx} (${obj.id}): invalid level "${obj.level}"`);
    return false;
  }
  if (!obj.correctAnswer || typeof obj.correctAnswer !== "string") {
    console.warn(`  [skip] entry ${idx} (${obj.id}): missing correctAnswer`);
    return false;
  }
  if (!Array.isArray(obj.hints) || obj.hints.length === 0) {
    console.warn(`  [skip] entry ${idx} (${obj.id}): hints must be a non-empty array`);
    return false;
  }
  if (obj.exerciseType && !EXERCISE_TYPES.includes(obj.exerciseType as never)) {
    console.warn(`  [skip] entry ${idx} (${obj.id}): unknown exerciseType "${obj.exerciseType}"`);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main generate flow
// ---------------------------------------------------------------------------

async function generate(
  lang: string,
  category: string,
  count: number,
  dryRun: boolean,
  offline: boolean,
  levelFilter?: Level
) {
  const refEntries = loadCategory("english", category);
  if (refEntries.length === 0) {
    throw new Error(`English reference not found for category: ${category}`);
  }

  const existing = loadCategory(lang, category);
  const existingIds = new Set(existing.map((e) => e.id));

  const levelsToProcess = levelFilter ? [levelFilter] : ([...LEVELS] as Level[]);
  const allNew: Entry[] = [];

  // Distribute count evenly across levels (or target a single level)
  const perLevel = Math.ceil(count / levelsToProcess.length);

  for (const level of levelsToProcess) {
    const refCount = refEntries.filter((e) => e.level === level).length;
    const existingCount = existing.filter((e) => e.level === level).length;
    const gap = refCount - existingCount;
    const toGenerate = levelFilter ? count : Math.max(perLevel, gap);

    if (toGenerate <= 0) {
      console.log(`  ${level}: already has ${existingCount}/${refCount} entries, skipping`);
      continue;
    }

    console.log(`  ${level}: generating ${toGenerate} entries...`);
    const generated = offline
      ? Array.from({ length: toGenerate }, (_, idx) => buildOfflineEnglishEntry(category, level, idx))
      : await generateEntries(buildPrompt(lang, category, level, existing, refEntries, toGenerate));
    const workingEntries = [...existing, ...allNew];
    const withIds: Entry[] = [];
    for (const entry of generated) {
      const generatedId = nextId(lang, category, level, workingEntries);
      const withId = { ...entry, id: generatedId } as Entry;
      workingEntries.push(withId);
      withIds.push(withId);
    }
    const valid = withIds.filter((e, i) => validateEntry(e, i));
    const deduped = valid.filter((e) => !existingIds.has(e.id));

    if (deduped.length < valid.length) {
      console.warn(`  [warn] ${valid.length - deduped.length} duplicate IDs removed`);
    }

    allNew.push(...deduped);
    deduped.forEach((e) => existingIds.add(e.id));
    console.log(`  ${level}: +${deduped.length} valid new entries`);
  }

  if (allNew.length === 0) {
    console.log("No new entries to add.");
    return;
  }

  const merged = [...existing, ...allNew];
  // Sort by level order for clean diffs
  const levelOrder: Record<Level, number> = { a1: 0, a2: 1, b1: 2, b2: 3 };
  merged.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

  saveCategory(lang, category, merged, dryRun);
  console.log(`\nDone. Added ${allNew.length} entries to ${lang}/${category}.`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

(async () => {
  const { lang, category, count, audit: doAudit, dryRun, offline, level } = parseArgs();

  if (doAudit) {
    audit();
    return;
  }

  if (!lang || !category) {
    console.error(
      "Usage:\n" +
        "  npx tsx scripts/generate-content.ts --lang=spanish --category=conversation --count=12\n" +
        "  npx tsx scripts/generate-content.ts --audit\n" +
        "  npx tsx scripts/generate-content.ts --dry-run --lang=spanish --category=conversation"
    );
    process.exit(1);
  }

  if (!(lang in LANG_PREFIXES)) {
    console.error(
      `Unknown language "${lang}". Add it to LANG_PREFIXES in the script.\nKnown: ${Object.keys(LANG_PREFIXES).join(", ")}`
    );
    process.exit(1);
  }

  if (offline && lang !== "english") {
    console.error("Offline generation is currently only supported for english.");
    process.exit(1);
  }

  console.log(
    `\nGenerating content: lang=${lang} category=${category} count=${count}${level ? ` level=${level}` : ""}${dryRun ? " [DRY RUN]" : ""}${offline ? " [OFFLINE]" : ""}\n`
  );

  await generate(lang, category, count, dryRun, offline, level as Level | undefined);
})();
