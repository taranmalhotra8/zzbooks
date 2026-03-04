/**
 * Stat Card — Satori-rendered branded graphic.
 * Displays a bold headline number with supporting text and optional source attribution.
 * Dimensions: 800x500px (landscape, optimized for inline chapter use).
 *
 * Used for: key savings figures, ROI highlights, cost metrics.
 */

export interface BrandColors {
  primary: string;
  foreground: string;
  background: string;
  secondary: string;
  darkPrimary: string;
  lightBackground: string;
}

export interface StatCardProps {
  headline: string;       // e.g., "$18,400/month"
  subtext: string;        // e.g., "Average savings from right-sizing"
  source?: string;        // e.g., "Datadog 2024 Report"
  brandColors: BrandColors;
}

export function StatCard(props: StatCardProps) {
  const { headline, subtext, source, brandColors } = props;

  return (
    <div
      style={{
        width: 800,
        height: 500,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 60,
        background: `linear-gradient(135deg, ${brandColors.primary}, ${brandColors.darkPrimary})`,
        color: "#FFFFFF",
        fontFamily: "Inter",
        position: "relative",
        overflow: "hidden",
        borderRadius: 16,
      }}
    >
      {/* Decorative circle — large, bottom-right */}
      <div
        style={{
          position: "absolute",
          bottom: -80,
          right: -80,
          width: 300,
          height: 300,
          borderRadius: "50%",
          backgroundColor: "rgba(255, 255, 255, 0.06)",
        }}
      />

      {/* Decorative circle — small, top-left */}
      <div
        style={{
          position: "absolute",
          top: -40,
          left: -40,
          width: 160,
          height: 160,
          borderRadius: "50%",
          backgroundColor: "rgba(255, 255, 255, 0.04)",
        }}
      />

      {/* Top accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 4,
          backgroundColor: "#FFFFFF",
          opacity: 0.6,
        }}
      />

      {/* Main content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: 16,
        }}
      >
        <h1
          style={{
            fontSize: headline.length <= 12 ? 72 : headline.length <= 20 ? 56 : headline.length <= 30 ? 44 : 36,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: "-0.03em",
            margin: 0,
            maxWidth: 680,
            wordBreak: "break-word",
          }}
        >
          {headline}
        </h1>
        <p
          style={{
            fontSize: subtext.length <= 40 ? 24 : subtext.length <= 80 ? 20 : 17,
            lineHeight: 1.4,
            margin: 0,
            opacity: 0.85,
            maxWidth: 650,
          }}
        >
          {subtext}
        </p>
      </div>

      {/* Footer with source + branding */}
      <div
        style={{
          position: "absolute",
          bottom: 28,
          left: 60,
          right: 60,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 14,
          opacity: 0.5,
        }}
      >
        <span>{source || ""}</span>
        <span>zopdev</span>
      </div>
    </div>
  );
}
