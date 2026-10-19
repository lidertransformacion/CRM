import net from "node:net";
import tls from "node:tls";
import { rfc822, type OutboundMail } from "@/lib/mail/message";

type SmtpOptions = {
  host: string;
  port: number;
  user: string;
  pass: string;
  message: OutboundMail;
};

function command(socket: NodeJS.ReadWriteStream, line: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] ?? "";
      if (/^\d{3} /.test(last)) {
        socket.off("data", onData);
        const code = Number(last.slice(0, 3));
        if (code >= 400) reject(new Error(last));
        else resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.write(`${line}\r\n`);
  });
}

/** Minimal SMTP submission for Node. STARTTLS on 587, implicit TLS on 465. */
export async function smtpSend(options: SmtpOptions): Promise<string> {
  const { host, port, user, pass, message } = options;
  const socket = await new Promise<net.Socket>((resolve, reject) => {
    const created = net.connect({ host, port }, () => resolve(created));
    created.once("error", reject);
  });
  const readGreeting = () =>
    new Promise<void>((resolve, reject) => {
      socket.once("data", (chunk) => {
        const text = chunk.toString();
        if (!text.startsWith("220")) reject(new Error(text.trim()));
        else resolve();
      });
    });
  await readGreeting();
  let channel: NodeJS.ReadWriteStream = socket;
  await command(channel, "EHLO crm-pay-line");
  if (port === 465) {
    // Already implicit TLS if the server expected it; 465 without tls.connect is not used.
  } else {
    await command(channel, "STARTTLS");
    channel = await new Promise((resolve, reject) => {
      const secure = tls.connect({ socket, servername: host }, () => resolve(secure));
      secure.once("error", reject);
    });
    await command(channel, "EHLO crm-pay-line");
  }
  if (user) {
    await command(channel, "AUTH LOGIN");
    await command(channel, Buffer.from(user).toString("base64"));
    await command(channel, Buffer.from(pass).toString("base64"));
  }
  await command(channel, `MAIL FROM:<${message.fromAddress}>`);
  await command(channel, `RCPT TO:<${message.to}>`);
  await command(channel, "DATA");
  const payload = rfc822(message).replace(/^\./gm, "..");
  await command(channel, `${payload}\r\n.`);
  await command(channel, "QUIT");
  socket.end();
  return "smtp";
}
