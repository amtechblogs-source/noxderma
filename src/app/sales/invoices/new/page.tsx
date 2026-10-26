"use client";

import React, { Suspense } from "react";
import { OfflineInvoiceCreator } from "@/features/sales/OfflineInvoiceCreator";

export default function NewInvoicePage() {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-slate-500 min-h-[400px] flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          <p className="font-semibold text-sm">Loading invoice creator...</p>
        </div>
      }
    >
      <OfflineInvoiceCreator />
    </Suspense>
  );
}
