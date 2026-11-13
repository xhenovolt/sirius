"use client";

import { useState } from "react";
import { clearanceCardPresets } from "@/lib/cardTemplateSchema";
import QrCards from "./QrCards";

const cardTabs = [
  { type: "permanent", label: "Clearance cards" },
  { type: "temporary", label: "Temporary clearance slips" },
];

function templatesForType(templates, type) {
  const matchingTemplates = templates
    .filter((item) => item.template.cardType === type)
    .sort((left, right) => {
      const byDate = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return byDate || right.version - left.version;
    });
  if (matchingTemplates.length) return matchingTemplates;
  const preset = clearanceCardPresets.find((item) => item.template.cardType === type);
  return preset
    ? [{
      id: `builtin-${type}`,
      name: preset.name,
      version: 1,
      template: preset.template,
      createdAt: "1970-01-01T00:00:00.000Z",
    }]
    : [];
}

export default function CardProductionClient({ students, school, templates }) {
  const [activeType, setActiveType] = useState("permanent");
  const [selectedIds, setSelectedIds] = useState(() => Object.fromEntries(
    cardTabs.map(({ type }) => [type, templatesForType(templates, type)[0]?.id || ""]),
  ));
  const availableTemplates = templatesForType(templates, activeType);
  const template = availableTemplates.find((item) => item.id === selectedIds[activeType])
    || availableTemplates[0];

  function selectTemplate(id) {
    setSelectedIds((current) => ({ ...current, [activeType]: id }));
  }

  return (
    <section className="card-production">
      <div className="card-production-tabs" role="tablist" aria-label="Card type">
        {cardTabs.map(({ type, label }) => (
          <button
            key={type}
            id={`card-tab-${type}`}
            type="button"
            role="tab"
            aria-selected={activeType === type}
            aria-controls="card-production-panel"
            className={activeType === type ? "active" : ""}
            onClick={() => setActiveType(type)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        id="card-production-panel"
        role="tabpanel"
        aria-labelledby={`card-tab-${activeType}`}
        className="card-production-panel"
      >
        {availableTemplates.length === 0 ? (
          <div className="empty-state">
            <strong>No {activeType === "temporary" ? "temporary slip" : "clearance card"} template has been saved.</strong>
            <p>Create a matching template in the separate designer before issuing cards.</p>
            <a className="button button-primary" href="/cards/designer">Open card designer</a>
          </div>
        ) : (
          <>
            {availableTemplates.length > 1 && (
              <label className="card-production-template">
                Saved card template
                <select value={template.id} onChange={(event) => selectTemplate(event.target.value)}>
                  {availableTemplates.map((item) => (
                    <option key={item.id} value={item.id}>{item.name} · v{item.version}</option>
                  ))}
                </select>
              </label>
            )}
            <QrCards
              key={template.id}
              students={students}
              school={school}
              templates={templates}
              canManage={false}
              selectedTemplateId={template.id}
              productionOnly
            />
          </>
        )}
      </div>
    </section>
  );
}
