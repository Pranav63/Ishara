import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ishara",
    short_name: "Ishara",
    description: "Sign language interpreters for any appointment in Dubai.",
    start_url: "/",
    display: "standalone",
    background_color: "#eef0ec",
    theme_color: "#0e7c66",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
