/* ============================================================
   Door2Door Laundry — admin/js/admin-reports.js
   Reports view: total revenue + top customers, shown as charts
   and a table, with a client-side "Export to Excel" button.

   Relies on helpers already defined in admin-dashboard.js
   (loaded first): $(), showToast(), formatMoney(), escapeHtml().
   Uses Chart.js (charts) and SheetJS/xlsx (Excel export), both
   loaded via CDN in dashboard.html.
   ============================================================ */

"use strict";

let _reportsLoadedOnce = false;
let _reportsData = null;
let _revenueChart = null;
let _topCustomersChart = null;

/* ── Palette (matches the app's teal/gold theme) ───────────── */
const REPORT_COLORS = {
  teal: "#1a6a6a",
  tealFill: "rgba(26, 106, 106, 0.12)",
  gold: "#b5650c",
  goldFill: "rgba(181, 101, 12, 0.75)",
  grid: "#eef5f5",
};

/* ── Date label formatting for the chart's x-axis ──────────── */
function formatDayLabel(dayStr) {
  const d = new Date(dayStr + "T00:00:00");
  if (isNaN(d)) return dayStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/* ── Load ───────────────────────────────────────────────────── */
async function loadReports() {
  const rangeSelect = $("reportsRangeSelect");
  const days = rangeSelect && rangeSelect.value ? Number(rangeSelect.value) : undefined;

  $("repStatRevenue").textContent = "…";
  $("repStatOrders").textContent = "…";
  $("repStatAvg").textContent = "…";
  $("repStatTopCustomer").textContent = "…";
  $("topCustomersTableBody").innerHTML =
    `<tr><td colspan="5" class="admin-table__empty">Loading…</td></tr>`;

  try {
    const res = await AdminAPI.getReportsSummary(days);
    _reportsData = res.data || {};
    renderReportStats(_reportsData);
    renderRevenueChart(_reportsData.revenue_by_day || []);
    renderTopCustomersChart(_reportsData.top_customers || []);
    renderTopCustomersTable(_reportsData.top_customers || []);
  } catch (err) {
    showToast(`Failed to load reports: ${err.message}`, true);
    $("topCustomersTableBody").innerHTML =
      `<tr><td colspan="5" class="admin-table__empty">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
  }
}

/* ── Stat cards ─────────────────────────────────────────────── */
function renderReportStats(data) {
  $("repStatRevenue").textContent = formatMoney(data.total_revenue);
  $("repStatOrders").textContent = data.total_orders ?? 0;
  $("repStatAvg").textContent = formatMoney(data.avg_order_value);

  const top = (data.top_customers || [])[0];
  $("repStatTopCustomer").textContent = top
    ? `${top.full_name} (${formatMoney(top.total_spent)})`
    : "—";
}

/* ── Revenue-over-time line chart ──────────────────────────── */
function renderRevenueChart(revenueByDay) {
  const ctx = document.getElementById("revenueChart");
  if (!ctx) return;

  if (typeof Chart === "undefined") {
    console.error("Chart.js failed to load — check that js/vendor/chart.umd.min.js exists and loads before admin-reports.js.");
    ctx.insertAdjacentHTML("afterend", '<p class="admin-table__empty" data-chartjs-warning>Chart library failed to load.</p>');
    return;
  }

  const labels = revenueByDay.map((r) => formatDayLabel(r.day));
  const values = revenueByDay.map((r) => r.revenue);

  if (_revenueChart) _revenueChart.destroy();

  if (!revenueByDay.length) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  _revenueChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Revenue (₹)",
        data: values,
        borderColor: REPORT_COLORS.teal,
        backgroundColor: REPORT_COLORS.tealFill,
        fill: true,
        tension: 0.3,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: REPORT_COLORS.grid }, beginAtZero: true },
      },
    },
  });
}

/* ── Top customers bar chart ───────────────────────────────── */
function renderTopCustomersChart(topCustomers) {
  const ctx = document.getElementById("topCustomersChart");
  if (!ctx) return;

  if (typeof Chart === "undefined") {
    // Already warned in renderRevenueChart; avoid a duplicate message here.
    return;
  }

  const top10 = topCustomers.slice(0, 10);
  const labels = top10.map((c) => c.full_name);
  const values = top10.map((c) => c.total_spent);

  if (_topCustomersChart) _topCustomersChart.destroy();

  if (!top10.length) {
    ctx.getContext("2d").clearRect(0, 0, ctx.width, ctx.height);
    return;
  }

  _topCustomersChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Spent (₹)",
        data: values,
        backgroundColor: REPORT_COLORS.goldFill,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: REPORT_COLORS.grid }, beginAtZero: true },
        y: { grid: { display: false } },
      },
    },
  });
}

/* ── Top customers table ───────────────────────────────────── */
function renderTopCustomersTable(topCustomers) {
  const tbody = $("topCustomersTableBody");

  if (!topCustomers.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="admin-table__empty">No orders in this period.</td></tr>`;
    return;
  }

  tbody.innerHTML = topCustomers.map((c, i) => `
    <tr>
      <td data-label="#">${i + 1}</td>
      <td data-label="Customer">
        <div class="cust-name">${escapeHtml(c.full_name || "—")}</div>
        <div class="cust-phone">${escapeHtml(c.email || "")}</div>
      </td>
      <td data-label="Orders">${c.order_count}</td>
      <td data-label="Total Spent">${formatMoney(c.total_spent)}</td>
      <td data-label="Contact">
        ${renderContactActions(
          c.full_name,
          c.phone,
          `Hi ${c.full_name || ""}, this is Door2Door Laundry. Thank you for being one of our valued customers!`
        )}
      </td>
    </tr>
  `).join("");
}

/* ── Export to Excel (client-side, via SheetJS) ────────────── */
function exportReportsToExcel() {
  if (!_reportsData) {
    showToast("Load the report first.", true);
    return;
  }
  if (typeof XLSX === "undefined") {
    showToast("Excel export library failed to load.", true);
    return;
  }

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const summaryRows = [
    ["Metric", "Value"],
    ["Total Revenue", _reportsData.total_revenue],
    ["Total Orders", _reportsData.total_orders],
    ["Average Order Value", _reportsData.avg_order_value],
    ["Report Generated", new Date().toLocaleString("en-IN")],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Summary");

  // Top customers sheet
  const custRows = [["Rank", "Customer", "Email", "Phone", "Orders", "Total Spent"]];
  (_reportsData.top_customers || []).forEach((c, i) => {
    custRows.push([i + 1, c.full_name, c.email, c.phone, c.order_count, c.total_spent]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(custRows), "Top Customers");

  // Revenue by day sheet
  const revRows = [["Date", "Revenue", "Order Count"]];
  (_reportsData.revenue_by_day || []).forEach((r) => {
    revRows.push([r.day, r.revenue, r.order_count]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(revRows), "Revenue By Day");

  // Top services sheet
  const svcRows = [["Service", "Order Count", "Revenue"]];
  (_reportsData.top_services || []).forEach((s) => {
    svcRows.push([s.name, s.order_count, s.revenue]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(svcRows), "Top Services");

  // Status breakdown sheet
  const statusRows = [["Status", "Count"]];
  (_reportsData.status_breakdown || []).forEach((s) => {
    statusRows.push([s.status, s.count]);
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(statusRows), "Status Breakdown");

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `door2door-report-${stamp}.xlsx`);
  showToast("Excel report downloaded.");
}

/* ── Init (called once, the first time the Reports tab opens) ─ */
function initReportsView() {
  const refreshBtn = $("reportsRefreshBtn");
  const exportBtn = $("reportsExportBtn");
  const rangeSelect = $("reportsRangeSelect");

  if (refreshBtn) refreshBtn.addEventListener("click", loadReports);
  if (exportBtn) exportBtn.addEventListener("click", exportReportsToExcel);
  if (rangeSelect) rangeSelect.addEventListener("change", loadReports);

  loadReports();
}

// Called from admin-dashboard.js's nav-switch handler the first
// time the admin clicks "Reports" — avoids loading data no one asked for.
window.initReportsViewIfNeeded = function () {
  if (_reportsLoadedOnce) return;
  _reportsLoadedOnce = true;
  initReportsView();
};