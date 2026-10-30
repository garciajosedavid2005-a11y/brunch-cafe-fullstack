export default function SectionHeading({ eyebrow, title, children }) {
  return (
    <header className="dashboard-section-heading">
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{children}</p>
    </header>
  );
}
