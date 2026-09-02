// Small shared shapes used across the dashboard builder's client
// components — split out on its own so DashboardGrid and WidgetEditorPanel
// don't need to import from each other (or from a component that no longer
// exists, now that tab/publish/delete controls live in the sidebar rather
// than a single DashboardTabs component).
export type CalculatedMetricOption = {
  id: string;
  name: string;
  aggregation: string;
  percentile: number | null;
  transactionCategory: string | null;
  merchantCategories: string[];
  period: string | null;
  periodAggregation: string | null;
};
