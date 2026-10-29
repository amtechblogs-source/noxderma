"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function EmployeesSalariesRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/finance/salaries");
  }, [router]);

  return (
    <div className="p-8 text-center text-xs text-slate-400">
      Redirecting to Staff Salaries &amp; Payroll...
    </div>
  );
}
