import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { ShieldCheck, Lock, Mail, AlertCircle, ArrowRight, CheckCircle2, RefreshCw, ArrowLeft, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login, sendOtp, loginWithOtp } = useAuth();
  const [authMode, setAuthMode] = useState("otp");
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [emailStatus, setEmailStatus] = useState(null);
  const [verifiedUserInfo, setVerifiedUserInfo] = useState(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (!email.trim()) { setError("Please enter your registered email or Employee ID."); return; }
    setLoading(true); setError(null);
    try {
      const res = await sendOtp(email.trim().toLowerCase());
      setVerifiedUserInfo(res.user); setEmailStatus(res); setStep(2);
    } catch (err) {
      setError(err.data?.error || err.message || "Invalid email. Contact your IT Admin.");
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e) => {
    e?.preventDefault();
    if (!otp || otp.length < 4) { setError("Please enter the 6-digit OTP code."); return; }
    setLoading(true); setError(null);
    try { await loginWithOtp(email.trim().toLowerCase(), otp.trim()); }
    catch (err) { setError(err.data?.error || err.message || "Invalid or expired OTP."); }
    finally { setLoading(false); }
  };

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true); setError(null);
    try { await login(email.trim().toLowerCase(), password); }
    catch (err) { setError(err.data?.error || err.message || "Login failed."); }
    finally { setLoading(false); }
  };

  const inp = {
    width: "100%", height: "48px", padding: "8px 14px 8px 42px",
    borderRadius: "10px", border: "1px solid #cbd5e1",
    background: "#ffffff", color: "#0f172a",
    fontSize: "14px", outline: "none", boxSizing: "border-box", transition: "border-color 0.15s ease, box-shadow 0.15s ease"
  };
  const focusOn = (e) => { e.target.style.borderColor = "#0284c7"; e.target.style.boxShadow = "0 0 0 3px rgba(2,132,199,0.12)"; };
  const focusOff = (e) => { e.target.style.borderColor = "#cbd5e1"; e.target.style.boxShadow = "none"; };
  const btnPrimary = (disabled) => ({
    width: "100%", height: "50px",
    background: disabled ? "#cbd5e1" : "#0284c7",
    color: "#ffffff", border: "none", borderRadius: "10px", fontSize: "14.5px", fontWeight: "700",
    cursor: disabled ? "not-allowed" : "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", gap: "9px",
    transition: "background 0.15s ease"
  });
  const btnGreen = (disabled) => ({ ...btnPrimary(disabled), background: disabled ? "#cbd5e1" : "#059669" });
  const lbl = { display: "block", fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "6px" };
  const ico = { position: "absolute", left: "14px", top: "16px" };

  return (
    <div style={{ minHeight: "100vh", background: "#f6f7f5", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 16px", boxSizing: "border-box", fontFamily: "var(--font-sans, system-ui, sans-serif)" }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "22px" }}>
          <div style={{ width: "60px", height: "60px", borderRadius: "16px", background: "#e0f2fe", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: "12px" }}>
            <ShieldCheck size={32} color="#0284c7" strokeWidth={2.0} />
          </div>
          <h1 style={{ fontSize: "26px", fontWeight: "800", letterSpacing: "-0.02em", color: "#0f172a", margin: "0 0 4px 0" }}>Hygiene360</h1>
          <p style={{ fontSize: "12.5px", color: "#64748b", margin: 0 }}>PG Electroplast Limited • Housekeeping & Facility Management</p>
        </div>

        <div style={{ background: "#ffffff", borderRadius: "16px", border: "1px solid #e2e8f0", padding: "24px 22px", boxShadow: "0 4px 24px rgba(15,23,42,0.06)" }}>

          <div style={{ display: "flex", gap: "4px", background: "#f1f5f9", borderRadius: "10px", padding: "4px", marginBottom: "20px" }}>
            {[{ k: "otp", label: "OTP Login" }, { k: "password", label: "Password" }].map(({ k, label }) => (
              <button key={k} type="button" onClick={() => { setAuthMode(k); setError(null); }}
                style={{ flex: 1, padding: "9px 8px", borderRadius: "8px", border: "none", fontSize: "13px", fontWeight: "700", cursor: "pointer", transition: "all 0.15s ease", background: authMode === k ? "#ffffff" : "transparent", color: authMode === k ? "#0369a1" : "#64748b", boxShadow: authMode === k ? "0 1px 4px rgba(15,23,42,0.08)" : "none" }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", margin: "0 0 3px 0" }}>
              {authMode === "otp" ? (step === 1 ? "Sign in" : `Hi, ${verifiedUserInfo?.name?.split(" ")[0] || "User"}!`) : "Sign in with password"}
            </h2>
            <p style={{ fontSize: "12.5px", color: "#64748b", margin: 0 }}>
              {authMode === "otp" ? (step === 1 ? "Enter your registered email or Employee ID" : "Enter the 6-digit OTP sent to your email") : "Use your company credentials"}
            </p>
          </div>

          {error && (
            <div style={{ padding: "11px 14px", borderRadius: "10px", background: "#fef2f2", border: "1px solid #fecaca", marginBottom: "16px", display: "flex", gap: "10px", alignItems: "flex-start" }}>
              <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: "1px" }} />
              <div style={{ fontSize: "12.5px", color: "#b91c1c", lineHeight: "1.45" }}>{error}</div>
            </div>
          )}

          {authMode === "otp" && step === 1 && (
            <form onSubmit={handleSendOtp} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={lbl}>Email / Employee ID / Phone</label>
                <div style={{ position: "relative" }}>
                  <Mail size={16} color="#94a3b8" style={ico} />
                  <input type="text" style={inp} onFocus={focusOn} onBlur={focusOff} placeholder="Your email or Employee ID" value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" autoCapitalize="none" autoFocus required />
                </div>
              </div>
              <button type="submit" disabled={loading || !email.trim()} style={btnPrimary(loading || !email.trim())}>
                {loading && <RefreshCw size={16} style={{ animation: "spin 0.8s linear infinite" }} />}
                <span>{loading ? "Verifying..." : "Send Login OTP"}</span>
                {!loading && <ArrowRight size={17} />}
              </button>
            </form>
          )}

          {authMode === "otp" && step === 2 && (
            <form onSubmit={handleVerifyOtp} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", background: "#f0fdf4", borderRadius: "10px", padding: "12px 14px", border: "1px solid #bbf7d0" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "10px", background: "#e0f2fe", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "800", fontSize: "17px", color: "#0369a1", flexShrink: 0 }}>
                  {verifiedUserInfo?.name?.charAt(0) || "U"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: "13.5px", fontWeight: "800", color: "#0f172a" }}>{verifiedUserInfo?.name || "User"}</div>
                  <div style={{ fontSize: "11.5px", color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{verifiedUserInfo?.employee_id} • {verifiedUserInfo?.email || email}</div>
                </div>
                <CheckCircle2 size={20} color="#059669" />
              </div>

              <div style={{ background: "#f0f9ff", borderRadius: "10px", padding: "10px 14px", border: "1px solid #bae6fd", fontSize: "12.5px", color: "#075985" }}>
                OTP sent. Check your <strong>Inbox & Spam</strong>.
                {emailStatus?.emailUnconfigured && <div style={{ marginTop: "5px", color: "#b45309" }}>SMTP pending — use master code <strong>123456</strong></div>}
              </div>

              <div>
                <label style={lbl}>Enter 6-digit OTP</label>
                <input type="text" style={{ width: "100%", height: "58px", background: "#ffffff", border: "1.5px solid #0284c7", borderRadius: "12px", color: "#0f172a", textAlign: "center", fontSize: "28px", fontWeight: "800", letterSpacing: "14px", fontFamily: "var(--font-mono, monospace)", outline: "none", boxSizing: "border-box" }}
                  placeholder="——————" maxLength={6} value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus required />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "8px", fontSize: "12.5px" }}>
                  <button type="button" onClick={() => { setStep(1); setOtp(""); setError(null); }} style={{ border: "none", background: "transparent", color: "#64748b", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", padding: 0 }}>
                    <ArrowLeft size={13} /><span>Change Email</span>
                  </button>
                  <button type="button" onClick={handleSendOtp} disabled={loading} style={{ border: "none", background: "transparent", color: "#0284c7", cursor: "pointer", fontWeight: "700", display: "flex", alignItems: "center", gap: "4px", padding: 0 }}>
                    <RefreshCw size={12} /><span>Resend OTP</span>
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading || otp.length < 4} style={btnGreen(loading || otp.length < 4)}>
                {loading ? <RefreshCw size={16} style={{ animation: "spin 0.8s linear infinite" }} /> : <CheckCircle2 size={18} />}
                <span>{loading ? "Verifying..." : "Verify & Enter App"}</span>
              </button>
            </form>
          )}

          {authMode === "password" && (
            <form onSubmit={handlePasswordLogin} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label style={lbl}>Email / Employee ID</label>
                <div style={{ position: "relative" }}>
                  <Mail size={16} color="#94a3b8" style={ico} />
                  <input type="text" style={inp} onFocus={focusOn} onBlur={focusOff} placeholder="name@pgmail.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
              </div>
              <div>
                <label style={lbl}>Password</label>
                <div style={{ position: "relative" }}>
                  <Lock size={16} color="#94a3b8" style={ico} />
                  <input type={showPassword ? "text" : "password"} style={{ ...inp, padding: "8px 44px 8px 42px" }} onFocus={focusOn} onBlur={focusOff} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} style={{ position: "absolute", right: "13px", top: "14px", background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} style={btnPrimary(loading)}>
                {loading ? <RefreshCw size={16} style={{ animation: "spin 0.8s linear infinite" }} /> : <ArrowRight size={17} />}
                <span>{loading ? "Signing in..." : "Sign In"}</span>
              </button>
            </form>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: "18px" }}>
          <p style={{ fontSize: "11.5px", color: "#94a3b8", margin: 0 }}>Authorized personnel only • © {new Date().getFullYear()} PG Electroplast Limited</p>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } input::placeholder { color: #94a3b8 !important; }`}</style>
    </div>
  );
}
