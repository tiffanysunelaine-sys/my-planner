(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.RecipeImages = api;
})(globalThis, function () {
  const DB_NAME = 'my-planner-images';
  const STORE = 'images';
  const validRecord = record => record && typeof record.id === 'string' && record.id.trim()
    && typeof record.dataUrl === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(record.dataUrl);
  const validateBackupImages = records => Array.isArray(records) && records.every(validRecord);
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('图片数据库无法打开'));
    });
  }
  async function withStore(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const result = action(transaction.objectStore(STORE));
      transaction.oncomplete = () => { db.close(); resolve(result); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error('图片数据库操作失败')); };
    });
  }
  const fileToDataUrl = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(file); });
  async function shrink(file) {
    const source = await fileToDataUrl(file);
    const image = new Image(); image.src = source;
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('无法识别这张图片')); });
    const largest = Math.max(image.width, image.height);
    if (largest <= 1000) return source;
    const ratio = 1000 / largest; const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  }
  async function put(id, file) { if (!file || !['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)) throw new Error('请选择 PNG、JPG、WebP 或 GIF 图片'); const dataUrl = await shrink(file); await withStore('readwrite', store => store.put({ id, dataUrl })); return dataUrl; }
  async function get(id) { const db = await open(); return new Promise((resolve, reject) => { const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id); request.onsuccess = () => { db.close(); resolve(request.result ? request.result.dataUrl : null); }; request.onerror = () => { db.close(); reject(request.error || new Error('图片读取失败')); }; }); }
  async function remove(id) { await withStore('readwrite', store => store.delete(id)); }
  async function exportAll() { const db = await open(); return new Promise((resolve, reject) => { const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); request.onsuccess = () => { db.close(); resolve(request.result || []); }; request.onerror = () => { db.close(); reject(request.error || new Error('图片导出失败')); }; }); }
  async function restore(records) { if (!validateBackupImages(records)) throw new Error('备份中的图片格式不正确'); await withStore('readwrite', store => { store.clear(); records.forEach(record => store.put(record)); }); }
  return { put, get, remove, exportAll, restore, validateBackupImages };
});
