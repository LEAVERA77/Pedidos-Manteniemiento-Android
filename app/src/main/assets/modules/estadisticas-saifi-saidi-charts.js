/**
 * Gráficos Chart.js SAIFI / SAIDI mensuales (aprox.) en estadísticas cooperativa eléctrica.
 * made by leavera77
 */

/**
 * @param {{
 *   crearChart: (id: string, type: string, labels: string[], datasets: unknown[], extraOpts?: Record<string, unknown>) => void;
 *   destruirChartPorId: (id: string) => void;
 *   showConf: boolean;
 *   denomEff: number;
 *   confMesRows: Array<{ mes?: string; ev?: unknown; min_tot?: unknown }>;
 * }} p
 */
export function sincronizarChartsSaifiSaidiConfiabilidad(p) {
  const { crearChart, destruirChartPorId, showConf, denomEff, confMesRows } = p;
  const ids = ["chart-saifi", "chart-saidi"];
  const denom = Number(denomEff);
  if (!showConf || !Number.isFinite(denom) || denom <= 0) {
    ids.forEach((id) => destruirChartPorId(id));
    return;
  }
  const rows = Array.isArray(confMesRows) ? confMesRows : [];
  if (!rows.length) {
    ids.forEach((id) => destruirChartPorId(id));
    return;
  }

  const mesLabels = rows.map((r) => String(r.mes || ""));
  const saifiData = rows.map((r) => {
    const ev = parseInt(String(r.ev != null ? r.ev : 0), 10) || 0;
    return ev / denom;
  });
  const saidiData = rows.map((r) => {
    const minTot = parseFloat(String(r.min_tot != null ? r.min_tot : 0)) || 0;
    return minTot / denom;
  });

  const scalesBase = {
    x: {
      grid: { display: false },
      ticks: { color: "#475569", maxRotation: 45, font: { size: 10, weight: "600" } },
    },
    y: {
      beginAtZero: true,
      grace: "8%",
      ticks: { color: "#475569" },
      grid: { color: "rgba(148,163,184,.22)" },
    },
  };

  crearChart(
    "chart-saifi",
    "bar",
    mesLabels,
    [
      {
        label: "SAIFI aprox.",
        data: saifiData,
        backgroundColor: "rgba(59, 130, 246, 0.55)",
        borderColor: "rgba(37, 99, 235, 0.75)",
        borderWidth: 1,
      },
    ],
    {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const raw = c.parsed && typeof c.parsed === "object" && c.parsed.y != null ? c.parsed.y : c.raw;
              const y = Number(raw) || 0;
              const mes = rows[c.dataIndex] && rows[c.dataIndex].mes != null ? String(rows[c.dataIndex].mes) : "";
              return ` SAIFI ≈ ${y.toFixed(4)} int./usuario (${mes})`;
            },
          },
        },
      },
      scales: {
        x: scalesBase.x,
        y: { ...scalesBase.y, title: { display: true, text: "Int. / usuario (aprox.)" } },
      },
    }
  );

  crearChart(
    "chart-saidi",
    "bar",
    mesLabels,
    [
      {
        label: "SAIDI aprox.",
        data: saidiData,
        backgroundColor: "rgba(16, 185, 129, 0.5)",
        borderColor: "rgba(5, 150, 105, 0.7)",
        borderWidth: 1,
      },
    ],
    {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (c) => {
              const raw = c.parsed && typeof c.parsed === "object" && c.parsed.y != null ? c.parsed.y : c.raw;
              const y = Number(raw) || 0;
              const mes = rows[c.dataIndex] && rows[c.dataIndex].mes != null ? String(rows[c.dataIndex].mes) : "";
              return ` SAIDI ≈ ${y.toFixed(1)} min/usuario (${mes})`;
            },
          },
        },
      },
      scales: {
        x: scalesBase.x,
        y: { ...scalesBase.y, title: { display: true, text: "Min acum. / usuario (aprox.)" } },
      },
    }
  );
}
