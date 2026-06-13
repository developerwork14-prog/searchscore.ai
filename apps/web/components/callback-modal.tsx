"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Button, Input } from "@/components/ui";

type CallbackModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function CallbackModal({ isOpen, onClose }: CallbackModalProps) {
  const [requestSent, setRequestSent] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRequestError("");
    setIsSubmitting(true);
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/callback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          website: data.get("website")
        })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message ?? "Could not submit request");
      }
      setRequestSent(true);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Could not submit request");
    } finally {
      setIsSubmitting(false);
    }
  }

  function closeModal() {
    onClose();
    window.setTimeout(() => {
      setRequestSent(false);
      setRequestError("");
      setIsSubmitting(false);
    }, 180);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 px-5 py-8 backdrop-blur-sm">
      <div className="w-full max-w-sm overflow-hidden rounded-[14px] border border-[#ECECEC] bg-white shadow-panel">
        {!requestSent ? (
          <div className="flex items-start justify-between gap-4 border-b border-[#ECECEC] bg-white p-4">
            <div>
              <p className="text-xs font-bold text-[#8A6D1F]">Request a call back</p>
              <h2 className="mt-1 text-xl font-black text-ink">Fix your AI Search Score</h2>
            </div>
            <button suppressHydrationWarning type="button" onClick={closeModal} className="flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-[#ECECEC] bg-[#FAFAFA] text-[#666666] transition hover:border-[#D9D9D9] hover:text-ink">
              <X className="size-4" />
            </button>
          </div>
        ) : null}

        {requestSent ? (
          <div className="p-4">
            <div className="rounded-lg border border-teal/20 bg-teal/10 p-4">
              <p className="font-black text-ink">Thanks. We received your request.</p>
              <p className="mt-2 text-sm font-medium leading-6 text-ink/62">Our team will contact you shortly with personalized recommendations.</p>
            </div>
            <Button className="mt-5 w-full rounded-[10px] border border-[#E8D4A8] bg-gold text-ink hover:bg-gold" type="button" onClick={closeModal}>
              Close
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-3 p-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#666666]">Name</label>
              <Input name="name" className="min-h-10 bg-[#FAFAFA]" placeholder="Your name" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#666666]">Company Email ID</label>
              <Input name="email" className="min-h-10 bg-[#FAFAFA]" type="email" placeholder="you@company.com" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#666666]">Phone Number</label>
              <Input name="phone" className="min-h-10 bg-[#FAFAFA]" type="tel" placeholder="+91 98765 43210" required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-[#666666]">Website</label>
              <Input name="website" className="min-h-10 bg-[#FAFAFA]" placeholder="https://domain.com" required />
            </div>
            {requestError ? <p className="rounded-[10px] border border-coral/20 bg-coral/10 px-3 py-2 text-xs font-bold leading-5 text-coral">{requestError}</p> : null}
            <Button className="w-full rounded-[10px] border border-[#E8D4A8] bg-gold text-ink hover:bg-gold" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Submitting..." : "Submit Request"}
              <ArrowRight className="size-4" />
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
