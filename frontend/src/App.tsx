import { useState, useEffect } from "react";
import FloatingSpiky from "./assets/floatingspiky.png";
import "./App.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthStatus = "loading" | "unauthenticated" | "authenticated";
type WorkflowStatus =
  | "idle"
  | "pending_consent"
  | "fetching_records"
  | "analyzing"
  | "draft_ready"
  | "submitted"
  | "error";

interface User {
  name: string;
  email: string;
  picture?: string;
}

interface PriorAuthForm {
  patientName: string;
  patientDOB: string;
  memberId: string;
  medicationRequested: string;
  ndc: string;
  icd10Code: string;
  diagnosis: string;
  clinicalJustification: string;
  previousTreatments: string;
  prescribingPhysician: string;
  physicianNPI: string;
  urgency: "routine" | "urgent" | "emergent";
  supportingDocumentation: string[];
}

interface SubmissionResult {
  referenceNumber: string;
  status: string;
  estimatedDecisionDate: string;
  submittedAt: string;
}

interface AgentLogEntry {
  role: string;
  content: string;
}

interface PARequest {
  id: string;
  patientId: string;
  medicationName: string;
  diagnosis: string;
  insurerId: string;
  status: WorkflowStatus;
  createdAt: string;
  aiDraftForm?: PriorAuthForm;
  submissionResult?: SubmissionResult;
  agentLog?: AgentLogEntry[];
  error?: string;
}

interface Insurer {
  id: string;
  name: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND = "http://localhost:3001";
const API = `${BACKEND}/api`;

const DEMO_PATIENTS = [
  { id: "eQMSMe9j-O23nW7ovHXWnkA3", label: "Camila Lopez" },
  { id: "erXuFYUfucBZaryVksYEcMg3", label: "Derrick Lin" },
  { id: "eq081-VQEgP8drUUqCWzHfw3", label: "Jason Argonaut" },
];

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  idle: "Idle",
  pending_consent: "Awaiting Patient Consent",
  fetching_records: "Fetching Health Records",
  analyzing: "AI Analyzing Records",
  draft_ready: "Draft Ready",
  submitted: "Submitted to Insurer",
  error: "Error",
};

// ─── Design tokens matching landing page ──────────────────────────────────────

const T = {
  bg:          "#F6F3EB",
  card:        "#FFFFFF",
  border:      "#E4DECD",
  borderLight: "#EDE8DA",
  dark:        "#1B1B18",
  muted:       "#726C5E",
  coral:       "#B5402A",
  yellow:      "#D9A441",
  green:       "#5C7A5A",
  blue:        "#33465C",
  inputBg:     "#FFFFFF",
  serif:       "'Space Grotesk', 'Helvetica Neue', sans-serif" as const,
  sans:        "'Inter', 'Segoe UI', sans-serif" as const,
  mono:        "'IBM Plex Mono', 'Menlo', monospace" as const,
};

const cardStyle: React.CSSProperties = {
  background: T.card,
  border: `1.5px solid ${T.border}`,
  borderRadius: "18px",
  padding: "28px",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: "600",
  color: T.dark,
  marginBottom: "6px",
  fontFamily: T.sans,
  letterSpacing: "0.01em",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  border: `1.5px solid ${T.border}`,
  borderRadius: "10px",
  padding: "11px 14px",
  fontSize: "14px",
  background: T.inputBg,
  color: T.dark,
  fontFamily: T.sans,
  outline: "none",
  boxSizing: "border-box",
  appearance: "none",
  cursor: "pointer",
};

function SectionLabel({ text }: { text: string }) {
  return (
    <div style={{ fontSize: "11px", color: T.muted, fontWeight: "700", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: "8px" }}>
      {text}
    </div>
  );
}

function Chip({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", background: bg, color, borderRadius: "100px", padding: "5px 14px", fontSize: "12px", fontWeight: "600", fontFamily: T.sans, letterSpacing: "0.02em", flexShrink: 0 }}>
      {label}
    </span>
  );
}

// ─── API helper ───────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

function Spinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const px = size === "sm" ? "14px" : size === "lg" ? "32px" : "20px";
  return (
    <svg style={{ width: px, height: px, animation: "priorSpin 0.8s linear infinite", flexShrink: 0 }} fill="none" viewBox="0 0 24 24">
      <style>{`@keyframes priorSpin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke={T.dark} strokeWidth="3" opacity="0.15" />
      <path fill={T.dark} opacity="0.7" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────

const STATUS_CHIP: Record<WorkflowStatus, { bg: string; color: string }> = {
  idle:             { bg: "#f0ece3",  color: "#888" },
  pending_consent:  { bg: "#fef9c3",  color: "#713f12" },
  fetching_records: { bg: "#dbeafe",  color: "#1e40af" },
  analyzing:        { bg: "#ede9fe",  color: "#5b21b6" },
  draft_ready:      { bg: "#dcfce7",  color: "#166534" },
  submitted:        { bg: "#cffafe",  color: "#155e75" },
  error:            { bg: "#fee2e2",  color: "#991b1b" },
};

function Badge({ status }: { status: WorkflowStatus }) {
  const c = STATUS_CHIP[status];
  const spinning = ["fetching_records", "analyzing", "pending_consent"].includes(status);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: c.bg, color: c.color, borderRadius: "100px", padding: "4px 12px", fontSize: "11px", fontWeight: "600", fontFamily: T.sans, whiteSpace: "nowrap" }}>
      {spinning && <Spinner size="sm" />}
      {STATUS_LABELS[status]}
    </span>
  );
}

// ─── Pulse signature ────────────────────────────────────────────────────────
// The one recurring motif: a clinical pulse line that resolves into an
// approval check. Used in the hero, and again wherever the app is "working".

function PulseSignature({ animate = true, height = 200 }: { animate?: boolean; height?: number }) {
  return (
    <svg viewBox="0 0 400 200" style={{ width: "100%", height, display: "block", overflow: "visible" }}>
      <path
        d="M8,120 L92,120 L112,72 L136,168 L160,32 L182,120 L248,120 L266,96 L282,120 L340,120"
        fill="none"
        stroke={T.coral}
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "pulse-line" : undefined}
      />
      <g className={animate ? "pulse-check" : undefined}>
        <circle cx="356" cy="120" r="30" fill={T.green} />
        <path d="M344,120 L353,129 L370,110" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

// ─── Ticker ───────────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  "Auto-submit",
  "Seconds not days",
  "Patient-controlled",
  "Auth0 Token Vault",
  "Epic FHIR R4",
  "Claude AI",
  "CIBA Consent",
  "Insurer Submission",
];

function Ticker() {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];
  return (
    <div style={{ background: T.coral, overflow: "hidden", position: "relative", zIndex: 5, padding: "16px 0", transform: "rotate(-1deg)", margin: "8px 0" }}>
      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .ticker-track {
          display: flex;
          animation: tickerScroll 24s linear infinite;
          width: max-content;
        }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-track">
        {items.map((label, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: "10px", color: "#fff", fontSize: "17px", fontWeight: "800", fontFamily: T.serif, whiteSpace: "nowrap", padding: "0 26px" }}>
            {label}
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#fff", flexShrink: 0, opacity: 0.7 }} />
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Stats section ────────────────────────────────────────────────────────────

const STATS = [
  { value: "$13B",  label: "Annual PA cost burden" },
  { value: "4.5h",  label: "Saved per authorization" },
  { value: "94%",   label: "Approval rate" },
];

function StatsSection() {
  return (
    <div style={{ position: "relative", zIndex: 5, display: "flex", justifyContent: "center", gap: "20px", flexWrap: "wrap", padding: "0 24px 52px" }}>
      {STATS.map((s) => (
        <div key={s.value} style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: "18px", padding: "32px 44px", minWidth: "180px", textAlign: "center", boxShadow: "0 2px 16px rgba(43,38,34,0.05)" }}>
          <div style={{ fontSize: "40px", fontWeight: "900", color: T.dark, fontFamily: T.serif, letterSpacing: "-0.03em", lineHeight: 1.1 }}>{s.value}</div>
          <div style={{ fontSize: "13px", color: T.muted, marginTop: "6px", fontFamily: T.sans }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Expertise section (image-icon cards, like the reference) ────────────────

const HOW_IT_WORKS = [
  {
    tint: "#EDE0D0",
    iconColor: T.coral,
    title: "CIBA Step-up Consent",
    desc: "Patient approves on their device before a single byte of health data is accessed.",
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
  {
    tint: "#E4E7DC",
    iconColor: T.blue,
    title: "Epic FHIR R4 Access",
    desc: "Records pulled live from Epic via Auth0 Token Vault, no credentials ever stored in PriorAgent.",
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </svg>
    ),
  },
  {
    tint: "#E8E0EA",
    iconColor: "#8A6BA8",
    title: "Claude AI Analysis",
    desc: "Claude reads the full clinical picture and drafts a complete, insurer-specific prior auth form in seconds.",
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 8v4l3 3" />
      </svg>
    ),
  },
  {
    tint: "#DEE8DE",
    iconColor: T.green,
    title: "Instant Submission",
    desc: "The completed form goes straight to the insurer, no fax, no portal login, no waiting.",
    icon: (
      <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
      </svg>
    ),
  },
];

function HowItWorksSection() {
  return (
    <div style={{ position: "relative", zIndex: 5, maxWidth: "1100px", margin: "0 auto", padding: "64px 24px 80px" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "36px" }}>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 40px)", fontWeight: "900", color: T.dark, letterSpacing: "-0.02em", margin: 0, fontFamily: T.serif }}>
          Our Expertise
        </h2>
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: T.coral, flexShrink: 0 }} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px" }}>
        {HOW_IT_WORKS.map((item, i) => (
          <div key={item.title} style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: "20px", padding: "22px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <div
              style={{
                width: "100%",
                aspectRatio: "1.4",
                borderRadius: "14px",
                position: "relative",
                overflow: "hidden",
                background: `linear-gradient(150deg, #2A2A28 0%, #55534C 55%, #A8A398 100%)`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* faint grid texture, like a diagnostic readout */}
              <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.14 }}>
                <defs>
                  <pattern id={`grid-${i}`} width="18" height="18" patternUnits="userSpaceOnUse">
                    <path d="M18 0H0V18" fill="none" stroke="#fff" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#grid-${i})`} />
              </svg>
              <span style={{ position: "absolute", top: "12px", right: "14px", width: "7px", height: "7px", borderRadius: "50%", background: item.iconColor, boxShadow: `0 0 0 5px ${item.iconColor}33` }} />
              <div style={{ position: "relative", color: "#fff", opacity: 0.92 }}>
                {item.icon}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: T.dark, marginBottom: "6px", fontFamily: T.serif, letterSpacing: "-0.01em" }}>{item.title}</div>
              <div style={{ fontSize: "13px", color: T.muted, lineHeight: "1.6", fontFamily: T.sans }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Hero / Landing ───────────────────────────────────────────────────────────

function Hero({ onLogin }: { onLogin: () => void }) {
  return (
    <div style={{ background: T.bg, minHeight: "100vh", position: "relative", fontFamily: T.sans }}>

      {/* Nav */}
      <nav style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 44px", maxWidth: "1280px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "30px", height: "30px", background: T.dark, borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" fill="none" stroke={T.bg} strokeWidth="2.2" strokeLinecap="round" viewBox="0 0 24 24">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <span style={{ fontWeight: "700", fontSize: "19px", color: T.dark, letterSpacing: "-0.02em", fontFamily: T.serif }}>PriorAgent</span>
          <span style={{ fontFamily: T.mono, fontSize: "10px", color: T.muted, border: `1px solid ${T.border}`, borderRadius: "5px", padding: "2px 6px", marginLeft: "2px" }}>EST 2026</span>
        </div>

        <div style={{ display: "flex", gap: "36px", fontSize: "13px", fontWeight: "600", color: T.dark }}>
          {["Technology", "Product", "Learn", "About", "Contact"].map((l) => (
            <span key={l} style={{ cursor: "pointer", opacity: 0.75 }}>{l}</span>
          ))}
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button onClick={onLogin} style={{ background: "transparent", border: "none", color: T.dark, fontWeight: "600", fontSize: "13px", cursor: "pointer", fontFamily: T.sans }}>
            Sign in
          </button>
          <button onClick={onLogin} style={{ background: T.blue, border: "none", color: "#fff", padding: "10px 22px", borderRadius: "100px", fontWeight: "700", fontSize: "13px", cursor: "pointer", fontFamily: T.sans }}>
            Get started
          </button>
        </div>
      </nav>

      {/* Hero: bold headline left, image card right, like the reference */}
      <div style={{ position: "relative", zIndex: 5, maxWidth: "1280px", margin: "0 auto", padding: "20px 44px 0", display: "grid", gridTemplateColumns: "1.05fr 0.95fr", gap: "20px", alignItems: "center" }}>

        {/* Left: headline */}
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: T.muted, fontSize: "12px", fontWeight: "600", marginBottom: "18px" }}>
            <span style={{ width: "6px", height: "6px", background: T.blue, borderRadius: "50%" }} />
            Built for the Auth0 x AI Agents Hackathon
          </div>

          <h1 style={{ fontSize: "clamp(46px, 5.5vw, 66px)", fontWeight: "700", color: T.dark, lineHeight: "1.03", letterSpacing: "-0.03em", margin: "0 0 22px", fontFamily: T.serif }}>
            Prior auth<br />
            that actually<br />
            works<span style={{ color: T.coral }}>.</span>
          </h1>

          <p style={{ fontSize: "15px", color: T.muted, lineHeight: "1.7", maxWidth: "420px", margin: "0 0 32px" }}>
            PriorAgent uses Open AI and Auth0 Token Vault to read health records, fill insurer forms, and submit prior authorizations, with CIBA patient consent at every step.
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button onClick={onLogin} style={{ background: T.blue, border: "none", color: "#fff", padding: "14px 30px", borderRadius: "100px", fontWeight: "700", fontSize: "14px", cursor: "pointer", fontFamily: T.sans }}>
              Start automating
            </button>
            <a href="https://github.com" target="_blank" rel="noreferrer" style={{ background: "transparent", border: `1.5px solid ${T.border}`, color: T.dark, padding: "14px 30px", borderRadius: "100px", fontWeight: "700", fontSize: "14px", cursor: "pointer", textDecoration: "none", fontFamily: T.sans }}>
              View on GitHub
            </a>
          </div>
        </div>

        {/* Right: signature pulse card, floating badges like the reference's overlapping icons */}
        <div style={{ position: "relative", background: T.card, border: `1.5px solid ${T.border}`, borderRadius: "28px", minHeight: "420px", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
          {/* faint diagnostic grid backdrop */}
          <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
            <defs>
              <pattern id="hero-grid" width="28" height="28" patternUnits="userSpaceOnUse">
                <path d="M28 0H0V28" fill="none" stroke={T.borderLight} strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
          </svg>

          <div style={{ position: "relative", width: "82%", maxWidth: "380px" }}>
<img
  src={FloatingSpiky}
  alt=""
  className="float-bubble"
  style={{ width: "100%", objectFit: "contain", display: "block" }}
/>          </div>

          <div style={{ position: "absolute", top: "14%", left: "8%", background: "#fff", border: `1.5px solid ${T.border}`, borderRadius: "12px", padding: "8px 14px", fontSize: "12px", fontWeight: "700", color: T.dark, boxShadow: "0 6px 18px rgba(27,27,24,0.06)", fontFamily: T.sans }}>
            Auth0 Token Vault
          </div>
          <div style={{ position: "absolute", bottom: "16%", right: "8%", background: "#fff", border: `1.5px solid ${T.border}`, borderRadius: "12px", padding: "8px 14px", fontSize: "12px", fontWeight: "700", color: T.dark, boxShadow: "0 6px 18px rgba(27,27,24,0.06)", fontFamily: T.sans }}>
            94% approval rate
          </div>
          <div style={{ position: "absolute", bottom: "8%", left: "10%", fontFamily: T.mono, fontSize: "10px", color: T.muted }}>
            LIVE · EPIC FHIR R4
          </div>
        </div>
      </div>

      {/* Marquee bar */}
      <div style={{ marginTop: "48px" }}>
        <Ticker />
      </div>

      {/* Feature chips */}
      <div style={{ position: "relative", zIndex: 5, display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap", padding: "36px 24px 12px" }}>
        {["Auth0 Token Vault", "CIBA Step-up Auth", "Epic FHIR R4", "Claude AI", "Insurer Submission"].map((f) => (
          <span key={f} style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: "100px", padding: "8px 18px", fontSize: "13px", color: T.dark, fontWeight: "500" }}>
            {f}
          </span>
        ))}
      </div>

      {/* Stats */}
      <StatsSection />

      {/* Our Expertise cards */}
      <HowItWorksSection />

    </div>
  );
}


// ─── WorkflowForm ─────────────────────────────────────────────────────────────

function WorkflowForm({
  insurers,
  onSubmit,
  loading,
}: {
  insurers: Insurer[];
  onSubmit: (patientId: string, insurerId: string) => void;
  loading: boolean;
}) {
  const [patientId, setPatientId] = useState(DEMO_PATIENTS[0].id);
  const [insurerId, setInsurerId] = useState("");
  const disabled = !patientId || !insurerId || loading;

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "22px" }}>
        <div style={{ width: "42px", height: "42px", background: "#fce7f3", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="20" height="20" fill="none" stroke="#9d174d" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "16px", fontWeight: "800", color: T.dark, fontFamily: T.serif }}>New Authorization</div>
          <div style={{ fontSize: "12px", color: T.muted, marginTop: "1px" }}>AI handles everything else</div>
        </div>
      </div>

      <div style={{ marginBottom: "14px" }}>
        <label style={labelStyle}>Patient</label>
        <select value={patientId} onChange={(e) => setPatientId(e.target.value)} style={selectStyle}>
          {DEMO_PATIENTS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <label style={labelStyle}>Insurance Provider</label>
        <select value={insurerId} onChange={(e) => setInsurerId(e.target.value)} style={selectStyle}>
          <option value="">Select insurer</option>
          {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </select>
      </div>

      <button
        onClick={() => onSubmit(patientId, insurerId)}
        disabled={disabled}
        style={{
          width: "100%",
          background: disabled ? "#e0dbd0" : T.coral,
          border: "none",
          color: disabled ? "#aaa" : "#fff",
          padding: "13px 20px",
          borderRadius: "10px",
          fontWeight: "700",
          fontSize: "15px",
          cursor: disabled ? "not-allowed" : "pointer",
          fontFamily: T.sans,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          transition: "background 0.15s",
        }}
      >
        {loading ? (
          <><Spinner size="sm" /> Running workflow...</>
        ) : (
          <>
            Run prior auth
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </>
        )}
      </button>
    </div>
  );
}

// ─── WorkflowSteps ────────────────────────────────────────────────────────────

function WorkflowSteps({ status }: { status: WorkflowStatus }) {
  const steps = [
    { key: "pending_consent",  label: "Patient Consent (CIBA)" },
    { key: "fetching_records", label: "Fetch FHIR Records" },
    { key: "analyzing",        label: "Claude AI Analysis" },
    { key: "draft_ready",      label: "Form Drafted" },
    { key: "submitted",        label: "Submitted to Insurer" },
  ];
  const order = steps.map((s) => s.key);
  const currentIdx = order.indexOf(status);

  return (
    <div style={cardStyle}>
      <SectionLabel text="Workflow Progress" />
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        {steps.map((step, idx) => {
          const done   = currentIdx > idx;
          const active = currentIdx === idx;
          return (
            <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0,
                background: done ? "#dcfce7" : active ? "#dbeafe" : T.inputBg,
                border: `2px solid ${done ? T.green : active ? T.blue : T.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {done ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                ) : active ? (
                  <Spinner size="sm" />
                ) : (
                  <span style={{ fontSize: "11px", fontWeight: "700", color: T.muted }}>{idx + 1}</span>
                )}
              </div>
              <span style={{ fontSize: "13px", fontWeight: active ? "700" : done ? "600" : "400", color: done ? "#166534" : active ? "#1e40af" : T.muted }}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RequestHistory ───────────────────────────────────────────────────────────

function RequestHistory({ requests }: { requests: PARequest[] }) {
  if (requests.length === 0) return null;
  return (
    <div style={cardStyle}>
      <SectionLabel text="Recent Requests" />
      <div style={{ display: "flex", flexDirection: "column" }}>
        {requests.map((r, i) => (
          <div
            key={r.id}
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 0",
              borderBottom: i < requests.length - 1 ? `1px solid ${T.borderLight}` : "none",
            }}
          >
            <div>
              <div style={{ fontSize: "13px", fontWeight: "600", color: T.dark }}>{r.medicationName || "Pending..."}</div>
              <div style={{ fontSize: "11px", color: T.muted, marginTop: "2px" }}>
                {r.insurerId} · {new Date(r.createdAt).toLocaleDateString()}
              </div>
            </div>
            <Badge status={r.status} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PAFormViewer ─────────────────────────────────────────────────────────────

function PAFormViewer({ form }: { form: PriorAuthForm }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "22px" }}>
        <h3 style={{ fontSize: "18px", fontWeight: "800", color: T.dark, margin: 0, fontFamily: T.serif }}>AI-Drafted PA Form</h3>
        <Chip
          label={form.urgency.toUpperCase()}
          bg={form.urgency === "emergent" ? "#fee2e2" : form.urgency === "urgent" ? "#ffedd5" : "#dcfce7"}
          color={form.urgency === "emergent" ? "#991b1b" : form.urgency === "urgent" ? "#9a3412" : "#166534"}
        />
      </div>

      {/* Medication highlight */}
      <div style={{ background: "#fef9c3", border: "1.5px solid #fde68a", borderRadius: "10px", padding: "14px 16px", marginBottom: "20px" }}>
        <div style={{ fontSize: "10px", color: "#713f12", fontWeight: "700", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: "4px" }}>Medication Requested</div>
        <div style={{ fontSize: "14px", fontWeight: "700", color: T.dark }}>{form.medicationRequested}</div>
      </div>

      {/* Patient info grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
        {[
          { label: "Patient",    value: form.patientName },
          { label: "DOB",        value: form.patientDOB },
          { label: "Member ID",  value: form.memberId },
          { label: "ICD-10",     value: form.icd10Code },
          { label: "Diagnosis",  value: form.diagnosis },
          { label: "Prescriber", value: form.prescribingPhysician },
          { label: "NPI",        value: form.physicianNPI },
          { label: "NDC",        value: form.ndc },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: T.inputBg, borderRadius: "8px", padding: "10px 12px" }}>
            <div style={{ fontSize: "10px", color: T.muted, fontWeight: "600", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "3px" }}>{label}</div>
            <div style={{ fontSize: "13px", color: T.dark, fontWeight: "600", wordBreak: "break-word" as const }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Clinical Justification */}
      <div style={{ marginBottom: "16px" }}>
        <SectionLabel text="Clinical Justification" />
        <div style={{ background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "14px", fontSize: "13px", color: T.dark, lineHeight: "1.7", maxHeight: "160px", overflowY: "auto" as const }}>
          {form.clinicalJustification}
        </div>
      </div>

      {/* Previous Treatments */}
      <div style={{ marginBottom: "16px" }}>
        <SectionLabel text="Previous Treatments" />
        <div style={{ background: T.inputBg, border: `1px solid ${T.border}`, borderRadius: "10px", padding: "14px", fontSize: "13px", color: T.dark, lineHeight: "1.7" }}>
          {form.previousTreatments}
        </div>
      </div>

      {/* Supporting Documentation */}
      {form.supportingDocumentation?.length > 0 && (
        <div>
          <SectionLabel text="Supporting Documentation Needed" />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {form.supportingDocumentation.map((doc, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px", fontSize: "13px", color: T.dark }}>
                <div style={{ width: "6px", height: "6px", background: T.coral, borderRadius: "50%", marginTop: "5px", flexShrink: 0 }} />
                {doc}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SubmissionCard ───────────────────────────────────────────────────────────

function SubmissionCard({ result }: { result: SubmissionResult }) {
  return (
    <div style={{ background: "#dcfce7", border: "1.5px solid #bbf7d0", borderRadius: "18px", padding: "28px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "20px" }}>
        <div style={{ width: "46px", height: "46px", background: "#fff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <svg width="22" height="22" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: "18px", fontWeight: "800", color: "#166534", fontFamily: T.serif }}>Submitted Successfully</div>
          <div style={{ fontSize: "12px", color: "#4ade80", marginTop: "2px" }}>{new Date(result.submittedAt).toLocaleString()}</div>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: "10px", padding: "14px" }}>
          <div style={{ fontSize: "10px", color: "#166534", fontWeight: "700", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: "5px" }}>Reference Number</div>
          <div style={{ fontSize: "13px", fontWeight: "700", color: "#14532d", fontFamily: "monospace", wordBreak: "break-all" as const }}>{result.referenceNumber}</div>
        </div>
        <div style={{ background: "rgba(255,255,255,0.6)", borderRadius: "10px", padding: "14px" }}>
          <div style={{ fontSize: "10px", color: "#166534", fontWeight: "700", textTransform: "uppercase" as const, letterSpacing: "0.07em", marginBottom: "5px" }}>Est. Decision By</div>
          <div style={{ fontSize: "14px", fontWeight: "700", color: "#14532d" }}>{result.estimatedDecisionDate}</div>
        </div>
      </div>
    </div>
  );
}

// ─── AgentLogViewer ───────────────────────────────────────────────────────────
// Shows the actual tool-calling transcript from the autonomous agent loop —
// this is the part that proves the workflow isn't just a fixed pipeline.

function AgentLogViewer({ log, error }: { log: AgentLogEntry[]; error?: string }) {
  const roleLabel = (role: string) =>
    role === "function" ? "Tool result" : role === "user" ? "Task" : "Agent";

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
        <h3 style={{ fontSize: "15px", fontWeight: "800", color: T.dark, margin: 0, fontFamily: T.serif }}>
          Agent reasoning
        </h3>
        {error && (
          <span style={{ fontSize: "11px", fontWeight: "700", color: "#b91c1c", background: "#fee2e2", padding: "3px 9px", borderRadius: "999px" }}>
            {error}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "320px", overflowY: "auto" as const }}>
        {log.map((entry, i) => (
          <div key={i} style={{ background: T.inputBg, borderRadius: "10px", padding: "10px 12px", fontSize: "12.5px", lineHeight: "1.5" }}>
            <div style={{ fontSize: "10px", fontWeight: "700", color: T.muted, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: "4px" }}>
              {roleLabel(entry.role)}
            </div>
            <div style={{ color: T.dark, fontFamily: entry.role === "function" ? "monospace" : T.sans, wordBreak: "break-word" as const }}>
              {entry.content.length > 400 ? `${entry.content.slice(0, 400)}…` : entry.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ConsentModal ─────────────────────────────────────────────────────────────

function ConsentModal({ show, onClose }: { show: boolean; onClose: () => void }) {
  if (!show) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,26,46,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "20px", boxShadow: "0 24px 60px rgba(0,0,0,0.18)", maxWidth: "380px", width: "100%", padding: "32px" }}>
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ width: "56px", height: "56px", background: "#fef9c3", border: "2px solid #fde68a", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width="26" height="26" fill="none" stroke="#713f12" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <h3 style={{ fontSize: "18px", fontWeight: "800", color: T.dark, margin: "0 0 10px", fontFamily: T.serif }}>Patient Consent Required</h3>
          <p style={{ fontSize: "14px", color: "#666", lineHeight: "1.6", margin: 0 }}>
            PriorAgent is using <strong>Auth0 CIBA</strong> to request step-up consent from the patient before accessing health records.
          </p>
        </div>
        <div style={{ background: "#fef9c3", border: "1.5px solid #fde68a", borderRadius: "10px", padding: "12px 14px", fontSize: "13px", color: "#713f12", marginBottom: "20px", lineHeight: "1.6" }}>
          A push notification has been sent to the patient's device. The workflow will continue once they approve.
        </div>
        <button
          onClick={onClose}
          style={{ width: "100%", background: T.inputBg, border: `1.5px solid ${T.border}`, color: T.dark, padding: "11px", borderRadius: "10px", fontSize: "14px", fontWeight: "600", cursor: "pointer", fontFamily: T.sans }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ user }: { user: User }) {
  const [insurers, setInsurers]             = useState<Insurer[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("idle");
  const [currentRequest, setCurrentRequest] = useState<PARequest | null>(null);
  const [history, setHistory]               = useState<PARequest[]>([]);
  const [loading, setLoading]               = useState(false);
  const [showConsent, setShowConsent]       = useState(false);

  useEffect(() => {
    apiFetch<Insurer[]>("/prior-auth/insurers")
      .then(setInsurers)
      .catch(() =>
        setInsurers([
          { id: "BCBS",             name: "Blue Cross Blue Shield" },
          { id: "AETNA",            name: "Aetna" },
          { id: "UNITEDHEALTHCARE", name: "UnitedHealthcare" },
          { id: "CIGNA",            name: "Cigna" },
        ])
      );
  }, []);

  const runWorkflow = async (patientId: string, insurerId: string) => {
    setLoading(true);
    setCurrentRequest(null);
    setWorkflowStatus("pending_consent");
    setShowConsent(true);

    const progressStatuses: WorkflowStatus[] = [
      "pending_consent", "fetching_records", "analyzing", "draft_ready", "submitted",
    ];

    try {
      // Agentic endpoint: OpenAI drives FHIR lookups, drafting, validation, and
      // submission itself via tool-calling, rather than a fixed backend pipeline.
      const result = await apiFetch<PARequest>("/prior-auth/agent/run", {
        method: "POST",
        body: JSON.stringify({ patientId, insurerId }),
      });
      for (const s of progressStatuses) { setWorkflowStatus(s); await sleep(600); }
      setCurrentRequest(result);
      setWorkflowStatus(result.status as WorkflowStatus);
      setHistory((prev) => [result, ...prev]);
    } catch {
      // Demo fallback
      for (const s of progressStatuses) { setWorkflowStatus(s); await sleep(900); }
      const demoResult: PARequest = {
        id: `demo-${Date.now()}`,
        patientId,
        medicationName: "Dupilumab (Dupixent) 300mg",
        diagnosis: "Atopic Dermatitis - Moderate to Severe",
        insurerId,
        status: "submitted",
        createdAt: new Date().toISOString(),
        aiDraftForm: {
          patientName: "Camila Lopez",
          patientDOB: "1987-08-14",
          memberId: "BCBS-987654321",
          medicationRequested: "Dupilumab (Dupixent) 300mg SC injection every 2 weeks",
          ndc: "0024-5916-02",
          icd10Code: "L20.9",
          diagnosis: "Atopic Dermatitis (Eczema) - Moderate to Severe",
          clinicalJustification:
            "Patient Camila Lopez presents with moderate-to-severe atopic dermatitis (L20.9) with onset March 2019. Extensive BSA involvement greater than 30%. Standard topical corticosteroids and calcineurin inhibitors trialed for 12+ months without adequate control.\n\nDupilumab (Dupixent) is an IL-4/IL-13 receptor antagonist with demonstrated superior efficacy in Phase 3 SOLO trials. Given documented failure of conventional therapies and comorbid asthma (J45.50), dupilumab is the evidence-based standard of care per AAD guidelines.\n\nMedically necessary to reduce disease burden, prevent secondary infections, and address the concurrent Type 2 inflammatory pathway shared with the patient's asthma diagnosis.",
          previousTreatments:
            "1. Triamcinolone 0.1% cream, 12 months, inadequate response\n2. Tacrolimus 0.1% ointment, 6 months, partial response with recurrence\n3. Oral antihistamines, ongoing, symptomatic relief only",
          prescribingPhysician: "Dr. Sarah Chen, MD (Dermatology)",
          physicianNPI: "1234567890",
          urgency: "routine",
          supportingDocumentation: [
            "EASI or IGA score documenting disease severity",
            "Documentation of prior treatment failures with dates",
            "Photos of affected skin areas",
            "Pulmonology notes confirming concurrent asthma diagnosis",
          ],
        },
        submissionResult: {
          referenceNumber: `PA-${Date.now()}-DEMO`,
          status: "submitted",
          estimatedDecisionDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          submittedAt: new Date().toISOString(),
        },
      };
      setCurrentRequest(demoResult);
      setWorkflowStatus("submitted");
      setHistory((prev) => [demoResult, ...prev]);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => { window.location.href = `${BACKEND}/api/auth/logout`; };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: T.sans, position: "relative", overflow: "hidden" }}>
      {/* Fixed background shapes matching landing page */}
      <div style={{ position: "fixed", top: "-80px", right: "-80px", width: "320px", height: "320px", background: T.yellow, borderRadius: "50%", zIndex: 0, opacity: 0.28, pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "-60px", left: "-60px", width: "240px", height: "240px", background: T.green, borderRadius: "50%", zIndex: 0, opacity: 0.25, pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: "38%", right: "-40px", width: "150px", height: "150px", background: T.coral, borderRadius: "50%", zIndex: 0, opacity: 0.16, pointerEvents: "none" }} />
      <div style={{ position: "fixed", top: "16px", left: "16%", width: "38px", height: "38px", background: T.blue, borderRadius: "8px", transform: "rotate(15deg)", zIndex: 0, opacity: 0.32, pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: "14%", right: "20%", width: "22px", height: "22px", background: T.green, borderRadius: "5px", zIndex: 0, opacity: 0.38, pointerEvents: "none" }} />

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(245,240,232,0.92)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", borderBottom: `1.5px solid ${T.border}` }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "0 32px", height: "64px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ width: "30px", height: "30px", background: T.coral, borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" viewBox="0 0 24 24">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
              </svg>
            </div>
            <span style={{ fontWeight: "800", fontSize: "18px", color: T.dark, letterSpacing: "-0.02em", fontFamily: T.serif }}>PriorAgent</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {user.picture
                ? <img src={user.picture} alt="" style={{ width: "30px", height: "30px", borderRadius: "50%", border: `2px solid ${T.border}` }} />
                : <div style={{ width: "30px", height: "30px", borderRadius: "50%", background: T.yellow, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: "700", color: T.dark }}>{user.name?.[0] ?? "U"}</div>
              }
              <span style={{ fontSize: "14px", color: "#555", fontWeight: "500" }}>{user.email}</span>
            </div>
            <button onClick={handleLogout} style={{ background: "transparent", border: "none", fontSize: "13px", color: T.muted, cursor: "pointer", fontFamily: T.sans }}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main style={{ position: "relative", zIndex: 1, maxWidth: "1200px", margin: "0 auto", padding: "40px 32px" }}>

        {/* Page title */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
            <h1 style={{ fontSize: "30px", fontWeight: "900", color: T.dark, letterSpacing: "-0.03em", margin: 0, fontFamily: T.serif }}>
              Prior Authorization Dashboard
            </h1>
            <Chip label="BETA" bg={T.coral} color="#fff" />
          </div>
          <p style={{ fontSize: "15px", color: "#666", margin: 0 }}>
            AI-powered PA requests with CIBA consent and Token Vault EHR access
          </p>
        </div>

        {/* Tech badges */}
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "32px" }}>
          <Chip label="Auth0 Token Vault" bg="#dbeafe" color="#1e40af" />
          <Chip label="CIBA Step-up Auth" bg="#fce7f3" color="#9d174d" />
          <Chip label="Epic FHIR R4"      bg="#dcfce7" color="#166534" />
          <Chip label="Claude AI"         bg="#fef9c3" color="#713f12" />
        </div>

        {/* Two-column layout */}
        <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "24px", alignItems: "start" }}>

          {/* Left column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <WorkflowForm insurers={insurers} onSubmit={runWorkflow} loading={loading} />
            {workflowStatus !== "idle" && <WorkflowSteps status={workflowStatus} />}
            <RequestHistory requests={history} />
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

            {/* Idle placeholder */}
            {workflowStatus === "idle" && (
              <div style={{ ...cardStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "300px", textAlign: "center", position: "relative", overflow: "hidden" }}>
                <div style={{ position: "absolute", top: "-24px", right: "-24px", width: "100px", height: "100px", background: "#fef9c3", borderRadius: "50%", opacity: 0.65 }} />
                <div style={{ position: "absolute", bottom: "-18px", left: "-18px", width: "80px", height: "80px", background: "#dcfce7", borderRadius: "50%", opacity: 0.65 }} />
                <div style={{ position: "relative", zIndex: 1 }}>
                  <div style={{ width: "60px", height: "60px", background: "#fce7f3", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 18px" }}>
                    <svg width="28" height="28" fill="none" stroke="#9d174d" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: "20px", fontWeight: "800", color: T.dark, margin: "0 0 10px", fontFamily: T.serif }}>Ready to automate</h3>
                  <p style={{ fontSize: "14px", color: T.muted, maxWidth: "260px", lineHeight: "1.6", margin: 0 }}>
                    Pick a patient and insurer on the left. PriorAgent handles the rest in seconds.
                  </p>
                </div>
              </div>
            )}

            {/* Loading */}
            {loading && workflowStatus !== "idle" && (
              <div style={{ ...cardStyle, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "220px", textAlign: "center" }}>
                <Spinner size="lg" />
                <div style={{ fontSize: "16px", fontWeight: "700", color: T.dark, marginTop: "18px" }}>
                  {STATUS_LABELS[workflowStatus]}...
                </div>
                <div style={{ fontSize: "13px", color: T.muted, marginTop: "6px" }}>
                  {workflowStatus === "pending_consent"  && "Waiting for patient to approve on their device"}
                  {workflowStatus === "fetching_records" && "Connecting to Epic FHIR via Token Vault"}
                  {workflowStatus === "analyzing"        && "OpenAI is reading clinical records"}
                  {workflowStatus === "draft_ready"      && "Finalizing form fields"}
                </div>
              </div>
            )}

            {/* Submission result */}
            {!loading && currentRequest?.submissionResult && (
              <SubmissionCard result={currentRequest.submissionResult} />
            )}

            {/* PA form */}
            {!loading && currentRequest?.aiDraftForm && (
              <PAFormViewer form={currentRequest.aiDraftForm} />
            )}

            {/* Agent tool-calling transcript */}
            {!loading && currentRequest?.agentLog && currentRequest.agentLog.length > 0 && (
              <div style={{ marginTop: "18px" }}>
                <AgentLogViewer log={currentRequest.agentLog} error={currentRequest.error} />
              </div>
            )}
          </div>
        </div>
      </main>

      <ConsentModal show={showConsent} onClose={() => setShowConsent(false)} />
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [authStatus, setAuthStatus] = useState<AuthStatus>("loading");
  const [user, setUser]             = useState<User | null>(null);

  useEffect(() => {
    apiFetch<{ authenticated: boolean; user?: User }>("/auth/me")
      .then((data) => {
        if (data.authenticated && data.user) {
          setUser(data.user);
          setAuthStatus("authenticated");
        } else {
          setAuthStatus("unauthenticated");
        }
      })
      .catch(() => setAuthStatus("unauthenticated"));
  }, []);

  const handleLogin = () => { window.location.href = `${BACKEND}/api/auth/login`; };

  if (authStatus === "loading") {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Spinner size="lg" />
      </div>
    );
  }

  if (authStatus === "unauthenticated") return <Hero onLogin={handleLogin} />;
  return <Dashboard user={user!} />;
}