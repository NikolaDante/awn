export function normalizeSmsIdentity(value: string) {
  return value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim().replace(/\s+/g, " ")).filter(Boolean).join("\n").toLowerCase();
}

export function smsImportFingerprint(identity: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (const character of identity) {
    const code = character.codePointAt(0) ?? 0;
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }
  return `fab-v1-${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}
