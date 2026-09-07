/** Thin IndexedDB blob shim (runtime-side, avoids editor-core dependency). */

const DB_NAME = 'ahengine'
const BLOB_STORE = 'blobs'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE)
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects')
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function idbGetBlob(key: string): Promise<Blob | undefined> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readonly')
    const request = tx.objectStore(BLOB_STORE).get(key)
    request.onsuccess = () => { db.close(); resolve(request.result as Blob | undefined) }
    request.onerror = () => { db.close(); reject(request.error) }
  })
}

export async function idbPutBlob(key: string, blob: Blob): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BLOB_STORE, 'readwrite')
    tx.objectStore(BLOB_STORE).put(blob, key)
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}
