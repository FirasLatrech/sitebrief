import { afterEach, describe, expect, it } from "vitest";
import { assertPublicUrl } from "../src/guard.js";

describe("URL guard", () => {
  afterEach(() => {
    delete process.env.SITEBRIEF_ALLOW_LOCAL;
  });

  it.each([
    "file:///etc/passwd",
    "ftp://example.com/",
    "http://localhost:3000/",
    "http://app.localhost/",
    "http://127.0.0.1/",
    "http://10.1.2.3/",
    "http://192.168.0.10/",
    "http://172.16.5.4/",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://[::ffff:7f00:1]/",
    "http://[::ffff:a9fe:a9fe]/",
    "http://[64:ff9b::7f00:1]/",
    "http://[2002:c0a8:101::1]/",
    "http://[fd00::1]/",
    "http://[fe80::1]/",
    "http://198.18.0.1/",
    "http://user:pass@1.1.1.1/",
  ])("rejects %s", async (url) => {
    await expect(assertPublicUrl(url)).rejects.toThrow();
  });

  it("allows local addresses with SITEBRIEF_ALLOW_LOCAL=1, but never file://", async () => {
    process.env.SITEBRIEF_ALLOW_LOCAL = "1";
    await expect(assertPublicUrl("http://localhost:3000/")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("http://192.168.0.10/")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
  });

  it("accepts public IP literals without DNS", async () => {
    await expect(assertPublicUrl("https://93.184.215.14/")).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl("https://[2606:4700::1111]/")).resolves.toBeInstanceOf(URL);
  });
});
