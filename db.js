// Small promise wrapper around IndexedDB. All data stays in the browser on this device.

const DB_NAME = 'opanchu';
const DB_VERSION = 2;

let dbPromise;

function openDB() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // Add new object stores here and bump DB_VERSION when the data model grows.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('tables')) db.createObjectStore('tables', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    let req;
    try {
      req = fn(tx.objectStore(store));
    } catch (err) {
      // Abort so a half-applied write (e.g. clear() then a bad put()) is rolled back.
      tx.abort();
      reject(err);
      return;
    }
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

export const getAll = (store) => run(store, 'readonly', (s) => s.getAll());
export const put = (store, value) => run(store, 'readwrite', (s) => s.put(value));
export const remove = (store, key) => run(store, 'readwrite', (s) => s.delete(key));

export const replaceAll = (store, values) =>
  run(store, 'readwrite', (s) => {
    s.clear();
    for (const value of values) s.put(value);
  });
