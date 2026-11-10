import { Check, Maximize2, Minimize2, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';

type ImageCropModalProps = {
  file: File;
  onCancel: () => void;
  onConfirm: (croppedFile: File) => void;
};

export function ImageCropModal({ file, onCancel, onConfirm }: ImageCropModalProps) {
  const [imageUrl, setImageUrl] = useState('');
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const [rotation, setRotation] = useState(0); // 0, 90, 180, 270
  const [zoom, setZoom] = useState(1);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('cover');
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    const img = new Image();
    img.onload = () => {
      setImgEl(img);
      setOffset({ x: 0, y: 0 });
      setZoom(1);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      startX: offset.x,
      startY: offset.y,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const dx = event.clientX - dragStartRef.current.x;
    const dy = event.clientY - dragStartRef.current.y;
    setOffset({
      x: dragStartRef.current.startX + dx,
      y: dragStartRef.current.startY + dy,
    });
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  const rotateRight = () => {
    setRotation(r => (r + 90) % 360);
    setOffset({ x: 0, y: 0 });
  };

  const toggleFitMode = () => {
    setFitMode(mode => (mode === 'cover' ? 'contain' : 'cover'));
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const resetTransform = () => {
    setRotation(0);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setFitMode('cover');
  };

  // Calculate base dimensions inside the preview stage
  const stageSize = stageRef.current?.clientWidth || 320;
  let baseWidth = stageSize;
  let baseHeight = stageSize;
  if (imgEl) {
    const isRotated = rotation % 180 !== 0;
    const naturalW = isRotated ? imgEl.naturalHeight : imgEl.naturalWidth;
    const naturalH = isRotated ? imgEl.naturalWidth : imgEl.naturalHeight;
    const scale =
      fitMode === 'cover'
        ? Math.max(stageSize / naturalW, stageSize / naturalH)
        : Math.min(stageSize / naturalW, stageSize / naturalH);
    // Keep unrotated element dimensions so CSS rotate works around center
    baseWidth = imgEl.naturalWidth * scale;
    baseHeight = imgEl.naturalHeight * scale;
  }

  const applyCrop = () => {
    if (!imgEl) {
      onConfirm(file);
      return;
    }
    const outputSize = 900;
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      onConfirm(file);
      return;
    }

    // Dark background in case user zoomed out or used 'contain' mode
    ctx.fillStyle = '#14161d';
    ctx.fillRect(0, 0, outputSize, outputSize);

    const ratio = outputSize / stageSize;
    const isRotated = rotation % 180 !== 0;
    const naturalW = isRotated ? imgEl.naturalHeight : imgEl.naturalWidth;
    const naturalH = isRotated ? imgEl.naturalWidth : imgEl.naturalHeight;
    const baseScale =
      fitMode === 'cover'
        ? Math.max(outputSize / naturalW, outputSize / naturalH)
        : Math.min(outputSize / naturalW, outputSize / naturalH);

    const drawW = imgEl.naturalWidth * baseScale * zoom;
    const drawH = imgEl.naturalHeight * baseScale * zoom;

    ctx.save();
    ctx.translate(outputSize / 2 + offset.x * ratio, outputSize / 2 + offset.y * ratio);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(imgEl, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();

    canvas.toBlob(
      blob => {
        if (blob) {
          onConfirm(new File([blob], `capmoney-crop-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        } else {
          onConfirm(file);
        }
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div className="cm-crop-overlay" onClick={onCancel}>
      <div className="cm-crop-modal" onClick={e => e.stopPropagation()}>
        <header className="cm-crop-header">
          <button type="button" className="cm-crop-icon-btn" onClick={onCancel} aria-label="Hủy cắt ảnh">
            <X size={20} />
          </button>
          <div>
            <strong>Căn chỉnh & Cắt ảnh</strong>
            <small>Kéo ảnh hoặc phóng to/thu nhỏ cho vừa khung</small>
          </div>
          <button type="button" className="cm-crop-confirm-top" onClick={applyCrop} aria-label="Xác nhận">
            <Check size={20} />
          </button>
        </header>

        <div
          ref={stageRef}
          className="cm-crop-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Ảnh cần cắt"
              draggable={false}
              className="cm-crop-image"
              style={{
                width: `${baseWidth}px`,
                height: `${baseHeight}px`,
                transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${zoom})`,
              }}
            />
          )}
          <div className="cm-crop-grid-lines" />
        </div>

        <div className="cm-crop-zoom-row">
          <button
            type="button"
            className="cm-crop-mini-btn"
            onClick={() => setZoom(z => Math.max(0.4, Number((z - 0.15).toFixed(2))))}
            aria-label="Thu nhỏ"
          >
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min="0.4"
            max="3"
            step="0.05"
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            className="cm-crop-slider"
          />
          <button
            type="button"
            className="cm-crop-mini-btn"
            onClick={() => setZoom(z => Math.min(3, Number((z + 0.15).toFixed(2))))}
            aria-label="Phóng to"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <div className="cm-crop-tools">
          <button type="button" className="cm-crop-tool-btn" onClick={rotateRight}>
            <RotateCw size={16} />
            <span>Xoay 90°</span>
          </button>
          <button type="button" className="cm-crop-tool-btn" onClick={toggleFitMode}>
            {fitMode === 'cover' ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{fitMode === 'cover' ? 'Vừa toàn ảnh' : 'Lấp đầy khung'}</span>
          </button>
          <button type="button" className="cm-crop-tool-btn" onClick={resetTransform}>
            <RotateCcw size={16} />
            <span>Đặt lại</span>
          </button>
        </div>

        <button type="button" className="cm-crop-submit-btn" onClick={applyCrop}>
          <Check size={18} /> Dùng ảnh này
        </button>
      </div>
    </div>
  );
}
