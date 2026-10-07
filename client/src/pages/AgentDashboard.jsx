import React, { useState, useEffect } from "react";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../i18n/LanguageContext";
import { Clock, CheckCircle2, MapPin, ScanLine } from "lucide-react";

const SLOT_CHIP = {
  APPROVED: { bg: "#dcfce7", color: "#166534", border: "#86efac", labelKey: "slot.APPROVED" },
  PENDING: { bg: "#fef9c3", color: "#854d0e", border: "#fde047", labelKey: "slot.PENDING" },
  REJECTED: { bg: "#ffedd5", color: "#9a3412", border: "#fdba74", labelKey: "slot.REJECTED" },
  MISSED: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", labelKey: "slot.MISSED" },
  DUE: { bg: "#e0f2fe", color: "#075985", border: "#38bdf8", labelKey: "slot.DUE" },
  IN_PROGRESS: { bg: "#e0f2fe", color: "#075985", border: "#38bdf8", labelKey: "slot.IN_PROGRESS" },
  UPCOMING: { bg: "#f1f5f9", color: "#64748b", border: "#e2e8f0", labelKey: "slot.UPCOMING" }
};

function MySlotsCard({ data }) {
  const { t } = useLang();
  const { currentSlot, slots, toilets } = data;
  const upcoming = slots.find(s => s.starts_in > 0 && toilets.some(tt => {
    const c = tt.cells.find(x => x.slot_id === s.id);
    return c && c.status === "UPCOMING";
  })) || null;
  const pendingNow = currentSlot
    ? toilets.filter(tt => {
        const c = tt.cells.find(x => x.slot_id === (tt.current_slot_id ?? currentSlot.id));
        return c && ["DUE", "IN_PROGRESS", "REJECTED"].includes(c.status);
      })
    : [];

  return (
    <div style={{ background: "#ffffff", borderRadius: "20px", border: pendingNow.length ? "1.5px solid #38bdf8" : "1px solid #e8edf2", padding: "16px", boxShadow: "0 4px 20px rgba(0,0,0,0.04)", marginBottom: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", marginBottom: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Clock size={19} color="#0284c7" />
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: "800", color: "#0f172a" }}>{t("dash.slotsTitle")}</div>
            <div style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>{t("dash.slotsSub")}</div>
          </div>
        </div>
      </div>

      {currentSlot ? (
        <div style={{ padding: "12px", borderRadius: "14px", background: pendingNow.length ? "#f0f9ff" : "#ecfdf5", border: `1px solid ${pendingNow.length ? "#7dd3fc" : "#a7f3d0"}`, color: pendingNow.length ? "#075985" : "#065f46", marginBottom: "10px" }}>
          <div style={{ fontSize: "11px", fontWeight: 800, opacity: 0.85, letterSpacing: "0.04em" }}>{t("dash.currentSlot")}</div>
          <div style={{ fontSize: "16px", fontWeight: 900 }}>{currentSlot.label} • {currentSlot.range}</div>
          <div style={{ fontSize: "12px", fontWeight: 600, marginTop: "2px" }}>
            {pendingNow.length
              ? t("dash.pendingLeft", { codes: pendingNow.map(tt => tt.code).join(", "), min: currentSlot.minutes_left })
              : t("dash.allSubmitted")}
          </div>
        </div>
      ) : null}

      <div style={{ padding: "10px 12px", borderRadius: "12px", background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", fontSize: "13px", fontWeight: 800, marginBottom: "12px" }}>
        {upcoming
          ? <>{t("dash.nextCleaning", { label: upcoming.label, range: upcoming.range })} <span style={{ fontWeight: 600 }}>{t("dash.inMin", { min: upcoming.starts_in })}</span></>
          : currentSlot ? t("dash.lastSlot") : t("dash.slotsOver")}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {toilets.map(tt => {
          const openCells = tt.cells.filter(c => c.status !== "APPROVED");
          return (
          <div key={tt.id} style={{ padding: "10px", borderRadius: "12px", background: "#f8fafc", border: "1px solid #eef2f7" }}>
            <div style={{ fontSize: "13px", fontWeight: 800, color: "#0f172a", marginBottom: "6px", display: "flex", alignItems: "center", gap: "5px" }}>
              <MapPin size={12} color="#0284c7" /> {tt.code} — {tt.name}
              {tt.area_name && <span style={{ fontSize: "10.5px", fontWeight: 700, color: "#64748b" }}>• {tt.area_name}</span>}
            </div>
            {openCells.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 700, color: "#15803d" }}>
                <CheckCircle2 size={14} /> {t("dash.allSlotsDone")}
              </div>
            ) : (
            <div style={{ display: "flex", gap: "6px", overflowX: "auto", paddingBottom: "2px" }}>
              {openCells.map(c => {
                const s = slots.find(x => x.id === c.slot_id);
                const chip = SLOT_CHIP[c.status] || SLOT_CHIP.UPCOMING;
                return (
                  <div key={c.slot_id} title={c.approval_remarks || ""} style={{ flex: "0 0 auto", minWidth: "92px", padding: "6px 8px", borderRadius: "10px", background: chip.bg, border: `1px solid ${chip.border}`, color: chip.color }}>
                    <div style={{ fontSize: "11px", fontWeight: 900 }}>{s ? s.range.split(" – ")[0] : ""}</div>
                    <div style={{ fontSize: "10.5px", fontWeight: 700 }}>{t(chip.labelKey)}</div>
                  </div>
                );
              })}
            </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

export default function AgentDashboard({ onOpenQRScanner, refreshKey }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [time, setTime] = useState(new Date());
  const [slotData, setSlotData] = useState(null);

  const loadSlots = async () => {
    try { setSlotData(await api.get("/cleaning/my-slots")); } catch (err) { console.error("Slots error:", err); }
  };

  useEffect(() => {
    loadSlots();
    const poll = setInterval(loadSlots, 30000);
    return () => clearInterval(poll);
  }, [user?.id]);

  useEffect(() => { if (refreshKey) loadSlots(); }, [refreshKey]);
  useEffect(() => { const clock = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(clock); }, []);

  const greeting = () => {
    const h = time.getHours();
    if (h < 12) return t("greet.morning");
    if (h < 17) return t("greet.afternoon");
    return t("greet.evening");
  };

  const timeStr = time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
  const dateStr = time.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg-app)", paddingBottom: "80px" }}>

      {/* HEADER */}
      <div style={{ background: "linear-gradient(160deg, #0b1b33 0%, #13294b 60%, #173a63 100%)", padding: "18px", color: "#ffffff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
            <div style={{ width: "54px", height: "54px", borderRadius: "16px", background: "linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", fontWeight: 800, flexShrink: 0, boxShadow: "0 6px 18px rgba(2,132,199,0.45)" }}>
              {user?.name?.charAt(0)?.toUpperCase() || "H"}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: "13px", color: "#94a3b8", fontWeight: 600 }}>{greeting()},</div>
              <div style={{ fontSize: "19px", fontWeight: 800, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textTransform: "uppercase" }}>
                {user?.name?.split(" ")[0] || "Agent"}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: "24px", fontWeight: 800, fontFamily: "var(--font-mono, monospace)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>{timeStr}</div>
            <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "2px" }}>{dateStr}</div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ padding: "0 16px", marginTop: "16px", position: "relative" }}>

        <button
          type="button"
          onClick={onOpenQRScanner}
          id="btn-dashboard-scan-qr"
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "12px",
            width: "min(100%, 260px)", aspectRatio: "1 / 1", margin: "0 auto 18px", padding: "20px",
            borderRadius: "24px", border: "none", cursor: "pointer", color: "#ffffff",
            background: "linear-gradient(145deg, #0ea5e9 0%, #0284c7 55%, #0369a1 100%)",
            boxShadow: "0 12px 30px rgba(2,132,199,0.35)", touchAction: "manipulation", WebkitTapHighlightColor: "transparent"
          }}
        >
          <div style={{ width: "88px", height: "88px", borderRadius: "22px", background: "rgba(255,255,255,0.18)", border: "2px solid rgba(255,255,255,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <ScanLine size={50} strokeWidth={2.2} />
          </div>
          <div style={{ fontSize: "19px", fontWeight: 900, letterSpacing: "0.01em" }}>{t("nav.scan")}</div>
          <div style={{ fontSize: "12px", fontWeight: 600, opacity: 0.9, textAlign: "center", lineHeight: 1.35 }}>{t("dash.scanTitle")}</div>
        </button>

        {slotData && slotData.slots.length > 0 && <MySlotsCard data={slotData} />}
      </div>
    </div>
  );
}
