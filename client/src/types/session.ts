export type PracticeMode = "speak" | "listen" | "words";

type SessionQuestionBase = {
  id: string;
  prompt: string;
  audioUrl?: string;
  imageUrl?: string;
  culturalNote?: string;
  hints?: string[];
};

export type MultipleChoiceQuestion = SessionQuestionBase & {
  type: "mc_sentence" | "dialogue_turn";
  answer: string;
  options: string[];
};

export type RoleplayQuestion = SessionQuestionBase & {
  type: "roleplay";
  answer: string;
  options: string[];
  answerEnglish?: string;
};

export type PracticeListenQuestion = SessionQuestionBase & {
  type: "practice_listen";
  answer: string;
  options: string[];
};

export type ClozeSentenceQuestion = SessionQuestionBase & {
  type: "cloze_sentence";
  answer?: string;
  clozeAnswer: string;
  clozeText: string;
  clozeOptions: string[];
};

export type BuildSentenceQuestion = SessionQuestionBase & {
  type: "build_sentence" | "dictation_sentence";
  answer: string;
  tokens: string[];
  acceptedAnswers?: string[];
};

export type FlashcardQuestion = SessionQuestionBase & {
  type: "flashcard";
  answer?: string;
  front?: string;
  back?: string;
};

export type PronunciationQuestion = SessionQuestionBase & {
  type: "pronunciation" | "practice_speak";
  answer: string;
  acceptedAnswers?: string[];
};

export type MatchingPair = {
  prompt: string;
  answer: string;
};

export type MatchingQuestion = SessionQuestionBase & {
  type: "matching";
  pairs: MatchingPair[];
};

export type PracticeWordPair = {
  left: string;
  right: string;
};

export type PracticeWordsQuestion = SessionQuestionBase & {
  type: "practice_words";
  pairs: PracticeWordPair[];
};

export type SessionQuestion =
  | MultipleChoiceQuestion
  | RoleplayQuestion
  | PracticeListenQuestion
  | ClozeSentenceQuestion
  | BuildSentenceQuestion
  | FlashcardQuestion
  | PronunciationQuestion
  | MatchingQuestion
  | PracticeWordsQuestion;

export type SessionFeedback = {
  type: "error" | "success";
  message: string;
  hint: string;
  showReveal?: boolean;
  answerWords?: string[] | null;
  correctOption?: string | null;
};

export type SessionSnapshot = {
  questionsQueue: SessionQuestion[];
  fixedQuestionCount: number;
  index: number;
  score: number;
  selectedOption: string;
  selectedTokenIndexes: number[];
  attemptLog: SessionAttempt[];
  feedback: SessionFeedback | null;
  revealedCurrentQuestion: boolean;
  roleplayHintVisible: boolean;
  questionMistakes: number;
  totalMistakes: number;
  hintsUsed: number;
  revealedAnswers: number;
  flashcardRevealed: boolean;
  pronunciationTranscript: string;
  practiceWordMatches: Array<{ left: string; right: string }>;
  practiceLeftOrder: string[];
  practiceRightOrder: string[];
  practiceSelection: { left: string; right: string };
  practiceFeedback: string;
  matchingPairs: Array<{ prompt: string; answer: string }>;
  matchingPromptOrder: string[];
  matchingAnswerOrder: string[];
};

export type SessionAttempt = {
  questionId: string;
  type: string;
  selectedOption?: string;
  builtSentence?: string;
  textAnswer?: string;
  revealed?: boolean;
  matchingPairs?: Array<{ prompt: string; answer: string }>;
  practicePairs?: Array<{ left: string; right: string }>;
};

export type SessionReport = {
  attempts: SessionAttempt[];
  score?: number;
  maxScore?: number;
  mistakes?: number;
  hintsUsed: number;
  revealedAnswers: number;
};

export type ActiveSession = {
  sessionId: string;
  language: string;
  category: string;
  categoryLabel: string;
  recommendedLevel: string;
  questions: SessionQuestion[];
  practiceMode?: PracticeMode;
  resumeState?: Partial<SessionSnapshot>;
};
