"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Markdown from "@/components/Markdown";
import type { Doc } from "@/lib/types";

function FolderGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 4.5A1.5 1.5 0 013.5 3H7l2 2h5.5A1.5 1.5 0 0116 6.5v7A1.5 1.5 0 0114.5 15h-11A1.5 1.5 0 012 13.5v-9z"
        fill="currentColor"
      />
    </svg>
  );
}

function SearchGlyph() {
  return (
    <svg
      className="dv-search-icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SidebarHeader({ onClose }: { onClose: () => void }) {
  const t = useTranslations("game.documentViewer");
  const tc = useTranslations("common");
  return (
    <div className="dv-sidebar-header">
      <span className="dv-folder-icon">
        <FolderGlyph />
      </span>
      <span className="dv-folder-title">{t("folderTitle")}</span>
      <button
        className="dv-sidebar-close"
        onClick={onClose}
        aria-label={tc("close")}
      >
        ×
      </button>
    </div>
  );
}

function DocListItem({
  doc,
  isActive,
  isStarred,
  onSelect,
  onToggleStar,
}: {
  doc: Doc;
  isActive: boolean;
  isStarred: boolean;
  onSelect: () => void;
  onToggleStar: () => void;
}) {
  const t = useTranslations("game.documentViewer");
  return (
    <div
      className={`dv-item${isActive ? " dv-item-active" : ""}`}
      onClick={onSelect}
    >
      <div className="dv-item-top">
        <button
          className={`dv-star${isStarred ? " dv-star-on" : ""}`}
          onClick={(ev) => {
            ev.stopPropagation();
            onToggleStar();
          }}
          aria-label={isStarred ? t("unfavorite") : t("favorite")}
        >
          ★
        </button>
        <span className="dv-item-category">
          {doc.source === "generated"
            ? t("sourceGenerated")
            : t("sourceExisting")}
        </span>
        <span style={{ flex: 1 }} />
      </div>
      <div className="dv-item-name">{doc.title}</div>
    </div>
  );
}

function ContentPane({
  active,
  onClose,
}: {
  active: Doc | null;
  onClose: () => void;
}) {
  const t = useTranslations("game.documentViewer");
  const tc = useTranslations("common");
  return (
    <div className="dv-content">
      <div className="dv-topbar">
        <nav className="dv-breadcrumb" aria-label={tc("breadcrumb")}>
          <span className="dv-bc-home">⌂</span>
          {active && (
            <>
              <span className="dv-bc-sep">›</span>
              <span className="dv-bc-current">{active.title}</span>
            </>
          )}
        </nav>
        <button className="dv-close" onClick={onClose} aria-label={tc("close")}>
          ×
        </button>
      </div>

      {active ? (
        <div className="dv-body">
          <h2 className="dv-doc-title">{active.title}</h2>
          <div className="dv-paper">
            <Markdown>{active.body}</Markdown>
          </div>
        </div>
      ) : (
        <div className="dv-empty">{t("noDocuments")}</div>
      )}
    </div>
  );
}

function DocSearchBox({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const t = useTranslations("game.documentViewer");
  return (
    <div className="dv-search-wrap">
      <SearchGlyph />
      <input
        type="text"
        className="dv-search-input"
        placeholder={t("searchPlaceholder")}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
      />
    </div>
  );
}

export default function DocumentViewer({
  documents,
  onClose,
  starred,
  onToggleStar,
}: {
  documents: Doc[];
  onClose: () => void;
  starred: Set<string>;
  onToggleStar: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(
    documents[0]?.id ?? null
  );
  const [docSearch, setDocSearch] = useState("");
  const [mobilePanelView, setMobilePanelView] = useState<"list" | "detail">(
    "list"
  );

  const active = documents.find((doc) => doc.id === activeId) ?? null;

  const filtered = documents.filter((doc) =>
    doc.title.toLowerCase().includes(docSearch.toLowerCase())
  );

  const handleContentClose = () => {
    if (mobilePanelView === "detail" && window.innerWidth <= 640) {
      setMobilePanelView("list");
    } else {
      onClose();
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`docs-modal dv-pane-${mobilePanelView}`}
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="dv-sidebar">
          <SidebarHeader onClose={onClose} />

          <DocSearchBox value={docSearch} onChange={setDocSearch} />

          <div className="dv-list">
            {filtered.map((doc) => (
              <DocListItem
                key={doc.id}
                doc={doc}
                isActive={doc.id === activeId}
                isStarred={starred.has(doc.id)}
                onSelect={() => {
                  setActiveId(doc.id);
                  setMobilePanelView("detail");
                }}
                onToggleStar={() => onToggleStar(doc.id)}
              />
            ))}
          </div>
        </div>

        <ContentPane active={active} onClose={handleContentClose} />
      </div>
    </div>
  );
}
