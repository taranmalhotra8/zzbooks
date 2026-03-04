/**
 * Open Graph image template for Satori.
 * Dimensions: 1200x630px
 */

export interface OgImageProps {
  title: string;
  subtitle: string;
  brandColors: {
    primary: string;
    foreground: string;
    background: string;
    secondary: string;
    darkPrimary: string;
    lightBackground: string;
  };
}

export function OgImage(props: OgImageProps) {
  const { title, subtitle, brandColors } = props;

  return (
    <div
      style={{
        width: 1200,
        height: 630,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        background: `linear-gradient(135deg, ${brandColors.primary}, ${brandColors.darkPrimary})`,
        color: "#FFFFFF",
        fontFamily: "Inter",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative circle — top-right */}
      <div
        style={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 300,
          height: 300,
          backgroundColor: "rgba(255,255,255,0.08)",
          borderRadius: "50%",
        }}
      />

      {/* Decorative circle — bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: -100,
          left: -100,
          width: 250,
          height: 250,
          backgroundColor: "rgba(255,255,255,0.05)",
          borderRadius: "50%",
        }}
      />

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxWidth: 900,
        }}
      >
        <h1
          style={{
            fontSize: 56,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {title}
        </h1>

        {/* Divider */}
        <div
          style={{
            width: 60,
            height: 3,
            backgroundColor: "rgba(255, 255, 255, 0.4)",
            borderRadius: 2,
          }}
        />

        <p
          style={{
            fontSize: 28,
            lineHeight: 1.5,
            margin: 0,
            opacity: 0.85,
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          style={{
            fontSize: 24,
            fontWeight: 700,
            opacity: 0.8,
          }}
        >
          zopdev
        </span>
        <span
          style={{
            fontSize: 18,
            opacity: 0.6,
          }}
        >
          Free Ebook
        </span>
      </div>
    </div>
  );
}
