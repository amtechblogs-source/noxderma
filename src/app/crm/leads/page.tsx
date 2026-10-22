"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Users2,
  Plus,
  ArrowLeft,
  Calendar,
  Building,
  Phone,
  MessageCircle,
  TrendingUp,
} from "lucide-react";
import { formatPKR, formatKarachiDate } from "@/lib/formatting";
import { offlineDb } from "@/lib/offline/db";
import type { Lead, LeadPipelineStage } from "@/types";

const STAGES: { stage: LeadPipelineStage; label: string; color: string }[] = [
  { stage: "new", label: "New Leads", color: "border-sky-500" },
  { stage: "contacted", label: "Contacted", color: "border-indigo-500" },
  { stage: "qualified", label: "Clinically Qualified", color: "border-teal-500" },
  { stage: "follow_up", label: "Active Follow-Up", color: "border-amber-500" },
  { stage: "offer_sent", label: "Commercial Offer Sent", color: "border-purple-500" },
  { stage: "converted", label: "Converted to Customer", color: "border-emerald-500" },
];

export default function LeadsCrmPage() {
  const [leads, setLeads] = useState<Lead[]>([]);

  useEffect(() => {
    async function loadLeads() {
      const list = await offlineDb.leads.toArray();
      if (list.length === 0) {
        // Preload sample clinical leads
        const now = new Date().toISOString();
        const sampleLeads: Lead[] = [
          {
            id: "lead_001",
            leadName: "Dr. Farhan Dermatology Clinic",
            organizationName: "Skin Care Aesthetics",
            contactPerson: "Dr. Farhan",
            phone: "+92 333 1122334",
            whatsappNumber: "+92 333 1122334",
            city: "Karachi",
            address: "Clifton Block 5",
            leadSource: "field_visit",
            interestedCategoryName: "Cosmeceuticals",
            assignedEmployeeId: "usr_rep_ali",
            assignedEmployeeName: "Ali Raza",
            status: "qualified",
            estimatedPotentialPkr: 150000,
            notes: "High interest in NoxDerm Hydro-Barrier cream for clinical procedures.",
            nextFollowUpDate: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
            createdAt: now,
          },
          {
            id: "lead_002",
            leadName: "Bismillah Pharmacy Network",
            organizationName: "Bismillah Medicos",
            contactPerson: "Saeed Anwar",
            phone: "+92 301 5566778",
            whatsappNumber: "+92 301 5566778",
            city: "Karachi",
            leadSource: "referral",
            interestedCategoryName: "Pharmacy & Prescriptions",
            assignedEmployeeId: "usr_rep_ali",
            assignedEmployeeName: "Ali Raza",
            status: "offer_sent",
            estimatedPotentialPkr: 350000,
            notes: "Negotiating wholesale discounts on antibiotic capsules.",
            nextFollowUpDate: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
            createdAt: now,
          },
        ];
        await offlineDb.leads.bulkPut(sampleLeads);
        setLeads(sampleLeads);
      } else {
        setLeads(list);
      }
    }
    loadLeads();
  }, []);

  const totalPipelineValue = leads.reduce((sum, l) => sum + (l.estimatedPotentialPkr || 0), 0);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 mb-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Users2 className="w-6 h-6 text-teal-600" />
            Leads Pipeline & Relationship Management
          </h1>
          <p className="text-xs md:text-sm text-slate-500">
            Track pharmacy prospects, clinic leads, and pipeline stages with WhatsApp integration.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-800 dark:text-teal-200 text-xs font-bold border border-teal-200 dark:border-teal-800">
            Pipeline Potential: <strong>{formatPKR(totalPipelineValue)}</strong>
          </div>
        </div>
      </div>

      {/* Kanban / Stage Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {STAGES.map(({ stage, label, color }) => {
          const stageLeads = leads.filter((l) => l.status === stage);

          return (
            <div
              key={stage}
              className={`p-4 rounded-xl border-t-4 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3 ${color}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {label}
                </span>
                <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-bold flex items-center justify-center">
                  {stageLeads.length}
                </span>
              </div>

              <div className="space-y-2.5">
                {stageLeads.length > 0 ? (
                  stageLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <strong className="font-bold text-slate-900 dark:text-slate-100">
                          {lead.leadName}
                        </strong>
                        <span className="font-bold text-teal-600">
                          {formatPKR(lead.estimatedPotentialPkr)}
                        </span>
                      </div>

                      <p className="text-[11px] text-slate-500">
                        Contact: {lead.contactPerson} • {lead.city}
                      </p>

                      {lead.interestedCategoryName && (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300">
                          {lead.interestedCategoryName}
                        </span>
                      )}

                      <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[10px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          {lead.nextFollowUpDate ? formatKarachiDate(lead.nextFollowUpDate) : "No follow-up set"}
                        </span>

                        <a
                          href={`https://wa.me/${(lead.whatsappNumber || "").replace(/[^0-9]/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-emerald-600 font-bold hover:underline flex items-center gap-1"
                        >
                          <MessageCircle className="w-3 h-3" />
                          WhatsApp
                        </a>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-[11px] text-slate-400">No leads in this stage.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
