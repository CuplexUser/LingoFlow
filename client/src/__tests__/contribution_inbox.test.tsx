import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ContributionInbox } from "../components/ContributionInbox";

function makeSubmission(overrides = {}) {
  return {
    id: 1,
    language: "spanish",
    category: "essentials",
    prompt: "How do you say hello?",
    correctAnswer: "Hola",
    hints: ["Greeting"],
    difficulty: "a1",
    audioUrl: "",
    imageUrl: "",
    culturalNote: "Common greeting",
    exerciseType: "flashcard",
    moderationStatus: "pending",
    createdAt: "2026-03-24T10:00:00.000Z",
    reviewerComment: "",
    reviewedAt: null,
    reviewedBy: null,
    submitter: {
      id: 2,
      email: "learner@example.com",
      displayName: "Learner"
    },
    ...overrides
  };
}

test("learner inbox loads personal submissions and hides moderator controls", async () => {
  const onLoad = vi.fn().mockResolvedValue({
    ok: true,
    canModerate: false,
    scope: "mine",
    submissions: [makeSubmission()]
  });
  const onUpdateStatus = vi.fn();

  render(
    <ContributionInbox
      language="spanish"
      categoryOptions={[{ id: "essentials", label: "Essentials" }]}
      canModerate={false}
      onLoad={onLoad}
      onUpdateStatus={onUpdateStatus}
    />
  );

  expect(await screen.findByText("My Submissions")).toBeInTheDocument();
  await waitFor(() =>
    expect(onLoad).toHaveBeenCalledWith({
      scope: "mine",
      status: "pending",
      language: "spanish",
      category: "",
      limit: 100
    })
  );

  expect(screen.queryByLabelText("Scope")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  expect(screen.getByText("How do you say hello?")).toBeInTheDocument();
});

test("moderator inbox loads all submissions, reacts to filters, and updates status", async () => {
  const user = userEvent.setup();
  const onLoad = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      canModerate: true,
      scope: "all",
      submissions: [makeSubmission()]
    })
    .mockResolvedValueOnce({
      ok: true,
      canModerate: true,
      scope: "all",
      submissions: [makeSubmission({ category: "travel" })]
    })
    .mockResolvedValueOnce({
      ok: true,
      canModerate: true,
      scope: "mine",
      submissions: [makeSubmission({ category: "travel" })]
    });
  const onUpdateStatus = vi.fn().mockResolvedValue({
    message: "Contribution marked approved."
  });

  render(
    <ContributionInbox
      language="spanish"
      categoryOptions={[
        { id: "essentials", label: "Essentials" },
        { id: "travel", label: "Travel" }
      ]}
      canModerate={true}
      onLoad={onLoad}
      onUpdateStatus={onUpdateStatus}
    />
  );

  expect(await screen.findByText("Contribution Inbox")).toBeInTheDocument();
  await waitFor(() =>
    expect(onLoad).toHaveBeenCalledWith({
      scope: "all",
      status: "pending",
      language: "spanish",
      category: "",
      limit: 100
    })
  );

  await user.selectOptions(screen.getByLabelText("Category"), "travel");
  await waitFor(() =>
    expect(onLoad).toHaveBeenCalledWith({
      scope: "all",
      status: "pending",
      language: "spanish",
      category: "travel",
      limit: 100
    })
  );

  await user.selectOptions(screen.getByLabelText("Scope"), "mine");
  await waitFor(() =>
    expect(onLoad).toHaveBeenCalledWith({
      scope: "mine",
      status: "pending",
      language: "spanish",
      category: "travel",
      limit: 100
    })
  );

  // Expand the review panel first, then approve
  await user.click(screen.getByRole("button", { name: "Review" }));
  await user.click(screen.getByRole("button", { name: "Approve" }));
  await waitFor(() =>
    expect(onUpdateStatus).toHaveBeenCalledWith(1, { moderationStatus: "approved", reviewerComment: "" })
  );

  expect(await screen.findByText("Contribution marked approved.")).toBeInTheDocument();
  expect(screen.getByText("Approved", { selector: "strong" })).toBeInTheDocument();
});

test("moderator inbox shows load errors", async () => {
  const onLoad = vi.fn().mockRejectedValue(new Error("Could not load contributions."));

  render(
    <ContributionInbox
      language="spanish"
      categoryOptions={[{ id: "essentials", label: "Essentials" }]}
      canModerate={true}
      onLoad={onLoad}
      onUpdateStatus={vi.fn()}
    />
  );

  expect(await screen.findByText("Could not load contributions.")).toBeInTheDocument();
  expect(screen.getByText("No submissions found")).toBeInTheDocument();
});
