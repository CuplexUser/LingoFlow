const crypto: typeof import("crypto") = require("crypto");

type AuthTokenPayload = {
  sub: number;
  iat: number;
  exp: number;
};

type GoogleStatePayload = {
  nonce: string;
  iat: number;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function createTokenService({
  authSecret,
  tokenTtlSeconds,
  googleStateTtlSeconds
}: {
  authSecret: string;
  tokenTtlSeconds: number;
  googleStateTtlSeconds: number;
}) {
  function signTokenPayload(payloadJson: string): string {
    return crypto
      .createHmac("sha256", authSecret)
      .update(payloadJson)
      .digest("base64url");
  }

  function createAuthToken(userId: number): string {
    const now = Math.floor(Date.now() / 1000);
    const payloadJson = JSON.stringify({
      sub: Number(userId),
      iat: now,
      exp: now + tokenTtlSeconds
    });
    const payloadPart = base64UrlEncode(payloadJson);
    const signature = signTokenPayload(payloadJson);
    return `v1.${payloadPart}.${signature}`;
  }

  function parseSignedPayload<T extends { exp: number }>(
    token: string | null | undefined,
    validate: (value: unknown) => value is T
  ): T | null {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3 || parts[0] !== "v1") return null;
    const payloadPart = parts[1];
    const signature = parts[2];

    let payloadJson: string;
    try {
      payloadJson = base64UrlDecode(payloadPart);
    } catch (_error) {
      return null;
    }

    const expectedSignature = signTokenPayload(payloadJson);
    const actualBuffer = Buffer.from(signature, "utf8");
    const expectedBuffer = Buffer.from(expectedSignature, "utf8");
    if (
      actualBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(actualBuffer, expectedBuffer)
    ) {
      return null;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(payloadJson);
    } catch (_error) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (!validate(payload)) return null;
    if (payload.exp <= now) return null;
    return payload;
  }

  function parseAuthToken(token: string | null | undefined): AuthTokenPayload | null {
    return parseSignedPayload<AuthTokenPayload>(token, (value): value is AuthTokenPayload => {
      const payload = value as Partial<AuthTokenPayload> | null;
      return Boolean(payload && Number.isInteger(payload.sub) && Number.isInteger(payload.exp));
    });
  }

  function createGoogleOauthState(): string {
    const now = Math.floor(Date.now() / 1000);
    const payloadJson = JSON.stringify({
      nonce: crypto.randomUUID(),
      iat: now,
      exp: now + googleStateTtlSeconds
    });
    const payloadPart = base64UrlEncode(payloadJson);
    const signature = signTokenPayload(payloadJson);
    return `v1.${payloadPart}.${signature}`;
  }

  function parseGoogleOauthState(state: string | null | undefined): GoogleStatePayload | null {
    return parseSignedPayload<GoogleStatePayload>(state, (value): value is GoogleStatePayload => {
      const payload = value as Partial<GoogleStatePayload> | null;
      return Boolean(payload && payload.nonce && Number.isInteger(payload.exp));
    });
  }

  return {
    createAuthToken,
    parseAuthToken,
    createGoogleOauthState,
    parseGoogleOauthState
  };
}

module.exports = {
  createTokenService
};

