import { Camera, Flashlight, ImagePlus, RefreshCcw, SquarePen, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ImageCropModal } from './ImageCropModal';

type CameraViewProps = {
  onCaptured: (file: File) => void;
  onSelected: (file: File) => void;
  onManual: () => void;
  onClose: () => void;
};

export function CameraView({ onCaptured, onSelected, onManual, onClose }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [flash, setFlash] = useState(false);
  const [permission, setPermission] = useState<'loading' | 'granted' | 'denied' | 'unsupported'>('loading');
  const [error, setError] = useState('');
  const [pendingCropFile, setPendingCropFile] = useState<File | null>(null);

  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPermission('unsupported');
        return;
      }
      try {
        streamRef.current?.getTracks().forEach(track => track.stop());
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode, width: { ideal: 1080 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setPermission('granted');
        setError('');
      } catch {
        setPermission('denied');
        setError('Hãy cho phép quyền truy cập Camera hoặc chọn ảnh từ thư viện.');
      }
    };
    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, [facingMode]);

  const capture = () => {
    const video = videoRef.current;
    if (permission === 'granted' && video && video.readyState >= 2) {
      const canvas = document.createElement('canvas');
      const size = Math.min(video.videoWidth || 720, video.videoHeight || 720);
      const sx = ((video.videoWidth || size) - size) / 2;
      const sy = ((video.videoHeight || size) - size) / 2;
      canvas.width = size;
      canvas.height = size;
      canvas.getContext('2d')?.drawImage(video, sx, sy, size, size, 0, 0, size, size);
      canvas.toBlob(
        blob => {
          if (blob) {
            onCaptured(new File([blob], `capmoney-${Date.now()}.jpg`, { type: 'image/jpeg' }));
          } else {
            onManual();
          }
        },
        'image/jpeg',
        0.9,
      );
      return;
    }
    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = 720;
    fallbackCanvas.height = 720;
    const ctx = fallbackCanvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 720, 720);
      grad.addColorStop(0, '#1e2028');
      grad.addColorStop(1, '#101217');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 720, 720);
    }
    fallbackCanvas.toBlob(
      blob => {
        if (blob) {
          onCaptured(new File([blob], `capmoney-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        } else {
          onManual();
        }
      },
      'image/jpeg',
      0.85,
    );
  };

  const toggleFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    if (!capabilities?.torch) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !flash } as MediaTrackConstraintSet] });
      setFlash(value => !value);
    } catch {
      // Ignore unsupported torch constraint
    }
  };

  if (pendingCropFile) {
    return (
      <ImageCropModal
        file={pendingCropFile}
        onCancel={() => setPendingCropFile(null)}
        onConfirm={cropped => {
          setPendingCropFile(null);
          onSelected(cropped);
        }}
      />
    );
  }

  return (
    <div className="cm-camera-modal" onClick={onClose}>
      <div className="cm-camera-sheet" onClick={event => event.stopPropagation()}>
        <div className="cm-camera-card">
          <div className="cm-camera-topbar">
            <button type="button" className="cm-pill-btn" onClick={onClose}>
              Hủy
            </button>
            <div className="cm-capture-top-right">
              <button
                type="button"
                className={`cm-flash-btn ${flash ? 'active' : ''}`}
                onClick={() => void toggleFlash()}
                aria-label="Đèn flash"
              >
                <Flashlight size={15} />
              </button>
              <span className="cm-quota-badge">
                <SquarePen size={13} /> 3/3
              </span>
            </div>
          </div>

          {permission === 'granted' ? (
            <video ref={videoRef} playsInline muted className="cm-camera-video" />
          ) : (
            <div className="cm-camera-fallback">
              <Camera size={38} />
              <strong>
                {permission === 'loading'
                  ? 'Đang mở camera…'
                  : permission === 'denied'
                    ? 'Chưa cấp quyền Camera'
                    : 'Thiết bị không có Camera'}
              </strong>
              <p>{error || 'Bấm nút chụp bên dưới hoặc chọn ảnh từ thư viện để tiếp tục nhập số tiền.'}</p>
              <button type="button" className="cm-library-pill" onClick={() => inputRef.current?.click()}>
                <ImagePlus size={16} /> Chọn ảnh từ thư viện
              </button>
            </div>
          )}
        </div>

        <div className="cm-camera-actions">
          <button
            type="button"
            className="cm-cam-side-btn"
            onClick={() => inputRef.current?.click()}
            aria-label="Chọn ảnh từ thư viện"
          >
            <ImagePlus size={22} />
            <span>Thư viện</span>
          </button>

          <button
            type="button"
            className="cm-shutter-btn"
            onClick={capture}
            aria-label="Chụp ảnh"
          >
            <span className="cm-shutter-inner" />
          </button>

          <button
            type="button"
            className="cm-cam-side-btn"
            onClick={() => setFacingMode(v => (v === 'environment' ? 'user' : 'environment'))}
            aria-label="Đổi camera"
          >
            <RefreshCcw size={22} />
            <span>Đổi cam</span>
          </button>
        </div>

        <button type="button" className="cm-skip-camera" onClick={onManual}>
          Nhập giá tiền không cần chụp ảnh <X size={13} style={{ display: 'none' }} />
        </button>

        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={event => {
            const file = event.target.files?.[0];
            if (file) setPendingCropFile(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}
