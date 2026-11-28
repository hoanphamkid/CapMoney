import { MAX_WALLPAPER_DATA_LENGTH } from '../constants/appearance';

export async function encodeWallpaper(file: File): Promise<string> {
  if (file.size > 25 * 1024 * 1024) throw new Error('Vui lòng chọn ảnh nhỏ hơn hoặc bằng 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => { throw new Error('Không đọc được ảnh. Hãy thử ảnh JPG, PNG hoặc WebP.'); });
    const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thiết bị chưa thể xử lý ảnh nền.');
    context.fillStyle = '#e9eaf0';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.84, .68, .5, .35]) {
      const src = canvas.toDataURL('image/jpeg', quality);
      if (src.startsWith('data:image/jpeg;base64,') && src.length <= MAX_WALLPAPER_DATA_LENGTH) return src;
    }
    throw new Error('Không thể thu nhỏ ảnh này. Hãy thử một ảnh khác.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
