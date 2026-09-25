import { describe, expect, it } from "vitest";
import { dateOnly, email, money, phoneBR } from "../src/lib/validation";

describe("validações comuns", () => {
  it("telefone: aceita formatos brasileiros e guarda só dígitos", () => {
    expect(phoneBR.parse("(27) 99811-2233")).toBe("27998112233");
    expect(phoneBR.parse("27 3322-1100")).toBe("2733221100");
    expect(phoneBR.parse("+55 27 99811-2233")).toBe("5527998112233");
    expect(() => phoneBR.parse("123")).toThrow();
    expect(() => phoneBR.parse("999999999999999")).toThrow();
  });

  it("dinheiro: positivo, com teto e arredondado para centavos", () => {
    expect(money.parse(10.005)).toBe(10.01);
    expect(money.parse(99.994)).toBe(99.99);
    expect(() => money.parse(0)).toThrow();
    expect(() => money.parse(-1)).toThrow();
    expect(() => money.parse(1_000_001)).toThrow();
  });

  it("datas viram meia-noite UTC do dia", () => {
    expect(dateOnly.parse("2026-09-24").toISOString()).toBe("2026-09-24T00:00:00.000Z");
    expect(dateOnly.parse("2026-09-24T18:30:00Z").toISOString()).toBe("2026-09-24T00:00:00.000Z");
  });

  it("e-mail é normalizado para minúsculas", () => {
    expect(email.parse("  Dra.Ana@Clinica.COM ")).toBe("dra.ana@clinica.com");
    expect(() => email.parse("sem-arroba")).toThrow();
  });
});
