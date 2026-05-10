import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeStorageClientConfig } from "./storage";

describe("makeStorageClientConfig", () => {
    it("keeps virtual-hosted addressing by default for R2", () => {
        const config = makeStorageClientConfig({
            R2_ENDPOINT_URL: "https://example.r2.cloudflarestorage.com",
            R2_ACCESS_KEY_ID: "access-key",
            R2_SECRET_ACCESS_KEY: "secret-key",
        });

        assert.equal(config.forcePathStyle, false);
    });

    it("can enable path-style addressing for MinIO", () => {
        const config = makeStorageClientConfig({
            R2_ENDPOINT_URL: "http://minio:9000",
            R2_ACCESS_KEY_ID: "minioadmin",
            R2_SECRET_ACCESS_KEY: "minioadmin",
            S3_FORCE_PATH_STYLE: "true",
        });

        assert.equal(config.forcePathStyle, true);
    });
});
