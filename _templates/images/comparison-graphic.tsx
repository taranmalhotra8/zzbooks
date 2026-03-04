/**
 * Comparison Graphic — Satori-rendered before/after card.
 * Two-column layout with an improvement badge between them.
 * Dimensions: 800x500px (landscape).
 *
 * Used for: before/after optimizations, cost comparisons, migration results.
 */

export interface BrandColors {
  primary: string;
  foreground: string;
  background: string;
  secondary: string;
  darkPrimary: string;
  lightBackground: string;
}

export interface ComparisonGraphicProps {
  title?: string;
  before: { label: string; value: string };
  after: { label: string; value: string };
  improvement: string;    // e.g., "67% reduction"
  brandColors: BrandColors;
}

// Auto-scale font size based on text length to prevent clipping
function valueFontSize(text: string): number {
  const len = text.length;
  if (len <= 8) return 36;
  if (len <= 14) return 28;
  if (len <= 20) return 22;
  return 18;
}

export function ComparisonGraphic(props: ComparisonGraphicProps) {
  const { title, before, after, improvement, brandColors } = props;

  const beforeSize = valueFontSize(before.value);
  const afterSize = valueFontSize(after.value);

  return (
    <div
      style={{
        width: 800,
        height: 500,
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
        border: `2px solid ${brandColors.primary}20`,
      }}
    >
      {/* Title */}
      {title && (
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 32,
            color: brandColors.foreground,
            letterSpacing: "-0.01em",
            textAlign: "center",
            maxWidth: 700,
          }}
        >
          {title}
        </div>
      )}

      {/* Two-column comparison */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
          gap: 32,
          width: "100%",
        }}
      >
        {/* BEFORE column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px 24px",
            borderRadius: 12,
            backgroundColor: "#FF6B6B18",
            border: "2px solid #FF6B6B40",
            flex: 1,
            maxWidth: 300,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#FF6B6B",
              marginBottom: 12,
            }}
          >
            BEFORE
          </div>
          <div
            style={{
              fontSize: beforeSize,
              fontWeight: 700,
              lineHeight: 1.3,
              color: "#FF6B6B",
              marginBottom: 8,
              textAlign: "center",
              wordBreak: "break-word",
            }}
          >
            {before.value}
          </div>
          <div
            style={{
              fontSize: 14,
              color: brandColors.foreground,
              opacity: 0.7,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {before.label}
          </div>
        </div>

        {/* Arrow + improvement badge */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div style={{ fontSize: 28, color: brandColors.primary }}>→</div>
          <div
            style={{
              backgroundColor: "#00C48C",
              color: "#FFFFFF",
              padding: "8px 16px",
              borderRadius: 20,
              fontSize: improvement.length > 20 ? 13 : 16,
              fontWeight: 700,
              textAlign: "center",
              maxWidth: 140,
            }}
          >
            {improvement}
          </div>
        </div>

        {/* AFTER column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "28px 24px",
            borderRadius: 12,
            backgroundColor: "#00C48C18",
            border: "2px solid #00C48C40",
            flex: 1,
            maxWidth: 300,
          }}
        >
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#00C48C",
              marginBottom: 12,
            }}
          >
            AFTER
          </div>
          <div
            style={{
              fontSize: afterSize,
              fontWeight: 700,
              lineHeight: 1.3,
              color: "#00C48C",
              marginBottom: 8,
              textAlign: "center",
              wordBreak: "break-word",
            }}
          >
            {after.value}
          </div>
          <div
            style={{
              fontSize: 14,
              color: brandColors.foreground,
              opacity: 0.7,
              textAlign: "center",
              lineHeight: 1.4,
            }}
          >
            {after.label}
          </div>
        </div>
      </div>

      {/* Footer branding */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          right: 48,
          fontSize: 14,
          opacity: 0.35,
          color: brandColors.foreground,
        }}
      >
        zopdev
      </div>
    </div>
  );
}
