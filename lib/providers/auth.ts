/**
 * Authentication provider contract.
 *
 * Endpoints depend on this interface and never on adapter details.
 */
export type Principal = {
  id: string;
  role: "anonymous" | "player" | "admin";
};

export type AuthHandler = (
  request: import("next/server").NextRequest,
  context?: { params?: Promise<Record<string, string | string[]>> }
) => Response | Promise<Response>;
export type AuthHandlers = {
  GET: AuthHandler;
  POST: AuthHandler;
};

export type SignInInput = {
  email: string;
  credential: string;
};

export type RegisterInput = {
  email: string;
  credential: string;
  username?: string;
  role: "player" | "admin";
};

export type ChangePasswordInput = {
  currentCredential: string;
  newCredential: string;
};

export interface AuthProvider {
  // OAuth and framework-managed signin/signout are exposed via handlers.
  handlers: AuthHandlers;
  getPrincipal(): Promise<Principal>;
  signin(input: SignInInput): Promise<Principal>;
  signout(): Promise<void>;
  register(input: RegisterInput): Promise<Principal>;
  changePassword(input: ChangePasswordInput): Promise<void>;
}
