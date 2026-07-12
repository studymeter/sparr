import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public", "title.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  const dots: Array<{
    top: number;
    left: number;
    size: number;
    color: string;
  }> = [
    { top: 96, left: 150, size: 46, color: "#67c9c9" },
    { top: 150, left: 1000, size: 40, color: "#ff77a9" },
    { top: 470, left: 210, size: 34, color: "#f4c45f" },
    { top: 520, left: 470, size: 24, color: "#f0a25a" },
    { top: 452, left: 980, size: 30, color: "#ff8fb0" },
    { top: 92, left: 800, size: 22, color: "#f4c45f" },
  ];

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        backgroundColor: "#f7f1e6",
        backgroundImage:
          "radial-gradient(circle at 50% 44%, #ffffff 0%, rgba(255,255,255,0) 58%)",
      }}
    >
      {dots.map((dot, i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            top: dot.top,
            left: dot.left,
            width: dot.size,
            height: dot.size,
            borderRadius: dot.size,
            backgroundColor: dot.color,
            opacity: 0.85,
          }}
        />
      ))}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        width={920}
        height={518}
        alt=""
        style={{ position: "relative" }}
      />
    </div>,
    { ...size }
  );
}
