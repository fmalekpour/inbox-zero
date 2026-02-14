export function buildPullingMessageJobId(options: {
  emailAccountId: string;
  messageId: string;
}) {
  return `${options.emailAccountId}:${options.messageId}`;
}
