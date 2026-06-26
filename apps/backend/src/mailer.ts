import nodemailer from "nodemailer";

const MAIL_FROM = process.env.MAIL_FROM ?? "Mealmate <no-reply@mealmate.local>";

// If SMTP_HOST is set, send real mail. Otherwise log to the console so
// local dev doesn't need a mail server.
const transport = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    console.log(`[mailer] to=${to} subject="${subject}"\n${text}`);
    return;
  }
  await transport.sendMail({ from: MAIL_FROM, to, subject, text });
}

export const notify = {
  newMessage: (to: { email: string; displayName: string }, from: { displayName: string }, listingTitle: string, body: string) =>
    sendMail(
      to.email,
      `New message from ${from.displayName} about "${listingTitle}"`,
      `${from.displayName} sent you a message about "${listingTitle}":\n\n${body}\n\nReply in the Mealmate app.`,
    ),

  mealJoined: (to: { email: string; displayName: string }, joiner: { displayName: string }, listingTitle: string) =>
    sendMail(
      to.email,
      `${joiner.displayName} joined your meal "${listingTitle}"`,
      `${joiner.displayName} has joined your meal "${listingTitle}". Open Mealmate to coordinate details.`,
    ),

  joinConfirmed: (
    to: { email: string; displayName: string },
    host: { displayName: string },
    listingTitle: string,
    mealTime: string,
    creditAmount: number,
  ) =>
    sendMail(
      to.email,
      `You're going to "${listingTitle}"`,
      `You've joined "${listingTitle}" hosted by ${host.displayName} on ${new Date(mealTime).toLocaleString()}.\n\n` +
        `${creditAmount} meal-credit has been spent from your balance.\n\n` +
        `This is a commitment to attend — if your plans change, message your host in the Mealmate app as soon as possible to avoid a negative review.`,
    ),

  reviewReceived: (to: { email: string; displayName: string }, reviewer: { displayName: string }, score: number) =>
    sendMail(
      to.email,
      `${reviewer.displayName} left you a review`,
      `${reviewer.displayName} rated your meal ${score}/100. Open Mealmate to see the details.`,
    ),
};
