/**
 * Existing Bullex palette and scales, deliberately retained during the v4
 * tooling migration. These are design tokens, not a second Tailwind compiler.
 * Palette values originate in Tailwind CSS v3 (MIT, Tailwind Labs).
 */
export default {
  colors: {
    slate: { 100: "#f1f5f9", 300: "#cbd5e1", 400: "#94a3b8", 500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a" },
    gray: { 50: "#f9fafb", 100: "#f3f4f6", 200: "#e5e7eb", 300: "#d1d5db", 400: "#9ca3af", 500: "#6b7280", 600: "#4b5563", 800: "#1f2937", 900: "#111827" },
    stone: { 400: "#a8a29e", 600: "#57534e", 700: "#44403c", 900: "#1c1917" },
    red: { 50: "#fef2f2", 100: "#fee2e2", 200: "#fecaca", 300: "#fca5a5", 400: "#f87171", 500: "#ef4444", 600: "#dc2626", 700: "#b91c1c", 800: "#991b1b", 900: "#7f1d1d", 950: "#450a0a" },
    orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#fed7aa", 400: "#fb923c", 500: "#f97316", 600: "#ea580c", 700: "#c2410c", 800: "#9a3412", 900: "#7c2d12", 950: "#431407" },
    amber: { 50: "#fffbeb", 100: "#fef3c7", 200: "#fde68a", 300: "#fcd34d", 400: "#fbbf24", 500: "#f59e0b", 600: "#d97706", 700: "#b45309", 800: "#92400e", 900: "#78350f", 950: "#451a03" },
    yellow: { 100: "#fef9c3", 400: "#facc15", 800: "#854d0e", 900: "#713f12" },
    green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#bbf7d0", 300: "#86efac", 400: "#4ade80", 500: "#22c55e", 600: "#16a34a", 700: "#15803d", 800: "#166534", 900: "#14532d", 950: "#052e16" },
    emerald: { 50: "#ecfdf5", 100: "#d1fae5", 200: "#a7f3d0", 300: "#6ee7b7", 400: "#34d399", 500: "#10b981", 600: "#059669", 700: "#047857", 800: "#065f46", 900: "#064e3b", 950: "#022c22" },
    teal: { 400: "#2dd4bf", 700: "#0f766e", 900: "#134e4a" },
    sky: { 400: "#38bdf8", 500: "#0ea5e9", 600: "#0284c7", 700: "#0369a1", 900: "#0c4a6e" },
    blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd", 400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8", 800: "#1e40af", 900: "#1e3a8a", 950: "#172554" },
    indigo: { 500: "#6366f1" },
    violet: { 100: "#ede9fe", 300: "#c4b5fd", 500: "#8b5cf6", 800: "#5b21b6", 900: "#4c1d95" },
    purple: { 100: "#f3e8ff", 200: "#e9d5ff", 400: "#c084fc", 600: "#9333ea", 800: "#6b21a8", 900: "#581c87" },
  },
  boxShadow: {
    sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    DEFAULT: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
  },
  blur: { sm: "4px", DEFAULT: "8px" },
  backdropBlur: { sm: "4px", DEFAULT: "8px" },
  ringWidth: { DEFAULT: "3px" },
  ringColor: { DEFAULT: "#3b82f680" },
};
