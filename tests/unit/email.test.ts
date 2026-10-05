import { describe, expect, it } from "vitest";
import { escapeHtml, renderNotificationEmail, safeUrl } from "@/lib/email/templates";

describe("plantillas de correo", () => {
  it("escapa HTML en título y cuerpo (sin inyección)", () => {
    const { html, subject } = renderNotificationEmail({
      title: `<script>alert(1)</script>`,
      body: `a<img src=x onerror=alert(1)>\nb`,
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(subject).not.toMatch(/[\r\n]/);
  });
  it("solo enlaza URLs https o localhost", () => {
    expect(safeUrl("https://app.technoultra.com/c")).toBe("https://app.technoultra.com/c");
    expect(safeUrl("http://localhost:3000/x")).toContain("localhost");
    for (const u of ["javascript:alert(1)", "http://evil.com", "data:text/html,x", "//evil.com", ""])
      expect(safeUrl(u)).toBeNull();
  });
  it("el botón solo aparece con URL segura", () => {
    expect(
      renderNotificationEmail({ title: "t", body: "b", ctaLabel: "Ver", ctaUrl: "javascript:1" }).html,
    ).not.toContain("Ver<");
    expect(
      renderNotificationEmail({
        title: "t",
        body: "b",
        ctaLabel: "Ver",
        ctaUrl: "https://app.technoultra.com",
      }).html,
    ).toContain("Ver</a>");
  });
  it("escapeHtml cubre comillas", () => {
    expect(escapeHtml(`"'<>&`)).toBe("&quot;&#39;&lt;&gt;&amp;");
  });
});
