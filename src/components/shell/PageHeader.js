export default function PageHeader({ eyebrow, title, intro, actions = null }) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {intro && <p className="intro-copy">{intro}</p>}
      </div>
      {actions}
    </div>
  );
}