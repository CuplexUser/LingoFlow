import { ContentStatsPage } from "./ContentStatsPage";

type Props = {
  canModerate: boolean;
};

export function AdminPage({ canModerate }: Props) {
  if (!canModerate) {
    return <div className="panel"><p>Access denied.</p></div>;
  }

  return (
    <div className="admin-page">
      <ContentStatsPage canModerate={canModerate} />
    </div>
  );
}
