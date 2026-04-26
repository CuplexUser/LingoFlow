import { render, screen, fireEvent } from "@testing-library/react";
import { ActivityGrid } from "../components/StatsPage";

// Only alternating rows (di % 2 === 0) show a label: Mon, Wed, Fri
const VISIBLE_DAY_LABELS = ["Mon", "Wed", "Fri"];

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

test("renders day-of-week row labels for Mon, Wed, and Fri", () => {
  render(<ActivityGrid history={[]}/>);
  VISIBLE_DAY_LABELS.forEach((d) => expect(screen.getByText(d)).toBeInTheDocument());
});

test("renders exactly 7 day rows", () => {
  const { container } = render(<ActivityGrid history={[]}/>);
  expect(container.querySelectorAll(".activity-day-row")).toHaveLength(7);
});

test("each day row contains one cell per week in the grid", () => {
  const { container } = render(<ActivityGrid history={[]}/>);
  const rows = container.querySelectorAll(".activity-day-row");
  const cellCountInFirstRow = rows[0].querySelectorAll(".act-cell").length;
  expect(cellCountInFirstRow).toBeGreaterThanOrEqual(24); // at least 6 months ≈ 26 weeks
  rows.forEach((row) => {
    expect(row.querySelectorAll(".act-cell").length).toBe(cellCountInFirstRow);
  });
});

test("today's cell gets tone-4 when it has the highest XP", () => {
  const today = todayIso();
  const { container } = render(
    <ActivityGrid history={[{ date: today, xp: 200, sessions: 3 }]}/>
  );
  // Scoped to day rows to exclude legend cells
  expect(container.querySelectorAll(".activity-day-row .act-cell.tone-4")).toHaveLength(1);
});

test("hover shows XP, session count, and date; leave restores placeholder", () => {
  const today = todayIso();
  const { container } = render(
    <ActivityGrid history={[{ date: today, xp: 150, sessions: 2 }]}/>
  );
  // Scope to day rows only — legend cells have the same classes but no handlers
  const toned = container.querySelector(".activity-day-row .act-cell:not(.tone-0):not(.empty)") as HTMLElement;
  fireEvent.mouseEnter(toned);
  expect(screen.getByText(/150 XP/)).toBeInTheDocument();
  expect(screen.getByText(/2 sessions/)).toBeInTheDocument();
  fireEvent.mouseLeave(toned);
  expect(screen.getByText("Hover a cell for details")).toBeInTheDocument();
});

test("hovering a zero-XP past cell shows 0 XP in the tooltip", () => {
  const { container } = render(<ActivityGrid history={[]}/>);
  const zeroCell = container.querySelector(".activity-day-row .act-cell.tone-0:not(.empty)") as HTMLElement;
  if (!zeroCell) return;
  fireEvent.mouseEnter(zeroCell);
  expect(screen.getByText(/0 XP/)).toBeInTheDocument();
  fireEvent.mouseLeave(zeroCell);
  expect(screen.getByText("Hover a cell for details")).toBeInTheDocument();
});

test("future cells in the current week have empty class", () => {
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const futureDays = 6 - dow;
  const { container } = render(<ActivityGrid history={[]}/>);
  const emptyCells = container.querySelectorAll(".act-cell.empty");
  expect(emptyCells.length).toBe(futureDays);
});

test("renders placeholder tip before any hover", () => {
  render(<ActivityGrid history={[]}/>);
  expect(screen.getByText("Hover a cell for details")).toBeInTheDocument();
});
