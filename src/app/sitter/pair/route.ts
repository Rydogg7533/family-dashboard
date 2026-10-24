import { NextResponse, type NextRequest } from "next/server";
import { verifyTablet, TABLET_COOKIE } from "@/lib/sitter-tablet";

// Open this link once on the kitchen tablet. A valid token is stored as a cookie on that device and the page opens; anything else is refused.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const to = req.nextUrl.clone(); to.search = "";
  if (!(await verifyTablet(token))) { to.pathname = "/sitter"; to.searchParams.set("e", "1"); return NextResponse.redirect(to); }
  to.pathname = "/sitter";
  const res = NextResponse.redirect(to);
  res.cookies.set(TABLET_COOKIE, token!, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
