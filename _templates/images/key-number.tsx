/**
 * Key Number — Satori-rendered single number callout.
 * A bold, centered number with contextual text below.
 * Dimensions: 800x400px (short landscape).
 *
 * Used for: hero statistics, chapter-opening shock values, fleet sizes.
 */

export interface BrandColors {
  primary: string;
  foreground: string;
  background: string;
  secondary: string;
  darkPrimary: string;
  lightBackground: string;
}

export interface KeyNumberProps {
  number: string;         // e.g., "143"
  unit: string;           // e.g., "EC2 instances"
  context: string;        // e.g., "running at <20% CPU utilization"
  brandColors: BrandColors;
}

export function KeyNumber(props: KeyNumberProps) {
  const { number, unit, context, brandColors } = props;

  return (
    <div
      style={{
        width: 800,
        height: 400,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 48,
        background: brandColors.lightBackground,
        color: brandColors.foreground,
        fontFamily: "Inter",
        position: "relative",
        overflow: "hidden",
        borderRadius: 16,
        border: `2px solid ${brandColors.primary}15`,
      }}
    >
      {/* Subtle top accent */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          transform: "translateX(-50%)",
          width: 80,
          height: 4,
          backgroundColor: brandColors.primary,
          borderRadius: "0 0 4px 4px",
        }}
      />

      {/* Number + unit */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "center",
          gap: 12,
          marginBottom: 12,
          maxWidth: 700,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: number.length <= 6 ? 96 : number.length <= 12 ? 72 : 56,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: "-0.04em",
            color: brandColors.primary,
          }}
        >
          {number}
        </div>
        <div
          style={{
            fontSize: unit.length <= 15 ? 28 : 22,
            fontWeight: 600,
            color: brandColors.foreground,
            opacity: 0.7,
          }}
        >
          {unit}
        </div>
      </div>

      {/* Context line */}
      <div
        style={{
          fontSize: context.length <= 50 ? 20 : 17,
          color: brandColors.foreground,
          opacity: 0.55,
          textAlign: "center",
          maxWidth: 650,
          lineHeight: 1.4,
        }}
      >
        {context}
      </div>

      {/* Footer branding */}
      <div
        style={{
          position: "absolute",
          bottom: 16,
          right: 48,
          fontSize: 13,
          opacity: 0.3,
          color: brandColors.foreground,
        }}
      >
        zopdev
      </div>
    </div>
  );
}
