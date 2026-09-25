const COLORS = {
  orange: "oklch(0.688 0.209 41.7)",
  blue: "oklch(0.55 0.18 245)",
  red: "oklch(0.55 0.22 25)",
  green: "oklch(0.508 0.105 165.6)",
  charcoal: "oklch(0.301 0 0)",
  amber: "oklch(0.554 0.121 66.4)",
  gold: "oklch(0.72 0.09 75)",
  warning: "oklch(0.554 0.121 66.4)",
};

function hasDiscrepancy(bundle, metricKey) {
  return (bundle.discrepancies || []).some((item) => item.metric_key === metricKey);
}

function formatTick(value) {
  return typeof value === "number" ? new Intl.NumberFormat("en").format(value) : value;
}

function isReconstructed(kind) {
  return String(kind || "").startsWith("reconstructed-");
}

function splitByQuality(values, quality, reconstructed) {
  return values.map((value, index) => isReconstructed(quality[index]) === reconstructed ? value : null);
}

export const SERMON_TITLES_BY_DATE = Object.freeze({
  "2026-08-30": "Faith In The Fire // James Aiton",
  "2026-08-23": "Living in Babylon // James Aiton",
  "2026-08-16": "Don't Stop Asking // Dawn Gimena",
  "2026-08-09": "Unstoppable Praise // JD",
  "2026-08-02": "The Ending Changes Everything // Paul Carolino",
  "2026-07-26": "What If My Faith Doesn't Make Sense? // Albie Gimena",
  "2026-07-19": "Hope As An Anchor For Your Soul // Mick Shah",
  "2026-07-12": "Peace // James Aiton",
  "2026-07-05": "Conference Sunday // Banning Liebscher",
  "2026-06-28": "Making Great Decisions // Shane Willard",
  "2026-06-21": "Us: For Richer or For Poorer // James Aiton",
  "2026-06-14": "Us: Friendships // James Aiton",
  "2026-06-07": "Us: Communication // James Aiton",
  "2026-05-31": "Us: Whole // James Aiton",
  "2026-05-24": "The Power Wasn't Meant For The Room // James Aiton",
  "2026-05-17": "Revelation of God as Father // Mike Connell",
  "2026-05-10": "The Power of Again // Kate Aiton",
  "2026-05-03": "He Is In My Boat // Albie Gimena",
  "2026-04-26": "Can You Follow A God That Looks Like Jesus // James Aiton",
  "2026-04-19": "Worship Sunday // Clark Beckham",
  "2026-04-12": "Why Have You Forsaken Me? // James Aiton",
  "2026-04-05": "Die — So That You Can Live // James Aiton",
  "2026-03-29": "It Matters What You Call It // Ken Lee",
  "2026-03-22": "Fear of The Lord: Part 2 // James Aiton",
  "2026-03-15": "Fear Of The Lord // James Aiton",
  "2026-03-08": "Where Are The Conquerors? // Paul Carolino",
  "2026-03-01": "What Now? Not A Moment, But A Walk // Mick Shah",
  "2026-02-22": "Building Strong // James Aiton",
  "2026-02-15": "Covenant Love // Kate Aiton",
  "2026-02-08": "Heart of Worship // Clark Beckham",
  "2026-02-01": "Faith Over Fear // Albie Gimena",
  "2026-01-25": "Kingdom Culture // James Aiton",
  "2026-01-18": "The Power of One // James Aiton",
  "2026-01-11": "Vision Sunday // James Aiton",
  "2026-01-04": "New Beginnings // James Aiton",
});

export function resolveSermonTitle(date, bundle) {
  if (!date) return "";
  if (bundle?.identity?.service_date === date) {
    if (bundle?.identity?.title) {
      return `${bundle.identity.title}${bundle.identity.speaker ? ` // ${bundle.identity.speaker}` : ""}`;
    }
    if (bundle?.media?.[0]?.caption) return bundle.media[0].caption;
  }
  return SERMON_TITLES_BY_DATE[date] || "";
}

export function get2026SundayForWeek(weekNum) {
  const num = Number(weekNum);
  if (!Number.isFinite(num) || num < 1 || num > 53) return "";
  const d = new Date(Date.UTC(2026, 0, 4 + (num - 1) * 7));
  return d.toISOString().slice(0, 10);
}

export function getWeekNumberForDate(dateStr) {
  if (!dateStr) return 0;
  const d = new Date(dateStr + "T00:00:00Z");
  const base = new Date("2026-01-04T00:00:00Z");
  const diff = Math.round((d.getTime() - base.getTime()) / (7 * 86400000));
  return diff >= 0 ? diff + 1 : 0;
}

export function buildComboChartConfig(bundle) {
  const combo = bundle.chart_series?.combo || {};
  const labels = combo.labels?.length ? combo.labels : [bundle.identity?.service_date || "This Week"];

  const seatedAdults = combo.seated_adults?.length
    ? combo.seated_adults
    : [bundle.metrics?.seated_adults?.value ?? null];
  const kidsAttended = combo.kids_attended?.length
    ? combo.kids_attended
    : [bundle.metrics?.kids_attended?.value ?? null];
  const kidsLeaders = combo.kids_leaders?.length
    ? combo.kids_leaders
    : [bundle.metrics?.kids_leaders?.value ?? null];
  const kidsLeadersQuality = combo.kids_leaders_quality?.length
    ? combo.kids_leaders_quality
    : [bundle.metrics?.kids_leaders?.dimensions?.calculationKind || "verified-unique"];

  const volunteers = combo.volunteers?.length
    ? combo.volunteers
    : [bundle.metrics?.volunteers?.value ?? null];
  const newPeople = combo.new_people?.length
    ? combo.new_people
    : [bundle.metrics?.new_people_bags?.value ?? bundle.metrics?.new_people?.value ?? null];
  const handsRaised = combo.hands_raised?.length
    ? combo.hands_raised
    : [bundle.metrics?.hands_raised?.value ?? null];
  const responseLounge = combo.response_lounge?.length
    ? combo.response_lounge
    : [bundle.metrics?.response_lounge?.value ?? bundle.metrics?.lounge?.value ?? null];

  const volunteerQuality = combo.volunteers_quality?.length
    ? combo.volunteers_quality
    : ["verified-rollup"];
  const volDiscrepancy = hasDiscrepancy(bundle, "volunteers");
  const handsDiscrepancy = hasDiscrepancy(bundle, "hands_raised");

  // Compute total attendance array to find peak week
  const totalAtt = labels.map((_, i) => {
    const parts = [seatedAdults[i], kidsAttended[i], kidsLeaders[i]];
    return parts.every((part) => typeof part === "number") ? parts.reduce((sum, part) => sum + part, 0) : null;
  });
  const numericAttendance = totalAtt.filter((value) => typeof value === "number");
  const maxAtt = numericAttendance.length ? Math.max(...numericAttendance) : null;
  const peakAttIdx = maxAtt === null ? -1 : totalAtt.indexOf(maxAtt);

  const numericVolunteers = volunteers.filter((value) => typeof value === "number");
  const maxVol = numericVolunteers.length ? Math.max(...numericVolunteers) : null;
  const peakVolIdx = maxVol === null ? -1 : volunteers.indexOf(maxVol);

  const numericNewPeople = newPeople.filter((value) => typeof value === "number");
  const maxNew = numericNewPeople.length ? Math.max(...numericNewPeople) : null;
  const peakNewIdx = maxNew === null ? -1 : newPeople.indexOf(maxNew);

  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        // Left Axis (y) - Stacked Bar Columns for Attendance
        {
          type: "bar",
          label: "Seated Adults",
          data: seatedAdults,
          backgroundColor: (ctx) => ctx.dataIndex === peakAttIdx ? "oklch(0.25 0 0)" : COLORS.charcoal,
          borderColor: COLORS.charcoal,
          borderWidth: 1,
          stack: "attendance",
          yAxisID: "y",
          order: 2,
        },
        {
          type: "bar",
          label: "Kids Attended",
          data: kidsAttended,
          backgroundColor: (ctx) => ctx.dataIndex === peakAttIdx ? "oklch(0.65 0.16 66.4)" : COLORS.amber,
          borderColor: COLORS.amber,
          borderWidth: 1,
          stack: "attendance",
          yAxisID: "y",
          order: 2,
        },
        {
          type: "bar",
          label: "Kids Leaders",
          data: kidsLeaders,
          backgroundColor: COLORS.gold,
          borderColor: COLORS.gold,
          borderWidth: 1,
          stack: "attendance",
          yAxisID: "y",
          order: 2,
        },
        // Right Axis (y1) - 4 Smoothed Lines
        {
          type: "line",
          label: "Volunteers",
          data: volunteers,
          borderColor: COLORS.orange,
          backgroundColor: COLORS.orange,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: COLORS.orange,
          pointBorderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          yAxisID: "y1",
          order: 1,
        },
        {
          type: "line",
          label: "New People",
          data: newPeople,
          borderColor: COLORS.blue,
          backgroundColor: COLORS.blue,
          pointBackgroundColor: newPeople.map((_, i) => i === peakNewIdx ? "#ffffff" : COLORS.blue),
          pointBorderColor: newPeople.map((_, i) => i === peakNewIdx ? COLORS.blue : "#ffffff"),
          pointBorderWidth: newPeople.map((_, i) => i === peakNewIdx ? 3 : 1.5),
          pointRadius: (ctx) => ctx.dataIndex === peakNewIdx ? 6 : 3.5,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          tension: 0.35,
          yAxisID: "y1",
          order: 1,
        },
        {
          type: "line",
          label: "Hands Raised",
          data: handsRaised,
          borderColor: COLORS.red,
          backgroundColor: COLORS.red,
          pointBackgroundColor: handsRaised.map(() => handsDiscrepancy ? COLORS.warning : COLORS.red),
          pointBorderColor: "#ffffff",
          pointRadius: handsDiscrepancy ? 5 : 3.5,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          tension: 0.35,
          yAxisID: "y1",
          order: 1,
        },
        {
          type: "line",
          label: "Response Lounge",
          data: responseLounge,
          borderColor: COLORS.green,
          backgroundColor: COLORS.green,
          pointBackgroundColor: COLORS.green,
          pointBorderColor: "#ffffff",
          pointRadius: 3.5,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          tension: 0.35,
          yAxisID: "y1",
          order: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 14,
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 11,
              weight: "600",
            },
          },
        },
        tooltip: {
          enabled: true,
          callbacks: {
            title(items) {
              if (!items.length) return "";
              const idx = items[0].dataIndex;
              const dateLabel = labels[idx] || "";
              const tot = totalAtt[idx];
              const isPeak = idx === peakAttIdx ? " ★ Peak Attendance Week" : "";
              const sermon = resolveSermonTitle(dateLabel, bundle);
              const sermonLine = sermon ? ` · "${sermon}"` : "";
              return `${dateLabel}${sermonLine} (Total Attendance: ${formatTick(tot)})${isPeak}`;
            },
            label(context) {
              const label = context.dataset.label || "";
              const val = context.parsed.y;
              const idx = context.dataIndex;
              let peakSuffix = "";
              if (label === "Volunteers" && idx === peakVolIdx) peakSuffix = " (★ Peak Volunteers)";
              if (label === "New People" && idx === peakNewIdx) peakSuffix = " (★ Peak New People)";
              return `${label}: ${val !== null && val !== undefined ? formatTick(val) : "Not reported"}${peakSuffix}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: {
            display: false,
          },
          ticks: {
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 11,
            },
          },
        },
        y: {
          type: "linear",
          display: true,
          position: "left",
          stacked: true,
          beginAtZero: true,
          min: 0,
          suggestedMax: 4000,
          title: {
            display: true,
            text: "Attendance (0–4,000)",
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 11,
              weight: "700",
            },
          },
          ticks: {
            callback: formatTick,
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 10,
            },
          },
          grid: {
            color: "rgba(0, 0, 0, 0.06)",
          },
        },
        y1: {
          type: "linear",
          display: true,
          position: "right",
          stacked: false,
          beginAtZero: true,
          min: 0,
          suggestedMax: 500,
          title: {
            display: true,
            text: "Engagement & Volunteers (0–500)",
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 11,
              weight: "700",
            },
          },
          ticks: {
            callback: formatTick,
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 10,
            },
          },
          grid: {
            drawOnChartArea: false,
          },
        },
      },
    },
  };
}

export function buildVolunteerChartConfig(bundle, viewMode = "year") {
  const volunteerDiscrepancy = hasDiscrepancy(bundle, "volunteers");

  if (viewMode === "week") {
    const combo = bundle.chart_series?.combo || {};
    const labels = combo.labels?.length ? combo.labels : [bundle.identity?.service_date || "This Week"];
    const volunteers = combo.volunteers?.length
      ? combo.volunteers
      : [bundle.metrics?.volunteers?.value ?? null];
    const quality = combo.volunteers_quality?.length ? combo.volunteers_quality : volunteers.map(() => "verified-rollup");
    const lower = combo.volunteers_lower?.length ? combo.volunteers_lower : volunteers;
    const upper = combo.volunteers_upper?.length ? combo.volunteers_upper : volunteers;

    return {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Sunday Volunteers",
            data: volunteers,
            borderColor: COLORS.orange,
            backgroundColor: "rgba(249, 115, 22, 0.10)",
            fill: false,
            pointBackgroundColor: "#ffffff",
            pointBorderColor: COLORS.orange,
            pointBorderWidth: 2.5,
            pointRadius: 4,
            pointHoverRadius: 7,
            borderWidth: 2.5,
            tension: 0.3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        spanGaps: false,
        plugins: {
          legend: {
            display: true,
            position: "bottom",
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              boxHeight: 8,
              padding: 14,
              font: {
                family: "'Inter', 'Favor Sans', sans-serif",
                size: 11,
                weight: "600",
              },
            },
          },
          tooltip: {
            enabled: true,
            callbacks: {
              title(items) {
                if (!items.length) return "";
                const dateLabel = items[0].label || "";
                const weekNum = getWeekNumberForDate(dateLabel);
                const sermon = resolveSermonTitle(dateLabel, bundle);
                const sermonLine = sermon ? ` · "${sermon}"` : "";
                return `Week ${weekNum} (${dateLabel})${sermonLine}`;
              },
              label(context) {
                const val = context.parsed.y;
                return `Sunday Volunteers: ${val !== null && val !== undefined ? formatTick(val) + " vols" : "Not reported"}`;
              },
              afterBody() {
                return "(Click point to pin & open report)";
              },
            },
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(0, 0, 0, 0.05)",
            },
            ticks: {
              font: {
                family: "'Inter', 'Favor Sans', sans-serif",
                size: 10,
              },
            },
          },
          y: {
            type: "linear",
            beginAtZero: true,
            suggestedMax: 500,
            title: {
              display: true,
              text: "Volunteers (0–500)",
              font: {
                family: "'Inter', 'Favor Sans', sans-serif",
                size: 11,
                weight: "700",
              },
            },
            ticks: {
              callback: formatTick,
              font: {
                family: "'Inter', 'Favor Sans', sans-serif",
                size: 10,
              },
            },
            grid: {
              color: "rgba(0, 0, 0, 0.06)",
            },
          },
        },
      },
    };
  }

  // Historical comparison is intentionally unavailable until every point is tagged
  // with its canonical Metric 124 unique-volunteer definition.
  const multiYear = bundle.chart_series?.volunteer_multi_year || {
    labels: [],
    series_2023: [],
    series_2024: [],
    series_2025: [],
    series_2026: [],
  };

  const labels = multiYear.labels || [];
  const currentQuality = multiYear.quality_2026 || [];
  const currentValues = multiYear.series_2026 || [];
  const currentLower = multiYear.lower_2026 || [];
  const currentUpper = multiYear.upper_2026 || [];

  return {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "2026",
          data: currentValues,
          borderColor: COLORS.orange,
          backgroundColor: COLORS.orange,
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: COLORS.orange,
          pointBorderWidth: 2.5,
          tension: 0.3,
          order: 1,
        },
        {
          label: "2025",
          data: multiYear.series_2025 || [],
          borderColor: COLORS.red,
          backgroundColor: COLORS.red,
          borderWidth: 2,
          pointRadius: 3.5,
          pointHoverRadius: 6,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: COLORS.red,
          pointBorderWidth: 2,
          tension: 0.3,
          order: 2,
        },
        {
          label: "2024",
          data: multiYear.series_2024 || [],
          borderColor: COLORS.gold,
          backgroundColor: COLORS.gold,
          borderWidth: 1.8,
          pointRadius: 3,
          pointHoverRadius: 5.5,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: COLORS.gold,
          pointBorderWidth: 1.8,
          tension: 0.3,
          order: 3,
        },
        {
          label: "2023",
          data: multiYear.series_2023 || [],
          borderColor: "oklch(0.60 0 0)",
          backgroundColor: "oklch(0.60 0 0)",
          borderWidth: 1.5,
          borderDash: [4, 4],
          pointRadius: 3,
          pointHoverRadius: 5.5,
          pointBackgroundColor: "#ffffff",
          pointBorderColor: "oklch(0.60 0 0)",
          pointBorderWidth: 1.5,
          tension: 0.3,
          order: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      spanGaps: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8,
            padding: 14,
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 11,
              weight: "600",
            },
          },
        },
        tooltip: {
          enabled: true,
          mode: "index",
          intersect: false,
          callbacks: {
            title(items) {
              const weekLabel = items[0]?.label || "";
              const weekNum = Number(weekLabel.replace(/^W/, ""));
              const date2026 = get2026SundayForWeek(weekNum);
              const sermon = resolveSermonTitle(date2026, bundle);
              const sermonLine = sermon ? ` · "${sermon}"` : "";
              return `Week ${weekNum} (${date2026})${sermonLine}`;
            },
            label(context) {
              const yrLabel = context.dataset.label || "";
              const val = context.parsed.y;
              if (val === null || val === undefined) return `${yrLabel}: No data`;
              const ds2026 = context.chart.data.datasets.find((d) => d.label === "2026");
              const val2026 = ds2026 ? ds2026.data[context.dataIndex] : null;
              if (yrLabel !== "2026" && typeof val2026 === "number" && typeof val === "number") {
                const diff = val2026 - val;
                const diffSign = diff >= 0 ? `+${diff}` : `${diff}`;
                const pct = val > 0 ? ` (${diff >= 0 ? "+" : ""}${Math.round((diff / val) * 100)}%)` : "";
                return `${yrLabel}: ${formatTick(val)} vols  (2026 is ${diffSign} vs ${yrLabel}${pct})`;
              }
              return `${yrLabel}: ${formatTick(val)} vols`;
            },
            afterBody() {
              return "(Click point to pin & open report)";
            },
          },
        },
      },
      scales: {
        x: {
          grid: {
            color: "rgba(0, 0, 0, 0.04)",
          },
          ticks: {
            maxTicksLimit: 13,
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 10,
            },
          },
        },
        y: {
          type: "linear",
          beginAtZero: true,
          suggestedMax: 500,
          title: {
            display: true,
            text: "Sunday Volunteers (0–500)",
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 11,
              weight: "700",
            },
          },
          ticks: {
            callback: formatTick,
            font: {
              family: "'Inter', 'Favor Sans', sans-serif",
              size: 10,
            },
          },
          grid: {
            color: "rgba(0, 0, 0, 0.06)",
          },
        },
      },
    },
  };
}

export function buildChartConfig(bundle) {
  const combo = buildComboChartConfig(bundle);
  const volunteers = buildVolunteerChartConfig(bundle, "year");
  const dashboard = combo;
  return { combo, dashboard, volunteers };
}
