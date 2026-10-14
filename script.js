const STORAGE_KEY = "finfuture-simulator-data-v1";
const THEME_KEY = "finfuture-simulator-theme";
const COLORS = ["#5b5ce2", "#18a874", "#e4a3ab", "#9274ec", "#e8b04b", "#4ba8c9", "#e47c48", "#8b9ab1"];
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const today = () => new Date().toISOString().slice(0, 10);
const money = (value) => new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(value || 0) + " сом";
const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let state = loadData();
let toastTimer;

function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.transactions) && Array.isArray(saved.goals)) {
      return { transactions: saved.transactions, goals: saved.goals, budgetLimit: Number(saved.budgetLimit) || 0 };
    }
  } catch (error) { console.warn("Не удалось прочитать сохранённые данные", error); }
  return { transactions: [], goals: [], budgetLimit: 0 };
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}

function inSelectedPeriod(dateString) {
  const period = $("#periodFilter").value;
  if (period === "all") return true;
  const date = new Date(dateString + "T12:00:00");
  const now = new Date();
  if (period === "month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (period === "year") return date.getFullYear() === now.getFullYear();
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return date >= start && date <= now;
}

function getPeriodTransactions() {
  return state.transactions.filter((transaction) => inSelectedPeriod(transaction.date));
}

function calculateBalance() {
  return state.transactions.reduce((sum, transaction) => sum + (transaction.type === "income" ? transaction.amount : -transaction.amount), 0);
}

function calculateIncome(transactions = getPeriodTransactions()) {
  return transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
}

function calculateExpenses(transactions = getPeriodTransactions()) {
  return transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
}

function addTransaction(event) {
  event.preventDefault();
  const form = $("#transactionForm");
  const data = new FormData(form);
  const amount = Number(data.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    showToast("Укажи сумму больше нуля.");
    return;
  }
  const transaction = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
    title: String(data.get("title")).trim(),
    amount,
    category: String(data.get("category")),
    date: String(data.get("date")),
    type: String(data.get("type"))
  };
  if (!transaction.title || !transaction.date) return;
  state.transactions.unshift(transaction);
  saveData();
  form.reset();
  $("#transactionDate").value = today();
  $("#transactionDialog").close();
  renderAll();
  showToast("Операция добавлена.");
}

function deleteTransaction(id) {
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction) return;
  if (!confirm(`Удалить операцию «${transaction.title}»?`)) return;
  state.transactions = state.transactions.filter((item) => item.id !== id);
  saveData();
  renderAll();
  showToast("Операция удалена.");
}

function addSavingsGoal(event) {
  event.preventDefault();
  const data = new FormData($("#goalForm"));
  const target = Number(data.get("target"));
  const saved = Number(data.get("saved"));
  const monthly = Number(data.get("monthly"));
  if (!Number.isFinite(target) || target <= 0 || saved < 0 || monthly < 0) {
    showToast("Проверь значения цели.");
    return;
  }
  state.goals.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
    name: String(data.get("name")).trim(),
    target,
    saved: Math.min(saved, target),
    monthly
  });
  saveData();
  $("#goalForm").reset();
  $("#goalSaved").value = "0";
  $("#goalMonthly").value = "0";
  $("#goalDialog").close();
  renderAll();
  showToast("Цель накопления создана.");
}

function updateProgress(goal) {
  const percent = goal.target > 0 ? Math.min(100, Math.round(goal.saved / goal.target * 100)) : 0;
  const remaining = Math.max(0, goal.target - goal.saved);
  let forecast = "Укажи ежемесячный взнос";
  if (remaining === 0) forecast = "Цель достигнута!";
  else if (goal.monthly > 0) {
    const months = Math.ceil(remaining / goal.monthly);
    forecast = `Примерно через ${months} мес.`;
  }
  return { percent, remaining, forecast };
}

function deleteGoal(id) {
  const goal = state.goals.find((item) => item.id === id);
  if (!goal || !confirm(`Удалить цель «${goal.name}»?`)) return;
  state.goals = state.goals.filter((item) => item.id !== id);
  saveData();
  renderAll();
  showToast("Цель удалена.");
}

function renderChart() {
  const transactions = getPeriodTransactions();
  const income = calculateIncome(transactions);
  const expenses = calculateExpenses(transactions);
  $("#chartIncome").textContent = money(income);
  $("#chartExpenses").textContent = money(expenses);
  const max = Math.max(income, expenses, 1);
  const incomeHeight = Math.max(income > 0 ? 5 : 0, income / max * 132);
  const expenseHeight = Math.max(expenses > 0 ? 5 : 0, expenses / max * 132);
  $("#comparisonChart").innerHTML = `
    <div class="bar-group"><div class="bars"><div class="bar income" title="Доходы: ${money(income)}" style="height:${incomeHeight}px"></div><div class="bar expense" title="Расходы: ${money(expenses)}" style="height:${expenseHeight}px"></div></div><span class="bar-label">Выбранный период</span></div>`;
  const categories = {};
  transactions.filter((item) => item.type === "expense").forEach((item) => {
    categories[item.category] = (categories[item.category] || 0) + item.amount;
  });
  const sorted = Object.entries(categories).sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, amount]) => sum + amount, 0);
  $("#categoryChart").innerHTML = sorted.length ? sorted.slice(0, 5).map(([category, amount], index) => `
    <div class="category-row"><span class="category-color" style="background:${COLORS[index % COLORS.length]}"></span><span class="category-name">${escapeHTML(category)}</span><strong class="category-amount">${money(amount)}</strong><div class="category-track"><span style="width:${total ? amount / total * 100 : 0}%;background:${COLORS[index % COLORS.length]}"></span></div></div>`).join("") : '<div class="empty-state">Пока нет расходов за выбранный период</div>';
  const limit = state.budgetLimit;
  const percent = limit > 0 ? Math.round(expenses / limit * 100) : 0;
  $("#budgetPercent").textContent = `${percent}%`;
  $("#budgetProgress").style.width = `${Math.min(100, percent)}%`;
  $("#budgetProgress").style.background = percent >= 100 ? "var(--red)" : "";
  $("#budgetSpent").textContent = `${money(expenses)} потрачено`;
  $("#budgetLimitLabel").textContent = limit > 0 ? `из ${money(limit)}` : "Лимит не задан";
  $("#budgetWarning").textContent = limit > 0 && expenses > limit ? `Внимание: лимит превышен на ${money(expenses - limit)}!` : (limit > 0 && expenses >= limit * 0.8 ? "Внимание: использовано 80% или больше лимита." : "");
}

function renderTransactions() {
  const search = $("#searchInput").value.trim().toLocaleLowerCase("ru");
  const from = $("#dateFrom").value;
  const to = $("#dateTo").value;
  const filtered = state.transactions.filter((item) => {
    const matchesSearch = `${item.title} ${item.category} ${item.type}`.toLocaleLowerCase("ru").includes(search);
    return matchesSearch && (!from || item.date >= from) && (!to || item.date <= to);
  }).sort((a, b) => b.date.localeCompare(a.date));
  $("#transactionsBody").innerHTML = filtered.map((item) => {
    const isIncome = item.type === "income";
    const icon = isIncome ? "↗" : "↘";
    return `<tr><td><div class="transaction-name"><span class="transaction-icon">${icon}</span><span>${escapeHTML(item.title)}</span></div></td><td>${escapeHTML(item.category)}</td><td>${new Date(item.date + "T12:00:00").toLocaleDateString("ru-RU")}</td><td><span class="transaction-type ${item.type}">${isIncome ? "Доход" : "Расход"}</span></td><td class="align-right amount ${item.type}">${isIncome ? "+" : "−"}${money(item.amount)}</td><td><button class="delete-btn" type="button" aria-label="Удалить операцию" title="Удалить" data-delete-transaction="${escapeHTML(item.id)}">×</button></td></tr>`;
  }).join("");
  $("#transactionsEmpty").style.display = filtered.length ? "none" : "block";
  $("#transactionSummary").textContent = `Показано ${filtered.length} из ${state.transactions.length} операций`;
  $$("[data-delete-transaction]").forEach((button) => button.addEventListener("click", () => deleteTransaction(button.dataset.deleteTransaction)));
}

function renderGoals() {
  $("#goalsGrid").innerHTML = state.goals.length ? state.goals.map((goal) => {
    const progress = updateProgress(goal);
    return `<article class="goal-card"><div class="goal-top"><span class="goal-icon">◎</span><button class="goal-delete" type="button" data-delete-goal="${escapeHTML(goal.id)}" aria-label="Удалить цель">×</button></div><h3>${escapeHTML(goal.name)}</h3><div class="goal-amounts"><strong>${money(goal.saved)}</strong><span>из ${money(goal.target)}</span></div><div class="goal-progress"><span style="width:${progress.percent}%"></span></div><div class="goal-meta"><span>${progress.remaining ? `Осталось ${money(progress.remaining)}` : "Поздравляем!"}</span><strong>${progress.percent}%</strong></div><div class="goal-meta" style="margin-top:8px"><span>${goal.monthly > 0 ? `Взнос: ${money(goal.monthly)}/мес.` : "Взнос не задан"}</span><span>${escapeHTML(progress.forecast)}</span></div></article>`;
  }).join("") : '<div class="empty-state">Создай первую цель, например «Новый компьютер»</div>';
  $$("[data-delete-goal]").forEach((button) => button.addEventListener("click", () => deleteGoal(button.dataset.deleteGoal)));
}

function renderAll() {
  $("#balanceValue").textContent = money(calculateBalance());
  const transactions = getPeriodTransactions();
  const income = calculateIncome(transactions);
  const expenses = calculateExpenses(transactions);
  $("#incomeValue").textContent = money(income);
  $("#expensesValue").textContent = money(expenses);
  $("#incomeCount").textContent = `${transactions.filter((item) => item.type === "income").length} операций`;
  $("#expenseCount").textContent = `${transactions.filter((item) => item.type === "expense").length} операций`;
  $("#savingsValue").textContent = money(state.goals.reduce((sum, goal) => sum + goal.saved, 0));
  $("#goalCount").textContent = `${state.goals.length} ${state.goals.length === 1 ? "цель" : "целей"}`;
  $("#budgetLimit").value = state.budgetLimit || "";
  renderChart();
  renderTransactions();
  renderGoals();
}

function exportReport() {
  const header = ["ID", "Название", "Тип", "Категория", "Дата", "Сумма (сом)"];
  const rows = state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map((item) => [item.id, item.title, item.type === "income" ? "Доход" : "Расход", item.category, item.date, item.amount]);
  const csvCell = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `finfuture-report-${today()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("CSV-отчёт подготовлен.");
}

function applyTheme(theme) {
  document.body.classList.toggle("dark", theme === "dark");
  $("#themeIcon").textContent = theme === "dark" ? "☀" : "☾";
  $("#themeText").textContent = theme === "dark" ? "Светлая тема" : "Тёмная тема";
  localStorage.setItem(THEME_KEY, theme);
}

function init() {
  $("#transactionDate").value = today();
  applyTheme(localStorage.getItem(THEME_KEY) || "light");
  $("#openTransactionBtn").addEventListener("click", () => $("#transactionDialog").showModal());
  $("#openGoalBtn").addEventListener("click", () => $("#goalDialog").showModal());
  $("#transactionForm").addEventListener("submit", addTransaction);
  $("#goalForm").addEventListener("submit", addSavingsGoal);
  $("#periodFilter").addEventListener("change", renderAll);
  $("#searchInput").addEventListener("input", renderTransactions);
  $("#dateFrom").addEventListener("change", renderTransactions);
  $("#dateTo").addEventListener("change", renderTransactions);
  $("#clearFiltersBtn").addEventListener("click", () => {
    $("#searchInput").value = ""; $("#dateFrom").value = ""; $("#dateTo").value = ""; renderTransactions();
  });
  $("#saveLimitBtn").addEventListener("click", () => {
    const value = Number($("#budgetLimit").value);
    if (!Number.isFinite(value) || value < 0) { showToast("Лимит не может быть отрицательным."); return; }
    state.budgetLimit = value;
    saveData(); renderChart(); showToast(value ? "Лимит расходов сохранён." : "Лимит отключён.");
  });
  $("#exportBtn").addEventListener("click", exportReport);
  $("#themeToggle").addEventListener("click", () => applyTheme(document.body.classList.contains("dark") ? "light" : "dark"));
  $$("[data-close]").forEach((button) => button.addEventListener("click", () => document.getElementById(button.dataset.close).close()));
  $$(".nav-link").forEach((link) => link.addEventListener("click", () => {
    $$(".nav-link").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  }));
  renderAll();
}

document.addEventListener("DOMContentLoaded", init);
