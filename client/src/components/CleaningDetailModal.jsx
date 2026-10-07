import React, { useEffect, useState } from "react";
import { api } from "../utils/api";
import { useLang } from "../i18n/LanguageContext";
import { fmtDateTime, fmt12 } from "../utils/istTime";
import EvidencePhoto from "./EvidencePhoto";
import { X, Clock, MapPin, ShieldCheck, AlertTriangle, ChevronRight } from "lucide-react";

const STATUS_STYLE = {
  APPROVED: { bg: "#dcfce7", color: "#166534", border: "#86efac", key: "chip.approved" },
  PENDING: { bg: "#fef9c3", color: "#854d0e", border: "#fde047", key: "chip.pending" },
  REJECTED: { bg: "#ffedd5", color: "#9a3412", border: "#fdba74", key: "chip.rejected" }
};

export default function CleaningDetailModal({ sessionId, onClose, onOpenIssue }) {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(null);

  useEffect(() => {
    let alive = true;
    api.get(`/cleaning/session/${sessionId}`)
      .then(res => { if (alive) setData(res); })
      .catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [sessionId]);

  const s = data?.session;
  const photos = data?.photos || [];
  const live = photos.filter(p => p.photo_type === "CLEANING_EVIDENCE").pop();
  const sheet = photos.filter(p => p.photo_type === "CHECK_SHEET").pop();
  const statusKey = s ? (s.approval_status === "APPROVED" ? "APPROVED" : (s.approval_status === "REJECTED" || s.status === "REJECTED") ? "REJECTED" : "PENDING") : null;
  const st = statusKey ? STATUS_STYLE[statusKey] : null;

  const row = (Icon, label, value, danger) => (
    <div style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "12.5px", padding: "7px 0", borderBottom: "1px solid #f1f5f9" }}>
      <Icon size={14} color={danger ? "#b91c1c" : "#0284c7"} style={{ flexShrink: 0, marginTop: "2px" }} />
      <span style={{ color: "#64748b", fontWeight: 700, minWidth: "110px" }}>{label}</span>
      <span style={{ color: danger ? "#b91c1c" : "#0f172a", fontWeight: 700, flex: 1, wordBreak: "break-word" }}>{value}</span>
    </div>
  );

  return (
    <div className="modal-overlay h360-sheet-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div className="modal-content h360-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: "560px", maxHeight: "90vh" }}>
        <div className="modal-header">
          <div style={{ minWidth: 0 }}>
            <h3 className="modal-title" style={{ margin: 0, fontSize: "15px" }}>{s ? `${s.toilet_uid || s.toilet_code} — ${s.toilet_name}` : t("common.loading")}</h3>
            {s && <div style={{ fontSize: "11px", color: "var(--color-primary-500)", fontFamily: "var(--font-mono)" }}>{s.session_code}</div>}
          </div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px" }}><X size={20} /></button>
        </div>

        <div className="modal-body">
          {!s ? (
            <div style={{ textAlign: "center", padding: "30px", color: error ? "#b91c1c" : "#64748b" }}>{error || t("common.loading")}</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ padding: "10px 12px", borderRadius: "10px", background: st.bg, border: `1px solid ${st.border}`, color: st.color, fontSize: "13px", fontWeight: 800 }}>
                {statusKey === "REJECTED" ? t("hist.issueRaised") : t(st.key)}
                {s.approved_by_name && s.approved_by_name !== "AUTO" && <span style={{ fontWeight: 600 }}> • {s.approved_by_name} • {fmtDateTime(s.approved_at)}</span>}
                {s.approval_remarks && <div style={{ fontWeight: 600, marginTop: "2px" }}>{t("cw.adminRemark")}: {s.approval_remarks}</div>}
              </div>

              <div>
                {row(MapPin, t("idm.location"), [s.plant_name, s.area_name].filter(Boolean).join(" / "))}
                {row(Clock, t("cw.slotLabel"), s.slot_label ? `${s.slot_label} (${fmt12(s.slot_start)} – ${fmt12(s.slot_end)})${s.slot_date ? ` • ${s.slot_date}` : ""}` : t("cw.noSlot"))}
                {row(Clock, t("hist.started"), fmtDateTime(s.start_time))}
                {row(Clock, t("cw.uploadedAt"), `${fmtDateTime(s.submit_time)}${s.submitted_late ? ` • ${t("cw.late")}` : ""}`, !!s.submitted_late)}
                {row(ShieldCheck, t("hist.sheetDate"), sheet?.ocr_detected_date || t("hist.sheetNotRead"))}
                {s.redo_of && row(AlertTriangle, t("hist.redo"), t("dash.resubmitted"))}
                {s.remarks && row(ShieldCheck, t("cw.remarks"), s.remarks)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[[live, t("flow.livePhoto")], [sheet, t("cw.checksheetStep")]].map(([p, label]) => (
                  <div key={label}>
                    <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", marginBottom: "4px" }}>{label}</div>
                    {p ? (
                      <>
                        <EvidencePhoto src={p.storage_path} alt={label} maxHeight="160px" onClick={() => setZoom(p.storage_path)} />
                        <div style={{ fontSize: "10.5px", color: "#64748b", marginTop: "2px" }}>{fmtDateTime(p.captured_at)}</div>
                      </>
                    ) : (
                      <div style={{ fontSize: "12px", color: "#94a3b8", border: "1px dashed #e2e8f0", borderRadius: "10px", padding: "20px 8px", textAlign: "center" }}>{t("idm.noPhoto")}</div>
                    )}
                  </div>
                ))}
              </div>

              {s.issue && onOpenIssue && (
                <button type="button" onClick={() => { onOpenIssue(s.issue.id); onClose(); }} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "11px 12px", borderRadius: "12px", border: "1.5px solid #fdba74", background: "#fff7ed", color: "#9a3412", fontWeight: 800, fontSize: "13px", cursor: "pointer", textAlign: "left" }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{s.issue.ticket_no} • {t(`status.${s.issue.status}`)}</span>
                  <ChevronRight size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {zoom && (
        <div className="modal-overlay" style={{ zIndex: 1200, padding: "10px" }} onClick={e => { e.stopPropagation(); setZoom(null); }}>
          <div style={{ width: "100%", maxWidth: "900px" }}>
            <EvidencePhoto src={zoom} alt="" maxHeight="88vh" style={{ backgroundColor: "transparent" }} />
          </div>
        </div>
      )}
    </div>
  );
}
