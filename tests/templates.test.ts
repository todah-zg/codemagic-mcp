import { describe, it, expect } from "vitest";
import * as yaml from "js-yaml";
import { listYamlTemplateTypes, getYamlTemplate } from "../src/templates.js";

describe("listYamlTemplateTypes", () => {
  it("returns a non-empty array", () => {
    const types = listYamlTemplateTypes();
    expect(types.length).toBeGreaterThan(0);
  });

  it("includes core project types", () => {
    const types = listYamlTemplateTypes();
    expect(types).toContain("flutter");
    expect(types).toContain("ios");
    expect(types).toContain("android");
  });
});

describe("getYamlTemplate", () => {
  it("returns a string for every listed type", () => {
    for (const type of listYamlTemplateTypes()) {
      expect(getYamlTemplate(type)).toBeTruthy();
    }
  });

  it("returns null for an unknown project type", () => {
    expect(getYamlTemplate("unknown-type")).toBeNull();
  });

  it("every template is parseable YAML", () => {
    for (const type of listYamlTemplateTypes()) {
      const template = getYamlTemplate(type)!;
      expect(() => yaml.load(template)).not.toThrow();
    }
  });

  it("every template contains a workflows key", () => {
    for (const type of listYamlTemplateTypes()) {
      const template = getYamlTemplate(type)!;
      const parsed = yaml.load(template) as Record<string, unknown>;
      expect(parsed).toHaveProperty("workflows");
    }
  });
});