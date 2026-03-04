/**
 * LinkedIn carousel slide template for Satori.
 * Dimensions: 1080x1080px
 */

export interface LinkedInSlideProps {
  heading: string;
  body: string;
  slideNumber: number;
  totalSlides: number;
  brandColors: {
    primary: string;
    foreground: string;
    background: string;
    secondary: string;
    darkPrimary: string;
    lightBackground: string;
  };
  isFirst: boolean;
  isLast: boolean;
}

export function LinkedInSlide(props: LinkedInSlideProps) {
  const { heading, body, slideNumber, totalSlides, brandColors, isFirst, isLast } = props;

  const isCoverSlide = isFirst || isLast;

  return (
    <div
      style={{
        width: 1080,
        height: 1080,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
        background: isCoverSlide
          ? `linear-gradient(135deg, ${brandColors.primary}, ${brandColors.darkPrimary})`
          : brandColors.lightBackground,
        color: isCoverSlide ? "#FFFFFF" : brandColors.foreground,
        fontFamily: "Inter",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Decorative circle — large, bottom-right */}
      {isCoverSlide && (
        <div
          style={{
            position: "absolute",
            bottom: -120,
            right: -120,
            width: 400,
            height: 400,
            borderRadius: "50%",
            backgroundColor: "rgba(255, 255, 255, 0.08)",
          }}
        />
      )}

      {/* Decorative circle — small, top-left */}
      {isCoverSlide && (
        <div
          style={{
            position: "absolute",
            top: -60,
            left: -60,
            width: 200,
            height: 200,
            borderRadius: "50%",
            backgroundColor: "rgba(255, 255, 255, 0.05)",
          }}
        />
      )}

      {/* Left accent strip for content slides */}
      {!isCoverSlide && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: 6,
            height: "100%",
            backgroundColor: brandColors.primary,
          }}
        />
      )}

      {/* Top bar for cover slides */}
      {isCoverSlide && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 6,
            backgroundColor: "#FFFFFF",
            opacity: 0.8,
          }}
        />
      )}

      {/* Content */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: isCoverSlide ? "center" : "flex-start",
          textAlign: isCoverSlide ? "center" : "left",
          gap: 24,
          maxWidth: 900,
        }}
      >
        <h1
          style={{
            fontSize: isFirst ? 64 : 52,
            fontWeight: 700,
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
            margin: 0,
          }}
        >
          {heading}
        </h1>
        <p
          style={{
            fontSize: 28,
            lineHeight: 1.6,
            margin: 0,
            opacity: 0.9,
          }}
        >
          {body}
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
          fontSize: 20,
          opacity: 0.6,
        }}
      >
        <span>zopdev</span>
        <span>
          {slideNumber} / {totalSlides}
        </span>
      </div>
    </div>
  );
}
