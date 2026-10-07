import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { api } from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../i18n/LanguageContext";
import { parseUtc, fmtDateTime, fmt12 } from "../utils/istTime";
import { X, AlertCircle, CheckCircle2, Camera, ShieldAlert, MapPin, User, Clock, RotateCcw, Check, AlertTriangle, UserCog } from "lucide-react";
import EvidencePhoto from "./EvidencePhoto";
import ResolveEvidenceModal from "./ResolveEvidenceModal";
const ACTIVE = ["OPEN", "ASSIGNED", "IN_PROGRESS", "REOPENED"];
const HOUSEKEEPING_ROLES = ["HOUSEKEEPING_AGENT", "HOUSEKEEPING"];

function toLocalInput(utc) {
  const d = parseUtc(utc);
  if (!d) return "";
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function IssueDetailModal({ isOpen, onClose, issueId, onIssueUpdated }) {
  const { user } = useAuth();
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionRemarks, setActionRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [zoomPhoto, setZoomPhoto] = useState(null);
  const [people, setPeople] = useState([]);
  const [assignAgentId, setAssignAgentId] = useState("");
  const [assignTarget, setAssignTarget] = useState("");
  const [assignOpen, setAssignOpen] = useState(false);
  const loadIssue = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/issues/${issueId}`);
      setData(res);
      setActionRemarks("");
      setActionError(null);
      setAssignAgentId(res.issue?.assigned_agent_id ? String(res.issue.assigned_agent_id) : "");
      setAssignTarget(toLocalInput(res.issue?.target_at));
      setAssignOpen(!!res.issue && res.issue.status === "OPEN" && !res.issue.assigned_agent_id && res.issue.complaint_type !== "CLEANING_AUDIT");
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [issueId]);

  const bodyRef = useRef(null);

  useEffect(() => {
    if (isOpen && issueId) loadIssue();
  }, [isOpen, issueId, loadIssue]);

  useEffect(() => {
    if (isOpen && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [isOpen, issueId, data?.issue?.status]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  const issue = data?.issue;
  const canVerify = !!issue?.can_verify;

  useEffect(() => {
    if (!assignOpen || !issue || people.length) return;
    api.get("/issues/responsible-people", { plantId: issue.plant_id })
      .then(res => setPeople(res.people || []))
      .catch(() => {});
  }, [assignOpen, issue, people.length]);

  const refreshAfterChange = async () => {
    await loadIssue();
    if (onIssueUpdated) onIssueUpdated();
  };

  const handleUpdateStatus = async (newStatus) => {
    if (newStatus === "REOPENED" && !actionRemarks.trim()) {
      setActionError("Please write why the action is not acceptable before reopening.");
      return;
    }
    setSubmitting(true);
    setActionError(null);
    try {
      await api.patch(`/issues/${issueId}/status`, { status: newStatus, remarks: actionRemarks });
      await refreshAfterChange();
    } catch (err) {
      setActionError(err.data?.error || err.message || "Status update failed");
    } finally { setSubmitting(false); }
  };

  const handleAssign = async () => {
    setSubmitting(true);
    setActionError(null);
    try {
      await api.patch(`/issues/${issueId}/assign`, {
        assignedAgentId: assignAgentId ? Number(assignAgentId) : null,
        targetAt: assignTarget ? new Date(assignTarget).toISOString() : null
      });
      setAssignOpen(false);
      await refreshAfterChange();
    } catch (err) {
      setActionError(err.data?.error || err.message || "Could not update the issue");
    } finally { setSubmitting(false); }
  };

  const handleResolved = async () => {
    setResolveOpen(false);
    await refreshAfterChange();
  };

  if (!isOpen) return null;

  const isHousekeeper = HOUSEKEEPING_ROLES.includes(user?.role);
  const isActive = ACTIVE.includes(issue?.status);
  const isClosed = issue?.status === "CLOSED" || issue?.status === "VERIFIED";
  const isAudit = issue?.complaint_type === "CLEANING_AUDIT";
  const canAgentAct = isHousekeeper && isActive;
  const unassigned = !!issue && !issue.assigned_agent_id;
  const slotLine = issue?.source_slot_label
    ? `${issue.source_slot_label} (${fmt12(issue.source_slot_start)} – ${fmt12(issue.source_slot_end)})${issue.source_slot_date ? ` • ${issue.source_slot_date}` : ""}`
    : t("cw.noSlot");

  const target = parseUtc(issue?.target_at);
  const overdue = !!(isActive && target && target.getTime() < Date.now());
  const updates = data?.updates || [];

  const statusColor = (s) => {
    if (s === "CLOSED" || s === "VERIFIED") return { bg: "#f0fdf4", border: "#86efac", text: "#15803d" };
    if (s === "RESOLVED") return { bg: "#fefce8", border: "#fde047", text: "#a16207" };
    if (s === "IN_PROGRESS") return { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" };
    return { bg: "#fef2f2", border: "#fca5a5", text: "#991b1b" };
  };

  const sectionLabel = { fontSize: "11px", fontWeight: "800", color: "#64748b", marginBottom: "5px", letterSpacing: "0.03em" };
  const box = { fontSize: "13px", color: "#1e293b", backgroundColor: "#f8fafc", padding: "10px 12px", borderRadius: "10px", border: "1px solid var(--color-border)", lineHeight: "1.5" };

  const locationLine = issue ? [issue.plant_name, issue.building_name, issue.block_name, issue.floor_name, issue.area_name].filter(Boolean).join(" / ") : "";

  const workflow = !issue ? [] : isAudit ? [
    { key: "submitted", label: t("idm.wf.cleaningSubmitted"), done: true, detail: `${slotLine}${issue.flagged_session_code ? ` • ${issue.flagged_session_code}` : ""}` },
    { key: "raised", label: t("idm.wf.issueRaised"), done: true, danger: isActive, detail: `${issue.supervisor_name || issue.reported_by_name || ""} • ${fmtDateTime(issue.created_at)}` },
    { key: "redo", label: t("idm.wf.redo"), done: issue.status === "RESOLVED" || isClosed, current: isActive, detail: issue.resolved_at && !isActive ? fmtDateTime(issue.resolved_at) : (isActive ? t("idm.wf.redoPending") : "") },
    { key: "review", label: t("idm.wf.adminReview"), done: isClosed, current: issue.status === "RESOLVED", detail: isClosed ? fmtDateTime(issue.verified_at) : "" },
    { key: "closed", label: t("idm.wf.closed"), done: isClosed, detail: "" }
  ] : [
    { key: "created", label: t("idm.wf.created"), done: true, detail: fmtDateTime(issue.created_at) },
    { key: "responsible", label: t("idm.wf.responsible"), done: !!issue.agent_name, detail: issue.agent_name || t("idm.notSet") },
    { key: "target", label: t("idm.wf.target"), done: !!issue.target_at, detail: issue.target_at ? `${fmtDateTime(issue.target_at)}${overdue ? ` • ${t("iss.overdue")}` : ""}` : t("idm.notSet"), danger: overdue },
    { key: "action", label: t("idm.wf.action"), done: issue.status === "RESOLVED" || isClosed, detail: issue.resolved_at ? fmtDateTime(issue.resolved_at) : (issue.status === "IN_PROGRESS" ? t("status.IN_PROGRESS") : "") },
    { key: "verify", label: t("idm.wf.verify"), done: isClosed, current: issue.status === "RESOLVED", detail: isClosed ? fmtDateTime(issue.verified_at) : (issue.status === "RESOLVED" ? t("status.RESOLVED") : "") },
    { key: "closed", label: t("idm.wf.closed"), done: isClosed, detail: "" }
  ];

  return createPortal(
    <>
      <div className="modal-overlay h360-sheet-overlay" onClick={onClose}>
        <div className="modal-content h360-sheet" style={{ maxWidth: "640px", maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>

          <div className="modal-header">
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <AlertCircle size={20} color="var(--color-danger-600)" style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <h3 className="modal-title" style={{ margin: 0, fontSize: "15px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {issue ? `${issue.ticket_no}: ${issue.checklist_item_label || issue.category}` : t("idm.issue")}
                </h3>
                <div style={{ fontSize: "11px", color: "var(--color-primary-500)", fontFamily: "var(--font-mono)" }}>{issue?.toilet_uid || issue?.toilet_code || "General Area"}</div>
              </div>
            </div>
            <button onClick={onClose} style={{ background: "transparent", border: "none", cursor: "pointer", padding: "4px" }}>
              <X size={20} />
            </button>
          </div>

          <div className="modal-body" ref={bodyRef}>
            {loading && !issue ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--color-primary-500)" }}>{t("common.loading")}</div>
            ) : !issue ? (
              <div style={{ textAlign: "center", padding: "40px", color: "var(--color-danger-600)" }}>Issue not found.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>

                {(() => { const c = statusColor(issue.status); return (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 12px", borderRadius: "10px", backgroundColor: c.bg, border: `1px solid ${c.border}` }}>
                    <span style={{ fontSize: "13px", fontWeight: "800", color: c.text }}>{t(`status.${issue.status}`)}</span>
                    <span style={{ fontSize: "11.5px", color: "#64748b", fontWeight: 700 }}>{issue.category} • {issue.priority}</span>
                  </div>
                ); })()}

                {isAudit && (
                  <div style={{ padding: "12px 14px", borderRadius: "10px", background: "#fff7ed", border: "1px solid #fdba74", fontSize: "12.5px", color: "#7c2d12", display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ fontWeight: 800, color: "#9a3412" }}>{t("idm.auditTitle")}</div>
                    <div><b>{t("cw.slotLabel")}:</b> {slotLine}</div>
                    {issue.source_submit_time && <div><b>{t("idm.submittedAt")}:</b> {fmtDateTime(issue.source_submit_time)}</div>}
                    <div><b>{t("cw.adminRemark")}:</b> {issue.verification_remarks || issue.description}</div>
                    {(issue.reopened_count || 0) > 0 && <div style={{ fontWeight: 700 }}>{t("idm.redoRejectedTimes", { n: issue.reopened_count })}</div>}
                  </div>
                )}

                {!isAudit && issue.status === "REOPENED" && issue.verification_remarks && (
                  <div style={{ padding: "10px 12px", borderRadius: "10px", background: "#fff7ed", border: "1px solid #fdba74", fontSize: "12.5px", color: "#7c2d12" }}>
                    <strong>{t("idm.reopenedMsg")}:</strong> {issue.verification_remarks}
                  </div>
                )}

                {issue.is_fake_audit_flagged === 1 && (
                  <div style={{ backgroundColor: "#fee2e2", border: "1.5px solid #fca5a5", borderRadius: "10px", padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#dc2626", fontWeight: "800", fontSize: "12px" }}>
                      <ShieldAlert size={15} /><span>CLEANING DISCREPANCY</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#991b1b", marginTop: "3px", lineHeight: "1.4" }}>
                      Marked clean by <strong>{issue.flagged_agent_name}</strong> ({issue.flagged_agent_emp_id}) in session {issue.flagged_session_code}.
                    </div>
                  </div>
                )}

                {/* Workflow */}
                <div>
                  <div style={sectionLabel}>{t("idm.workflow")}</div>
                  <div style={{ ...box, padding: "12px 14px" }}>
                    {workflow.map((step, idx) => {
                      const color = step.danger ? "#dc2626" : step.done ? "#16a34a" : step.current ? "#ca8a04" : "#cbd5e1";
                      return (
                        <div key={step.key} style={{ display: "flex", gap: "10px" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <div style={{ width: "20px", height: "20px", borderRadius: "50%", background: step.done || step.current || step.danger ? color : "#ffffff", border: `2px solid ${color}`, color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                              {step.done && !step.danger && <Check size={12} strokeWidth={3} />}
                              {step.danger && <AlertTriangle size={11} />}
                            </div>
                            {idx < workflow.length - 1 && <div style={{ width: "2px", flex: 1, minHeight: "14px", background: step.done ? "#86efac" : "#e2e8f0" }} />}
                          </div>
                          <div style={{ paddingBottom: idx < workflow.length - 1 ? "10px" : 0, minWidth: 0 }}>
                            <div style={{ fontSize: "12.5px", fontWeight: 800, color: step.done || step.current ? "#0f172a" : "#94a3b8" }}>{step.label}</div>
                            {step.detail && <div style={{ fontSize: "11.5px", color: step.danger ? "#b91c1c" : "#64748b", fontWeight: step.danger ? 800 : 500 }}>{step.detail}</div>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div style={sectionLabel}>{t("idm.issue")}</div>
                  <div style={box}>{issue.description || "No description provided."}</div>
                </div>

                {/* Before / After photos */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "10px" }}>
                  <div>
                    <div style={{ ...sectionLabel, color: "#b91c1c" }}>{t("idm.before")}</div>
                    {issue.evidence_photo_path ? (
                      <EvidencePhoto src={issue.evidence_photo_path} alt="Issue photo" maxHeight="260px" onClick={() => setZoomPhoto(issue.evidence_photo_path)} />
                    ) : (
                      <div style={{ ...box, color: "#94a3b8", textAlign: "center", borderStyle: "dashed" }}>{t("idm.noPhoto")}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ ...sectionLabel, color: "#15803d" }}>{t("idm.after")}</div>
                    {issue.resolution_photo_path ? (
                      <EvidencePhoto src={issue.resolution_photo_path} alt="Action taken photo" maxHeight="260px" onClick={() => setZoomPhoto(issue.resolution_photo_path)} />
                    ) : (
                      <div style={{ ...box, color: "#94a3b8", textAlign: "center", borderStyle: "dashed" }}>{t("idm.noPhoto")}</div>
                    )}
                  </div>
                </div>

                {issue.resolution_remarks && issue.resolution_photo_path && (
                  <div style={{ padding: "10px 12px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0", fontSize: "12.5px" }}>
                    <strong style={{ color: "#047857" }}>{t("idm.wf.action")}:</strong> {issue.resolution_remarks}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px" }}>
                  <div style={box}>
                    <div style={sectionLabel}><MapPin size={11} style={{ verticalAlign: "-1px" }} /> {t("idm.location")}</div>
                    <div style={{ fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "12.5px" }}>{issue.toilet_uid || issue.toilet_code || "N/A"}</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>{issue.toilet_name ? `${issue.toilet_name} • ` : ""}{locationLine}</div>
                  </div>
                  <div style={box}>
                    <div style={sectionLabel}><User size={11} style={{ verticalAlign: "-1px" }} /> {t("idm.reportedBy")}</div>
                    <div style={{ fontWeight: 700 }}>{issue.reported_by_name || issue.supervisor_name || "Staff"}</div>
                    <div style={{ fontSize: "12px", color: "#64748b" }}>
                      {issue.reported_by_emp_id ? `Emp: ${issue.reported_by_emp_id}` : ""}
                      {issue.reported_by_phone ? ` • ${issue.reported_by_phone}` : ""}
                    </div>
                    {(issue.reported_by_department || issue.reported_by_designation) && (
                      <div style={{ fontSize: "12px", color: "#64748b" }}>
                        {[issue.reported_by_department, issue.reported_by_designation].filter(Boolean).join(" • ")}
                      </div>
                    )}
                    <div style={{ fontSize: "11.5px", color: "#64748b", display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                      <Clock size={11} /> {fmtDateTime(issue.created_at)}
                    </div>
                  </div>
                  <div style={box}>
                    <div style={sectionLabel}>{t("idm.responsible")}</div>
                    <div style={{ fontWeight: 700 }}>{issue.agent_name || t("idm.notSet")}</div>
                    {issue.agent_emp_id && <div style={{ fontSize: "12px", color: "#64748b" }}>Emp: {issue.agent_emp_id}</div>}
                    {(issue.toilet_supervisor_name || issue.supervisor_name) && (
                      <div style={{ fontSize: "11.5px", color: "#64748b", marginTop: "2px" }}>Supervisor: {issue.toilet_supervisor_name || issue.supervisor_name}</div>
                    )}
                  </div>
                  <div style={{ ...box, borderColor: overdue ? "#fca5a5" : "var(--color-border)", background: overdue ? "#fef2f2" : "#f8fafc" }}>
                    <div style={sectionLabel}>{t("idm.target")}</div>
                    <div style={{ fontWeight: 800, color: overdue ? "#b91c1c" : "#0f172a" }}>{issue.target_at ? fmtDateTime(issue.target_at) : t("idm.notSet")}</div>
                    {overdue && <div style={{ fontSize: "11.5px", fontWeight: 800, color: "#b91c1c" }}>{t("iss.overdue")}</div>}
                  </div>
                </div>

                {/* Admin / supervisor: responsible person and target time */}
                {canVerify && isActive && !isAudit && (
                  <div style={{ padding: "12px 14px", borderRadius: "10px", border: `1px solid ${unassigned ? "#fcd34d" : "#bae6fd"}`, background: unassigned ? "#fffbeb" : "#f0f9ff" }}>
                    {!assignOpen ? (
                      <button type="button" onClick={() => setAssignOpen(true)} className="btn btn-outline btn-sm" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <UserCog size={14} /> {unassigned ? "Verify & assign housekeeper" : "Change housekeeper / target time"}
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <div style={{ fontSize: "12.5px", fontWeight: 800, color: unassigned ? "#92400e" : "#0369a1" }}>
                          {unassigned ? "Verify this complaint and push it to a housekeeper" : "Housekeeper & target time"}
                        </div>
                        {unassigned && (
                          <div style={{ fontSize: "12px", color: "#78350f" }}>The selected housekeeper gets a notification and must fix it with a live photo.</div>
                        )}
                        <select className="form-control" value={assignAgentId} onChange={e => setAssignAgentId(e.target.value)}>
                          <option value="">{unassigned ? "— Select housekeeper —" : "— Keep current —"}</option>
                          {people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.employee_id})</option>)}
                        </select>
                        <label style={{ fontSize: "11.5px", fontWeight: 700, color: "#64748b" }}>Target time (optional)</label>
                        <input type="datetime-local" className="form-control" value={assignTarget} onChange={e => setAssignTarget(e.target.value)} />
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button type="button" onClick={handleAssign} disabled={submitting || (unassigned && !assignAgentId)} className="btn btn-primary btn-sm" style={{ flex: 1 }}>
                            {unassigned ? "Verify & Push to Housekeeper" : "Save"}
                          </button>
                          <button type="button" onClick={() => setAssignOpen(false)} disabled={submitting} className="btn btn-outline btn-sm">Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isAudit && canVerify && isActive && (
                  <div style={{ padding: "12px 14px", background: "#f8fafc", borderRadius: "10px", border: "1px solid var(--color-border)", fontSize: "12.5px", color: "#475569" }}>
                    Waiting for {issue.agent_name || "the housekeeper"} to clean again and resubmit with a live photo. It will come back here for your verification.
                  </div>
                )}

                {issue.status === "RESOLVED" && !canVerify && (
                  <div style={{ padding: "12px 14px", background: "#fefce8", borderRadius: "10px", border: "1px solid #fde047", fontSize: "13px", fontWeight: 700, color: "#854d0e" }}>
                    {t("idm.waitingVerify")}
                  </div>
                )}

                {issue.status === "RESOLVED" && canVerify && (
                  <div style={{ padding: "14px", borderRadius: "10px", backgroundColor: "#f8fafc", border: "1px solid var(--color-border)" }}>
                    <div style={{ fontSize: "13px", fontWeight: "800", color: "#0f172a", marginBottom: "4px" }}>{isAudit ? "Resubmitted — verify it" : "Supervisor Verification"}</div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "8px" }}>
                      {isAudit
                        ? "Check the new live photo. Verify & Close if it is clean now, or Roll Back with a remark to send it to the housekeeper again."
                        : "Compare the before and after photos. Close the issue if the action is acceptable, or reopen it with a reason."}
                    </div>
                    <textarea rows={2} className="form-control" placeholder={isAudit ? "Remark (required for roll back)" : "Verification remarks (required for reopening)"} value={actionRemarks} onChange={e => setActionRemarks(e.target.value)} style={{ marginBottom: "10px" }} />
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => handleUpdateStatus("CLOSED")} disabled={submitting} className="btn btn-success" style={{ flex: 1 }}>
                        <CheckCircle2 size={16} /><span>Verify & Close</span>
                      </button>
                      <button onClick={() => handleUpdateStatus("REOPENED")} disabled={submitting} className="btn btn-outline" style={{ flex: 1, color: "#b91c1c", borderColor: "#fca5a5" }}>
                        <RotateCcw size={15} /><span>{isAudit ? "Roll Back" : "Reopen"}</span>
                      </button>
                    </div>
                  </div>
                )}

                {isClosed && (
                  <div style={{ padding: "12px 14px", background: "#f0fdf4", borderRadius: "10px", border: "1px solid #86efac", display: "flex", alignItems: "center", gap: "10px" }}>
                    <CheckCircle2 size={20} color="#16a34a" />
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#065f46" }}>
                      {t("idm.closedMsg")}
                      {issue.verification_remarks && <div style={{ fontWeight: 500, fontSize: "12px" }}>{issue.verification_remarks}</div>}
                    </div>
                  </div>
                )}

                {actionError && (
                  <div style={{ padding: "10px 12px", borderRadius: "8px", background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: "12.5px" }}>{actionError}</div>
                )}

                {updates.length > 0 && (
                  <div>
                    <div style={sectionLabel}>{t("idm.history")}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      {updates.map(u => (
                        <div key={u.id} style={{ fontSize: "12px", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--color-border)", background: "#ffffff" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                            <strong style={{ color: "#0f172a" }}>{u.to_status ? t(`status.${u.to_status}`) : "Update"}</strong>
                            <span style={{ color: "#64748b" }}>{fmtDateTime(u.created_at)}</span>
                          </div>
                          <div style={{ color: "#475569" }}>{u.user_name}{u.remarks ? ` — ${u.remarks}` : ""}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {canAgentAct ? (
            <div className="modal-footer" style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: "8px", background: "#f0fdf4", borderTop: "1.5px solid #86efac" }}>
              <div>
                <div style={{ fontSize: "14px", fontWeight: 800, color: "#065f46" }}>{t(isAudit ? "idm.resubmitQuestion" : "idm.fixedQuestion")}</div>
                <div style={{ fontSize: "12px", color: "#065f46", lineHeight: 1.4 }}>{t(isAudit ? "idm.resubmitHint" : "idm.agentHint")}</div>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button onClick={onClose} className="btn btn-outline" style={{ flex: 1, height: "46px", background: "#ffffff" }}>{t("common.close")}</button>
                <button onClick={() => setResolveOpen(true)} disabled={submitting} className="btn btn-success" style={{ flex: 1, height: "46px", fontSize: "14px", fontWeight: 800 }}>
                  <Camera size={17} /><span>{t(isAudit ? "idm.resubmitYes" : "idm.fixedYes")}</span>
                </button>
              </div>
            </div>
          ) : (
          <div className="modal-footer" style={{ display: "flex", gap: "10px" }}>
            <button onClick={onClose} className="btn btn-outline">{t("common.close")}</button>
          </div>
          )}
        </div>
      </div>

      <ResolveEvidenceModal
        isOpen={resolveOpen}
        issue={issue}
        onClose={() => setResolveOpen(false)}
        onResolved={handleResolved}
      />

      {zoomPhoto && (
        <div className="modal-overlay" style={{ zIndex: 1200, padding: "10px" }} onClick={() => setZoomPhoto(null)}>
          <button onClick={() => setZoomPhoto(null)} style={{ position: "absolute", top: "14px", right: "14px", width: "38px", height: "38px", borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={20} />
          </button>
          <div style={{ width: "100%", maxWidth: "900px" }} onClick={e => e.stopPropagation()}>
            <EvidencePhoto src={zoomPhoto} alt="Evidence" maxHeight="88vh" style={{ backgroundColor: "transparent" }} />
          </div>
        </div>
      )}
    </>,
    document.body
  );
}
