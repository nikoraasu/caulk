import React, { useState } from "react";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import { soundEngine } from "../../audio/soundEngine";
import "./checklistCard.css";

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

type Props = {
  element: ExcalidrawElement;
  onUpdateElement?: (elementId: string, customData: Record<string, unknown>) => void;
};

export const ChecklistCard: React.FC<Props> = ({ element, onUpdateElement }) => {
  const customData = (element.customData || {}) as Record<string, unknown>;
  const title = typeof customData.title === "string" ? customData.title : "Checklist";
  const items = Array.isArray(customData.items) ? (customData.items as ChecklistItem[]) : [];

  const [newItemText, setNewItemText] = useState("");

  const completedCount = items.filter((it) => it.done).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const handleToggleItem = (id: string) => {
    const nextItems = items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
    onUpdateElement?.(element.id, {
      ...customData,
      items: nextItems,
    });
    soundEngine.play("click");
  };

  const handleAddItem = () => {
    if (!newItemText.trim()) return;
    const newItem: ChecklistItem = {
      id: `chk-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      text: newItemText.trim(),
      done: false,
    };
    onUpdateElement?.(element.id, {
      ...customData,
      items: [...items, newItem],
    });
    setNewItemText("");
    soundEngine.play("create");
  };

  const handleDeleteItem = (id: string) => {
    const nextItems = items.filter((it) => it.id !== id);
    onUpdateElement?.(element.id, {
      ...customData,
      items: nextItems,
    });
    soundEngine.play("delete");
  };

  const handleTitleChange = (newTitle: string) => {
    onUpdateElement?.(element.id, {
      ...customData,
      title: newTitle,
    });
  };

  return (
    <div className="caulk-checklist-card">
      <div className="caulk-checklist-header">
        <div className="caulk-checklist-title-row">
          <input
            type="text"
            className="caulk-checklist-title"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Checklist Title"
          />
          <span className="caulk-checklist-progress-meta">
            {totalCount === 0 ? "0 items" : `${completedCount}/${totalCount} (${progressPercent}%)`}
          </span>
        </div>
        <div className="caulk-checklist-progress-bar">
          <div className="caulk-checklist-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>

      <div className="caulk-checklist-items">
        {items.length === 0 ? (
          <div className="caulk-checklist-empty">
            Empty checklist. Add an item below.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="caulk-checklist-item">
              <input
                type="checkbox"
                className="caulk-checklist-checkbox"
                checked={item.done}
                onChange={() => handleToggleItem(item.id)}
              />
              <span className={`caulk-checklist-label${item.done ? " done" : ""}`}>{item.text}</span>
              <button
                type="button"
                className="caulk-checklist-delete-btn"
                title="Remove checklist item"
                onClick={() => handleDeleteItem(item.id)}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>

      <div className="caulk-checklist-add-row">
        <input
          type="text"
          className="caulk-checklist-add-input"
          placeholder="Add an item..."
          value={newItemText}
          onChange={(e) => setNewItemText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddItem();
            }
          }}
        />
        <button type="button" className="caulk-checklist-add-btn" onClick={handleAddItem}>
          + ADD
        </button>
      </div>
    </div>
  );
};
