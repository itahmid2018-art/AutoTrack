import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  X,
  SwitchCamera,
  ScanBarcode,
  QrCode,
  AlertCircle,
  Loader2,
  Upload,
  Flashlight,
  RefreshCw,
} from 'lucide-react';
import {
  BarcodeScanResult,
  normalizeScannedSerial,
  parseProductQrPayload,
} from '../utils/barcodeSerialParser';
import { resolveApiUrl } from '../utils/apiBase';

interface SerialBarcodeScannerModalProps {
  onDetected: (result: BarcodeScanResult) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  prioritizeQr?: boolean;
}

const DEFAULT_BARCODE_FORMATS = [
  'qr_code',
  'data_matrix',
  'code_128',
  'code_39',
  'code_93',
  'codabar',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'aztec',
  'pdf417',
];

export const SerialBarcodeScannerModal: React.FC<SerialBarcodeScannerModalProps> = ({
  onDetected,
  onClose,
  title = 'Scan Tool QR / Serial Barcode',
  subtitle = 'Supports QR codes, DataMatrix, Code 128, Code 39, EAN, and nameplate labels',
  prioritizeQr = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const isScanningFrameRef = useRef(false);
  const hasDetectedRef = useRef(false);

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [hardwareDetectorActive, setHardwareDetectorActive] = useState(false);
  const [isAnalyzingSnapshot, setIsAnalyzingSnapshot] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Requesting camera permission...');

  const stopCameraResources = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setTorchSupported(false);
    setTorchEnabled(false);
  }, []);

  const finishWithDetection = useCallback(
    (result: BarcodeScanResult) => {
      if (hasDetectedRef.current) return;
      hasDetectedRef.current = true;
      stopCameraResources();
      onDetected(result);
    },
    [onDetected, stopCameraResources]
  );

  const buildResultFromRaw = useCallback(
    (rawValue: string, format: string, method: BarcodeScanResult['method']): BarcodeScanResult => {
      const parsed = parseProductQrPayload(rawValue);
      return {
        serialNumber: normalizeScannedSerial(rawValue),
        rawValue,
        format,
        method,
        detectedModelNumber: parsed.modelNumber,
        detectedSku: parsed.sku,
        detectedBrand: parsed.brand,
      };
    },
    []
  );

  const createBarcodeDetector = useCallback(async () => {
    const DetectorCtor = (window as any).BarcodeDetector;
    if (!DetectorCtor) return null;

    const orderedFormats = prioritizeQr
      ? DEFAULT_BARCODE_FORMATS
      : [
          'code_128',
          'code_39',
          'code_93',
          'codabar',
          'ean_13',
          'ean_8',
          'upc_a',
          'upc_e',
          'itf',
          'qr_code',
          'data_matrix',
          'aztec',
          'pdf417',
        ];

    try {
      if (typeof DetectorCtor.getSupportedFormats === 'function') {
        const supported: string[] = await DetectorCtor.getSupportedFormats();
        const usable = orderedFormats.filter((fmt) => supported.includes(fmt));
        if (usable.length > 0) {
          return new DetectorCtor({ formats: usable });
        }
      }
      return new DetectorCtor();
    } catch {
      try {
        return new DetectorCtor();
      } catch {
        return null;
      }
    }
  }, [prioritizeQr]);

  const startCamera = useCallback(
    async (requestedFacing: 'environment' | 'user') => {
      stopCameraResources();
      setCameraError(null);
      setStatusMessage('Initializing camera stream...');

      if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Live camera API is unavailable in this browser context. Use "Upload / Mobile Camera Photo" below.'
        );
        setStatusMessage('Camera unavailable');
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: requestedFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        streamRef.current = stream;

        const videoEl = videoRef.current;
        if (videoEl) {
          videoEl.srcObject = stream;
          await videoEl.play().catch(() => {});
        }

        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
          setTorchSupported(Boolean(caps?.torch));
        }

        setFacingMode(requestedFacing);
        setCameraReady(true);

        const detector = await createBarcodeDetector();
        if (detector) {
          setHardwareDetectorActive(true);
          setStatusMessage('Point camera at product QR code or serial barcode for auto-scan');

          scanTimerRef.current = window.setInterval(async () => {
            if (hasDetectedRef.current || isScanningFrameRef.current) return;
            const currentVideo = videoRef.current;
            if (!currentVideo || currentVideo.readyState < 2 || currentVideo.videoWidth === 0) return;

            isScanningFrameRef.current = true;
            try {
              const barcodes = await detector.detect(currentVideo);
              if (Array.isArray(barcodes) && barcodes.length > 0) {
                const hit = barcodes.find((b: any) => typeof b.rawValue === 'string' && b.rawValue.trim());
                if (hit) {
                  const resObj = buildResultFromRaw(
                    hit.rawValue,
                    String(hit.format || 'barcode').toUpperCase(),
                    'Hardware BarcodeDetector'
                  );
                  if (resObj.serialNumber || resObj.detectedSku || resObj.rawValue) {
                    finishWithDetection(resObj);
                  }
                }
              }
            } catch {
              // Ignore transient frame detection errors while camera settles
            } finally {
              isScanningFrameRef.current = false;
            }
          }, 180);
        } else {
          setHardwareDetectorActive(false);
          setStatusMessage('Live auto-detector unavailable in this browser. Align QR/label and click Capture & Read Label.');
        }
      } catch (err: any) {
        const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError';
        setCameraError(
          denied
            ? 'Camera permission denied. Allow camera access in browser settings or upload a QR/barcode photo below.'
            : `Unable to start camera (${err?.message || 'no camera detected'}). Upload a QR/barcode photo below.`
        );
        setStatusMessage('Camera offline');
      }
    },
    [buildResultFromRaw, createBarcodeDetector, finishWithDetection, stopCameraResources]
  );

  useEffect(() => {
    hasDetectedRef.current = false;
    startCamera('environment');
    return () => {
      stopCameraResources();
    };
  }, [startCamera, stopCameraResources]);

  const handleToggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const nextTorch = !torchEnabled;
    try {
      await track.applyConstraints({
        advanced: [{ torch: nextTorch } as MediaTrackConstraintSet & { torch: boolean }],
      });
      setTorchEnabled(nextTorch);
    } catch {
      setCameraError('Flashlight toggle is not supported by this camera hardware.');
    }
  };

  const decodeImageViaServer = async (imageDataUrl: string) => {
    setIsAnalyzingSnapshot(true);
    setCameraError(null);
    setStatusMessage('Reading product QR code, barcode, and nameplate...');

    try {
      const mimeMatch = imageDataUrl.match(/^data:([^;]+);base64,/i);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      const res = await fetch(resolveApiUrl('/api/ai/scan-serial'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageDataUrl,
          mimeType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.details || data?.error || 'Label reader request failed');
      }

      const candidateRaw = data.serialNumber || data.sku || '';
      const normalized = normalizeScannedSerial(candidateRaw);
      if (!normalized && !data.sku) {
        setCameraError('No readable QR code, barcode, or nameplate code detected. Hold closer and ensure sharp focus.');
        setStatusMessage(
          hardwareDetectorActive
            ? 'Point camera at product QR code or serial barcode for auto-scan'
            : 'Align QR/label and click Capture & Read Label'
        );
        return;
      }

      finishWithDetection({
        serialNumber: normalized,
        rawValue: candidateRaw,
        format: data.format || 'Label Vision',
        method: 'AI Label Vision',
        detectedModelNumber: data.modelNumber || undefined,
        detectedSku: data.sku || undefined,
        detectedBrand: data.brand || undefined,
      });
    } catch (err: any) {
      setCameraError(err?.message || 'Unable to decode QR/barcode snapshot.');
    } finally {
      setIsAnalyzingSnapshot(false);
    }
  };

  const handleCaptureSnapshot = async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setCameraError('Camera stream is still initializing. Wait a moment and try again.');
      return;
    }

    const maxWidth = 1024;
    const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // First try local hardware BarcodeDetector on the still canvas before server fallback
    const detector = await createBarcodeDetector();
    if (detector) {
      try {
        const barcodes = await detector.detect(canvas);
        const hit = Array.isArray(barcodes)
          ? barcodes.find((b: any) => typeof b.rawValue === 'string' && b.rawValue.trim())
          : null;
        if (hit) {
          const resObj = buildResultFromRaw(
            hit.rawValue,
            String(hit.format || 'barcode').toUpperCase(),
            'Hardware BarcodeDetector'
          );
          if (resObj.serialNumber || resObj.detectedSku || resObj.rawValue) {
            finishWithDetection(resObj);
            return;
          }
        }
      } catch {
        // Fall through to AI snapshot reader
      }
    }

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    await decodeImageViaServer(dataUrl);
  };

  const handleUploadBarcodeImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    setCameraError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const rawUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!rawUrl) return;

      const img = new Image();
      img.onload = async () => {
        const maxWidth = 1024;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const detector = await createBarcodeDetector();
          if (detector) {
            try {
              const barcodes = await detector.detect(canvas);
              const hit = Array.isArray(barcodes)
                ? barcodes.find((b: any) => typeof b.rawValue === 'string' && b.rawValue.trim())
                : null;
              if (hit) {
                const resObj = buildResultFromRaw(
                  hit.rawValue,
                  String(hit.format || 'barcode').toUpperCase(),
                  'Hardware BarcodeDetector'
                );
                if (resObj.serialNumber || resObj.detectedSku || resObj.rawValue) {
                  finishWithDetection(resObj);
                  return;
                }
              }
            } catch {
              // Fall back to server label reader
            }
          }
          await decodeImageViaServer(canvas.toDataURL('image/jpeg', 0.88));
        } else {
          await decodeImageViaServer(rawUrl);
        }
      };
      img.onerror = () => {
        setCameraError('Could not load selected image file.');
      };
      img.src = rawUrl;
    };
    reader.readAsDataURL(file);
  };

  const handleCloseModal = () => {
    stopCameraResources();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-zinc-950/60 dark:bg-zinc-950/85 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="serial-scanner-title"
    >
      <div className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="px-5 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-300 dark:border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-400 dark:border-zinc-700 text-emerald-700 dark:text-emerald-400">
              {prioritizeQr ? <QrCode className="w-5 h-5" /> : <ScanBarcode className="w-5 h-5" />}
            </div>
            <div>
              <h3 id="serial-scanner-title" className="text-sm font-bold text-zinc-950 dark:text-white uppercase tracking-wider">
                {title}
              </h3>
              <p className="text-[11px] text-zinc-700 dark:text-zinc-400 font-sans">
                {subtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            className="p-2 rounded-xl bg-white dark:bg-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white border border-zinc-300 dark:border-zinc-800 transition-colors"
            aria-label="Close scanner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Live Viewfinder Area */}
        <div className="p-5 space-y-4">
          <div className="relative w-full aspect-video bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl overflow-hidden flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className={`w-full h-full object-cover ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
            />

            {/* Target Reticle Overlay */}
            {cameraReady && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
                <div className="w-full max-w-sm h-28 border-2 border-emerald-400/70 rounded-xl relative shadow-[0_0_0_9999px_rgba(9,9,11,0.45)]">
                  <div className="absolute inset-x-3 top-1/2 h-0.5 bg-emerald-400/80 shadow-[0_0_8px_#34d399]" />
                  <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-white/95 dark:bg-zinc-950/90 px-2.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700/60 whitespace-nowrap">
                    {hardwareDetectorActive ? 'AUTO-SCAN ACTIVE' : 'ALIGN BARCODE INSIDE FRAME'}
                  </span>
                </div>
              </div>
            )}

            {!cameraReady && !cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs text-zinc-700 dark:text-zinc-400">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-700 dark:text-emerald-400" />
                <span>Waiting for camera permission...</span>
              </div>
            )}

            {isAnalyzingSnapshot && (
              <div className="absolute inset-0 bg-zinc-100/80 dark:bg-zinc-950/75 flex flex-col items-center justify-center gap-2 text-xs text-zinc-950 dark:text-white">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-700 dark:text-emerald-400" />
                <span>Decoding barcode &amp; nameplate serial...</span>
              </div>
            )}
          </div>

          {/* Status & Error Notices */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-800 rounded-xl px-3 py-2">
            <span className="text-zinc-800 dark:text-zinc-300 font-sans">{statusMessage}</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                hardwareDetectorActive
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60'
                  : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-400 border-zinc-400 dark:border-zinc-700'
              }`}
            >
              {hardwareDetectorActive ? 'Hardware BarcodeDetector' : 'Snapshot Vision Mode'}
            </span>
          </div>

          {cameraError && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800/70 rounded-xl text-xs text-rose-800 dark:text-rose-200 font-sans flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
              <span>{cameraError}</span>
            </div>
          )}

          {/* Controls */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => startCamera(facingMode === 'environment' ? 'user' : 'environment')}
                disabled={isAnalyzingSnapshot}
                className="px-3 py-2 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
                <span>Switch Camera</span>
              </button>

              {torchSupported && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`px-3 py-2 text-xs font-bold border rounded-xl flex items-center gap-1.5 transition-colors ${
                    torchEnabled
                      ? 'bg-amber-500 text-zinc-950 border-amber-400'
                      : 'bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 border-zinc-400 dark:border-zinc-700'
                  }`}
                >
                  <Flashlight className="w-3.5 h-3.5" />
                  <span>{torchEnabled ? 'Light On' : 'Flash'}</span>
                </button>
              )}

              {cameraError && (
                <button
                  type="button"
                  onClick={() => startCamera(facingMode)}
                  className="px-3 py-2 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Camera</span>
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="px-3 py-2 text-xs font-bold bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-900 dark:text-zinc-200 border border-zinc-400 dark:border-zinc-700 rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload / Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleUploadBarcodeImage}
                  className="hidden"
                />
              </label>

              {cameraReady && (
                <button
                  type="button"
                  onClick={handleCaptureSnapshot}
                  disabled={isAnalyzingSnapshot}
                  className="px-4 py-2 text-xs font-bold bg-zinc-950 dark:bg-white hover:bg-zinc-800 dark:hover:bg-zinc-200 text-white dark:text-zinc-950 rounded-xl shadow flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{isAnalyzingSnapshot ? 'Reading...' : 'Capture & Read Label'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
