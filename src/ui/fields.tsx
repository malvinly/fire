import { useId, useRef, useState, type ReactNode } from 'react';
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
  min?: number;
  max?: number;
  step?: number;
  hint?: ReactNode;
  help?: ReactNode;
  warn?: string | null;
  allowEmpty?: boolean;
}

export function NumberField({ label, value, onChange, kind = 'money', min, max, step, hint, help, warn, allowEmpty }: NumberFieldProps) {
  const id = useId();
  const scale = kind === 'percent' ? 100 : 1;
  const toText = (v: number | null) => (v === null ? '' : String(+(v * scale).toFixed(kind === 'percent' ? 3 : 2)));
  const [text, setText] = useState(toText(value));
  const [seen, setSeen] = useState(value);
  // Keep the text in sync when the value changes from outside (loading a session, defaults button).
  if (value !== seen) {
    setSeen(value);
    const parsed = text === '' ? null : Number(text) / scale;
    if (parsed !== value) setText(toText(value));
  }

  const commit = (t: string) => {
    setText(t);
    if (t.trim() === '') {
      if (allowEmpty) {
        setSeen(null);
        onChange(null);
      }
      return;
    }
    const n = Number(t);
    if (Number.isFinite(n)) {
      setSeen(n / scale);
      onChange(n / scale);
    }
  };

  const unit = kind === 'money' ? ' ($)' : kind === 'percent' ? ' (%)' : '';
  return (
    <div className={`field${warn ? ' invalid' : ''}`}>
      <Label htmlFor={id} text={`${label}${unit}`} help={help} />
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={text}
        min={min === undefined ? undefined : min * scale}
        max={max === undefined ? undefined : max * scale}
        step={step ?? (kind === 'money' ? 100 : kind === 'percent' ? 0.1 : 1)}
        onChange={(e) => commit(e.target.value)}
      />
      {warn && <span className="warn">{warn}</span>}
      {hint && <span className="hint">{hint}</span>}
    </div>
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
