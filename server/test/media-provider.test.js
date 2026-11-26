"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createCloudinaryMediaProvider } = require("../media/cloudinary");

test("Cloudinary adapter signs an account-scoped upload with stable response fields", () => {
  const env = {
    CLOUDINARY_CLOUD_NAME: "example-cloud",
    CLOUDINARY_API_KEY: "public-key",
    CLOUDINARY_API_SECRET: "secret"
  };
  const provider = createCloudinaryMediaProvider(env);
  const result = provider.signUpload({
    userId: "12345678-1234-4234-8234-123456789abc",
    resourceType: "video",
    now: 1_800_000_000_000
  });
  const timestamp = 1_800_000_000;
  const folder = "ethio-one/12345678-1234-4234-8234-123456789abc";
  const canonical = "folder=" + folder + "&timestamp=" + timestamp;
  const expected = crypto.createHash("sha1").update(canonical + "secret", "utf8").digest("hex");
  assert.deepEqual(result, {
    cloudName: "example-cloud",
    apiKey: "public-key",
    timestamp,
    folder,
    signature: expected,
    resourceType: "video"
  });
});

test("Cloudinary adapter defaults unsupported resource types to image for compatibility", () => {
  const provider = createCloudinaryMediaProvider({
    CLOUDINARY_CLOUD_NAME: "example-cloud",
    CLOUDINARY_API_KEY: "public-key",
    CLOUDINARY_API_SECRET: "secret"
  });
  assert.equal(provider.signUpload({
    userId: "12345678-1234-4234-8234-123456789abc",
    resourceType: "unexpected",
    now: 1_800_000_000_000
  }).resourceType, "image");
});

test("Cloudinary adapter refuses to sign when credentials are missing", () => {
  const provider = createCloudinaryMediaProvider({});
  assert.equal(provider.isConfigured(), false);
  assert.throws(() => provider.signUpload({
    userId: "12345678-1234-4234-8234-123456789abc"
  }), error => error.code === "MEDIA_PROVIDER_NOT_CONFIGURED");
});

test("Cloudinary adapter rejects an invalid owner identifier", () => {
  const provider = createCloudinaryMediaProvider({
    CLOUDINARY_CLOUD_NAME: "example-cloud",
    CLOUDINARY_API_KEY: "public-key",
    CLOUDINARY_API_SECRET: "secret"
  });
  assert.throws(() => provider.signUpload({ userId: "../other-account" }), error => error.code === "INVALID_MEDIA_OWNER");
});


const { createMediaProvider } = require("../media");

test("media provider factory defaults to Cloudinary for existing deployments", () => {
  const provider = createMediaProvider({
    CLOUDINARY_CLOUD_NAME: "example-cloud",
    CLOUDINARY_API_KEY: "public-key",
    CLOUDINARY_API_SECRET: "secret"
  });
  assert.equal(provider.key, "cloudinary");
  assert.equal(provider.isConfigured(), true);
});

test("media provider factory rejects unknown providers instead of silently falling back", () => {
  assert.throws(
    () => createMediaProvider({ MEDIA_STORAGE_PROVIDER: "unknown-storage" }),
    error => error.code === "MEDIA_PROVIDER_UNSUPPORTED"
  );
});
