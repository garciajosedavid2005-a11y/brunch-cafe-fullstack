import { AlertCircle } from "lucide-react";

export default function AdminStatus({ cargando, error, onReintentar }) {
  if (cargando) {
    return <p style={{ padding: "1rem 0", color: "#6b7280" }}>Cargando...</p>;
  }

  if (error) {
    return (
      <div className="admin-alert-error">
        <AlertCircle size={18} />
        <span>{error}</span>
        <button
          type="button"
          onClick={onReintentar}
          style={{ marginLeft: "auto", cursor: "pointer" }}
        >
          Reintentar
        </button>
      </div>
    );
  }

  return null;
}