export type ContributionExerciseType =
  | "build_sentence"
  | "dialogue_turn"
  | "flashcard"
  | "matching"
  | "pronunciation";

export type ContributionMode = "idea" | "exercise";

export type ContributionForm = {
  mode: ContributionMode;
  // General idea
  ideaTitle: string;
  ideaBody: string;
  // Exercise
  exerciseLanguage: string;
  category: string;
  exerciseType: ContributionExerciseType;
  difficulty: string;
  prompt: string;
  correctAnswer: string;
  hint1: string;
  hint2: string;
  hint3: string;
  culturalNote: string;
  audioUrl: string;
  imageUrl: string;
};

export type ContributionModerationStatus = "pending" | "approved" | "rejected" | "changes_requested";

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
  reviewerComment: string;
  reviewedAt: string | null;
  reviewedBy: { id: number; displayName: string } | null;
  submitter: {
    id: number;
    email: string;
    displayName: string;
  } | null;
};
