import React, { useState, useEffect, useRef } from "react";
import { appleSound } from "../utils/appleSound";
import { Bell, AlertCircle, X, ChevronRight, Camera, Sparkles } from "lucide-react";

export default function NotificationToast({ latestNotification, onActionClick, onDismiss }) {
  const [visible, setVisible] = useState(false);
  const [currentNotif, setCurrentNotif] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (latestNotification && latestNotification.id !== currentNotif?.id) {
      setCurrentNotif(latestNotification);
      setVisible(true);

      // Play authentic Apple notification chime sound!
      appleSound.playAppleChime();

      // Auto dismiss after 10 seconds
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        setVisible(false);
        if (onDismiss) onDismiss();
      }, 10000);
    }
  }, [latestNotification]);

  const handleClose = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (onDismiss) onDismiss();
  };

  const handleAction = () => {
    setVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (onActionClick && currentNotif) {
      onActionClick(currentNotif);
    }
  };

  if (!visible || !currentNotif) return null;

  let meta = {};
  try {
    meta = typeof currentNotif.metadata_json === "string" ? JSON.parse(currentNotif.metadata_json) : (currentNotif.metadata_json || {});
  } catch (e) {}

  const isComplaint = currentNotif.type === "COMPLAINT_NEW" || currentNotif.type === "SLOT_MISSED" || currentNotif.type === "CLEANING_REJECTED" || currentNotif.title?.includes("Complaint") || currentNotif.title?.includes("Defect");

  return (
    <div
      style={{
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(440px, 94vw)",
        zIndex: 9999,
        animation: "appleSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      <style>{`
        @keyframes appleSlideDown {
          0% { opacity: 0; transform: translate(-50%, -24px) scale(0.96); }
          100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
        }
      `}</style>

      {/* iOS style frosted glass notification banner */}
      <div
        style={{
          background: "linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderRadius: "18px",
          border: "1.5px solid rgba(56, 189, 248, 0.35)",
          boxShadow: "0 12px 35px rgba(0, 0, 0, 0.45), 0 0 20px rgba(2, 132, 199, 0.25)",
          padding: "14px 16px",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        {/* Header row: Apple badge, app name, time, close */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "8px",
                background: isComplaint ? "linear-gradient(135deg, #ef4444, #dc2626)" : "linear-gradient(135deg, #0284c7, #38bdf8)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: isComplaint ? "0 2px 8px rgba(239, 68, 68, 0.5)" : "0 2px 8px rgba(2, 132, 199, 0.5)",
              }}
            >
              <Bell size={15} color="#ffffff" />
            </div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: "800", color: isComplaint ? "#f87171" : "#38bdf8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {isComplaint ? "HOUSEKEEPING ALERT" : "HYGIENE 360"}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.4)" }}>Now</span>
            <button
              onClick={handleClose}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: "50%",
                width: "22px",
                height: "22px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "rgba(255,255,255,0.6)",
                cursor: "pointer",
              }}
              title="Dismiss"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Notification Body */}
        <div>
          <div style={{ fontSize: "13.5px", fontWeight: "800", color: "#ffffff", marginBottom: "4px" }}>
            {currentNotif.title || "New Facility Alert"}
          </div>
          <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.78)", lineHeight: "1.45" }}>
            {currentNotif.message}
          </div>

          {meta.toilet_code && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "6px", backgroundColor: "rgba(2, 132, 199, 0.2)", border: "1px solid rgba(56, 189, 248, 0.3)", borderRadius: "6px", padding: "3px 8px", fontSize: "11px", color: "#38bdf8", fontWeight: "700" }}>
              <span>Facility: {meta.toilet_code} {meta.toilet_name ? `(${meta.toilet_name})` : ""}</span>
            </div>
          )}
        </div>

        {/* Action Button: View & Resolve */}
        <div style={{ display: "flex", gap: "8px", marginTop: "2px" }}>
          <button
            onClick={handleAction}
            style={{
              flex: 1,
              height: "36px",
              background: "linear-gradient(135deg, #0284c7, #0ea5e9)",
              border: "none",
              borderRadius: "10px",
              color: "#ffffff",
              fontSize: "12px",
              fontWeight: "800",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              boxShadow: "0 3px 10px rgba(2, 132, 199, 0.35)",
            }}
          >
            <Camera size={14} />
            <span>
              {currentNotif.type === "APPROVAL_REQUEST" ? "Review Photos & Approve"
                : String(currentNotif.type || "").startsWith("SLOT_") ? "Open Cleaning Slots"
                : String(currentNotif.type || "").startsWith("CLEANING_") ? "View Details"
                : "View & Resolve with Live Photo"}
            </span>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
