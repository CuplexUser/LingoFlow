export type ContributionIdeaType =
  | "content"
  | "exercise"
  | "media"
  | "culture"
  | "product";

export type ContributionExerciseType =
  | "build_sentence"
  | "dialogue_turn"
  | "flashcard"
  | "matching"
  | "pronunciation";

export type ContributionForm = {
  category: string;
  ideaType: ContributionIdeaType;
  title: string;
  learnerNeed: string;
  proposal: string;
  exampleContent: string;
  implementationNotes: string;
  difficulty: string;
  audioUrl: string;
  imageUrl: string;
  culturalNote: string;
  exerciseType: ContributionExerciseType;
};

export type ContributionModerationStatus = "pending" | "approved" | "rejected";

export type ContributionSubmission = {
  id: number;
  language: string;
  category: string;
  prompt: string;
  correctAnswer: string;
  hints: string[];
  difficulty: string;
  audioUrl: string;
  imageUrl: string;
  culturalNote: string;
  exerciseType: string;
  moderationStatus: ContributionModerationStatus;
  createdAt: string;
  submitter: {
    id: number;
    email: string;
    displayName: string;
  } | null;
};
