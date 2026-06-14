import { NextRequest, NextResponse } from "next/server";
import { reportStore } from "@/lib/server/report-store";
import nodemailer from "nodemailer";
import { z } from "zod";

export const runtime = "nodejs";

const subscriptionSchema = z.object({
  reportId: z.string().min(1)
});

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(request: NextRequest) {
  try {
    const body = subscriptionSchema.parse(await request.json());
    const report = await reportStore.get(body.reportId);

    if (!report) {
      return NextResponse.json({ message: "Report not found." }, { status: 404 });
    }

    const submittedAt = new Date().toISOString();
    const reportUrl = report.shareUrl || `${new URL(request.url).origin}/report/${report.id}`;
    const subscription = await reportStore.saveInsightSubscription({
      reportId: report.id,
      email: report.businessEmail,
      brand: report.brandName,
      website: report.websiteUrl,
      reportUrl,
      frequency: "biweekly",
      createdAt: submittedAt
    });

    const to = process.env.LEAD_NOTIFICATION_EMAIL ?? process.env.BUSINESS_EMAIL ?? "";
    const smtpHost = process.env.SMTP_HOST ?? "";
    const smtpPort = Number(process.env.SMTP_PORT ?? 465);
    const smtpUser = process.env.SMTP_USER ?? "";
    const smtpPass = process.env.SMTP_PASS ?? "";
    const from = process.env.LEAD_EMAIL_FROM ?? process.env.EMAIL_FROM ?? smtpUser;

    if (!to || !smtpHost || !smtpUser || !smtpPass || !from) {
      console.log("Insight subscription saved, but email notification is not configured.", subscription);
      return NextResponse.json(
        { message: "Subscription saved, but SMTP email notification is not configured." },
        { status: 503 }
      );
    }

    const subject = `AI Insights Subscription - ${report.brandName}`;
    const safeBrand = escapeHtml(report.brandName);
    const safeEmail = escapeHtml(report.businessEmail);
    const safeWebsite = escapeHtml(report.websiteUrl);
    const safeReportUrl = escapeHtml(reportUrl);
    const safeSubmittedAt = escapeHtml(submittedAt);
    const text = [
      "AI Visibility Insights Subscription",
      "",
      `Brand: ${report.brandName}`,
      `Email: ${report.businessEmail}`,
      `Website: ${report.websiteUrl}`,
      `Frequency: Every two weeks`,
      `Report: ${reportUrl}`,
      `Subscribed: ${submittedAt}`
    ].join("\n");

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111; line-height: 1.5;">
        <h2 style="margin: 0 0 12px;">AI Visibility Insights Subscription</h2>
        <p style="margin: 0 0 18px;">A report visitor subscribed to personalized AI visibility insights.</p>
        <table style="border-collapse: collapse; width: 100%; max-width: 620px;">
          <tr><td style="padding: 8px 0; color: #666;">Brand</td><td style="padding: 8px 0; font-weight: 700;">${safeBrand}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Email</td><td style="padding: 8px 0; font-weight: 700;">${safeEmail}</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Website</td><td style="padding: 8px 0;"><a href="${safeWebsite}">${safeWebsite}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Frequency</td><td style="padding: 8px 0;">Every two weeks</td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Report</td><td style="padding: 8px 0;"><a href="${safeReportUrl}">${safeReportUrl}</a></td></tr>
          <tr><td style="padding: 8px 0; color: #666;">Subscribed</td><td style="padding: 8px 0;">${safeSubmittedAt}</td></tr>
        </table>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    try {
      await transporter.sendMail({
        from,
        to,
        replyTo: report.businessEmail,
        subject,
        text,
        html
      });
    } catch (error) {
      console.error("Insight subscription SMTP email failed", error);
      if (error && typeof error === "object" && "code" in error && error.code === "EAUTH") {
        return NextResponse.json({ message: "Gmail rejected the SMTP login. Check SMTP_USER and use a valid Gmail App Password for SMTP_PASS." }, { status: 502 });
      }
      return NextResponse.json({ message: "Subscription saved, but the notification email could not be sent." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, message: "Insight subscription saved." }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ message: "Invalid request", issues: error.flatten() }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ message: "Could not subscribe to insights." }, { status: 500 });
  }
}
