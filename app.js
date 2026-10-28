import { getAll, put, remove, replaceAll } from './db.js';

const STORE = 'tables';
const BACKUP_FORMAT = 'opanchu-backup';
const FIRST_YEAR = 2014;
const LAST_YEAR = 2030;
const YEAR_KEY = 'opanchu-year';
const DEFAULT_YEAR = Math.min(Math.max(new Date().getFullYear(), FIRST_YEAR), LAST_YEAR);

const wrap = document.getElementById('table-wrap');
const grid = document.getElementById('grid');
const thead = grid.tHead;
const tbody = grid.tBodies[0];
const empty = document.getElementById('empty');
const status = document.getElementById('status');
const yearSelect = document.getElementById('year');
const importFile = document.getElementById('import-file');

const colDialog = document.getElementById('col-dialog');
const colName = document.getElementById('col-name');
const colLeft = document.getElementById('col-left');
const colRight = document.getElementById('col-right');

const rowDialog = document.getElementById('row-dialog');
const rowTitle = document.getElementById('row-title');
const rowUp = document.getElementById('row-up');
const rowDown = document.getElementById('row-down');

// One table per year, each stored as its own IndexedDB record:
// { id: year, columns: [{ id, name, type: 'text' | 'check' }], rows: [{ id, cells: { [columnId]: string | boolean } }] }
// Every saved year is also kept in memory, so Back up can build its file without waiting.
const tables = new Map();
let table;

const newId = () => crypto.randomUUID();
const newRow = () => ({ id: newId(), cells: {} });
const label = (col) => col.name.trim() || 'Untitled';

// A year with no table yet starts with the same columns as the year you came from.
function newTable(year, columns) {
  return {
    id: year,
    columns: columns?.length
      ? columns.map((col) => ({ ...col }))
      : [
          { id: newId(), name: 'Item', type: 'text' },
          { id: newId(), name: 'Done', type: 'check' },
        ],
    rows: [newRow(), newRow(), newRow()],
  };
}

// Typing is saved after a short pause; everything else is saved straight away.
let saveTimer;

function save() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  tables.set(table.id, table);
  put(STORE, table).catch((err) => alert(`Could not save: ${err.message}`));
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

function flushSave() {
  if (saveTimer) save();
}

// iOS can close a backgrounded app without warning, so flush pending edits first.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) flushSave();
});

function commit() {
  render();
  save();
}

function move(list, index, by) {
  const [item] = list.splice(index, 1);
  list.splice(index + by, 0, item);
}

// ---- Years

function showYear(year) {
  flushSave();
  table = tables.get(year) ?? newTable(year, table?.columns);
  yearSelect.value = String(year);
  try { localStorage.setItem(YEAR_KEY, year); } catch {}
  wrap.scrollTo(0, 0);
  render();
}

function initialYear() {
  let saved;
  try { saved = Number(localStorage.getItem(YEAR_KEY)); } catch {}
  return saved >= FIRST_YEAR && saved <= LAST_YEAR ? saved : DEFAULT_YEAR;
}

for (let year = FIRST_YEAR; year <= LAST_YEAR; year++) yearSelect.add(new Option(year, year));
yearSelect.addEventListener('change', () => showYear(Number(yearSelect.value)));

// ---- Rendering

function render() {
  renderHeader();
  renderBody();
  grid.hidden = table.columns.length === 0;
  empty.hidden = table.columns.length > 0;
}

function renderHeader() {
  const tr = document.createElement('tr');
  tr.append(document.createElement('th'));
  for (const col of table.columns) {
    const th = document.createElement('th');
    th.className = col.type;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.col = col.id;
    btn.textContent = label(col);
    th.append(btn);
    tr.append(th);
  }
  thead.replaceChildren(tr);
}

function renderBody() {
  tbody.replaceChildren(...table.rows.map((row, i) => {
    const tr = document.createElement('tr');
    tr.dataset.row = row.id;
    const th = document.createElement('th');
    th.scope = 'row';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = i + 1;
    th.append(btn);
    tr.append(th, ...table.columns.map((col) => renderCell(row, col)));
    return tr;
  }));
}

function renderCell(row, col) {
  const td = document.createElement('td');
  td.className = col.type;
  const value = row.cells[col.id];
  if (col.type === 'check') {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = value === true;
    box.dataset.col = col.id;
    box.setAttribute('aria-label', label(col));
    const wrapper = document.createElement('label');
    wrapper.append(box);
    td.append(wrapper);
  } else {
    // The wrapper mirrors the text (see .cell in styles.css) so the cell grows to fit it.
    const cell = document.createElement('div');
    cell.className = 'cell';
    const text = document.createElement('textarea');
    text.rows = 1;
    text.cols = 1;
    text.setAttribute('wrap', 'off');
    text.value = typeof value === 'string' ? value : '';
    text.dataset.col = col.id;
    text.setAttribute('aria-label', label(col));
    cell.dataset.value = text.value;
    cell.append(text);
    td.append(cell);
  }
  return td;
}

function focusRow(id) {
  const tr = tbody.querySelector(`tr[data-row="${id}"]`);
  tr.scrollIntoView({ block: 'nearest' });
  tr.querySelector('textarea')?.focus();
}

// ---- Cell editing

function onCellEdit(el) {
  const row = table.rows.find((r) => r.id === el.closest('tr').dataset.row);
  row.cells[el.dataset.col] = el.type === 'checkbox' ? el.checked : el.value;
  saveSoon();
}

grid.addEventListener('input', (e) => {
  if (e.target.tagName !== 'TEXTAREA') return;
  e.target.parentElement.dataset.value = e.target.value;
  onCellEdit(e.target);
});

grid.addEventListener('change', (e) => {
  if (e.target.type === 'checkbox') onCellEdit(e.target);
});

grid.addEventListener('click', (e) => {
  // A tap on the empty space under a short text cell still starts typing in it.
  if (e.target.matches('td.text')) {
    e.target.querySelector('textarea').focus();
    return;
  }
  const btn = e.target.closest('button');
  if (!btn) return;
  if (btn.closest('thead')) openColumnDialog(btn.dataset.col);
  else openRowDialog(btn.closest('tr').dataset.row);
});

document.getElementById('add-row').addEventListener('click', () => {
  const row = newRow();
  table.rows.push(row);
  commit();
  focusRow(row.id);
});

document.getElementById('add-col').addEventListener('click', () => {
  const col = { id: newId(), name: `Column ${table.columns.length + 1}`, type: 'text' };
  table.columns.push(col);
  commit();
  wrap.scrollLeft = wrap.scrollWidth;
  openColumnDialog(col.id);
  colName.focus();
  colName.setSelectionRange(0, colName.value.length);
});

// ---- Column dialog

let activeColId;
const activeColIndex = () => table.columns.findIndex((c) => c.id === activeColId);

function openColumnDialog(id) {
  activeColId = id;
  syncColumnDialog();
  colDialog.showModal();
}

function syncColumnDialog() {
  const i = activeColIndex();
  const col = table.columns[i];
  colName.value = col.name;
  colDialog.querySelector(`[name="col-type"][value="${col.type}"]`).checked = true;
  colLeft.disabled = i === 0;
  colRight.disabled = i === table.columns.length - 1;
}

colName.addEventListener('input', () => {
  table.columns[activeColIndex()].name = colName.value;
  renderHeader();
  saveSoon();
});

colDialog.addEventListener('change', (e) => {
  if (e.target.name !== 'col-type') return;
  const col = table.columns[activeColIndex()];
  const hasData = table.rows.some((row) => row.cells[col.id]);
  if (hasData && !confirm(`Changing the type clears everything in "${label(col)}". Continue?`)) {
    syncColumnDialog();
    return;
  }
  col.type = e.target.value;
  for (const row of table.rows) delete row.cells[col.id];
  commit();
});

colLeft.addEventListener('click', () => {
  move(table.columns, activeColIndex(), -1);
  commit();
  syncColumnDialog();
});

colRight.addEventListener('click', () => {
  move(table.columns, activeColIndex(), 1);
  commit();
  syncColumnDialog();
});

document.getElementById('col-delete').addEventListener('click', () => {
  const i = activeColIndex();
  const col = table.columns[i];
  if (!confirm(`Delete column "${label(col)}" and everything in it?`)) return;
  table.columns.splice(i, 1);
  for (const row of table.rows) delete row.cells[col.id];
  colDialog.close();
  commit();
});

// ---- Row dialog

let activeRowId;
const activeRowIndex = () => table.rows.findIndex((r) => r.id === activeRowId);

function openRowDialog(id) {
  activeRowId = id;
  syncRowDialog();
  rowDialog.showModal();
}

function syncRowDialog() {
  const i = activeRowIndex();
  rowTitle.textContent = `Row ${i + 1}`;
  rowUp.disabled = i === 0;
  rowDown.disabled = i === table.rows.length - 1;
}

rowUp.addEventListener('click', () => {
  move(table.rows, activeRowIndex(), -1);
  commit();
  syncRowDialog();
});

rowDown.addEventListener('click', () => {
  move(table.rows, activeRowIndex(), 1);
  commit();
  syncRowDialog();
});

document.getElementById('row-insert').addEventListener('click', () => {
  const row = newRow();
  table.rows.splice(activeRowIndex() + 1, 0, row);
  rowDialog.close();
  commit();
  focusRow(row.id);
});

document.getElementById('row-delete').addEventListener('click', () => {
  const i = activeRowIndex();
  if (!confirm(`Delete row ${i + 1}?`)) return;
  table.rows.splice(i, 1);
  rowDialog.close();
  commit();
});

// Tapping the dimmed backdrop closes a dialog.
for (const dialog of [colDialog, rowDialog]) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

// ---- Back up / Restore

// Back up: on iPhone this opens the share sheet, where "Save to Files" keeps a copy.
// Built synchronously from memory, because iOS rejects navigator.share() once an await
// has used up the tap.
document.getElementById('export').addEventListener('click', async () => {
  flushSave();
  const backup = { format: BACKUP_FORMAT, version: 2, exportedAt: new Date().toISOString(), tables: [...tables.values()] };
  const name = `opanchu-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(backup, null, 2)], name, { type: 'application/json' });

  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(file);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

document.getElementById('import').addEventListener('click', () => importFile.click());

importFile.addEventListener('change', async () => {
  const file = importFile.files[0];
  importFile.value = '';
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    const restored = backup.tables;
    const valid = backup.format === BACKUP_FORMAT && Array.isArray(restored) && restored.length > 0
      && restored.every((t) => Number.isInteger(t?.id) && Array.isArray(t.columns) && Array.isArray(t.rows));
    if (!valid) throw new Error('This is not an Opanchu backup file.');
    const years = restored.map((t) => t.id).sort((a, b) => a - b).join(', ');
    if (!confirm(`Replace all your tables with the backup? It contains: ${years}.`)) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    await replaceAll(STORE, restored);
    tables.clear();
    for (const t of restored) tables.set(t.id, t);
    showYear(Number(yearSelect.value));
  } catch (err) {
    alert(`Restore failed: ${err.message}`);
  }
});

async function showStorageStatus() {
  // Asks the browser not to clear this app's data under storage pressure.
  const persisted = await navigator.storage?.persist?.();
  status.textContent = persisted
    ? 'Saved on this device only'
    : 'Saved on this device only · back up regularly';
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');

for (const t of await getAll(STORE)) tables.set(t.id, t);

// Before years were added, the single table was stored as "main". It becomes this year's table.
const legacy = tables.get('main');
if (legacy) {
  tables.delete('main');
  if (!tables.has(DEFAULT_YEAR)) {
    tables.set(DEFAULT_YEAR, { ...legacy, id: DEFAULT_YEAR });
    await put(STORE, tables.get(DEFAULT_YEAR));
  }
  await remove(STORE, 'main');
}

showYear(initialYear());
showStorageStatus();
