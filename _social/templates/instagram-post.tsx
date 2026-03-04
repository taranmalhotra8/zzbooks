/**
 * Instagram post template for Satori.
 * Dimensions: 1080x1350px (4:5 ratio)
 */

export interface InstagramPostProps {
  quote: string;
  attribution: string;
  bookTitle: string;
  brandColors: {
    primary: string;
    foreground: string;
    background: string;
    secondary: string;
    darkPrimary: string;
    lightBackground: string;
  };
}

export function InstagramPost(props: InstagramPostProps) {
  const { quote, attribution, bookTitle, brandColors } = props;

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        backgroundColor: brandColors.background,
        fontFamily: "Inter",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top accent bar — gradient */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 8,
          background: `linear-gradient(90deg, ${brandColors.primary}, ${brandColors.darkPrimary})`,
        }}
      />

      {/* Background watermark quote mark */}
      <div
        style={{
          position: "absolute",
          top: 120,
          right: 40,
          fontSize: 480,
          color: brandColors.primary,
          lineHeight: 1,
          fontWeight: 700,
          opacity: 0.04,
        }}
      >
        {"\u201C"}
      </div>

      {/* Bottom fade overlay */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 200,
          backgroundColor: brandColors.lightBackground,
          opacity: 0.4,
        }}
      />

      {/* Visible quote mark */}
      <div
        style={{
          fontSize: 120,
          color: brandColors.primary,
          lineHeight: 1,
          marginBottom: 20,
          fontWeight: 700,
          opacity: 0.3,
        }}
      >
        {"\u201C"}
      </div>

      {/* Quote text */}
      <div
        style={{
          fontSize: 36,
          lineHeight: 1.6,
          color: brandColors.foreground,
          textAlign: "center",
          maxWidth: 880,
          fontWeight: 500,
          marginBottom: 40,
        }}
      >
        {quote}
      </div>

      {/* Attribution */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <div
          style={{
            width: 80,
            height: 3,
            backgroundColor: brandColors.primary,
            marginBottom: 12,
            borderRadius: 2,
          }}
        />
        <span
          style={{
            fontSize: 20,
            color: brandColors.secondary,
            fontWeight: 600,
          }}
        >
          {attribution}
        </span>
        <span
          style={{
            fontSize: 18,
            color: brandColors.secondary,
            opacity: 0.7,
          }}
        >
          {bookTitle}
        </span>
      </div>

      {/* Footer branding */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          fontSize: 20,
          color: brandColors.primary,
          fontWeight: 700,
          opacity: 0.6,
        }}
      >
        zopdev
      </div>
    </div>
  );
}
