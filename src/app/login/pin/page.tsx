import { cookies } from "next/headers";
import { PinLogin } from "@/components/c/PinLogin";

export const dynamic = "force-dynamic";

// Kid sign-in: name and a 6-digit code on a keypad. The name is remembered on the device after the first time.
export default async function PinLoginPage() {
  const remembered = (await cookies()).get("kid_name")?.value ?? "";
  return <PinLogin remembered={remembered.slice(0, 40)} />;
}
