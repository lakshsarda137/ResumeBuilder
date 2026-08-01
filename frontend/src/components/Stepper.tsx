import { Minus, Plus } from 'lucide-react';
import './Stepper.css';

interface StepperProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

/**
 * +/- control for small bounded integer ranges.
 *
 * Preferred over both a raw number box (which shows no range and needs a typed
 * draft to stop it snapping to the clamped minimum mid-keystroke) and a slider
 * (overkill when there are five legal values). The bounds are rendered, and the
 * buttons disable at the ends so the limit is discoverable without trying it.
 */
export function Stepper({ label, value, min, max, step = 1, onChange }: StepperProps) {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(clamp(value - step))}
        disabled={value <= min}
        aria-label={`Decrease ${label}`}
      >
        <Minus size={14} />
      </button>
      <output className="stepper__value" aria-live="polite">
        {value}
      </output>
      <button
        type="button"
        className="stepper__btn"
        onClick={() => onChange(clamp(value + step))}
        disabled={value >= max}
        aria-label={`Increase ${label}`}
      >
        <Plus size={14} />
      </button>
      <span className="stepper__range">
        {min}–{max}
      </span>
    </div>
  );
}
