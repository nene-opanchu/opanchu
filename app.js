import { get, put } from './db.js';

const STORE = 'tables';
const TABLE_ID = 'main';
const BACKUP_FORMAT = 'opanchu-backup';

const wrap = document.getElementById('table-wrap');
const grid = document.getElementById('grid');
const thead = grid.tHead;
const tbody = grid.tBodies[0];
const empty = document.getElementById('empty');
const status = document.getElementById('status');
const importFile = document.getElementById('import-file');

const colDialog = document.getElementById('col-dialog');
const colName = document.getElementById('col-name');
const colLeft = document.getElementById('col-left');
const colRight = document.getElementById('col-right');

const rowDialog = document.getElementById('row-dialog');
const rowTitle = document.getElementById('row-title');
const rowUp = document.getElementById('row-up');
const rowDown = document.getElementById('row-down');

// Table shape: { id, columns: [{ id, name, type: 'text' | 'check' }], rows: [{ id, cells: { [columnId]: string | boolean } }] }
let table;

const newId = () => crypto.randomUUID();
const newRow = () => ({ id: newId(), cells: {} });
const label = (col) => col.name.trim() || 'Untitled';

function newTable() {
  return {
    id: TABLE_ID,
    columns: [
      { id: newId(), name: 'Item', type: 'text' },
      { id: newId(), name: 'Done', type: 'check' },
    ],
    rows: [newRow(), newRow(), newRow()],
  };
}

// The whole table is one IndexedDB record. Typing is saved after a short pause.
let saveTimer;

function save() {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  put(STORE, table).catch((err) => alert(`Could not save: ${err.message}`));
}

function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

// iOS can close a backgrounded app without warning, so flush pending edits first.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && saveTimer) save();
});

function commit() {
  render();
  save();
}

function move(list, index, by) {
  const [item] = list.splice(index, 1);
  list.splice(index + by, 0, item);
}

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
  autosize(...tbody.querySelectorAll('textarea'));
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
    const text = document.createElement('textarea');
    text.rows = 1;
    text.value = typeof value === 'string' ? value : '';
    text.dataset.col = col.id;
    text.setAttribute('aria-label', label(col));
    td.append(text);
  }
  return td;
}

// Grow text cells to fit their content. Reads are batched to avoid a reflow per cell.
function autosize(...areas) {
  for (const area of areas) area.style.height = 'auto';
  const heights = areas.map((area) => area.scrollHeight);
  areas.forEach((area, i) => { area.style.height = `${heights[i]}px`; });
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
  autosize(e.target);
  onCellEdit(e.target);
});

grid.addEventListener('change', (e) => {
  if (e.target.type === 'checkbox') onCellEdit(e.target);
});

grid.addEventListener('click', (e) => {
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
  const backup = { format: BACKUP_FORMAT, version: 1, exportedAt: new Date().toISOString(), table };
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
    const restored = backup.table;
    if (backup.format !== BACKUP_FORMAT || !Array.isArray(restored?.columns) || !Array.isArray(restored?.rows)) {
      throw new Error('This is not an Opanchu backup file.');
    }
    const summary = `${restored.columns.length} columns, ${restored.rows.length} rows`;
    if (!confirm(`Replace the current table with the backup (${summary})?`)) return;
    table = { ...restored, id: TABLE_ID };
    commit();
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

table = (await get(STORE, TABLE_ID)) ?? newTable();
render();
showStorageStatus();
