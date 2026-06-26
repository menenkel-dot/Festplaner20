// @deno-types="npm:@types/nodemailer@6.4.16"
import nodemailer from "nodemailer";

export const DEFAULT_MAIL_SUBJECT = "Reservierungsbestätigung für {{fest_name}}";

export const DEFAULT_MAIL_BODY = `Hallo {{gast_name}},

vielen Dank für deine Reservierungsanfrage.

Wir bestätigen hiermit deine Reservierung für {{fest_name}}.

Datum: {{datum}}
Uhrzeit: {{uhrzeit}}
Tisch(e): {{tische}}
Anzahl Tische: {{anzahl_tische}}

Bei Rückfragen antworte bitte direkt auf diese E-Mail.

Viele Grüße
{{verein_name}}`;

export interface SmtpSettings {
  sender_name: string;
  sender_email: string;
  reply_to_email?: string | null;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_username: string;
  smtp_password: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

const getCryptoKey = async (secret: string) => {
  const hash = await crypto.subtle.digest("SHA-256", textEncoder.encode(secret));
  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["encrypt", "decrypt"]);
};

export const encryptSecret = async (value: string, secret: string) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getCryptoKey(secret);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, textEncoder.encode(value));
  return `${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(encrypted))}`;
};

export const decryptSecret = async (value: string, secret: string) => {
  const [ivBase64, encryptedBase64] = value.split(":");
  if (!ivBase64 || !encryptedBase64) throw new Error("SMTP-Passwort konnte nicht entschlüsselt werden.");
  const key = await getCryptoKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivBase64) },
    key,
    base64ToBytes(encryptedBase64),
  );
  return textDecoder.decode(decrypted);
};

export const renderTemplate = (template: string, variables: Record<string, string>) => {
  return Object.entries(variables).reduce(
    (output, [key, value]) => output.split(`{{${key}}}`).join(value || "-"),
    template,
  );
};

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

export const textToHtml = (value: string) => {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
};

const formatSender = (name: string, email: string) => {
  const cleanName = name.trim().replace(/"/g, "'");
  return cleanName ? `"${cleanName}" <${email.trim()}>` : email.trim();
};

export const sendSmtpMail = async (
  settings: SmtpSettings,
  to: string,
  subject: string,
  text: string,
) => {
  const transport = nodemailer.createTransport({
    host: settings.smtp_host,
    port: Number(settings.smtp_port),
    secure: Boolean(settings.smtp_secure),
    auth: {
      user: settings.smtp_username,
      pass: settings.smtp_password,
    },
  });

  await new Promise<void>((resolve, reject) => {
    transport.sendMail(
      {
        from: formatSender(settings.sender_name, settings.sender_email),
        to,
        replyTo: settings.reply_to_email || settings.sender_email,
        subject,
        text,
        html: textToHtml(text),
      },
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
};
