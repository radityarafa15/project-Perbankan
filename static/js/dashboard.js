const categories = {
  income: ["Gaji", "Bonus", "Penjualan", "Investasi", "Hadiah", "Lainnya"],
  expense: ["Makanan", "Transportasi", "Tagihan", "Belanja", "Pendidikan", "Kesehatan", "Hiburan", "Lainnya"]
};

const typeInput = document.getElementById("type");
const categoryInput = document.getElementById("category");
const amountInput = document.getElementById("amount");
const dateInput = document.getElementById("transaction-date");
const searchInput = document.getElementById("search");

function renderCategories() {
  categoryInput.innerHTML = "";
  categories[typeInput.value].forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    categoryInput.appendChild(option);
  });
}

typeInput?.addEventListener("change", renderCategories);
renderCategories();

if (dateInput && !dateInput.value) {
  dateInput.value = new Date().toISOString().slice(0, 10);
}

amountInput?.addEventListener("input", () => {
  const digits = amountInput.value.replace(/\D/g, "");
  amountInput.value = digits ? Number(digits).toLocaleString("id-ID") : "";
});

searchInput?.addEventListener("input", () => {
  const query = searchInput.value.toLowerCase().trim();
  document.querySelectorAll("#transaction-table tr[data-search]").forEach((row) => {
    row.hidden = !row.dataset.search.includes(query);
  });
});

const data = window.CHART_DATA || {};
const money = (value) => "Rp " + Number(value || 0).toLocaleString("id-ID");

const monthlyCanvas = document.getElementById("monthly-chart");
if (monthlyCanvas) {
  new Chart(monthlyCanvas, {
    type: "bar",
    data: {
      labels: data.months || [],
      datasets: [
        { label: "Pemasukan", data: data.income || [], backgroundColor: "rgba(21,128,61,.75)" },
        { label: "Pengeluaran", data: data.expense || [], backgroundColor: "rgba(220,38,38,.75)" }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${money(ctx.raw)}` } } },
      scales: { y: { beginAtZero: true, ticks: { callback: money } } }
    }
  });
}

const categoryCanvas = document.getElementById("category-chart");
if (categoryCanvas) {
  new Chart(categoryCanvas, {
    type: "doughnut",
    data: {
      labels: data.categories || [],
      datasets: [{ data: data.categoryTotals || [] }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${money(ctx.raw)}` } } }
    }
  });
}
