/**
 * The self-signup username charset (D3/D45/D49): lowercase letters, digits,
 * dots, underscores, plus and dash, 3-32 characters, never starting with a
 * separator. Shared by the self-signup form and the Google provisioner so a
 * username accepted on one path can never silently disagree with the other.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._+-]{2,31}$/;
