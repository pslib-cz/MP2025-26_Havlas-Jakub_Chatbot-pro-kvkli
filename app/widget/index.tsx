import React from "react";
import { createRoot } from "react-dom/client";
import ChatWidget from "./ChatWidget";

// --- Inject styles once into <head> ---
const CSS = `
#cw-root{position:fixed;bottom:24px;right:24px;z-index:99999;font-family:'DM Sans',Poppins,Arial,sans-serif;font-size:14px;line-height:1.5;}
#cw-root *{box-sizing:border-box;}
@keyframes cw-bounce{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.3);opacity:.5}}
@keyframes cw-slidein{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}
@keyframes cw-slideout{from{transform:translateX(0);opacity:1}to{transform:translateX(120%);opacity:0}}
@keyframes cw-fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.cw-btn{background:#FBBF24;color:#000;border:none;border-radius:9999px;padding:12px 18px;display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:500;font-size:14px;box-shadow:0 10px 25px rgba(0,0,0,.2);transition:transform .2s,box-shadow .2s;white-space:nowrap;font-family:inherit;}
.cw-btn:hover{transform:translateY(-4px) scale(1.05);box-shadow:0 14px 30px rgba(0,0,0,.25);}
.cw-window{width:480px;height:600px;background:#fff;border-radius:5px;box-shadow:0 20px 60px rgba(0,0,0,.3);display:flex;flex-direction:column;overflow:hidden;position:absolute;bottom:0;right:0;}
.cw-opening{animation:cw-slidein .3s ease;}
.cw-closing{animation:cw-slideout .3s ease forwards;}
.cw-header{background:#3d4b6e;color:#fff;padding:16px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;}
.cw-header-left{display:flex;align-items:center;gap:12px;}
.cw-header-icon{background:#fff;border-radius:9999px;padding:8px;display:flex;}
.cw-header-title{font-weight:600;font-size:18px;margin:0;}
.cw-close-btn{background:none;border:none;color:#fff;cursor:pointer;padding:4px;border-radius:4px;display:flex;line-height:1;}
.cw-close-btn:hover{background:rgba(255,255,255,.15);}
.cw-messages{flex:1;padding:16px;overflow-y:auto;display:flex;flex-direction:column;gap:16px;background:#f9fafb;}
.cw-user-row{display:flex;justify-content:flex-end;}
.cw-user-bubble{background:#3d4b6e;color:#fff;padding:8px 16px;border-radius:22px 22px 0 22px;max-width:80%;line-height:1.5;}
.cw-bot-row{display:flex;gap:8px;align-items:flex-start;margin-top:8px;}
.cw-bot-bubble{background:#fff;color:#1f2937;padding:12px;border-radius:8px;max-width:75%;line-height:1.6;box-shadow:0 1px 3px rgba(0,0,0,.1);}
.cw-bot-text a{color:#3b82f6;text-decoration:underline;}
.cw-bot-text strong{font-weight:700;}
.cw-fb-row{display:flex;gap:8px;margin-top:8px;}
.cw-fb-btn{background:none;border:none;cursor:pointer;color:#6b7280;padding:2px;display:flex;border-radius:4px;transition:color .15s;line-height:1;}
.cw-fb-btn:hover{color:#3d4b6e;}
.cw-fb-btn.cw-liked{color:#22c55e;}
.cw-loading{display:flex;gap:8px;align-items:center;}
.cw-dots{background:#3d4b6e;color:#fff;padding:12px;border-radius:9999px;display:flex;gap:4px;align-items:center;}
.cw-dot{width:8px;height:8px;background:#fff;border-radius:9999px;}
.cw-dot:nth-child(1){animation:cw-bounce .8s 0s infinite;}
.cw-dot:nth-child(2){animation:cw-bounce .8s .2s infinite;}
.cw-dot:nth-child(3){animation:cw-bounce .8s .4s infinite;}
.cw-loading-text{color:#6b7280;font-style:italic;animation:cw-fadein .3s ease;}
.cw-input-area{display:flex;align-items:center;padding:12px;background:#3d4b6e;gap:8px;flex-shrink:0;}
.cw-input{flex:1;padding:12px 16px;border-radius:9999px;background:#4a5a7f;color:#fff;border:none;outline:none;font-size:14px;font-family:inherit;}
.cw-input::placeholder{color:#9ca3af;}
.cw-send-btn{background:#4a5a7f;color:#fff;border:none;border-radius:9999px;padding:12px;cursor:pointer;display:flex;transition:background .2s;line-height:1;}
.cw-send-btn:hover{background:#5a6a8f;}
.cw-limit-banner{padding:12px;border-top:1px solid #e5e7eb;background:#f3f4f6;text-align:center;color:#6b7280;flex-shrink:0;}
.cw-feedback-card{background:#fefce8;border:1px solid #fde68a;color:#92400e;border-radius:8px;padding:16px;display:flex;flex-direction:column;gap:12px;animation:cw-fadein .3s ease;font-size:13px;}
.cw-feedback-card-title{font-weight:600;margin:0;}
.cw-feedback-card p{margin:0;}
.cw-cf-row{display:flex;gap:12px;justify-content:center;}
.cw-cf-yes,.cw-cf-no{border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font-size:14px;font-family:inherit;transition:background .2s;}
.cw-cf-yes{background:#22c55e;color:#fff;}
.cw-cf-yes:hover{background:#16a34a;}
.cw-cf-no{background:#ef4444;color:#fff;}
.cw-cf-no:hover{background:#dc2626;}
.cw-cf-yes:disabled,.cw-cf-no:disabled{opacity:.5;cursor:not-allowed;}
.cw-feedback-textarea{width:100%;border:1px solid #fde68a;border-radius:8px;padding:8px;font-size:13px;background:#fff;color:#1f2937;resize:none;font-family:inherit;}
.cw-success-card{background:#f0fdf4;border:1px solid #86efac;color:#166534;border-radius:8px;padding:12px;text-align:center;animation:cw-fadein .3s ease;font-size:13px;}
.cw-success-card a{text-decoration:underline;font-weight:600;color:inherit;}
.cw-toast{position:absolute;bottom:80px;left:50%;transform:translateX(-50%);background:#22c55e;color:#fff;padding:8px 16px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.15);white-space:nowrap;animation:cw-fadein .3s ease;pointer-events:none;font-size:13px;}
@media(max-width:640px){
  #cw-root{bottom:0;right:0;left:0;}
  .cw-btn-wrap{display:flex;justify-content:center;padding-bottom:16px;}
  .cw-window{width:100%;height:100dvh;height:100vh;border-radius:0;position:fixed;inset:0;}
}
`;

function injectStyles() {
    if (document.getElementById("cw-styles")) return;
    const el = document.createElement("style");
    el.id = "cw-styles";
    el.textContent = CSS;
    document.head.appendChild(el);
}

function getBackendUrl(): string {
    // Priority 1: data-backend attribute on the script tag
    const script =
        (document.currentScript as HTMLScriptElement | null) ||
        document.querySelector<HTMLScriptElement>("script[data-backend]");
    const attr = script?.dataset?.backend;
    if (typeof attr === "string" && attr.trim() !== "") return attr.replace(/\/$/, "");

    // Priority 2: global variable set before the script tag
    if (
        typeof (window as any).CHATBOT_BACKEND_URL === "string" &&
        (window as any).CHATBOT_BACKEND_URL.trim() !== ""
    ) {
        return (window as any).CHATBOT_BACKEND_URL.replace(/\/$/, "");
    }

    // Priority 3: production default
    return "https://chatbot.144-91-77-107.sslip.io";
}

function mount() {
    injectStyles();

    const backendUrl = getBackendUrl();
    const container = document.createElement("div");
    container.id = "cw-root";
    document.body.appendChild(container);

    createRoot(container).render(
        <React.StrictMode>
            <ChatWidget backendUrl={backendUrl} />
        </React.StrictMode>,
    );
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
} else {
    mount();
}
