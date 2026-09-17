/* Хранение и валидация.
   Источник правды — localStorage: данные остаются после обновления страницы
   и работают без сервера. Backend подключается опционально. */
(function (global) {
  'use strict';

  var KEY = 'expenses.v1';
  var BUDGET_KEY = 'expenses.budgets.v1';
  var MAX_AMOUNT = 100000000;
  var MAX_NOTE = 140;

  function readRaw(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn('Не удалось прочитать localStorage:', err);
      return fallback;
    }
  }

  function writeRaw(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.warn('Не удалось записать в localStorage:', err);
      return false;
    }
  }

  function isValidRecord(e) {
    return e && typeof e === 'object' &&
      typeof e.id === 'string' &&
      typeof e.category === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) &&
      Number.isFinite(Number(e.amount)) && Number(e.amount) > 0;
  }

  function all() {
    var items = readRaw(KEY, []);
    if (!Array.isArray(items)) return [];
    return items.filter(isValidRecord).map(function (e) {
      return {
        id: e.id,
        amount: Number(e.amount),
        category: e.category,
        date: e.date,
        note: typeof e.note === 'string' ? e.note : '',
        created_at: e.created_at || new Date().toISOString()
      };
    });
  }

  function save(items) { return writeRaw(KEY, items); }

  function newId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* Валидация ввода. Возвращает { ok, value, errors } с понятными сообщениями. */
  function validate(input) {
    var errors = {};
    var raw = String(input.amount === undefined || input.amount === null ? '' : input.amount)
      .trim().replace(/\s/g, '').replace(',', '.');
    var amount = NaN;

    if (!raw) {
      errors.amount = 'Введите сумму';
    } else if (!/^\d*\.?\d*$/.test(raw)) {
      errors.amount = 'Сумма должна быть числом, например 1500';
    } else {
      amount = Number(raw);
      if (!Number.isFinite(amount)) errors.amount = 'Сумма должна быть числом, например 1500';
      else if (amount <= 0) errors.amount = 'Сумма должна быть больше нуля';
      else if (amount > MAX_AMOUNT) errors.amount = 'Слишком большая сумма';
      else if (Math.round(amount * 100) !== amount * 100) errors.amount = 'Не больше двух знаков после запятой';
    }

    var known = global.Analytics.CATEGORIES.some(function (c) { return c.id === input.category; });
    if (!input.category) errors.category = 'Выберите категорию';
    else if (!known) errors.category = 'Неизвестная категория';

    var date = String(input.date || '').trim();
    if (!date) {
      errors.date = 'Укажите дату';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(new Date(date + 'T00:00:00').getTime())) {
      errors.date = 'Дата в формате ГГГГ-ММ-ДД';
    } else {
      var year = parseInt(date.slice(0, 4), 10);
      if (year < 2000 || year > new Date().getFullYear() + 1) errors.date = 'Дата вне допустимого диапазона';
    }

    var note = String(input.note || '').trim();
    if (note.length > MAX_NOTE) errors.note = 'Не длиннее ' + MAX_NOTE + ' символов';

    var ok = Object.keys(errors).length === 0;
    return {
      ok: ok,
      errors: errors,
      value: ok ? {
        id: newId(),
        amount: global.Analytics.round2(amount),
        category: input.category,
        date: date,
        note: note,
        created_at: new Date().toISOString()
      } : null
    };
  }

  function add(record) {
    var items = all();
    items.push(record);
    save(items);
    return record;
  }

  function remove(id) {
    var items = all();
    var index = items.findIndex(function (e) { return e.id === id; });
    if (index === -1) return null;
    var removed = items.splice(index, 1)[0];
    save(items);
    return removed;
  }

  function restore(record) {
    var items = all();
    items.push(record);
    items.sort(function (a, b) { return String(a.created_at).localeCompare(String(b.created_at)); });
    save(items);
    return record;
  }

  function clear() { save([]); }

  function months() {
    var set = {};
    all().forEach(function (e) { set[e.date.slice(0, 7)] = true; });
    return Object.keys(set).sort().reverse();
  }

  function getBudget(month) {
    var map = readRaw(BUDGET_KEY, {});
    return map && typeof map === 'object' ? Number(map[month]) || 0 : 0;
  }

  function setBudget(month, value) {
    var map = readRaw(BUDGET_KEY, {}) || {};
    if (value > 0) map[month] = global.Analytics.round2(value);
    else delete map[month];
    writeRaw(BUDGET_KEY, map);
  }

  function toCsv(items) {
    var head = ['date', 'category', 'amount', 'note'];
    var rows = items.map(function (e) {
      return [e.date, global.Analytics.categoryTitle(e.category), e.amount,
        '"' + String(e.note).replace(/"/g, '""') + '"'].join(',');
    });
    return '\ufeff' + head.join(',') + '\n' + rows.join('\n');
  }

  /* ---- Необязательный backend ---- */
  var API = {
    base: (location.protocol === 'file:') ? 'http://localhost:8000' : '',

    available: function () {
      return fetch(API.base + '/api/health', { method: 'GET' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) { return Boolean(data && data.status === 'ok'); })
        .catch(function () { return false; });
    },

    push: function (items, replace) {
      return fetch(API.base + '/api/expenses/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          replace: !!replace,
          items: items.map(function (e) {
            return { amount: e.amount, category: e.category, date: e.date, note: e.note };
          })
        })
      }).then(function (r) {
        if (!r.ok) throw new Error('Сервер отклонил запрос');
        return r.json();
      });
    },

    summary: function (month, budget) {
      var url = API.base + '/api/analytics/summary?month=' + encodeURIComponent(month) +
        (budget ? '&budget=' + budget : '');
      return fetch(url).then(function (r) {
        if (!r.ok) throw new Error('Ошибка аналитики');
        return r.json();
      });
    }
  };

  global.Store = {
    all: all,
    validate: validate,
    add: add,
    remove: remove,
    restore: restore,
    clear: clear,
    months: months,
    getBudget: getBudget,
    setBudget: setBudget,
    toCsv: toCsv,
    API: API
  };
})(window);
