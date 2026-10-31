import { Hammer } from "lucide-react";

export default function PlaceholderSection({ title, description, phase }) {
  return (
    <div className="admin-section">
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">{title}</h2>
          <p className="admin-section__subtitle">{description}</p>
        </div>
      </div>

      <div className="admin-card admin-placeholder-card">
        <div className="admin-placeholder-box">
          <div className="admin-placeholder-icon">
            <Hammer size={36} />
          </div>
          <h3>Módulo en Preparación</h3>
          <p>
            Esta vista corresponde a la <strong>{phase}</strong> del desarrollo del panel de administración.
          </p>
          <span className="admin-badge admin-badge--neutral">
            Próximamente disponible
          </span>
        </div>
      </div>
    </div>
  );
}

