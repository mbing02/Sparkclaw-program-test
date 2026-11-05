// Vercel Routing Middleware entry for static / non-Next.js projects.
// Logic lives in gate.js. Next.js 16 projects use proxy.ts instead (see nextjs/).
export { default } from "./gate.js";
export const config = { matcher: "/:path*" };
