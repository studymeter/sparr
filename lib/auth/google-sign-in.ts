export function isGoogleSignInEnabled(): boolean {
  return (
    process.env.AUTH_PROVIDER === "authjs" &&
    Boolean(process.env.AUTH_GOOGLE_ID) &&
    Boolean(process.env.AUTH_GOOGLE_SECRET)
  );
}
