import { describe, it, expect } from "vitest";
import * as yaml from "js-yaml";
import { listYamlTemplateTypes, getYamlTemplate } from "../src/templates.js";

describe("listYamlTemplateTypes", () => {
  it("returns a non-empty array", () => {
    const types = listYamlTemplateTypes();
    expect(types.length).toBeGreaterThan(0);
  });

  it("includes all expected project types", () => {
    const types = listYamlTemplateTypes();
    // original types
    expect(types).toContain("android");
    expect(types).toContain("ios");
    expect(types).toContain("flutter");
    expect(types).toContain("react-native");
    expect(types).toContain("ionic-capacitor");
    expect(types).toContain("ionic-cordova");
    expect(types).toContain("unity");
    // new types
    expect(types).toContain("flutter-native");
    expect(types).toContain("kmm");
    expect(types).toContain("snap");
    expect(types).toContain("unity-oculus");
    expect(types).toContain("dotnet-maui");
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