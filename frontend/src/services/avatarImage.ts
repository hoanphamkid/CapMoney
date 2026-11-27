export async function encodeAvatar(file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error('Ảnh đại diện phải nhỏ hơn hoặc bằng 10 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error('Không đọc được ảnh này. Hãy thử chọn ảnh JPG, PNG hoặc WebP.');
    });

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Thiết bị chưa thể xử lý ảnh đại diện.');
    const square = Math.min(image.naturalWidth, image.naturalHeight);
    context.fillStyle = '#f4f5f8';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (image.naturalWidth - square) / 2, (image.naturalHeight - square) / 2, square, square, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}
