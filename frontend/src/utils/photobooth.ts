export const BOOTH_THEMES = {
  dark: { label: 'Film đen', background: '#111522', glow: '#252a41', paper: '#262b40', ink: '#f5f2ff', accent: '#c4b3ff' },
  pink: { label: 'Đào pastel', background: '#ffe4ed', glow: '#fff5f8', paper: '#fff9fc', ink: '#692e4d', accent: '#af497c' },
  neon: { label: 'Tím neon', background: '#151334', glow: '#31255e', paper: '#282548', ink: '#f5e9ff', accent: '#e3b1ff' },
  retro: { label: 'Kem retro', background: '#f3dbaf', glow: '#fff4dc', paper: '#fff8e9', ink: '#593a23', accent: '#985b32' },
  matcha: { label: 'Matcha', background: '#dae7be', glow: '#f6f9ea', paper: '#fcfdf6', ink: '#354728', accent: '#55773c' },
  sky: { label: 'Mây xanh', background: '#d4eafd', glow: '#f3fbff', paper: '#f9fdff', ink: '#243d63', accent: '#5279b0' },
} as const;

export const BOOTH_BORDERS = {
  plain: { label: 'Viền trơn', mark: '○', fill: '#b5a7c4', center: '#fff' },
  hearts: { label: 'Tim hồng', mark: '♡', fill: '#ed7eab', center: '#ffe2f0' },
  bows: { label: 'Nơ xinh', mark: '🎀', fill: '#dd91c6', center: '#ffedf8' },
  daisies: { label: 'Hoa cúc', mark: '✿', fill: '#fff2c8', center: '#eeac49' },
  stars: { label: 'Lấp lánh', mark: '✦', fill: '#ffc962', center: '#fff4d2' },
  clouds: { label: 'Mây bông', mark: '☁', fill: '#b2daf4', center: '#f3fbff' },
  confetti: { label: 'Kẹo bi', mark: '●', fill: '#b79ae9', center: '#ffc1d4' },
} as const;

export const BOOTH_EFFECTS = {
  original: 'Ảnh gốc', warm: 'Nắng ấm', cool: 'Xanh mát', mono: 'Đen trắng',
  soft: 'Mơ màng', retro: 'Nâu cổ điển', vivid: 'Rực rỡ',
} as const;

export type BoothTheme = keyof typeof BOOTH_THEMES;
export type BoothBorder = keyof typeof BOOTH_BORDERS;
export type BoothEffect = keyof typeof BOOTH_EFFECTS;
export type BoothRatio = 'source' | 'portrait' | 'landscape';

export type BoothPhoto = { id: string; src: string; label: string; date?: string; amount?: string };
type LoadedPhoto = BoothPhoto & { image: HTMLImageElement };
type Size = { width: number; height: number };
type Rect = Size & { x: number; y: number };
type PhotoLayout = { frame: Rect; image: Rect };
type BoothOptions = { ratio: BoothRatio; slots: 4 | 8; theme: BoothTheme; border: BoothBorder; effect: BoothEffect };

export async function loadBoothImage(source: string) {
  const url = new URL(source, location.href);
  if (!['data:', 'blob:', 'https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported image URL');
  const image = new Image();
  if (url.origin !== location.origin && (url.protocol === 'https:' || url.protocol === 'http:')) image.crossOrigin = 'anonymous';
  image.src = url.href;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty image');
  return image;
}

function boothLayout(images: HTMLImageElement[], options: BoothOptions) {
  const singleSource = images.length === 1 && options.ratio === 'source';
  const first = images[0];
  const longestEdge = Math.max(first.naturalWidth, first.naturalHeight);
  const naturalScale = longestEdge > 2400 ? 2400 / longestEdge : Math.max(1, Math.floor(1440 / longestEdge));
  const width = singleSource ? Math.max(1, Math.round(first.naturalWidth * naturalScale)) : 1440;
  const fixedHeight = singleSource ? Math.max(1, Math.round(first.naturalHeight * naturalScale))
    : options.ratio === 'portrait' ? width * 16 / 9 : options.ratio === 'landscape' ? width * 9 / 16 : 0;
  const unit = Math.min(width, fixedHeight || width) / 1200;
  const margin = 36 * unit;
  const gap = 22 * unit;
  const inset = 20 * unit;
  const header = 91 * unit;
  const footer = 50 * unit;
  const caption = 61 * unit;
  const columns = images.length === 1 ? 1 : options.slots === 8 && options.ratio === 'landscape' ? 4 : 2;
  const rowCount = Math.ceil(images.length / columns);
  const maxHeight = fixedHeight
    ? (fixedHeight - header - footer - (rowCount - 1) * gap) / rowCount - 2 * inset - caption
    : 990 * unit;
  const layouts: PhotoLayout[] = [];
  let y = header;

  for (let start = 0; start < images.length; start += columns) {
    const ratios = images.slice(start, start + columns).map(image => image.naturalWidth / image.naturalHeight);
    const availableWidth = width - 2 * margin - (ratios.length - 1) * gap - 2 * inset * ratios.length;
    const imageHeight = Math.min(maxHeight, availableWidth / ratios.reduce((sum, ratio) => sum + ratio, 0));
    const rowWidth = ratios.reduce((sum, ratio) => sum + imageHeight * ratio + 2 * inset, 0) + (ratios.length - 1) * gap;
    let x = (width - rowWidth) / 2;
    for (const ratio of ratios) {
      const imageWidth = imageHeight * ratio;
      const frame = { x, y, width: imageWidth + 2 * inset, height: imageHeight + 2 * inset + caption };
      layouts.push({ frame, image: { x: x + inset, y: y + inset, width: imageWidth, height: imageHeight } });
      x += frame.width + gap;
    }
    y += imageHeight + 2 * inset + caption + gap;
  }
  const naturalHeight = y - gap + footer;
  const height = fixedHeight || Math.ceil(naturalHeight);
  const shift = (height - naturalHeight) / 2;
  for (const layout of layouts) {
    layout.frame.y += shift;
    layout.image.y += shift;
  }
  return { width, height, margin, unit, inset, layouts };
}

// Apply the effect to the photo pixels only, including on browsers without canvas filters.
function photoEffect(ctx: CanvasRenderingContext2D, rect: Rect, scale: number, effect: BoothEffect) {
  if (effect === 'original') return;
  const x = Math.ceil(rect.x * scale);
  const y = Math.ceil(rect.y * scale);
  const width = Math.floor((rect.x + rect.width) * scale) - x;
  const height = Math.floor((rect.y + rect.height) * scale) - y;
  if (width < 1 || height < 1) return;
  const pixels = ctx.getImageData(x, y, width, height);
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const luma = .213 * r + .715 * g + .072 * b;
    switch (effect) {
      case 'warm': data[i] = r * 1.06 + 7; data[i + 1] = g * 1.02 + 3; data[i + 2] = b * .89; break;
      case 'cool': data[i] = r * .88; data[i + 1] = g * 1.02 + 5; data[i + 2] = b * 1.08 + 7; break;
      case 'mono': data[i] = data[i + 1] = data[i + 2] = luma; break;
      case 'soft': data[i] = r * .78 + 34; data[i + 1] = g * .78 + 29; data[i + 2] = b * .78 + 38; break;
      case 'retro': data[i] = luma * 1.04 + 23; data[i + 1] = luma * .91 + 18; data[i + 2] = luma * .71 + 15; break;
      case 'vivid': data[i] = luma + (r - luma) * 1.5; data[i + 1] = luma + (g - luma) * 1.5; data[i + 2] = luma + (b - luma) * 1.5; break;
    }
  }
  ctx.putImageData(pixels, x, y);
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawSticker(ctx: CanvasRenderingContext2D, border: Exclude<BoothBorder, 'plain'>, x: number, y: number, size: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const { fill, center } = BOOTH_BORDERS[border];
  ctx.fillStyle = fill;
  ctx.beginPath();
  switch (border) {
    case 'hearts':
      ctx.moveTo(0, .9);
      ctx.bezierCurveTo(-2.15, -.6, -1, -1.65, 0, -.65);
      ctx.bezierCurveTo(1, -1.65, 2.15, -.6, 0, .9);
      ctx.fill();
      break;
    case 'bows':
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-1.45, -1.5, -1.38, -.2);
      ctx.quadraticCurveTo(-1.6, 1.2, 0, .2);
      ctx.quadraticCurveTo(1.6, 1.2, 1.38, -.2);
      ctx.quadraticCurveTo(1.45, -1.5, 0, 0);
      ctx.fill();
      ctx.fillStyle = center;
      circle(ctx, 0, 0, .31);
      break;
    case 'daisies':
      for (let i = 0; i < 6; i++) circle(ctx, Math.cos(i * Math.PI / 3) * .65, Math.sin(i * Math.PI / 3) * .65, .42);
      ctx.fillStyle = center;
      circle(ctx, 0, 0, .41);
      break;
    case 'stars':
      ctx.moveTo(0, -1.25);
      ctx.quadraticCurveTo(.19, -.18, 1.25, 0);
      ctx.quadraticCurveTo(.19, .18, 0, 1.25);
      ctx.quadraticCurveTo(-.19, .18, -1.25, 0);
      ctx.quadraticCurveTo(-.19, -.18, 0, -1.25);
      ctx.fill();
      break;
    case 'clouds':
      circle(ctx, -.64, .12, .55);
      circle(ctx, .01, -.25, .74);
      circle(ctx, .67, .14, .5);
      ctx.fillStyle = center;
      circle(ctx, .05, -.45, .27);
      break;
    case 'confetti':
      circle(ctx, -.55, .32, .42);
      circle(ctx, .54, .45, .24);
      ctx.fillStyle = center;
      circle(ctx, .38, -.46, .42);
      break;
  }
  ctx.restore();
}

export function renderPhotobooth(canvas: HTMLCanvasElement, photos: LoadedPhoto[], options: BoothOptions) {
  if (!photos.length) return;
  const { width, height, margin, unit, inset, layouts } = boothLayout(photos.map(photo => photo.image), options);
  const scale = Math.min(1, 2400 / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.scale(scale, scale);
  ctx.imageSmoothingQuality = 'high';
  const theme = BOOTH_THEMES[options.theme];
  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, theme.glow);
  background.addColorStop(1, theme.background);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = theme.ink;
  ctx.font = `700 ${35 * unit}px sans-serif`;
  ctx.fillText('CAPMONEY LIFE4CUTS', margin, 53 * unit, width - 2 * margin);

  for (const [index, { frame, image }] of layouts.entries()) {
    const photo = photos[index];
    ctx.fillStyle = theme.paper;
    ctx.fillRect(frame.x, frame.y, frame.width, frame.height);
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 1.5 * unit;
    ctx.strokeRect(frame.x, frame.y, frame.width, frame.height);
    ctx.drawImage(photo.image, image.x, image.y, image.width, image.height);
    photoEffect(ctx, image, scale, options.effect);
    const textWidth = frame.width - 2 * inset;
    const captionY = image.y + image.height;
    if (textWidth > 32 * unit) {
      ctx.fillStyle = theme.ink;
      ctx.font = `700 ${22 * unit}px sans-serif`;
      ctx.fillText(photo.amount ?? photo.label, image.x, captionY + 32 * unit, textWidth);
      if (photo.amount || photo.date) {
        ctx.fillStyle = theme.accent;
        ctx.font = `${17 * unit}px sans-serif`;
        ctx.fillText(photo.amount ? [photo.label, photo.date].filter(Boolean).join(' · ') : photo.date!, image.x, captionY + 57 * unit, textWidth);
      }
    }
    const border = options.border;
    if (border !== 'plain') {
      const edge = inset / 2;
      const size = edge * .87;
      drawSticker(ctx, border, frame.x + edge, frame.y + edge, size);
      drawSticker(ctx, border, frame.x + frame.width - edge, frame.y + edge, size);
      drawSticker(ctx, border, frame.x + frame.width - edge, frame.y + frame.height - edge, size);
    }
  }
  ctx.fillStyle = theme.accent;
  ctx.font = `600 ${18 * unit}px sans-serif`;
  ctx.fillText(`${photos.length} ảnh · CapMoney`, margin, height - 18 * unit, width - 2 * margin);
}
