import { toNextJsHandler } from "better-auth/next-js";
import { getAuthService } from "src/lib/auth-singleton";

const authService = await getAuthService();

export const { GET, POST } = toNextJsHandler(authService.auth);
