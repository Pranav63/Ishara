/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  async rewrites() {
    const api = process.env.ISHARA_API_URL || (process.env.VERCEL ? "" : "http://127.0.0.1:8000");
    return api ? [{ source: "/api/:path*", destination: `${api.replace(/\/$/, "")}/api/:path*` }] : [];
  },
  async headers() {
    return [
      { source: "/:path*", headers: [
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
      ] },
      ...["/r/:path*", "/i/:path*"].map((source) => ({ source, headers: [
        { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
        { key: "Cache-Control", value: "no-store" },
      ] })),
    ];
  },
};
