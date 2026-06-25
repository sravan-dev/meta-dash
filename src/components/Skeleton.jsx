// Loading placeholder shown while a report is being fetched.
export default function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading report">
      {/* KPI cards */}
      <div className="kpis">
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="kpi" key={i}>
            <div className="skeleton sk-line sk-sm" />
            <div className="skeleton sk-line sk-lg" />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="panel">
        <div className="skeleton sk-line sk-title" />
        <div className="skeleton sk-block" />
      </div>

      {/* Table */}
      <div className="panel">
        <div className="skeleton sk-line sk-title" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div className="sk-row" key={i}>
            <div className="skeleton sk-cell" style={{ width: 40 }} />
            <div className="skeleton sk-cell" style={{ flex: 2 }} />
            <div className="skeleton sk-cell" style={{ flex: 2 }} />
            <div className="skeleton sk-cell" style={{ flex: 1 }} />
            <div className="skeleton sk-cell" style={{ flex: 1 }} />
            <div className="skeleton sk-cell" style={{ flex: 1 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
