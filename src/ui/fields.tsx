import { useId, useRef, useState, type ReactNode } from 'react';
import { fieldBlock, parseFieldText, parseYearText, yearTextFor } from './format';
import { Icon, type IconName } from './icons';

/**
 * "?" help next to a label. Shows on hover or keyboard focus of the label, positioned in the viewport so it
 * is never clipped by the scrolling inputs panel.
 */
export function Help({ text, children }: { text: ReactNode; children: ReactNode }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = () => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const width = 300;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), top: r.bottom + 6 });
  };
  const hide = () => setPos(null);
  return (
    <span ref={anchor} className="help" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      <button type="button" className="help-btn" aria-label="What is this?" aria-describedby={id}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (pos) hide(); else show(); }}>
        ?
      </button>
      <span role="tooltip" id={id} className="help-tip" hidden={!pos} style={pos ?? undefined}>
        {text}
      </span>
    </span>
  );
}

function Label({ htmlFor, text, help }: { htmlFor: string; text: ReactNode; help?: ReactNode }) {
  return <label htmlFor={htmlFor}>{help ? <Help text={help}>{text}</Help> : text}</label>;
}

interface NumberFieldProps {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  /** 'percent' shows/edits value × 100. */
  kind?: 'money' | 'percent' | 'int' | 'number';
  /** Limits in stored units. A value outside them is not accepted, and the field says why (D76). */
  min?: number;
  max?: number;
  /** Message for a value outside min/max, instead of "Must be at least …". */
  rangeMessage?: string;
  /** Any other reason a value can't be accepted, or null. */
  check?: (v: number) => string | null;
  step?: number;
  hint?: ReactNode;
  help?: ReactNode;
  /** A value that is accepted but unusual. */
  warn?: string | null;
  allowEmpty?: boolean;
}

export function NumberField({ label, value, onChange, kind = 'money', min, max, rangeMessage, check, step, hint, help, warn, allowEmpty }: NumberFieldProps) {
  const id = useId();
  const scale = kind === 'percent' ? 100 : 1;
  const toText = (v: number | null) => (v === null ? '' : String(+(v * scale).toFixed(kind === 'percent' ? 3 : 2)));
  const [text, setText] = useState(toText(value));
  const [seen, setSeen] = useState(value);
  const [focused, setFocused] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const parsed = parseFieldText(text, kind);
  // Keep the text in sync when the value changes from outside (loading a session, defaults button). While
  // typing, a caller that clamps (claim age 62–70) would otherwise rewrite a half-typed "6" to "62"; the
  // clamped value is shown on blur instead.
  if (value !== seen) {
    setSeen(value);
    if (parsed !== value && !focused) setText(toText(value));
  }

  const commit = (t: string) => {
    setText(t);
    const v = parseFieldText(t, kind);
    setBlocked(null);
    if (v === null) {
      if (allowEmpty) {
        setSeen(null);
        onChange(null);
      }
      return;
    }
    if (v === undefined) return;
    const why = fieldBlock(v, kind, { min, max, rangeMessage, check });
    if (why) {
      setBlocked(why); // keep the last accepted value; the text reverts on leaving the field
      return;
    }
    setSeen(v);
    onChange(v);
  };
  const message = blocked ?? warn;

  const unit = kind === 'money' ? ' ($)' : kind === 'percent' ? ' (%)' : '';
  return (
    <div className={`field${message ? ' invalid' : ''}`}>
      <Label htmlFor={id} text={`${label}${unit}`} help={help} />
      <input
        id={id}
        type="number"
        inputMode="decimal"
        data-1p-ignore
        value={text}
        min={min === undefined ? undefined : min * scale}
        max={max === undefined ? undefined : max * scale}
        step={step ?? (kind === 'money' ? 100 : kind === 'percent' ? 0.1 : 1)}
        onChange={(e) => commit(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setBlocked(null); setText(toText(value)); }}
        aria-invalid={blocked ? true : undefined}
      />
      {message && <span className="warn" role={blocked ? 'alert' : undefined}>{message}</span>}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/**
 * The year picker's box. The typed text is kept locally so a year can be typed digit by digit; it is applied
 * once it is a whole year within [min, max], and reverts to the current year on leaving the box (D84).
 */
export function YearInput({ id, value, min, max, onChange }: { id: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(String(value));
  const [seen, setSeen] = useState(value);
  // Show the new year when it changes from outside (− / +, "Back to earliest", switching FIRE type).
  if (value !== seen) {
    setSeen(value);
    setText(yearTextFor(text, value, min, max));
  }
  const commit = (t: string) => {
    setText(t);
    const v = parseYearText(t, min, max);
    if (v === null) return;
    setSeen(v);
    onChange(v);
  };
  return (
    <input id={id} type="number" data-1p-ignore style={{ width: 90 }} value={text} min={min} max={max}
      onChange={(e) => commit(e.target.value)} onBlur={() => setText(String(value))} />
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  hint?: ReactNode;
  help?: ReactNode;
}

export function SelectField<T extends string>({ label, value, options, onChange, hint, help }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <Label htmlFor={id} text={label} help={help} />
      <select id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function TextField({ label, value, onChange, help }: { label: string; value: string; onChange: (v: string) => void; help?: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <Label htmlFor={id} text={label} help={help} />
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function Section({ title, icon, open, children }: { title: string; icon?: IconName; open?: boolean; children: ReactNode }) {
  return (
    <details className="section" open={open}>
      <summary>{icon && <Icon name={icon} />}{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}
