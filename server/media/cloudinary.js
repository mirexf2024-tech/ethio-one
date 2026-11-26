"use strict";

const crypto = require("node:crypto");

/**
 * Cloudinary implementation of the provider-neutral media upload contract.
 * Keep provider-specific signing and response details inside this adapter.
 */
function createCloudinaryMediaProvider(env = process.env) {
  return {
    key: "cloudinary",
    isConfigured() {
      return Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);
    },
    signUpload({ userId, resourceType = "image", now = Date.now() } = {}) {
      if (!this.isConfigured()) {
        const error = new Error("Media upload is not configured yet.");
        error.code = "MEDIA_PROVIDER_NOT_CONFIGURED";
        throw error;
      }
      if (typeof userId !== "string" || !/^[0-9a-f-]{36}$/i.test(userId)) {
        const error = new Error("A valid account is required to sign a media upload.");
        error.code = "INVALID_MEDIA_OWNER";
        throw error;
      }
      const allowedTypes = ["image", "video", "raw"];
      const type = allowedTypes.includes(resourceType) ? resourceType : "image";
      const timestamp = Math.floor(now / 1000);
      const folder = "ethio-one/" + userId;
      const params = { folder, timestamp };
      const canonical = Object.keys(params).sort().map(key => key + "=" + params[key]).join("&");
      const signature = crypto.createHash("sha1")
        .update(canonical + env.CLOUDINARY_API_SECRET, "utf8")
        .digest("hex");
      return {
        cloudName: env.CLOUDINARY_CLOUD_NAME,
        apiKey: env.CLOUDINARY_API_KEY,
        timestamp,
        folder,
        signature,
        resourceType: type
      };
    }
  };
}

module.exports = { createCloudinaryMediaProvider };
