"use strict";

const { createCloudinaryMediaProvider } = require("./cloudinary");

/**
 * Resolve the configured storage provider in one server-side location.
 * Cloudinary remains the default for backwards compatibility.
 */
function createMediaProvider(env = process.env) {
  const providerKey = String(env.MEDIA_STORAGE_PROVIDER || "cloudinary").trim().toLowerCase();
  if (providerKey === "cloudinary") return createCloudinaryMediaProvider(env);
  const error = new Error("The configured media storage provider is not supported.");
  error.code = "MEDIA_PROVIDER_UNSUPPORTED";
  throw error;
}

module.exports = { createMediaProvider };
