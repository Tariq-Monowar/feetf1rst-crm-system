/**
 * Test email SMTP connection on Ubuntu VPS (standalone - no S3/AWS required)
 * Run: npm run test:email
 */
import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";

const user = process.env.NODE_MAILER_USER || "";
const pass = process.env.NODE_MAILER_PASSWORD || "";
const testEmail = process.env.TEST_EMAIL || user;

async function main() {
  console.log("NODE_MAILER_USER:", user ? "✓ set" : "✗ missing");
  console.log("NODE_MAILER_PASSWORD:", pass ? "✓ set" : "✗ missing");
  console.log("");

  if (!user || !pass) {
    console.error("Set NODE_MAILER_USER and NODE_MAILER_PASSWORD in .env");
    process.exit(1);
  }

  const usePort465 = process.env.EMAIL_USE_PORT_465 === "true";
  const port = usePort465 ? 465 : 587;
  console.log("Using SMTP port:", port, usePort465 ? "(SSL)" : "(STARTTLS)");
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port,
    secure: usePort465,
    requireTLS: !usePort465,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });

  try {
    await transporter.verify();
    console.log("SMTP connection verified successfully.");
  } catch (err: any) {
    console.error("SMTP verification failed:", err?.message);
    console.error("\nTry: Add EMAIL_USE_PORT_465=true to .env (port 465 often allowed when 587 is blocked)");
    console.error("Or: Ask hosting to allow outbound SMTP ports 587/465.");
    process.exit(1);
  }

  if (testEmail) {
    console.log(`Sending test email to ${testEmail}...`);
    try {
      await transporter.sendMail({
        from: `"Feetf1rst" <${user}>`,
        to: testEmail,
        subject: "Feetf1rst Email Test",
        html: "<p>If you see this, email is working on your VPS.</p>",
      });
      console.log("Test email sent successfully.");
    } catch (e: any) {
      console.error("Test email failed:", e?.message);
      process.exit(1);
    }
  } else {
    console.log("Set TEST_EMAIL in .env to send a test email.");
  }
}

main();
