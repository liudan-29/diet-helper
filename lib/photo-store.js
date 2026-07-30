const DATABASE_NAME = "diet-helper-photos";
const STORE_NAME = "photos";
const MAX_BYTES = 2 * 1024 * 1024;

export async function preparePhoto(file) {
  if (!(file instanceof File) || !file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let quality = 0.86;
  let blob = await canvasToBlob(canvas, quality);
  while (blob.size > MAX_BYTES && quality > 0.42) {
    quality -= 0.1;
    blob = await canvasToBlob(canvas, quality);
  }
  if (blob.size > MAX_BYTES) throw new Error("照片压缩后仍超过2MB");
  return blob;
}

export async function savePhoto(id, blob) {
  const database = await openDatabase();
  await transactionPromise(
    database,
    "readwrite",
    (store) => store.put({ id, blob, createdAt: new Date().toISOString() })
  );
  return id;
}

export async function getPhoto(id) {
  if (!id) return null;
  const database = await openDatabase();
  return transactionPromise(database, "readonly", (store) => store.get(id));
}

export async function deletePhoto(id) {
  if (!id) return;
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.delete(id));
}

export async function clearPhotos() {
  const database = await openDatabase();
  await transactionPromise(database, "readwrite", (store) => store.clear());
}

export function photoObjectUrl(record) {
  return record?.blob ? URL.createObjectURL(record.blob) : "";
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("照片压缩失败"))),
      "image/jpeg",
      quality
    );
  });
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("浏览器不支持照片存储"));
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("照片存储不可用"));
  });
}

function transactionPromise(database, mode, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    let result;
    let settled = false;
    let request;
    const fail = () => {
      if (settled) return;
      settled = true;
      database.close();
      reject(new Error("照片存储事务失败"));
    };
    try {
      request = action(transaction.objectStore(STORE_NAME));
    } catch {
      transaction.abort();
      fail();
      return;
    }
    request.onsuccess = () => {
      result = request.result;
    };
    request.onerror = () => {
      // 由事务error或abort统一拒绝，避免请求成功前误报事务完成。
    };
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      resolve(result);
    };
    transaction.onerror = fail;
    transaction.onabort = fail;
  });
}
