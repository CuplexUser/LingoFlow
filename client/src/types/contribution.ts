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
