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

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user, pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });

  try {
    await transporter.verify();
    console.log("SMTP connection verified successfully.");
  } catch (err: any) {
    console.error("SMTP verification failed:", err?.message);
    console.error("\nCommon VPS issues: firewall blocks port 587, Gmail blocks datacenter IP.");
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
