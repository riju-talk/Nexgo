import { apiFetch } from '@/lib/api';

const MAX_BYTES = 3 * 1024 * 1024;

// Reads a browser File and stores it for the signed-in seller; resolves to the saved file record.
export async function uploadSellerFile(purpose, file) {
  if (file.size > MAX_BYTES) throw new Error('File must be under 3 MB');
  const dataBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('The file could not be read'));
    reader.readAsDataURL(file);
  });
  return apiFetch('/v1/seller/files', { method: 'POST', body: { purpose, filename: file.name, dataBase64 } });
}

export async function openSellerFile(fileId, admin = false) {
  const { url } = await apiFetch(admin ? `/v1/admin/files/${fileId}/url` : `/v1/seller/files/${fileId}/url`);
  window.open(url, '_blank', 'noopener');
}
