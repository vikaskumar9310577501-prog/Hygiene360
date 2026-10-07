import React, { useState, useEffect, useRef } from "react";
import { api, photoUrl } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../i18n/LanguageContext";
import { fmtDateTime } from "../utils/istTime";
import { RefreshCw, CheckCircle2, BellRing, MapPin, ChevronRight, ImageOff, Inbox, AlertTriangle } from "lucide-react";

const PENDING_STATUSES = ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"];

export function parseDbDate(value) {
  if (!value) return null;
  // SQLite CURRENT_TIMESTAMP is UTC without a zone marker
  const iso = typeof value === "string" && !value.includes("T") ? value.replace(" ", "T") + "Z" : value;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

export function timeAgo(value, now, t) {
  const d = parseDbDate(value);
  if (!d) return "";
  const mins = Math.max(0, Math.floor((now - d) / 60000));
  if (mins < 1) return t ? t("iss.justNow") : "Just now";
  if (mins < 60) return t ? t("iss.minAgo", { n: mins }) : `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t ? t("iss.hrAgo", { n: hrs }) : `${hrs} hr ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function ComplaintThumb({ path }) {
  const [failed, setFailed] = useState(false);
  const base = { width: "58px", height: "58px", borderRadius: "12px", flexShrink: 0, objectFit: "cover", backgroundColor: "#f1f5f9", border: "1px solid #e2e8f0" };
  if (!path || failed) {
    return (
      <div style={{ ...base, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>
        <ImageOff size={20} />
      </div>
    );
  }
  return <img src={photoUrl(path)} alt="" loading="lazy" onError={() => setFailed(true)} style={base} />;
}

export default function HousekeeperComplaints({ onSelectIssue, refreshKey }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState(() => new Set());
  const [showResolved, setShowResolved] = useState(false);
  const [now, setNow] = useState(new Date());
  const knownIdsRef = useRef(null);

  const loadComplaints = async () => {
    try {
      const res = await api.get("/issues");
      const list = res.issues || [];
      const ids = new Set(list.map(i => i.id));
      if (knownIdsRef.current) {
        const fresh = list.filter(i => !knownIdsRef.current.has(i.id)).map(i => i.id);
        if (fresh.length) setNewIds(prev => new Set([...prev, ...fresh]));
      }
      knownIdsRef.current = ids;
      setComplaints(list);
    } catch (err) {
      console.error("Agent complaints error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
    const poll = setInterval(loadComplaints, 15000);
    return () => clearInterval(poll);
  }, [user?.id]);

  useEffect(() => { if (refreshKey) loadComplaints(); }, [refreshKey]);
  useEffect(() => { const clock = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(clock); }, []);

  const openComplaint = (id) => {
    setNewIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    if (onSelectIssue) onSelectIssue(id);
  };

  const pendingComplaints = complaints.filter(c => PENDING_STATUSES.includes(c.status))
    .sort((a, b) => (b.status === "REOPENED") - (a.status === "REOPENED"));
  const isOverdue = c => { const d = parseDbDate(c.target_at); return !!d && d.getTime() < now.getTime(); };
  const resolvedComplaints = complaints.filter(c => !PENDING_STATUSES.includes(c.status)).slice(0, 10);

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", padding: "16px 16px 90px" }}>
      <div id="agent-complaints" style={{ background: "#ffffff", borderRadius: "20px", border: pendingComplaints.length ? "1.5px solid #fecaca" : "1px solid #e8edf2", padding: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", maxWidth: "720px", margin: "0 auto" }}>
        <style>{`@keyframes h360Pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); } 50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); } }`}</style>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: pendingComplaints.length ? "#fee2e2" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <BellRing size={19} color={pendingComplaints.length ? "#dc2626" : "#15803d"} />
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>{t("iss.title")}</div>
              <div style={{ fontSize: "11px", color: pendingComplaints.length ? "#dc2626" : "#94a3b8", fontWeight: 600 }}>
                {pendingComplaints.length ? t("iss.pending", { n: pendingComplaints.length }) : t("iss.nonePending")}
              </div>
            </div>
          </div>
          <button onClick={loadComplaints} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" }} title="Refresh complaints">
            <RefreshCw size={13} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "18px", fontSize: "12px", color: "#94a3b8" }}>{t("common.loading")}</div>
        ) : pendingComplaints.length === 0 ? (
          <div style={{ textAlign: "center", padding: "18px 10px", color: "#94a3b8", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #e2e8f0" }}>
            <Inbox size={26} style={{ marginBottom: "4px" }} />
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#64748b" }}>{t("iss.allClear")}</div>
            <div style={{ fontSize: "11.5px" }}>{t("iss.emptyHint")}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {pendingComplaints.map(c => {
              const isNew = newIds.has(c.id);
              const inProgress = c.status === "IN_PROGRESS";
              const overdue = isOverdue(c);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openComplaint(c.id)}
                  style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left", padding: "10px", borderRadius: "14px", border: isNew ? "1.5px solid #ef4444" : "1px solid #eef2f7", background: isNew ? "#fff5f5" : "#f8fafc", cursor: "pointer", touchAction: "manipulation" }}
                >
                  <ComplaintThumb path={c.evidence_photo_path} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                      {isNew && <span style={{ fontSize: "9.5px", fontWeight: 900, color: "#ffffff", background: "#ef4444", borderRadius: "6px", padding: "1px 6px" }}>{t("iss.new")}</span>}
                      <span style={{ fontSize: "10px", fontWeight: 800, padding: "1px 7px", borderRadius: "10px", background: inProgress ? "#fffbeb" : "#fef2f2", color: inProgress ? "#92400e" : "#dc2626", border: `1px solid ${inProgress ? "#fcd34d" : "#fca5a5"}` }}>
                        {t(`status.${c.status}`)}
                      </span>
                      <span style={{ fontSize: "10.5px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>{timeAgo(c.created_at, now, t)}</span>
                    </div>
                    <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.checklist_item_label || c.category}
                    </div>
                    <div style={{ fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <MapPin size={11} color="#0284c7" style={{ flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.toilet_uid || c.toilet_code || "Facility"}{c.toilet_name ? ` — ${c.toilet_name}` : ""}</span>
                    </div>
                    {c.complaint_type === "CLEANING_AUDIT" && (
                      <div style={{ fontSize: "11px", fontWeight: 700, color: "#9a3412", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: "1px" }}>
                        {t("idm.redoCleaning")}{c.source_slot_label ? ` • ${t("cw.slotLabel")} ${c.source_slot_label}` : ""}{c.source_slot_date ? ` • ${c.source_slot_date}` : ""}
                      </div>
                    )}
                    {c.target_at && (
                      <div style={{ fontSize: "11px", fontWeight: 800, color: overdue ? "#b91c1c" : "#c2410c", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                        {overdue && <AlertTriangle size={11} />}
                        {overdue ? t("iss.overdue") : t("iss.due", { time: fmtDateTime(c.target_at) })}
                      </div>
                    )}
                  </div>
                  <ChevronRight size={18} color="#94a3b8" style={{ flexShrink: 0 }} />
                </button>
              );
            })}
          </div>
        )}

        {resolvedComplaints.length > 0 && (
          <div style={{ marginTop: "10px" }}>
            <button type="button" onClick={() => setShowResolved(v => !v)} style={{ background: "none", border: "none", color: "#0284c7", fontSize: "12px", fontWeight: 700, cursor: "pointer", padding: "4px 0" }}>
              {showResolved ? t("iss.hideClosed") : t("iss.showClosed", { n: resolvedComplaints.length })}
            </button>
            {showResolved && (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "6px" }}>
                {resolvedComplaints.map(c => (
                  <button key={c.id} type="button" onClick={() => openComplaint(c.id)} style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: "10px", border: "1px solid #dcfce7", background: "#f0fdf4", cursor: "pointer" }}>
                    <CheckCircle2 size={15} color="#10b981" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#065f46", flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {c.ticket_no} • {c.checklist_item_label || c.category} • {c.toilet_code}
                    </span>
                    <span style={{ fontSize: "10px", fontWeight: 800, color: "#15803d" }}>{t(`status.${c.status}`)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
