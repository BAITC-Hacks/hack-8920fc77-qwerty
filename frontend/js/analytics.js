/* Аналитика на клиенте. Повторяет backend/app/analytics.py,
   чтобы приложение считало итоги даже без запущенного сервера. */
(function (global) {
  'use strict';

  var CURRENCY = '₸';

  var CATEGORIES = [
    { id: 'food', title: 'Еда', color: 'var(--c-food)' },
    { id: 'transport', title: 'Транспорт', color: 'var(--c-transport)' },
    { id: 'housing', title: 'Жильё', color: 'var(--c-housing)' },
    { id: 'education', title: 'Учёба', color: 'var(--c-education)' },
    { id: 'health', title: 'Здоровье', color: 'var(--c-health)' },
    { id: 'entertainment', title: 'Развлечения', color: 'var(--c-entertainment)' },
    { id: 'clothes', title: 'Одежда', color: 'var(--c-clothes)' },
    { id: 'other', title: 'Другое', color: 'var(--c-other)' }
  ];

  var byId = {};
  CATEGORIES.forEach(function (c) { byId[c.id] = c; });

  function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  function categoryTitle(id) { return byId[id] ? byId[id].title : id; }
  function categoryColor(id) { return byId[id] ? byId[id].color : 'var(--c-other)'; }

  function formatAmount(n) {
    var value = round2(Math.abs(n));
    var text = (Math.round(value * 100) % 100 === 0)
      ? String(Math.round(value))
      : value.toFixed(2);
    var parts = text.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (n < 0 ? '−' : '') + parts.join(',');
  }

  function money(n) { return formatAmount(n) + ' ' + CURRENCY; }

  function monthOf(dateStr) { return String(dateStr).slice(0, 7); }

  function shiftMonth(month, delta) {
    var y = parseInt(month.slice(0, 4), 10);
    var m = parseInt(month.slice(5, 7), 10);
    var idx = y * 12 + (m - 1) + delta;
    return String(Math.floor(idx / 12)).padStart(4, '0') + '-' +
      String((idx % 12) + 1).padStart(2, '0');
  }

  function daysInMonth(month) {
    return new Date(parseInt(month.slice(0, 4), 10), parseInt(month.slice(5, 7), 10), 0).getDate();
  }

  function filterMonth(expenses, month) {
    return expenses.filter(function (e) { return monthOf(e.date) === month; });
  }

  function total(expenses) {
    return round2(expenses.reduce(function (sum, e) { return sum + Number(e.amount); }, 0));
  }

  function byCategory(expenses) {
    var buckets = {};
    expenses.forEach(function (e) {
      if (!buckets[e.category]) buckets[e.category] = { category: e.category, amount: 0, count: 0 };
      buckets[e.category].amount += Number(e.amount);
      buckets[e.category].count += 1;
    });
    var grand = total(expenses);
    var rows = Object.keys(buckets).map(function (key) {
      var b = buckets[key];
      var amount = round2(b.amount);
      return {
        category: b.category,
        title: categoryTitle(b.category),
        color: categoryColor(b.category),
        amount: amount,
        count: b.count,
        share: grand ? round2((amount / grand) * 100) : 0
      };
    });
    rows.sort(function (a, b) { return b.amount - a.amount || a.title.localeCompare(b.title); });

    // Сумма категорий обязана совпасть с итогом: остаток округления отдаём максимальной.
    var drift = round2(grand - round2(rows.reduce(function (s, r) { return s + r.amount; }, 0)));
    if (rows.length && Math.abs(drift) >= 0.01) rows[0].amount = round2(rows[0].amount + drift);
    return rows;
  }

  function byDay(expenses, month) {
    var n = daysInMonth(month);
    var days = [];
    var map = {};
    expenses.forEach(function (e) {
      var d = parseInt(e.date.slice(8, 10), 10);
      map[d] = (map[d] || 0) + Number(e.amount);
    });
    var running = 0;
    for (var d = 1; d <= n; d += 1) {
      running += map[d] || 0;
      days.push({
        day: d,
        date: month + '-' + String(d).padStart(2, '0'),
        amount: round2(map[d] || 0),
        cumulative: round2(running)
      });
    }
    return days;
  }

  function summary(allExpenses, month, budget) {
    var current = filterMonth(allExpenses, month);
    var prevMonth = shiftMonth(month, -1);
    var previous = filterMonth(allExpenses, prevMonth);

    var grand = total(current);
    var prevTotal = total(previous);
    var categories = byCategory(current);
    var days = byDay(current, month);
    var n = daysInMonth(month);

    var today = new Date();
    var todayMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    var elapsed = month < todayMonth ? n : (month > todayMonth ? 0 : today.getDate());

    var amounts = current.map(function (e) { return Number(e.amount); }).sort(function (a, b) { return a - b; });
    var med = 0;
    if (amounts.length) {
      var mid = Math.floor(amounts.length / 2);
      med = amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
    }

    var dailyAverage = elapsed ? round2(grand / elapsed) : 0;
    var result = {
      month: month,
      total: grand,
      count: current.length,
      byCategory: categories,
      byDay: days,
      topCategory: categories[0] || null,
      averageExpense: current.length ? round2(grand / current.length) : 0,
      medianExpense: round2(med),
      largestExpense: current.length ? current.reduce(function (a, b) {
        return Number(b.amount) > Number(a.amount) ? b : a;
      }) : null,
      dailyAverage: dailyAverage,
      activeDays: days.filter(function (d) { return d.amount > 0; }).length,
      daysInMonth: n,
      daysElapsed: elapsed,
      projectedTotal: elapsed ? round2(dailyAverage * n) : 0,
      previousMonth: prevMonth,
      previousTotal: prevTotal,
      changePct: prevTotal > 0 ? round2(((grand - prevTotal) / prevTotal) * 100) : null,
      checksumOk: Math.abs(round2(categories.reduce(function (s, c) { return s + c.amount; }, 0)) - grand) < 0.01
    };

    if (budget && budget > 0) {
      result.budget = round2(budget);
      result.budgetLeft = round2(budget - grand);
      result.budgetUsedPct = round2((grand / budget) * 100);
      result.budgetRisk = result.projectedTotal > budget;
    }
    return result;
  }

  global.Analytics = {
    CURRENCY: CURRENCY,
    CATEGORIES: CATEGORIES,
    categoryTitle: categoryTitle,
    categoryColor: categoryColor,
    formatAmount: formatAmount,
    money: money,
    round2: round2,
    monthOf: monthOf,
    shiftMonth: shiftMonth,
    daysInMonth: daysInMonth,
    filterMonth: filterMonth,
    total: total,
    byCategory: byCategory,
    byDay: byDay,
    summary: summary
  };
})(window);
