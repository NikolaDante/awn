export function signupNeedsConfirmation(session: unknown) {
  return !session;
}

export function recoveryFormAllowed(recoveryAuthorized: boolean, hasSession: boolean) {
  return recoveryAuthorized && hasSession;
}
