"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Crop,
  ZoomIn,
  ZoomOut,
  RotateCw,
  RefreshCw,
  Check,
  Move,
  Maximize2,
  Sparkles,
} from "lucide-react";

export type AspectRatioType = "1:1" | "4:3" | "3:4" | "16:9" | "free";

interface ImageCropModalProps {
  isOpen: boolean;
  imageSrc: string;
  fileName?: string;
  initialAspectRatio?: AspectRatioType;
  onClose: () => void;
  onCropComplete: (croppedFile: File, previewDataUrl: string) => Promise<void> | void;
}

export function ImageCropModal({
  isOpen,
  imageSrc,
  fileName = "product-image.jpg",
  initialAspectRatio = "1:1",
  onClose,
  onCropComplete,
}: ImageCropModalProps) {
  const [aspectRatio, setAspectRatio] = useState<AspectRatioType>(initialAspectRatio);
  const [zoom, setZoom] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0); // in degrees: 0, 90, 180, 270
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Reset parameters when a new image is loaded
  useEffect(() => {
    if (isOpen) {
      setZoom(1);
      setRotation(0);
      setPosition({ x: 0, y: 0 });
      setAspectRatio(initialAspectRatio);
    }
  }, [isOpen, imageSrc, initialAspectRatio]);

  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    setNaturalDimensions({ width: naturalWidth, height: naturalHeight });
    setPosition({ x: 0, y: 0 });
  };

  // Dragging / Panning handlers (Mouse & Touch)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.1 : -0.1;
    setZoom((prev) => Math.min(3, Math.max(0.6, Number((prev + delta).toFixed(2)))));
  };

  const rotateClockwise = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const resetAdjustments = () => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  };

  // Compute crop aspect ratio CSS styles
  const getAspectRatioBoxStyle = (): React.CSSProperties => {
    switch (aspectRatio) {
      case "1:1":
        return { aspectRatio: "1 / 1", maxWidth: "340px", maxHeight: "340px" };
      case "4:3":
        return { aspectRatio: "4 / 3", maxWidth: "380px", maxHeight: "285px" };
      case "3:4":
        return { aspectRatio: "3 / 4", maxWidth: "270px", maxHeight: "360px" };
      case "16:9":
        return { aspectRatio: "16 / 9", maxWidth: "400px", maxHeight: "225px" };
      case "free":
      default:
        return { width: "90%", height: "90%", maxWidth: "400px", maxHeight: "360px" };
    }
  };

  // Live off-screen crop and output generator
  const performCrop = useCallback(async () => {
    if (!imageRef.current || !containerRef.current) return;
    setIsProcessing(true);

    try {
      const img = imageRef.current;
      const cropBox = containerRef.current.getBoundingClientRect();

      // Output resolution target (high resolution for crystal-clear catalog rendering)
      let outputWidth = 800;
      let outputHeight = 800;

      if (aspectRatio === "4:3") {
        outputWidth = 800;
        outputHeight = 600;
      } else if (aspectRatio === "3:4") {
        outputWidth = 600;
        outputHeight = 800;
      } else if (aspectRatio === "16:9") {
        outputWidth = 960;
        outputHeight = 540;
      } else if (aspectRatio === "free") {
        const ratio = cropBox.width / cropBox.height;
        outputWidth = 800;
        outputHeight = Math.round(800 / ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Could not create canvas 2D context");
      }

      // Smooth image rendering
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Fill white background for transparent images/letterboxing
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, outputWidth, outputHeight);

      // Save canvas state
      ctx.save();

      // Move center of canvas to center of output
      ctx.translate(outputWidth / 2, outputHeight / 2);

      // Apply rotation
      ctx.rotate((rotation * Math.PI) / 180);

      // Scale factors: ratio of output canvas pixels to the screen crop box pixels
      const scaleX = outputWidth / cropBox.width;
      const scaleY = outputHeight / cropBox.height;

      // Calculate where the image sits relative to the crop box
      const imgRect = img.getBoundingClientRect();
      const imgCenterRelativeToCropBox = {
        x: imgRect.left + imgRect.width / 2 - (cropBox.left + cropBox.width / 2),
        y: imgRect.top + imgRect.height / 2 - (cropBox.top + cropBox.height / 2),
      };

      // Draw image transformed
      const drawWidth = imgRect.width * scaleX;
      const drawHeight = imgRect.height * scaleY;

      ctx.drawImage(
        img,
        -drawWidth / 2 + (imgCenterRelativeToCropBox.x * scaleX),
        -drawHeight / 2 + (imgCenterRelativeToCropBox.y * scaleY),
        drawWidth,
        drawHeight
      );

      ctx.restore();

      // Generate Blob and File
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            setIsProcessing(false);
            return;
          }

          const baseCleanName = fileName.replace(/\.[^/.]+$/, "");
          const cleanFileName = `${baseCleanName}_cropped_${Date.now()}.jpg`;
          const croppedFile = new File([blob], cleanFileName, { type: "image/jpeg" });
          const previewDataUrl = canvas.toDataURL("image/jpeg", 0.92);

          await onCropComplete(croppedFile, previewDataUrl);
          setIsProcessing(false);
          onClose();
        },
        "image/jpeg",
        0.92
      );
    } catch (err) {
      console.error("Failed to crop image:", err);
      setIsProcessing(false);
    }
  }, [aspectRatio, fileName, onClose, onCropComplete, rotation]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in select-none">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/60 dark:bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400 flex items-center justify-center shadow-sm">
              <Crop className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                Crop & Set Product Photo
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300">
                  HD Quality
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                Drag to position, zoom, and choose the perfect framing for catalog & bills.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Viewport Area */}
        <div className="relative flex-1 bg-slate-950 overflow-hidden flex items-center justify-center min-h-[300px] sm:min-h-[380px]">
          
          {/* Panning / Zooming Container */}
          <div
            className="absolute inset-0 flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheel}
          >
            {/* The Image being cropped */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imageRef}
              src={imageSrc}
              alt="Crop target"
              onLoad={handleImageLoaded}
              draggable={false}
              style={{
                transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${zoom})`,
                transition: isDragging ? "none" : "transform 0.12s ease-out",
                maxHeight: "none",
                maxWidth: "none",
                userSelect: "none",
              }}
              className="pointer-events-none select-none max-w-none origin-center"
            />
          </div>

          {/* Mask Darkening Overlay */}
          <div className="absolute inset-0 pointer-events-none bg-slate-950/65 flex items-center justify-center">
            {/* The Cutout / Crop Viewport Frame */}
            <div
              ref={containerRef}
              style={getAspectRatioBoxStyle()}
              className="w-full relative shadow-[0_0_0_9999px_rgba(2,6,23,0.68)] rounded-2xl border-2 border-white/90 ring-1 ring-teal-400/40 pointer-events-none overflow-hidden transition-all duration-200"
            >
              {/* Rule of Thirds Grid Overlay */}
              <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-40 pointer-events-none">
                <div className="border-r border-b border-white/50" />
                <div className="border-r border-b border-white/50" />
                <div className="border-b border-white/50" />
                <div className="border-r border-b border-white/50" />
                <div className="border-r border-b border-white/50" />
                <div className="border-b border-white/50" />
                <div className="border-r border-white/50" />
                <div className="border-r border-white/50" />
                <div />
              </div>

              {/* Corner accent marks */}
              <div className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 border-teal-400" />
              <div className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 border-teal-400" />
              <div className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 border-teal-400" />
              <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-teal-400" />

              {/* Aspect Ratio Badge inside Crop Box */}
              <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur-sm text-[10px] font-mono font-bold text-white border border-white/20">
                {aspectRatio === "1:1"
                  ? "Square (1:1)"
                  : aspectRatio === "4:3"
                  ? "Standard (4:3)"
                  : aspectRatio === "3:4"
                  ? "Portrait (3:4)"
                  : aspectRatio === "16:9"
                  ? "Wide (16:9)"
                  : "Freeform"}
              </div>
            </div>
          </div>

          {/* Quick Helper Floating Tip */}
          <div className="absolute top-3 left-3 bg-slate-900/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 text-white/80 text-[11px] font-medium flex items-center gap-1.5 pointer-events-none shadow-lg">
            <Move className="w-3.5 h-3.5 text-teal-400" />
            <span>Drag photo to reposition • Scroll to zoom</span>
          </div>
        </div>

        {/* Toolbar & Controls */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-4 shrink-0">
          
          {/* Aspect Ratio Selector Pills */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5" /> Ratio:
            </span>

            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {(["1:1", "4:3", "3:4", "16:9", "free"] as AspectRatioType[]).map((ratio) => (
                <button
                  key={ratio}
                  type="button"
                  onClick={() => setAspectRatio(ratio)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    aspectRatio === ratio
                      ? "bg-teal-600 text-white shadow-sm"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  {ratio === "1:1"
                    ? "1:1 Square"
                    : ratio === "4:3"
                    ? "4:3"
                    : ratio === "3:4"
                    ? "3:4"
                    : ratio === "16:9"
                    ? "16:9"
                    : "Free"}
                </button>
              ))}
            </div>

            {/* Rotation & Reset Buttons */}
            <div className="flex items-center gap-1.5 ml-auto">
              <button
                type="button"
                onClick={rotateClockwise}
                title="Rotate 90° Clockwise"
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <RotateCw className="w-3.5 h-3.5 text-teal-600" />
                <span className="hidden sm:inline">Rotate</span>
              </button>
              <button
                type="button"
                onClick={resetAdjustments}
                title="Reset zoom and position"
                className="min-h-[36px] px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </button>
            </div>
          </div>

          {/* Zoom Slider */}
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setZoom((prev) => Math.max(0.6, Number((prev - 0.1).toFixed(2))))}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <input
              type="range"
              min="0.6"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 accent-teal-600 h-2 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />

            <button
              type="button"
              onClick={() => setZoom((prev) => Math.min(3, Number((prev + 0.1).toFixed(2))))}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <span className="font-mono text-xs font-bold text-slate-500 w-12 text-right">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Footer Action Buttons */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs text-slate-400">
              {naturalDimensions.width > 0 && (
                <span>
                  Original: {naturalDimensions.width} × {naturalDimensions.height} px
                </span>
              )}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="min-h-[42px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs sm:text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performCrop}
                disabled={isProcessing}
                className="min-h-[42px] px-6 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold text-xs sm:text-sm shadow-soft shadow-teal-600/20 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processing Crop...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Crop & Set Photo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
