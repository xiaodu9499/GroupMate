export async function stdoutReply(text: string): Promise<void> {
  process.stdout.write(`${text}\n`);
}
