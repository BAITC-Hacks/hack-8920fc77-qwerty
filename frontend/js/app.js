/* Сценарий пользователя: добавил расход → увидел список и итоги → удалил → итоги пересчитались. */
(function () {
  'use strict';

  var A = window.Analytics;
  var S = window.Store;

  var el = {
    month: document.getElementById('month'),
    badge: document.getElementById('storageBadge'),
    form: document.getElementById('form'),
    amount: document.getElementById('amount'),
    category: document.getElementById('category'),
    date: document.getElementById('date'),
    note: document.getElementById('note'),
    quick: document.getElementById('quick'),
    list: document.getElementById('list'),
    filterCategory: document.getElementById('filterCategory'),
    exportBtn: document.getElementById('exportBtn'),
    heroTotal: document.getElementById('heroTotal'),
    heroMonth: document.getElementById('heroMonth'),
    heroMeta: document.getElementById('heroMeta'),
    stack: document.getElementById('stack'),
    stackLegend: document.getElementById('stackLegend'),
    catTable: document.querySelector('#catTable tbody'),
    catTotal: document.getElementById('catTotal'),
    checksum: document.getElementById('checksum'),
    stats: document.getElementById('stats'),
    spark: document.getElementById('spark'),
    budget: document.getElementById('budget'),
    budgetSave: document.getElementById('budgetSave'),
    budgetProgress: document.getElementById('budgetProgress'),
    budgetFill: document.getElementById('budgetFill'),
    budgetText: document.getElementById('budgetText'),
    syncBtn: document.getElementById('syncBtn'),
    syncNote: document.getElementById('syncNote'),
    resetBtn: document.getElementById('resetBtn'),
    toast: document.getElementById('toast'),
    toastText: document.getElementById('toastText'),
    toastUndo: document.getElementById('toastUndo')
  };

  var MONTH_NAMES = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле',
    'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];
  var DAY_NAMES = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
    'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  var state = { month: '', filter: '' };
  var toastTimer = null;

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function monthLabel(month) {
    return 'в ' + MONTH_NAMES[parseInt(month.slice(5, 7), 10) - 1] + ' ' + month.slice(0, 4);
  }

  function dayLabel(date) {
    var d = parseInt(date.slice(8, 10), 10);
    return d + ' ' + DAY_NAMES[parseInt(date.slice(5, 7), 10) - 1];
  }

  function fillSelects() {
    A.CATEGORIES.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.title;
      el.category.appendChild(o);
      var f = o.cloneNode(true);
      el.filterCategory.appendChild(f);
    });
    [500, 1000, 1500, 3000].forEach(function (v) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = '+' + A.formatAmount(v);
      b.addEventListener('click', function () {
        var current = Number(String(el.amount.value).replace(/\s/g, '').replace(',', '.')) || 0;
        el.amount.value = A.round2(current + v);
        el.amount.focus();
      });
      el.quick.appendChild(b);
    });
  }

  function showErrors(errors) {
    ['amount', 'category', 'date', 'note'].forEach(function (name) {
      var box = document.getElementById('err-' + name);
      var field = el[name].closest('.field');
      box.textContent = errors[name] || '';
      field.classList.toggle('invalid', Boolean(errors[name]));
    });
    var first = Object.keys(errors)[0];
    if (first) el[first].focus();
  }

  function toast(text, undoFn) {
    el.toastText.textContent = text;
    el.toast.hidden = false;
    el.toastUndo.hidden = !undoFn;
    el.toastUndo.onclick = function () {
      if (undoFn) undoFn();
      hideToast();
    };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undoFn ? 6000 : 2600);
  }

  function hideToast() {
    el.toast.hidden = true;
    el.toastUndo.onclick = null;
  }

  /* ---------- отрисовка ---------- */

  function renderHero(s) {
    el.heroMonth.textContent = monthLabel(s.month);
    el.heroTotal.textContent = A.formatAmount(s.total);

    if (!s.count) {
      el.heroMeta.textContent = 'Пока нет записей за этот месяц';
    } else {
      var parts = [s.count + ' ' + plural(s.count, 'запись', 'записи', 'записей')];
      if (s.topCategory) {
        parts.push('больше всего на «' + s.topCategory.title + '» — ' +
          A.formatAmount(s.topCategory.share) + '%');
      }
      var html = parts.join(', ');
      if (s.changePct !== null && s.changePct !== undefined) {
        var cls = s.changePct > 0 ? 'up' : 'down';
        var word = s.changePct > 0 ? 'больше' : 'меньше';
        html += '. К прошлому месяцу <b class="' + cls + '">на ' +
          A.formatAmount(Math.abs(s.changePct)) + '% ' + word + '</b>';
      }
      el.heroMeta.innerHTML = html;
    }

    el.stack.innerHTML = '';
    el.stackLegend.innerHTML = '';
    el.stack.classList.toggle('stack--empty', !s.total);
    s.byCategory.forEach(function (row) {
      var bar = document.createElement('span');
      bar.style.width = (row.amount / s.total * 100) + '%';
      bar.style.background = row.color;
      bar.title = row.title + ': ' + A.money(row.amount);
      el.stack.appendChild(bar);

      var li = document.createElement('li');
      var dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = row.color;
      li.appendChild(dot);
      li.appendChild(document.createTextNode(row.title + ' '));
      var b = document.createElement('b');
      b.textContent = A.money(row.amount);
      li.appendChild(b);
      el.stackLegend.appendChild(li);
    });
  }

  function plural(n, one, few, many) {
    var mod10 = n % 10;
    var mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }

  function renderList(items) {
    el.list.innerHTML = '';
    var visible = state.filter
      ? items.filter(function (e) { return e.category === state.filter; })
      : items;

    if (!visible.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.innerHTML = items.length
        ? '<b>В этой категории пока пусто</b><span>Снимите фильтр, чтобы увидеть все расходы.</span>'
        : '<b>Записей за этот месяц нет</b><span>Добавьте первый расход — итоги посчитаются сразу.</span>';
      el.list.appendChild(empty);
      return;
    }

    var sorted = visible.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) ||
        String(b.created_at).localeCompare(String(a.created_at));
    });

    var currentDay = null;
    sorted.forEach(function (e) {
      if (e.date !== currentDay) {
        currentDay = e.date;
        var dayTotal = sorted
          .filter(function (x) { return x.date === e.date; })
          .reduce(function (sum, x) { return sum + Number(x.amount); }, 0);
        var head = document.createElement('div');
        head.className = 'list__day';
        head.innerHTML = '<span>' + dayLabel(e.date) + '</span><b>' + A.money(dayTotal) + '</b>';
        el.list.appendChild(head);
      }

      var row = document.createElement('div');
      row.className = 'row';

      var bar = document.createElement('span');
      bar.className = 'row__bar';
      bar.style.background = A.categoryColor(e.category);

      var main = document.createElement('div');
      main.className = 'row__main';
      var cat = document.createElement('div');
      cat.className = 'row__cat';
      cat.textContent = A.categoryTitle(e.category);
      main.appendChild(cat);
      if (e.note) {
        var note = document.createElement('div');
        note.className = 'row__note';
        note.textContent = e.note;
        main.appendChild(note);
      }

      var amount = document.createElement('div');
      amount.className = 'row__amount';
      amount.textContent = A.money(e.amount);

      var del = document.createElement('button');
      del.className = 'row__del';
      del.type = 'button';
      del.title = 'Удалить расход';
      del.setAttribute('aria-label', 'Удалить расход ' + A.money(e.amount));
      del.textContent = '×';
      del.addEventListener('click', function () { onDelete(e.id, row); });

      row.appendChild(bar);
      row.appendChild(main);
      row.appendChild(amount);
      row.appendChild(del);
      el.list.appendChild(row);
    });
  }

  function renderCategories(s) {
    el.catTable.innerHTML = '';
    if (!s.byCategory.length) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="3" style="color:var(--muted)">Нет данных за месяц</td>';
      el.catTable.appendChild(tr);
    }
    s.byCategory.forEach(function (row) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td><span class="cat"><i class="dot" style="background:' + row.color + '"></i>' +
        row.title + '</span></td>' +
        '<td class="num">' + A.money(row.amount) + '</td>' +
        '<td class="num">' + A.formatAmount(row.share) + '%</td>';
      el.catTable.appendChild(tr);
    });
    el.catTotal.textContent = A.money(s.total);
    el.checksum.textContent = s.checksumOk
      ? 'Сумма категорий совпадает с общим итогом.'
      : 'Расхождение в расчёте — проверьте данные.';
    el.checksum.classList.toggle('bad', !s.checksumOk);
  }

  function renderStats(s) {
    var rows = [
      ['Средний расход', A.money(s.averageExpense)],
      ['Медиана', A.money(s.medianExpense)],
      ['В среднем в день', A.money(s.dailyAverage)],
      ['Дней с тратами', s.activeDays + ' из ' + s.daysInMonth],
      ['Самый крупный', s.largestExpense ? A.money(s.largestExpense.amount) : '—'],
      ['Прогноз на месяц', s.daysElapsed ? A.money(s.projectedTotal) : '—']
    ];
    el.stats.innerHTML = '';
    rows.forEach(function (r) {
      var box = document.createElement('div');
      var dt = document.createElement('dt');
      dt.textContent = r[0];
      var dd = document.createElement('dd');
      dd.textContent = r[1];
      box.appendChild(dt);
      box.appendChild(dd);
      el.stats.appendChild(box);
    });

    var max = Math.max.apply(null, s.byDay.map(function (d) { return d.amount; }).concat([1]));
    el.spark.innerHTML = '';
    s.byDay.forEach(function (d) {
      var i = document.createElement('i');
      i.style.height = Math.max(2, (d.amount / max) * 100) + '%';
      if (d.amount > 0) i.className = 'has';
      i.title = dayLabel(d.date) + ': ' + A.money(d.amount);
      el.spark.appendChild(i);
    });
  }

  function renderBudget(s) {
    var budget = S.getBudget(state.month);
    el.budget.value = budget ? budget : '';
    if (!budget) {
      el.budgetProgress.hidden = true;
      return;
    }
    var pct = Math.min(100, (s.total / budget) * 100);
    el.budgetProgress.hidden = false;
    el.budgetFill.style.width = pct + '%';
    el.budgetFill.parentNode.classList.toggle('over', s.total > budget);
    if (s.total > budget) {
      el.budgetText.textContent = 'Бюджет превышен на ' + A.money(s.total - budget) + '.';
    } else {
      var text = 'Осталось ' + A.money(budget - s.total) + ' из ' + A.money(budget) + '.';
      if (s.daysElapsed && s.projectedTotal > budget) {
        text += ' При текущем темпе к концу месяца выйдет ' + A.money(s.projectedTotal) + '.';
      }
      el.budgetText.textContent = text;
    }
  }

  function render() {
    var all = S.all();
    var monthItems = A.filterMonth(all, state.month);
    var s = A.summary(all, state.month);
    renderHero(s);
    renderList(monthItems);
    renderCategories(s);
    renderStats(s);
    renderBudget(s);
  }

  /* ---------- действия ---------- */

  function onSubmit(event) {
    event.preventDefault();
    var result = S.validate({
      amount: el.amount.value,
      category: el.category.value,
      date: el.date.value,
      note: el.note.value
    });
    if (!result.ok) {
      showErrors(result.errors);
      return;
    }
    showErrors({});
    S.add(result.value);
    if (A.monthOf(result.value.date) !== state.month) {
      state.month = A.monthOf(result.value.date);
      el.month.value = state.month;
    }
    el.amount.value = '';
    el.note.value = '';
    el.amount.focus();
    render();
    toast('Расход добавлен: ' + A.money(result.value.amount));
  }

  function onDelete(id, row) {
    row.classList.add('removing');
    var removed = S.remove(id);
    render();
    if (removed) {
      toast('Удалено: ' + A.money(removed.amount), function () {
        S.restore(removed);
        render();
      });
    }
  }

  function onExport() {
    var items = A.filterMonth(S.all(), state.month);
    if (!items.length) {
      toast('За этот месяц нечего выгружать');
      return;
    }
    var blob = new Blob([S.toCsv(items)], { type: 'text/csv;charset=utf-8' });
    var link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'expenses-' + state.month + '.csv';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function onSync() {
    var items = S.all();
    if (!items.length) {
      toast('Нет записей для отправки');
      return;
    }
    el.syncBtn.disabled = true;
    S.API.push(items, true)
      .then(function (res) {
        toast('В базу записано: ' + res.saved);
        el.badge.textContent = 'браузер + база';
        el.badge.dataset.mode = 'server';
      })
      .catch(function () {
        toast('Сервер недоступен — данные остались в браузере');
      })
      .then(function () { el.syncBtn.disabled = false; });
  }

  function onReset() {
    if (!S.all().length) {
      toast('Список уже пуст');
      return;
    }
    if (!confirm('Удалить все записи? Действие нельзя отменить.')) return;
    S.clear();
    render();
    toast('Все записи удалены');
  }

  /* ---------- запуск ---------- */

  function init() {
    fillSelects();
    var known = S.months();
    state.month = known.length ? known[0] : todayIso().slice(0, 7);
    el.month.value = state.month;
    el.date.value = todayIso();
    el.category.value = 'food';

    el.form.addEventListener('submit', onSubmit);
    el.month.addEventListener('change', function () {
      if (!/^\d{4}-\d{2}$/.test(el.month.value)) {
        el.month.value = state.month;
        return;
      }
      state.month = el.month.value;
      render();
    });
    el.filterCategory.addEventListener('change', function () {
      state.filter = el.filterCategory.value;
      render();
    });
    el.exportBtn.addEventListener('click', onExport);
    el.syncBtn.addEventListener('click', onSync);
    el.resetBtn.addEventListener('click', onReset);
    el.budgetSave.addEventListener('click', function () {
      var value = Number(String(el.budget.value).replace(/\s/g, '').replace(',', '.'));
      if (el.budget.value && (!Number.isFinite(value) || value < 0)) {
        toast('Бюджет должен быть положительным числом');
        return;
      }
      S.setBudget(state.month, value);
      render();
      toast(value > 0 ? 'Бюджет сохранён' : 'Бюджет убран');
    });
    ['amount', 'category', 'date', 'note'].forEach(function (name) {
      el[name].addEventListener('input', function () {
        el[name].closest('.field').classList.remove('invalid');
        document.getElementById('err-' + name).textContent = '';
      });
    });

    render();

    S.API.available().then(function (ok) {
      if (ok) {
        el.syncNote.textContent = 'Данные хранятся в браузере. Сервер доступен — можно скопировать записи в базу.';
      } else {
        el.syncBtn.disabled = true;
        el.syncBtn.title = 'Backend не запущен';
        el.syncNote.textContent = 'Данные хранятся в браузере и остаются после обновления страницы. Backend не запущен — он не обязателен.';
      }
    });
  }

  init();
})();
