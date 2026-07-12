import type {
  AuthHandlers,
  AuthProvider,
  ChangePasswordInput,
  Principal,
  SignInInput,
} from "@/lib/providers";

const ANON_PRINCIPAL: Principal = {
  id: "anonymous",
  role: "anonymous",
};

function unsupported(op: string): never {
  throw new Error(`auth provider 'none' does not support ${op}`);
}

const authDisabledHandler = async () =>
  new Response(JSON.stringify({ error: "auth_disabled" }), {
    status: 501,
    headers: { "content-type": "application/json" },
  });

// The 'none' provider has no account store: every request is anonymous.
// Sign-in/registration throw; real auth lands in an Auth.js-backed adapter.
export class NoneAuthProvider implements AuthProvider {
  readonly handlers: AuthHandlers = {
    ["GET"]: authDisabledHandler,
    ["POST"]: authDisabledHandler,
  };

  async getPrincipal(): Promise<Principal> {
    return ANON_PRINCIPAL;
  }

  async signin(_input: SignInInput): Promise<Principal> {
    return unsupported("signin");
  }

  async signout(): Promise<void> {
    unsupported("signout");
  }

  async register(): Promise<Principal> {
    return unsupported("register");
  }

  async changePassword(_input: ChangePasswordInput): Promise<void> {
    unsupported("changePassword");
  }
}
