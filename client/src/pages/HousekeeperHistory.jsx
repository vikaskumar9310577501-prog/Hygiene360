import React, { useState, useEffect } from "react";
import { api } from "../utils/api";
import { useLang } from "../i18n/LanguageContext";
import { CheckCircle2, ChevronRight, AlertTriangle, History, Hourglass } from "lucide-react";
import CleaningDetailModal from "../components/CleaningDetailModal";

const HISTORY_CHIP = {
  APPROVED: { bg: "#dcfce7", color: "#166534", border: "#86efac", labelKey: "chip.approved", Icon: CheckCircle2 },
  PENDING: { bg: "#fef9c3", color: "#854d0e", border: "#fde047", labelKey: "chip.pending", Icon: Hourglass },
  REJECTED: { bg: "#ffedd5", color: "#9a3412", border: "#fdba74", labelKey: "hist.issueRaised", Icon: AlertTriangle }
};

function historyStatus(h) {
  if (h.approval_status === "APPROVED") return "APPROVED";
  if (h.approval_status === "REJECTED" || h.status === "REJECTED") return "REJECTED";
  return "PENDING";
}

function historyTime(h) {
  if (!h.submit_time) return "";
  const iso = !h.submit_time.includes("T") ? h.submit_time.replace(" ", "T") + "Z" : h.submit_time;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function historyDayLabel(day, t) {
  const today = new Date().toLocaleDateString("en-CA");
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  if (day === today) return t("common.today");
  if (day === yesterday) return t("common.yesterday");
  const d = new Date(`${day}T00:00:00`);
  return isNaN(d.getTime()) ? day : d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}

export default function HousekeeperHistory({ onSelectIssue, refreshKey }) {
  const { t } = useLang();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  const loadHistory = async () => {
    try {
      const h = await api.get("/cleaning/my-history?days=7");
      setHistory((h.history || []).filter(x => historyStatus(x) === "APPROVED"));
    } catch (err) {
      console.error("History error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadHistory(); }, [refreshKey]);

  const groups = history.reduce((acc, h) => {
    const last = acc[acc.length - 1];
    if (last && last.day === h.day) last.items.push(h);
    else acc.push({ day: h.day, items: [h] });
    return acc;
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-app)", padding: "16px 16px 80px" }}>
      <div id="agent-history" style={{ background: "#ffffff", borderRadius: "20px", border: "1px solid #e8edf2", padding: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <History size={19} color="#15803d" />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>{t("dash.historyTitle")}</div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>{t("dash.historySub", { n: history.length })}</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "18px", fontSize: "12px", color: "#94a3b8" }}>{t("common.loading")}</div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: "center", padding: "18px 10px", color: "#94a3b8", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #e2e8f0", fontSize: "12px" }}>
            {t("dash.historyEmpty")}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {groups.map(g => (
              <div key={g.day}>
                <div style={{ fontSize: "11px", fontWeight: 800, color: "#64748b", letterSpacing: "0.04em", marginBottom: "6px" }}>{historyDayLabel(g.day, t).toUpperCase()}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {g.items.map(h => {
                    const chip = HISTORY_CHIP[historyStatus(h)];
                    const ChipIcon = chip.Icon;
                    return (
                      <button type="button" key={h.id} onClick={() => setDetailId(h.id)} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", textAlign: "left", cursor: "pointer", padding: "9px 10px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #eef2f7", touchAction: "manipulation" }}>
                        <ChipIcon size={17} color={chip.color} style={{ flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "12.5px", fontWeight: 800, color: "#0f172a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {h.toilet_uid || h.toilet_code} — {h.toilet_name}
                          </div>
                          <div style={{ fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {h.slot_label ? `${h.slot_label} • ` : ""}{t("dash.submittedAt", { time: historyTime(h) })}{h.redo_of ? ` • ${t("dash.resubmitted")}` : ""}{h.submitted_late ? ` • ${t("dash.late")}` : ""}
                          </div>
                        </div>
                        <span style={{ fontSize: "10px", fontWeight: 800, padding: "2px 8px", borderRadius: "10px", background: chip.bg, color: chip.color, border: `1px solid ${chip.border}`, whiteSpace: "nowrap" }}>{t(chip.labelKey)}</span>
                        <ChevronRight size={15} color="#94a3b8" style={{ flexShrink: 0 }} />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detailId && <CleaningDetailModal sessionId={detailId} onClose={() => setDetailId(null)} onOpenIssue={onSelectIssue} />}
    </div>
  );
}
