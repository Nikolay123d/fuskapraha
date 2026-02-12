
import { ENV } from "./00_env.js";

export function log(...a){ if(ENV.DEBUG) console.log("[mk]", ...a); }
export function warn(...a){ console.warn("[mk]", ...a); }
export function err(...a){ console.error("[mk]", ...a); }
