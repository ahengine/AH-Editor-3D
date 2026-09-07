/** Minimal IndexedDB wrapper: project JSON + binary asset blobs. */

const DB_NAME = 'ahengine'
const DB_VERSION = 1
const PROJECT_STORE = 'projects'
const BLOB_STORE = 'blobs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE)
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode)
    const request = run(tx.objectStore(storeName))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
  })
}

export async function idbPutProject(key: string, data: unknown): Promise<void> {
  await withStore(PROJECT_STORE, 'readwrite', (store) => store.put(data, key))
}

export async function idbGetProject<T>(key: string): Promise<T | undefined> {
  return withStore(PROJECT_STORE, 'readonly', (store) => store.get(key) as IDBRequest<T | undefined>)
}

export async function idbDeleteProject(key: string): Promise<void> {
  await withStore(PROJECT_STORE, 'readwrite', (store) => store.delete(key))
}

export async function idbPutBlob(key: string, blob: Blob): Promise<void> {
  await withStore(BLOB_STORE, 'readwrite', (store) => store.put(blob, key))
}

export async function idbGetBlob(key: string): Promise<Blob | undefined> {
  return withStore(BLOB_STORE, 'readonly', (store) => store.get(key) as IDBRequest<Blob | undefined>)
}

export async function idbDeleteBlob(key: string): Promise<void> {
  await withStore(BLOB_STORE, 'readwrite', (store) => store.delete(key))
}
