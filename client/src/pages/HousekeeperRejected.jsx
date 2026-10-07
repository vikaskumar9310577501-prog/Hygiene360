import React, { useState, useEffect } from "react";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../i18n/LanguageContext";
import { RefreshCw, XCircle, MapPin, Clock, Camera, CheckCircle2, MessageSquareWarning } from "lucide-react";
import { timeAgo } from "./HousekeeperComplaints";

function formatDay(day) {
  if (!day) return "";
  const d = new Date(`${day}T00:00:00`);
  return isNaN(d.getTime()) ? day : d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function to12h(t) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export default function HousekeeperRejected({ onFixResubmit, refreshKey }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const load = async () => {
    try {
      const res = await api.get("/cleaning/my-rejected");
      setList(res.rejected || []);
    } catch (err) {
      console.error("Rejected cleanings error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, 30000);
    return () => clearInterval(poll);
  }, [user?.id]);

  useEffect(() => { if (refreshKey) load(); }, [refreshKey]);
  useEffect(() => { const clock = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(clock); }, []);

  const fix = (r) => {
    if (!onFixResubmit) return;
    onFixResubmit({
      id: r.toilet_id,
      code: r.toilet_code,
      name: r.toilet_name,
      gender: r.toilet_gender,
      plant_id: r.plant_id,
      plant_name: r.plant_name,
      building_name: r.building_name,
      floor_name: r.floor_name,
      area_name: r.area_name,
      redoOf: r.id,
      redoRemark: r.approval_remarks,
      redoSlot: r.slot_start ? `${r.slot_label || "Slot"} • ${to12h(r.slot_start)} – ${to12h(r.slot_end)} • ${formatDay(r.slot_date)}` : formatDay(r.slot_date)
    });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f0f4f8", padding: "16px 16px 90px" }}>
      <div style={{ background: "#ffffff", borderRadius: "20px", border: list.length ? "1.5px solid #fdba74" : "1px solid #e8edf2", padding: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", maxWidth: "720px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: list.length ? "#ffedd5" : "#dcfce7", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <XCircle size={19} color={list.length ? "#c2410c" : "#15803d"} />
            </div>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>{t("rej.title")}</div>
              <div style={{ fontSize: "11px", color: list.length ? "#c2410c" : "#94a3b8", fontWeight: 600 }}>
                {list.length ? t("rej.count", { n: list.length }) : t("rej.none")}
              </div>
            </div>
          </div>
          <button onClick={load} style={{ background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "6px 8px", cursor: "pointer", color: "#475569", display: "flex", alignItems: "center" }} title="Refresh">
            <RefreshCw size={13} />
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "18px", fontSize: "12px", color: "#94a3b8" }}>{t("common.loading")}</div>
        ) : list.length === 0 ? (
          <div style={{ textAlign: "center", padding: "18px 10px", color: "#94a3b8", background: "#f8fafc", borderRadius: "12px", border: "1px dashed #e2e8f0" }}>
            <CheckCircle2 size={26} color="#10b981" style={{ marginBottom: "4px" }} />
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: "#64748b" }}>{t("rej.allGood")}</div>
            <div style={{ fontSize: "11.5px" }}>{t("rej.emptyHint")}</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {list.map(r => (
              <div key={r.id} style={{ padding: "12px", borderRadius: "14px", border: "1px solid #fed7aa", background: "#fff7ed" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10px", fontWeight: 800, padding: "1px 7px", borderRadius: "10px", background: "#ffedd5", color: "#9a3412", border: "1px solid #fdba74" }}>{t("rej.badge")}</span>
                  <span style={{ fontSize: "10.5px", color: "#94a3b8", marginLeft: "auto", whiteSpace: "nowrap" }}>{timeAgo(r.approved_at, now, t)}</span>
                </div>
                <div style={{ fontSize: "13.5px", fontWeight: 800, color: "#0f172a", display: "flex", alignItems: "center", gap: "5px" }}>
                  <MapPin size={12} color="#0284c7" /> {r.toilet_code} — {r.toilet_name}
                </div>
                <div style={{ fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                  <Clock size={11} />
                  {r.slot_start ? `${r.slot_label || "Slot"} • ${to12h(r.slot_start)} – ${to12h(r.slot_end)}` : t("rej.noSlot")} • {formatDay(r.slot_date)}
                </div>
                <div style={{ marginTop: "8px", padding: "8px 10px", borderRadius: "10px", background: "#ffffff", border: "1px solid #fed7aa", fontSize: "12px", color: "#7c2d12", display: "flex", gap: "6px" }}>
                  <MessageSquareWarning size={14} style={{ flexShrink: 0, marginTop: "1px" }} />
                  <span><b>{t("cw.adminRemark")}:</b> {r.approval_remarks || t("cw.noReason")}{r.approved_by_name ? ` — ${r.approved_by_name}` : ""}</span>
                </div>
                <button type="button" onClick={() => fix(r)} style={{ marginTop: "10px", width: "100%", background: "#ea580c", color: "#ffffff", border: "none", borderRadius: "12px", padding: "11px", fontSize: "13.5px", fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <Camera size={16} /> {t("rej.fix")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
