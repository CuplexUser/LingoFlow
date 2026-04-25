import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityGrid } from "../components/StatsPage";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("renders all 7 day-of-week column headers", () => {
  render(<ActivityGrid history={[]}/>);
  DAY_LABELS.forEach((d) => expect(screen.getByText(d)).toBeInTheDocument());
});

test("renders exactly 7 week rows", () => {
  const { container } = render(<ActivityGrid history={[]}/>);
  expect(container.querySelectorAll(".activity-week-row")).toHaveLength(7);
});

test("each week row contains exactly 7 cells", () => {
  const { container } = render(<ActivityGrid history={[]}/>);
  container.querySelectorAll(".activity-week-row").forEach((row) => {
    expect(row.querySelectorAll(".act-cell")).toHaveLength(7);
  });
});

test("today's cell gets tone-4 when it has the highest XP", () => {
  const today = todayIso();
  const { container } = render(
    <ActivityGrid history={[{ date: today, xp: 200, sessions: 3 }]}/>
  );
  // Scoped to week rows to exclude legend cells
  expect(container.querySelectorAll(".activity-week-row .act-cell.tone-4")).toHaveLength(1);
});

test("hover shows XP, session count, and date; leave restores placeholder", () => {
  const today = todayIso();
  const { container } = render(
    <ActivityGrid history={[{ date: today, xp: 150, sessions: 2 }]}/>
  );
  // Scope to week rows only — legend cells have the same classes but no handlers
  const toned = container.querySelector(".activity-week-row .act-cell:not(.tone-0):not(.empty)") as HTMLElement;
  fireEvent.mouseEnter(toned);
  expect(screen.getByText(/150 XP/)).toBeInTheDocument();
  expect(screen.getByText(/2 sessions/)).toBeInTheDocument();
  fireEvent.mouseLeave(toned);
  expect(screen.getByText("Hover a cell for details")).toBeInTheDocument();
});

test("hovering a zero-XP past cell shows 0 XP in the tooltip", () => {
  const { container } = render(<ActivityGrid history={[]}/>);
  // Find any non-empty tone-0 cell (past day with no activity)
  const zeroCell = container.querySelector(".activity-week-row .act-cell.tone-0:not(.empty)") as HTMLElement;
  if (!zeroCell) return; // pathological case: no past cells in grid
  fireEvent.mouseEnter(zeroCell);
  expect(screen.getByText(/0 XP/)).toBeInTheDocument();
  fireEvent.mouseLeave(zeroCell);
  expect(screen.getByText("Hover a cell for details")).toBeInTheDocument();
});

test("future cells in the current week have empty class", () => {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const futureDays = 6 - dow; // days remaining in this week after today
  const { container } = render(<ActivityGrid history={[]}/>);
  const emptyCells = container.querySelectorAll(".act-cell.empty");
  expect(emptyCells.length).toBe(futureDays);
});

test("renders placeholder tip before any hover", () => {
  render(<ActivityGrid history={[]}/>);
  expect(screen.getByText("Hover a cell for details")).toBeInTheDocument();
});
