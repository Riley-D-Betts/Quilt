/**
 * A little paint program for designing your own fabric: freehand brush on
 * a 256x256 canvas, color palette + custom color, three brush sizes,
 * eraser, fill, undo, clear. The result is saved through the same image
 * pipeline as fabric photos (a small data URL on the fabric).
 */
import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '../../shared/quilt';

const CANVAS_PX = 256;
const UNDO_LIMIT = 24;

const PALETTE = [
  '#3c2a21', // ink
  '#ffffff',
  '#c0392b',
  '#e67e22',
  '#d9a441',
  '#3d6b52',
  '#94ab8d',
  '#4a5a8a',
  '#7d9bb8',
  '#7b5d7e',
  '#c96a7b',
  '#f5efdd',
];

const BRUSHES = [
  { label: 'Fine', size: 4 },
  { label: 'Medium', size: 10 },
  { label: 'Wide', size: 22 },
] as const;

interface DrawDialogProps {
  /** Existing image to continue drawing on (photo or previous drawing). */
  initialImage?: string | null;
  onSave: (dataUrl: string) => void;
  onClose: () => void;
}

export function DrawDialog({ initialImage, onSave, onClose }: DrawDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoStack = useRef<ImageData[]>([]);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState('#c0392b');
  const [brush, setBrush] = useState<number>(BRUSHES[1].size);
  const [eraser, setEraser] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
    if (initialImage) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, CANVAS_PX, CANVAS_PX);
      img.src = initialImage;
    }
    // Run once per dialog open; the canvas is not React-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ctx(): CanvasRenderingContext2D {
    return canvasRef.current!.getContext('2d')!;
  }

  function pushUndo() {
    const c = ctx();
    undoStack.current.push(c.getImageData(0, 0, CANVAS_PX, CANVAS_PX));
    if (undoStack.current.length > UNDO_LIMIT) undoStack.current.shift();
    setCanUndo(true);
  }

  function undo() {
    const snapshot = undoStack.current.pop();
    if (snapshot) ctx().putImageData(snapshot, 0, 0);
    setCanUndo(undoStack.current.length > 0);
  }

  function canvasPoint(e: React.PointerEvent): { x: number; y: number } {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_PX,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_PX,
    };
  }

  function strokeColor(): string {
    return eraser ? '#ffffff' : color;
  }

  function down(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    pushUndo();
    drawing.current = true;
    const p = canvasPoint(e);
    lastPoint.current = p;
    const c = ctx();
    c.fillStyle = strokeColor();
    c.beginPath();
    c.arc(p.x, p.y, brush / 2, 0, Math.PI * 2);
    c.fill();
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current || !lastPoint.current) return;
    const p = canvasPoint(e);
    const c = ctx();
    c.strokeStyle = strokeColor();
    c.lineWidth = brush;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(lastPoint.current.x, lastPoint.current.y);
    c.lineTo(p.x, p.y);
    c.stroke();
    lastPoint.current = p;
  }

  function up() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function fillAll() {
    pushUndo();
    const c = ctx();
    c.fillStyle = strokeColor();
    c.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
  }

  function clearAll() {
    pushUndo();
    const c = ctx();
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, CANVAS_PX, CANVAS_PX);
  }

  function save() {
    setSaveError(null);
    const canvas = canvasRef.current!;
    // PNG keeps drawings crisp; fall back to JPEG if it somehow gets huge.
    let dataUrl = canvas.toDataURL('image/png');
    if (dataUrl.length > LIMITS.maxImageChars) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    }
    if (dataUrl.length > LIMITS.maxImageChars) {
      setSaveError('This drawing is too detailed to save — try simplifying it.');
      return;
    }
    onSave(dataUrl);
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog draw-dialog" role="dialog" aria-modal="true" aria-label="Draw a fabric">
        <h2>Draw your fabric</h2>
        <canvas
          ref={canvasRef}
          width={CANVAS_PX}
          height={CANVAS_PX}
          className="draw-canvas"
          style={{ touchAction: 'none' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
        <div className="draw-colors" role="group" aria-label="Colors">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className={`draw-color ${!eraser && color === c ? 'selected' : ''}`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
              onClick={() => {
                setColor(c);
                setEraser(false);
              }}
            />
          ))}
          <label className="draw-color draw-color-custom" title="Custom color">
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                setEraser(false);
              }}
            />
            <span style={{ background: color }} />
          </label>
        </div>
        <div className="draw-tools">
          {BRUSHES.map((b) => (
            <button
              key={b.label}
              type="button"
              className={`btn btn-small ${brush === b.size ? 'btn-primary' : ''}`}
              onClick={() => setBrush(b.size)}
            >
              {b.label}
            </button>
          ))}
          <button
            type="button"
            className={`btn btn-small ${eraser ? 'btn-primary' : ''}`}
            onClick={() => setEraser(!eraser)}
          >
            Eraser
          </button>
          <button type="button" className="btn btn-small" onClick={fillAll}>
            Fill
          </button>
          <button type="button" className="btn btn-small" onClick={undo} disabled={!canUndo}>
            Undo
          </button>
          <button type="button" className="btn btn-small" onClick={clearAll}>
            Clear
          </button>
        </div>
        {saveError && (
          <p className="form-error" role="alert">
            {saveError}
          </p>
        )}
        <div className="dialog-actions">
          <span className="dialog-actions-spacer" />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={save}>
            Use this fabric
          </button>
        </div>
      </div>
    </div>
  );
}
