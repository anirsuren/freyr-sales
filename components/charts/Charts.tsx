// Server-safe barrel. Colours live in the plain `palette` module so server
// components can read VIZ / VIZ_SERIES directly; the interactive chart
// components live in the "use client" ChartsClient module and are re-exported
// here so every existing `@/components/charts/Charts` import keeps working.
export { VIZ, VIZ_SERIES } from "./palette";
export {
  AreaChart,
  DonutChart,
  BarChart,
  LineChart,
  Sparkline,
  Legend,
  DonutLegend,
} from "./ChartsClient";
export type { TipItem } from "./ChartsClient";
