// CDL Site Management v10 — modules/login_ui.js
// Premium cinematic login — "Transforming Blueprints into Bespoke Lifestyle Destinations"
import { APP_NAME, APP_VERSION, APP_CLIENT, LOGO_URL } from "../config.js";

export function renderLogin(onLogin) {
  const screen = document.getElementById("login-screen");

  // ─── HTML ────────────────────────────────────────────────────
  screen.innerHTML = `
    <div class="login-root">

      <!-- ═══ LEFT PANEL: Branding ═══ -->
      <div class="login-brand">
        <div class="brand-bg"></div>
        <div class="brand-mesh"></div>
        <div class="brand-grid"></div>

        <!-- Floating particles -->
        <div class="particle p1"></div>
        <div class="particle p2"></div>
        <div class="particle p3"></div>
        <div class="particle p4"></div>

        <div class="brand-glow"></div>

        <div class="brand-content">
          <!-- Logo -->
          <div class="logo-wrap">
            <img src="${LOGO_URL}" alt="${APP_CLIENT}" class="brand-logo"
              onerror="this.style.display='none';document.getElementById('logo-fallback').style.display='flex'" />
            <div id="logo-fallback" class="logo-fallback">🏗</div>
            <div class="logo-ring"></div>
          </div>

          <!-- App name -->
          <h1 class="brand-title">${APP_NAME}</h1>
          <p class="brand-tagline">10 YEARS OF EXCELLENCE</p>
          <p class="brand-subtag">Transforming Blueprints into Bespoke Lifestyle Destinations</p>

          <!-- Feature highlights -->
          <div class="brand-features">
            <div class="feat-item">
              <span class="feat-icon">◈</span>
              <div>
                <div class="feat-title">Luxurious Living</div>
                <div class="feat-sub">Smart secure spaces across Nairobi</div>
              </div>
            </div>
            <div class="feat-item">
              <span class="feat-icon">◈</span>
              <div>
                <div class="feat-title">AI-Powered Operations</div>
                <div class="feat-sub">Intelligent material tracking &amp; procurement</div>
              </div>
            </div>
            <div class="feat-item">
              <span class="feat-icon">◈</span>
              <div>
                <div class="feat-title">Real-Time Intelligence</div>
                <div class="feat-sub">Live audit logging &amp; instant notifications</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom branding -->
        <p class="brand-footer"><span class="brand-footer-dot">◆</span> ${APP_CLIENT} · ${APP_VERSION}</p>
      </div>

      <!-- ═══ RIGHT PANEL: Login Form ═══ -->
      <div class="login-form-panel">
        <div class="form-corner-glow"></div>

        <div class="login-form-wrap">
          <!-- Welcome text -->
          <div class="login-header">
            <h2>Welcome</h2>
            <p>Sign in to your CDL account</p>
          </div>

          <form id="login-form">
            <!-- Email -->
            <div class="field-group">
              <label for="login-email">Email Address</label>
              <input id="login-email" type="email" placeholder="you@canaan.co.ke" autocomplete="email" />
            </div>

            <!-- Password -->
            <div class="field-group">
              <label for="login-password">Password</label>
              <input id="login-password" type="password" placeholder="••••••••" autocomplete="current-password" />
              <button type="button" id="pw-toggle" class="pw-toggle" aria-label="Toggle password visibility" onclick="window.togglePw(this)">👁</button>
            </div>

            <!-- Error -->
            <div id="login-error" class="login-error"></div>

            <!-- Submit -->
            <button type="submit" id="login-btn" class="login-btn">
              <span>Sign In</span>
              <span class="login-btn-arrow">→</span>
            </button>
          </form>

          <!-- Divider -->
          <div class="form-divider">
            <div class="divider-line"></div>
            <span class="divider-label">Secure Access</span>
            <div class="divider-line"></div>
          </div>

          <!-- Security badges -->
          <div class="security-badges">
            <span class="badge-item">
              <span class="badge-dot"></span>
              Encrypted
            </span>
            <span class="badge-sep">·</span>
            <span>Role-Based Access</span>
            <span class="badge-sep">·</span>
            <span>Audit Logged</span>
          </div>
        </div>
      </div>
    </div>

    <style>
      /* ═══ Login Root ═══ */
      .login-root {
        display: flex;
        width: 100%;
        min-height: 100vh;
        background: var(--bg-900);
        overflow: hidden;
        position: relative;
        animation: loginFadeIn 0.8s var(--ease) forwards;
        opacity: 0;
      }
      @keyframes loginFadeIn { to { opacity: 1; } }

      /* ═══ Left Panel: Branding ═══ */
      .login-brand {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px;
        position: relative;
        overflow: hidden;
        min-height: 100vh;
        animation: brandSlideIn 1s var(--ease) 0.1s forwards;
        opacity: 0;
        transform: translateX(-30px);
      }
      @keyframes brandSlideIn { to { opacity: 1; transform: translateX(0); } }

      .brand-bg {
        position: absolute;
        inset: 0;
        background: linear-gradient(160deg, #06070a 0%, #0e1018 40%, #0a0c12 100%);
      }

      .brand-mesh {
        position: absolute;
        inset: 0;
        opacity: 0.15;
        background:
          radial-gradient(ellipse at 20% 50%, rgba(212,175,110,0.15) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba(91,154,255,0.08) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 80%, rgba(212,175,110,0.1) 0%, transparent 50%);
        animation: meshShift 12s ease-in-out infinite alternate;
      }
      @keyframes meshShift {
        0%   { transform: scale(1) rotate(0deg); }
        100% { transform: scale(1.1) rotate(3deg); }
      }

      .brand-grid {
        position: absolute;
        inset: 0;
        opacity: 0.025;
        background-image:
          linear-gradient(rgba(212,175,110,0.4) 1px, transparent 1px),
          linear-gradient(90deg, rgba(212,175,110,0.4) 1px, transparent 1px);
        background-size: 80px 80px;
      }

      /* Floating particles */
      .particle {
        position: absolute;
        border-radius: 50%;
        animation: particleFloat 6s ease-in-out infinite;
      }
      .p1 { top: 15%; right: 20%; width: 6px; height: 6px; background: var(--gold); opacity: 0.25; animation-duration: 7s; animation-delay: 0s; }
      .p2 { bottom: 25%; left: 15%; width: 4px; height: 4px; background: var(--gold); opacity: 0.15; animation-duration: 9s; animation-delay: 1s; }
      .p3 { top: 60%; right: 30%; width: 3px; height: 3px; background: var(--blue); opacity: 0.1; animation-duration: 8s; animation-delay: 2s; }
      .p4 { top: 35%; left: 25%; width: 5px; height: 5px; background: var(--gold); opacity: 0.08; animation-duration: 10s; animation-delay: 0.5s; }

      .brand-glow {
        position: absolute;
        top: 25%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 500px;
        height: 500px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(212,175,110,0.06) 0%, transparent 70%);
        animation: glowBreathe 5s ease-in-out infinite;
      }
      @keyframes glowBreathe {
        0%, 100% { opacity: 0.5; transform: translate(-50%,-50%) scale(1); }
        50%      { opacity: 1;   transform: translate(-50%,-50%) scale(1.1); }
      }

      /* Brand content stagger */
      .brand-content {
        text-align: center;
        z-index: 1;
        max-width: 380px;
      }
      .brand-content > * {
        opacity: 0;
        transform: translateY(15px);
        animation: brandItemIn 0.6s var(--ease) forwards;
      }
      .brand-content > *:nth-child(1) { animation-delay: 0.3s; }
      .brand-content > *:nth-child(2) { animation-delay: 0.4s; }
      .brand-content > *:nth-child(3) { animation-delay: 0.5s; }
      .brand-content > *:nth-child(4) { animation-delay: 0.6s; }
      .brand-content > *:nth-child(5) { animation-delay: 0.7s; }
      @keyframes brandItemIn { to { opacity: 1; transform: translateY(0); } }

      /* Logo */
      .logo-wrap {
        margin-bottom: 28px;
        position: relative;
        display: inline-block;
      }
      .brand-logo {
        height: 72px;
        object-fit: contain;
        filter: drop-shadow(0 0 40px rgba(212,175,110,0.3));
      }
      .logo-fallback {
        display: none;
        width: 84px;
        height: 84px;
        margin: 0 auto;
        background: linear-gradient(135deg, #d4af6e, #b8944f);
        border-radius: 22px;
        align-items: center;
        justify-content: center;
        font-size: 38px;
        box-shadow: 0 0 50px rgba(212,175,110,0.3);
      }
      .logo-ring {
        position: absolute;
        top: -8px; left: -8px; right: -8px; bottom: -8px;
        border: 1px solid rgba(212,175,110,0.15);
        border-radius: 28px;
        animation: ringPulse 3s ease-in-out infinite;
      }
      @keyframes ringPulse {
        0%, 100% { opacity: 0.3; transform: scale(1); }
        50%      { opacity: 0.6; transform: scale(1.05); }
      }

      /* Typography */
      .brand-title {
        font-size: 32px;
        font-weight: 800;
        color: var(--text-100);
        margin-bottom: 6px;
        letter-spacing: -0.04em;
        line-height: 1.1;
      }
      .brand-tagline {
        color: var(--gold);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 4px;
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      .brand-subtag {
        color: var(--text-400);
        font-size: 12px;
        font-weight: 400;
        letter-spacing: 1px;
        margin-bottom: 40px;
        font-style: italic;
      }

      /* Feature highlights */
      .brand-features {
        display: flex;
        flex-direction: column;
        gap: 14px;
        text-align: left;
      }
      .feat-item {
        display: flex;
        align-items: center;
        gap: 14px;
        padding: 10px 14px;
        border-radius: var(--r-md);
        transition: all 0.3s var(--ease);
        cursor: default;
      }
      .feat-item:hover {
        background: rgba(212,175,110,0.06);
        transform: translateX(4px);
      }
      .feat-icon {
        color: var(--gold);
        font-size: 16px;
        width: 24px;
        text-align: center;
        flex-shrink: 0;
      }
      .feat-title {
        color: var(--text-200);
        font-size: 13px;
        font-weight: 600;
      }
      .feat-sub {
        color: var(--text-400);
        font-size: 11px;
        margin-top: 2px;
      }

      /* Bottom branding */
      .brand-footer {
        position: absolute;
        bottom: 20px;
        color: var(--text-400);
        font-size: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
        letter-spacing: 1px;
      }
      .brand-footer-dot {
        color: var(--gold);
        opacity: 0.3;
      }

      /* ═══ Right Panel: Login Form ═══ */
      .login-form-panel {
        width: 480px;
        min-height: 100vh;
        background: var(--bg-800);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px;
        position: relative;
        animation: formSlideIn 1s var(--ease) 0.2s forwards;
        opacity: 0;
        transform: translateX(30px);
      }
      @keyframes formSlideIn { to { opacity: 1; transform: translateX(0); } }

      .form-corner-glow {
        position: absolute;
        top: 0; right: 0;
        width: 250px;
        height: 250px;
        background: radial-gradient(circle at 100% 0%, rgba(212,175,110,0.03) 0%, transparent 70%);
        pointer-events: none;
      }

      .login-form-wrap {
        width: 100%;
        max-width: 340px;
        z-index: 1;
      }

      /* Login header */
      .login-header {
        margin-bottom: 32px;
        animation: formItemIn 0.6s var(--ease) 0.4s forwards;
        opacity: 0;
        transform: translateY(10px);
      }
      .login-header h2 {
        font-size: 28px;
        font-weight: 800;
        color: var(--text-100);
        margin-bottom: 6px;
        letter-spacing: -0.03em;
      }
      .login-header p {
        color: var(--text-300);
        font-size: 14px;
      }

      /* Form fields stagger */
      .field-group {
        position: relative;
        animation: formItemIn 0.5s var(--ease) forwards;
        opacity: 0;
        transform: translateY(8px);
      }
      .field-group:nth-child(1) { animation-delay: 0.5s; }
      .field-group:nth-child(2) { animation-delay: 0.6s; }
      .field-group:nth-child(3) { animation-delay: 0.7s; }
      .field-group:nth-child(4) { animation-delay: 0.8s; }
      @keyframes formItemIn { to { opacity: 1; transform: translateY(0); } }

      .field-group label {
        display: block;
        font-size: 10px;
        font-weight: 600;
        color: var(--text-400);
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 6px;
      }

      .field-group input {
        width: 100%;
        background: var(--bg-700);
        border: 1px solid var(--border);
        border-radius: var(--r-md);
        padding: 13px 16px;
        color: var(--text-100);
        font-size: 14px;
        outline: none;
        transition: all 0.25s var(--ease);
        font-family: 'Inter', sans-serif;
      }
      .field-group input#login-password {
        padding-right: 44px;
      }
      .field-group input:focus {
        border-color: var(--gold);
        box-shadow: 0 0 0 3px rgba(212,175,110,0.1);
      }

      .pw-toggle {
        position: absolute;
        right: 12px;
        bottom: 11px;
        background: transparent;
        border: none;
        color: var(--text-400);
        cursor: pointer;
        font-size: 16px;
        padding: 2px;
        transition: color 0.2s;
      }
      .pw-toggle:hover { color: var(--gold); }

      /* Error */
      .login-error {
        display: none;
        background: var(--red-dim);
        border: 1px solid rgba(248,113,113,0.2);
        border-radius: var(--r-md);
        padding: 10px 14px;
        color: var(--red);
        font-size: 13px;
        border-left: 3px solid var(--red);
        animation: shake 0.4s ease;
      }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20% { transform: translateX(-6px); }
        40% { transform: translateX(6px); }
        60% { transform: translateX(-4px); }
        80% { transform: translateX(4px); }
      }

      /* Submit button */
      .login-btn {
        width: 100%;
        background: linear-gradient(135deg, #d4af6e, #b8944f);
        color: var(--bg-900);
        border: none;
        border-radius: var(--r-md);
        padding: 14px;
        font-size: 14px;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.25s var(--ease);
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        letter-spacing: -0.01em;
        font-family: 'Inter', sans-serif;
        box-shadow: 0 4px 20px rgba(212,175,110,0.2);
        position: relative;
        overflow: hidden;
      }
      .login-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 30px rgba(212,175,110,0.35);
      }
      .login-btn:active {
        transform: scale(0.98);
      }
      .login-btn:disabled {
        opacity: 0.8;
        cursor: not-allowed;
      }
      .login-btn-arrow {
        opacity: 0.6;
      }
      .login-btn::before {
        content: '';
        position: absolute;
        top: 0; left: -100%;
        width: 100%; height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
        transition: left 0.5s;
      }
      .login-btn:hover::before { left: 100%; }

      /* Divider */
      form-divider {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 24px 0;
      }
      .divider-line {
        flex: 1;
        height: 1px;
        background: linear-gradient(90deg, transparent, var(--border), transparent);
      }
      .divider-label {
        font-size: 10px;
        color: var(--text-400);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      /* Security badges */
      .security-badges {
        text-align: center;
        color: var(--text-400);
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .badge-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .badge-dot {
        width: 5px;
        height: 5px;
        border-radius: 50%;
        background: var(--green);
        box-shadow: 0 0 6px var(--green);
      }
      .badge-sep {
        color: var(--border);
      }

      /* ═══ Responsive ═══ */

      /* Tablet: stack vertically, hide features */
      @media (max-width: 900px) {
        .login-root { flex-direction: column !important; }
        .login-brand { min-height: auto !important; padding: 32px 20px !important; }
        .login-form-panel { width: 100% !important; min-height: auto !important; padding: 32px 20px !important; }
        .brand-features { display: none !important; }
        .brand-footer { display: none !important; }
        .brand-title { font-size: 26px !important; }
        .brand-tagline { font-size: 10px !important; letter-spacing: 3px !important; }
      }

      /* Mobile: compact brand, full-width form */
      @media (max-width: 600px) {
        .login-brand { padding: 24px 16px !important; }
        .login-form-panel { padding: 24px 16px !important; }
        .brand-title { font-size: 22px !important; }
        .brand-tagline { display: none !important; }
        .brand-subtag { font-size: 11px !important; margin-bottom: 24px !important; }
        .brand-logo, .logo-fallback { height: 56px !important; }
        .login-header h2 { font-size: 22px !important; }
        .login-header p { font-size: 13px !important; }
        .field-group input { padding: 12px 14px !important; }
        .login-btn { padding: 13px !important; }
      }

      /* Small mobile */
      @media (max-width: 380px) {
        .login-brand { padding: 20px 12px !important; }
        .login-form-panel { padding: 20px 12px !important; }
        .brand-title { font-size: 20px !important; }
        .brand-subtag { display: none !important; }
      }
    </style>
  `;

  // ─── Password Toggle ────────────────────────────────────────
  document.getElementById("pw-toggle")?.addEventListener("click", function() { window.togglePw(this); });
  window.togglePw = (btn) => {
    const input = document.getElementById("login-password");
    if (input.type === "password") {
      input.type = "text";
      btn.textContent = "🔒";
    } else {
      input.type = "password";
      btn.textContent = "👁";
    }
  };

  // ─── Form Submit ────────────────────────────────────────────
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const btn = document.getElementById("login-btn");
    const errEl = document.getElementById("login-error");
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    // Loading state
    btn.innerHTML = `<div class="spinner" style="width:18px;height:18px;border-width:2px;border-top-color:var(--bg-900);"></div><span>Signing in…</span>`;
    btn.disabled = true;
    btn.style.opacity = "0.8";
    errEl.style.display = "none";

    const err = await onLogin(email, password);

    if (err) {
      errEl.textContent = err;
      errEl.style.display = "block";
      btn.innerHTML = `<span>Sign In</span><span class="login-btn-arrow">→</span>`;
      btn.disabled = false;
      btn.style.opacity = "1";
    }
  });
}
