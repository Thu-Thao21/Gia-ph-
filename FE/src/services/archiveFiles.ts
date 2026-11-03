/** Persist the original files separately from the library's local metadata. */
interface StoredArchiveFile {
  blob: Blob;
  name: string;
}

function openFiles(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('mfgms-archive-files', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('files');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function fileOperation<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openFiles();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction('files', mode);
      const request = operation(transaction.objectStore('files'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error);
      transaction.onerror = () => reject(transaction.error || request.error);
    });
  } finally {
    db.close();
  }
}

export async function saveArchiveFile(id: string, file: File): Promise<void> {
  await fileOperation('readwrite', store => store.put({ blob: file, name: file.name } satisfies StoredArchiveFile, id));
}

export function readArchiveFile(id: string): Promise<StoredArchiveFile | undefined> {
  return fileOperation('readonly', store => store.get(id));
}

export async function removeArchiveFile(id: string): Promise<void> {
  await fileOperation('readwrite', store => store.delete(id));
}
