import { Link } from 'react-router-dom';

export function Button({ children, variant = 'primary', className = '', ...props }) {
  return <button className={`btn btn-${variant} ${className}`} {...props}>{children}</button>;
}

export function Card({ children, className = '', ...props }) {
  return <section className={`card ${className}`} {...props}>{children}</section>;
}

export function Chip({ children, className = '' }) { return <span className={`chip ${className}`}>{children}</span>; }
export function Field({ label, hint, error, id, className = '', children, ...props }) {
  return <label className={`field ${className}`} htmlFor={id}>{label}{hint && <span className="field-hint"> {hint}</span>}{children || <input id={id} {...props} />}{error && <span className="field-error" role="alert">{error}</span>}</label>;
}
export function PageTitle({ eyebrow, title, description, action }) {
  return <div className="page-title"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description && <p className="muted">{description}</p>}</div>{action && <div className="page-title-action">{action}</div>}</div>;
}
export function EmptyState({ title, children }) { return <div className="empty-state"><strong>{title}</strong>{children && <p>{children}</p>}</div>; }
export function Metric({ value, label, icon: Icon }) { return <div className="metric">{Icon && <Icon size={18} aria-hidden="true" />}<strong>{value}</strong><span>{label}</span></div>; }
export function LinkButton({ to, children, variant = 'primary', className = '' }) { return <Link to={to} className={`btn btn-${variant} ${className}`}>{children}</Link>; }
