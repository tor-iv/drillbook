import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tally",
    short_name: "Tally",
    description: "Count what counts. Daily drills, logged.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4ec",
    theme_color: "#f7f4ec",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
