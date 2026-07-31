import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HBCField — Field Service Management",
    short_name: "HBCField",
    description:
      "Field service management: task dispatch, GPS tracking, time & attendance, and reporting for field teams.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e1116",
    theme_color: "#0e1116",
    icons: [
      { src: "/favicon.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
