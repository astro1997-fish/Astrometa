"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const ws_1 = __importDefault(require("ws"));
const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!supabaseUrl || !supabaseService) {
    console.warn('⚠️  SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — Supabase client will not function until configured.');
}
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl || 'https://placeholder.supabase.co', supabaseService || 'placeholder', {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws_1.default },
});
