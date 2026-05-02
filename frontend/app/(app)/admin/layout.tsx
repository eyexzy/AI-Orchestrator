import { ShieldOff } from "lucide-react";
import { auth } from "@/auth";

const ADMIN_EMAIL = "eyexzy@gmail.com";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (session?.user?.email !== ADMIN_EMAIL) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <ShieldOff size={32} strokeWidth={1.5} className="text-ds-text-tertiary" />
          <p className="text-[18px] font-semibold text-ds-text">Доступ заборонено</p>
          <p className="text-[14px] text-ds-text-tertiary">
            Ця сторінка доступна тільки адмін-акаунту.
          </p>
        </div>
      </main>
    );
  }

  return children;
}
